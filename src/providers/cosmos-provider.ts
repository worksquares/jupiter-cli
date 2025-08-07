/**
 * CosmosAPI Provider - Integration with CosmosAPI at https://cosmosapi.digisquares.com/
 */

import axios, { AxiosInstance } from 'axios';
import { BaseAIProvider, AIMessage, AIResponse, AIProviderConfig } from './ai-provider';
import { Logger } from '../utils/logger';

export class CosmosProvider extends BaseAIProvider {
  name = 'CosmosAPI';
  private client!: AxiosInstance;
  private logger = new Logger('CosmosProvider');

  async initialize(config: AIProviderConfig): Promise<void> {
    await super.initialize(config);
    
    // CosmosAPI endpoint
    const baseURL = config.baseUrl || 'https://cosmosapi.digisquares.com';

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        // CosmosAPI expects API key in x-api-key header
        ...(config.apiKey ? { 'x-api-key': config.apiKey } : {})
      },
      timeout: config.timeout || 120000, // Increased to 2 minutes
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    this.logger.info('CosmosAPI provider initialized');
  }

  async generateCompletion(messages: AIMessage[], options?: any): Promise<AIResponse> {
    this.validateConfig();

    // Retry logic with exponential backoff
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Format messages for CosmosAPI
        const formattedMessages = messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        // Prepare request payload
        const payload = {
          model: this.config.model || 'default',
          messages: formattedMessages,
          temperature: options?.temperature ?? this.config.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 4096,
          ...options
        };

        this.logger.debug('Sending request to CosmosAPI:', {
          model: payload.model,
          messageCount: messages.length,
          temperature: payload.temperature,
          attempt
        });

        // Make API call to CosmosAPI
        const response = await this.client.post('/api/v1/chat/completions', payload);

        // Extract response based on CosmosAPI format
        const content = response.data.choices?.[0]?.message?.content || 
                       response.data.content ||
                       response.data.response ||
                       response.data.text ||
                       '';

        return {
          content,
          usage: response.data.usage ? {
            promptTokens: response.data.usage.prompt_tokens || 0,
            completionTokens: response.data.usage.completion_tokens || 0,
            totalTokens: response.data.usage.total_tokens || 0
          } : undefined,
          model: response.data.model || this.config.model
        };
      } catch (error: any) {
        lastError = error;
        this.logger.error(`CosmosAPI error (attempt ${attempt}/${maxRetries}):`, error.response?.data || error.message);
        
        if (error.response?.status === 401) {
          throw new Error('CosmosAPI authentication failed');
        } else if (error.response?.status === 429 && attempt < maxRetries) {
          // Rate limit - wait before retry
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          this.logger.info(`Rate limited, waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        } else if (error.code === 'ECONNABORTED' && attempt < maxRetries) {
          // Timeout - retry with backoff
          const waitTime = attempt * 2000; // Linear backoff for timeouts
          this.logger.info(`Request timeout, waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // Don't retry for client errors (4xx except 429)
        if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
          throw new Error(`CosmosAPI error: ${error.response?.data?.error || error.message}`);
        }
      }
    }
    
    // All retries failed
    throw new Error(`CosmosAPI error after ${maxRetries} attempts: ${lastError?.response?.data?.error || lastError?.message}`);
  }

  async generateCode(prompt: string, language?: string): Promise<{ code: string; language: string; explanation: string }> {
    // Use specialized code generation prompt
    const systemMessage = `You are an expert ${language || 'software'} developer using CosmosAPI. Generate high-quality, production-ready code following best practices.
    
Requirements:
- Write clean, well-structured code
- Include appropriate error handling
- Add helpful comments
- Follow ${language || 'programming'} language conventions
- Return ONLY the code without any markdown formatting or explanations`;

    const messages: AIMessage[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.3, // Lower temperature for more consistent code
      maxTokens: 8192  // Higher token limit for code generation
    });

    // Clean up any markdown formatting if present
    let code = response.content;
    
    // Remove markdown code blocks
    code = code.replace(/^```[a-zA-Z]*\n/gm, '');
    code = code.replace(/\n```$/gm, '');
    code = code.trim();

    // Detect language from prompt or code
    const detectedLanguage = language || this.detectLanguage(prompt, code);

    return {
      code,
      language: detectedLanguage,
      explanation: `Generated ${detectedLanguage} code for: ${prompt.substring(0, 100)}...`
    };
  }

  private detectLanguage(prompt: string, code: string): string {
    const lower = prompt.toLowerCase();
    
    if (lower.includes('javascript') || lower.includes('js')) return 'javascript';
    if (lower.includes('typescript') || lower.includes('ts')) return 'typescript';
    if (lower.includes('python')) return 'python';
    if (lower.includes('java') && !lower.includes('javascript')) return 'java';
    if (lower.includes('react')) return 'javascript';
    if (lower.includes('c++') || lower.includes('cpp')) return 'cpp';
    if (lower.includes('c#') || lower.includes('csharp')) return 'csharp';
    if (lower.includes('go') || lower.includes('golang')) return 'go';
    if (lower.includes('rust')) return 'rust';
    
    // Try to detect from code patterns
    if (code.includes('function') || code.includes('const') || code.includes('let')) return 'javascript';
    if (code.includes('def ') || code.includes('import ')) return 'python';
    if (code.includes('public class') || code.includes('private ')) return 'java';
    
    return 'unknown';
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];
    const response = await this.generateCompletion(messages);
    return response.content;
  }

  async analyzeCode(code: string): Promise<any> {
    const systemMessage = `You are a code analysis expert using CosmosAPI. Analyze the given code and provide insights about:
- Code quality and structure
- Potential bugs or issues
- Performance considerations
- Best practices violations
- Suggestions for improvement

Provide a structured JSON response.`;

    const messages: AIMessage[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: `Analyze this code:\n\n${code}` }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.3,
      maxTokens: 2048
    });

    try {
      // Try to parse as JSON
      return JSON.parse(response.content);
    } catch {
      // If not valid JSON, return structured object
      return {
        analysis: response.content,
        quality: 'unknown',
        issues: [],
        suggestions: []
      };
    }
  }

  /**
   * Test connection to CosmosAPI
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      this.logger.warn('CosmosAPI health check failed:', error);
      // Try alternate endpoint with minimal request
      try {
        const response = await this.client.post('/api/v1/chat/completions', {
          model: this.config.model || 'default',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        });
        return !!response.data;
      } catch {
        return false;
      }
    }
  }
}
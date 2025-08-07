/**
 * AI Provider Interface - ONLY COSMOSAPI IS SUPPORTED
 */

import { z } from 'zod';

// AI Provider types - ONLY COSMOS IS ALLOWED
export interface AIProviderConfig {
  provider: 'cosmos' | 'cosmosapi'; // ONLY COSMOSAPI
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
}

export interface AIProvider {
  name: string;
  initialize(config: AIProviderConfig): Promise<void>;
  generateCompletion(messages: AIMessage[], options?: any): Promise<AIResponse>;
  generateCode(prompt: string, language?: string): Promise<{ code: string; language: string; explanation: string }>;
  isAvailable(): boolean;
}

// Configuration schema - ONLY COSMOS IS ALLOWED
export const AIProviderConfigSchema = z.object({
  provider: z.enum(['cosmos', 'cosmosapi']), // ONLY COSMOSAPI
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(4096),
  timeout: z.number().positive().default(30000)
});

// Base AI Provider class
export abstract class BaseAIProvider implements AIProvider {
  abstract name: string;
  protected config!: AIProviderConfig;
  protected initialized = false;

  async initialize(config: AIProviderConfig): Promise<void> {
    // STRICT VALIDATION: Only CosmosAPI is allowed
    if (config.provider !== 'cosmos' && config.provider !== 'cosmosapi') {
      throw new Error('ONLY CosmosAPI is supported. No other AI providers are allowed.');
    }
    this.config = AIProviderConfigSchema.parse(config);
    this.initialized = true;
  }

  abstract generateCompletion(messages: AIMessage[], options?: any): Promise<AIResponse>;

  async generateCode(prompt: string, language?: string): Promise<{ code: string; language: string; explanation: string }> {
    const systemMessage = `You are an expert programmer using CosmosAPI. Generate clean, well-commented ${language || 'code'} that follows best practices. Only return the code without any explanation or markdown formatting.`;
    
    const messages: AIMessage[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt }
    ];

    const response = await this.generateCompletion(messages);
    
    return {
      code: response.content,
      language: language || 'unknown',
      explanation: `Generated code for: ${prompt.substring(0, 100)}...`
    };
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    const response = await this.generateCompletion(messages);
    return response.content;
  }

  isAvailable(): boolean {
    return this.initialized;
  }

  protected validateConfig(): void {
    if (!this.initialized) {
      throw new Error(`${this.name} provider not initialized`);
    }
  }
}
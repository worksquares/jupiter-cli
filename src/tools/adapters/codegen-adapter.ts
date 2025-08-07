/**
 * Code Generation Tool Adapter - Uses AI to generate code
 */

import { BaseToolAdapter } from '../base-adapter';
import { AgentInterface } from '../../core/types';

export class CodeGenAdapter extends BaseToolAdapter {
  name = 'codegen';
  description = 'Generates code using AI based on requirements';
  parameters = {
    prompt: {
      type: 'string' as const,
      description: 'Description of what code to generate',
      required: true
    },
    language: {
      type: 'string' as const,
      description: 'Programming language to use',
      required: false
    },
    outputFile: {
      type: 'string' as const,
      description: 'Optional file path to write the generated code',
      required: false
    },
    requirements: {
      type: 'array' as const,
      description: 'Additional requirements or constraints',
      required: false
    }
  };

  private agent?: AgentInterface;

  setAgent(agent: AgentInterface): void {
    this.agent = agent;
  }

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['prompt']);
    this.validateTypes(params, {
      prompt: 'string',
      language: 'string',
      outputFile: 'string',
      requirements: 'object'
    });

    if (!this.agent) {
      this.error('Agent not set for code generation', 'NOT_INITIALIZED');
    }

    const { prompt, language, outputFile, requirements = [] } = params;

    try {
      // Build enhanced prompt with requirements
      let enhancedPrompt = prompt;
      if (requirements.length > 0) {
        enhancedPrompt += '\n\nAdditional Requirements:\n';
        requirements.forEach((req: string, index: number) => {
          enhancedPrompt += `${index + 1}. ${req}\n`;
        });
      }

      // Generate code using the agent's AI provider
      if (this.logger) {
        this.logger.info(`Generating ${language || 'code'} based on prompt...`);
      }
      const result = await (this.agent as any).generateCode(enhancedPrompt, language);
      
      // Extract the code from the result object
      const generatedCode = typeof result === 'string' ? result : result.code;
      const detectedLanguage = typeof result === 'object' ? result.language : (language || 'unknown');

      // If outputFile is specified, write the code
      if (outputFile) {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const absolutePath = path.isAbsolute(outputFile) 
          ? outputFile 
          : path.resolve(outputFile);

        await fs.writeFile(absolutePath, generatedCode, 'utf-8');
        
        return this.success({
          message: 'Code generated successfully',
          file: absolutePath,
          language: detectedLanguage,
          linesOfCode: generatedCode.split('\n').length,
          preview: generatedCode.substring(0, 200) + '...'
        });
      }

      // Return the generated code directly
      return this.success({
        code: generatedCode,
        language: detectedLanguage,
        linesOfCode: generatedCode.split('\n').length,
        explanation: typeof result === 'object' ? result.explanation : undefined
      });
      
    } catch (error) {
      const err = error as any;
      if (err.message?.includes('API key')) {
        this.error('AI provider not configured. Please set AI_PROVIDER and AI_API_KEY environment variables.', 'NOT_INITIALIZED');
      }
      this.error(`Failed to generate code: ${err.message}`, 'TOOL_EXECUTION_ERROR', error);
    }
  }

  validate(params: any): boolean {
    return !!params.prompt;
  }
}

// Export singleton instance
export default new CodeGenAdapter();
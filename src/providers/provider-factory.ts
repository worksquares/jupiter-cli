/**
 * AI Provider Factory - Creates and manages AI providers
 * STRICT RULE: ONLY COSMOSAPI IS SUPPORTED
 */

import { AIProvider, AIProviderConfig } from './ai-provider';
import { CosmosProvider } from './cosmos-provider';
import { Logger } from '../utils/logger';

export class AIProviderFactory {
  private static providers: Map<string, AIProvider> = new Map();
  private static logger = new Logger('AIProviderFactory');

  static async createProvider(config: AIProviderConfig): Promise<AIProvider> {
    // STRICT RULE: Only CosmosAPI is allowed
    if (config.provider !== 'cosmos' && config.provider !== 'cosmosapi') {
      throw new Error('ONLY CosmosAPI is supported. No other AI providers are allowed.');
    }

    const key = `cosmos-${config.model}`;
    
    // Check if provider already exists
    if (this.providers.has(key)) {
      return this.providers.get(key)!;
    }

    // Only create CosmosProvider
    const provider = new CosmosProvider();

    try {
      await provider.initialize({
        ...config,
        provider: 'cosmos',
        baseUrl: config.baseUrl || 'https://cosmosapi.digisquares.com'
      });
      
      this.providers.set(key, provider);
      this.logger.info(`Initialized CosmosAPI provider with model ${config.model}`);
      return provider;
    } catch (error) {
      this.logger.error('Failed to initialize CosmosAPI provider:', error);
      throw new Error('Failed to initialize CosmosAPI. This is the only supported provider.');
    }
  }

  static getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  static async getDefaultProvider(): Promise<AIProvider> {
    // ALWAYS use CosmosAPI - no alternatives
    const model = process.env.AI_MODEL || 'default';
    const apiKey = process.env.AI_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || 'https://cosmosapi.digisquares.com';

    this.logger.info('Using CosmosAPI provider (the only supported provider)');
    
    return this.createProvider({
      provider: 'cosmos',
      model,
      apiKey,
      baseUrl
    });
  }
}
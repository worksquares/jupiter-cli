/**
 * Provider Manager - Manages AI providers
 */

import { BaseAIProvider, AIProviderConfig } from './ai-provider';
import { CosmosProvider } from './cosmos-provider';
import { Logger } from '../utils/logger';

export class ProviderManager {
  private providers: Map<string, BaseAIProvider> = new Map();
  private currentProvider: BaseAIProvider | null = null;
  private logger = new Logger('ProviderManager');

  constructor() {
    this.registerProviders();
  }

  private registerProviders() {
    // ONLY CosmosAPI is supported as per JUPITER.md
    this.providers.set('cosmos', new CosmosProvider());
    this.providers.set('cosmosapi', new CosmosProvider());
  }

  async initialize(providerName: string, config: AIProviderConfig): Promise<void> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    await provider.initialize(config);
    this.currentProvider = provider;
    this.logger.info(`Provider initialized: ${providerName}`);
  }

  getProvider(): BaseAIProvider {
    if (!this.currentProvider) {
      throw new Error('No provider initialized');
    }
    return this.currentProvider;
  }
  
  getDefaultProvider(): BaseAIProvider {
    return this.getProvider();
  }

  async switchProvider(providerName: string, config: AIProviderConfig): Promise<void> {
    await this.initialize(providerName, config);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
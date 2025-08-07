/**
 * Azure API Configuration
 * Configuration for the external Azure API service
 */

import { config } from 'dotenv';

// Load environment variables
config();

export interface AzureAPIConfiguration {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export const azureAPIConfig: AzureAPIConfiguration = {
  baseUrl: process.env.AZURE_API_URL || 'https://azureapi.digisquares.in',
  apiKey: process.env.AZURE_API_KEY || 'abf6ebdb9a66288f1dee83b91d595fad67f1fa767163295045be056bc7310f48',
  timeout: parseInt(process.env.AZURE_API_TIMEOUT || '60000', 10),
  retryAttempts: parseInt(process.env.AZURE_API_RETRY_ATTEMPTS || '3', 10),
  retryDelay: parseInt(process.env.AZURE_API_RETRY_DELAY || '1000', 10)
};

// Validate configuration
export function validateAzureAPIConfig(): void {
  if (!azureAPIConfig.baseUrl) {
    throw new Error('Azure API base URL is not configured');
  }
  
  if (!azureAPIConfig.apiKey) {
    throw new Error('Azure API key is not configured');
  }
  
  // Log configuration (without sensitive data)
  console.log('Azure API Configuration:', {
    baseUrl: azureAPIConfig.baseUrl,
    timeout: azureAPIConfig.timeout,
    retryAttempts: azureAPIConfig.retryAttempts,
    retryDelay: azureAPIConfig.retryDelay,
    apiKeyConfigured: !!azureAPIConfig.apiKey
  });
}
/**
 * Azure Configuration with validation and defaults
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import { Logger } from '../utils/logger';

// Load environment variables
dotenv.config();

const logger = new Logger('AzureConfig');

// Azure configuration schema
export const AzureConfigSchema = z.object({
  subscriptionId: z.string().uuid().optional(),
  resourceGroup: z.string().min(1).default('appmaker-platform-rg'),
  tenantId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  clientSecret: z.string().min(1).optional(),
  location: z.string().default('eastus'),
  containerRegistry: z.object({
    server: z.string().default('mcr.microsoft.com'),
    username: z.string().optional(),
    password: z.string().optional(),
    usePublicRegistry: z.boolean().default(true)
  }),
  storage: z.object({
    connectionString: z.string().optional(),
    containerName: z.string().default('deployments')
  }),
  defaults: z.object({
    containerCpu: z.number().min(0.25).max(4).default(1),
    containerMemory: z.number().min(0.5).max(16).default(2),
    containerTimeout: z.number().min(60).max(3600).default(1800)
  })
});

export type AzureConfig = z.infer<typeof AzureConfigSchema>;

/**
 * Get Azure configuration from environment with validation
 */
export function getAzureConfig(): AzureConfig {
  const config = {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
    resourceGroup: process.env.AZURE_RESOURCE_GROUP,
    tenantId: process.env.AZURE_TENANT_ID,
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    location: process.env.AZURE_LOCATION,
    containerRegistry: {
      server: process.env.AZURE_CONTAINER_REGISTRY_SERVER || 'mcr.microsoft.com',
      username: process.env.AZURE_CONTAINER_REGISTRY_USERNAME,
      password: process.env.AZURE_CONTAINER_REGISTRY_PASSWORD,
      usePublicRegistry: !process.env.AZURE_CONTAINER_REGISTRY_SERVER || 
                         process.env.AZURE_CONTAINER_REGISTRY_SERVER === 'mcr.microsoft.com'
    },
    storage: {
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      containerName: process.env.AZURE_STORAGE_CONTAINER
    },
    defaults: {
      containerCpu: Number(process.env.AZURE_DEFAULT_CPU) || undefined,
      containerMemory: Number(process.env.AZURE_DEFAULT_MEMORY) || undefined,
      containerTimeout: Number(process.env.AZURE_DEFAULT_TIMEOUT) || undefined
    }
  };

  try {
    return AzureConfigSchema.parse(config);
  } catch (error) {
    logger.warn('Azure configuration validation failed, using defaults', error);
    // Return config with defaults for optional fields
    return AzureConfigSchema.parse({});
  }
}

/**
 * Check if Azure is configured for deployment
 */
export function isAzureConfigured(): boolean {
  const config = getAzureConfig();
  return !!(
    config.subscriptionId &&
    config.resourceGroup &&
    (
      // Either using public registry or have private registry credentials
      config.containerRegistry.usePublicRegistry ||
      (config.containerRegistry.username && config.containerRegistry.password)
    )
  );
}

/**
 * Get Azure credential type
 */
export function getAzureCredentialType(): 'service-principal' | 'managed-identity' | 'default' {
  const config = getAzureConfig();
  
  if (config.clientId && config.clientSecret && config.tenantId) {
    return 'service-principal';
  }
  
  if (process.env.AZURE_USE_MANAGED_IDENTITY === 'true') {
    return 'managed-identity';
  }
  
  return 'default';
}

/**
 * Validate Azure configuration for specific operations
 */
export function validateAzureConfig(operation: 'deploy' | 'storage' | 'basic'): { 
  valid: boolean; 
  errors: string[] 
} {
  const config = getAzureConfig();
  const errors: string[] = [];

  switch (operation) {
    case 'deploy':
      if (!config.subscriptionId) {
        errors.push('AZURE_SUBSCRIPTION_ID is required for deployment');
      }
      if (!config.resourceGroup) {
        errors.push('AZURE_RESOURCE_GROUP is required for deployment');
      }
      if (!config.containerRegistry.usePublicRegistry && 
          (!config.containerRegistry.username || !config.containerRegistry.password)) {
        errors.push('Container registry credentials required for private registry');
      }
      break;
      
    case 'storage':
      if (!config.storage.connectionString) {
        errors.push('AZURE_STORAGE_CONNECTION_STRING is required for storage operations');
      }
      break;
      
    case 'basic':
      // Basic operations don't require full configuration
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get container image based on template
 */
export function getContainerImage(template: string): string {
  const config = getAzureConfig();
  
  // Public MCR images
  const publicImages: Record<string, string> = {
    'node': 'mcr.microsoft.com/devcontainers/javascript-node:18',
    'python': 'mcr.microsoft.com/devcontainers/python:3.11',
    'dotnet': 'mcr.microsoft.com/devcontainers/dotnet:7.0',
    'java': 'mcr.microsoft.com/devcontainers/java:17',
    'go': 'mcr.microsoft.com/devcontainers/go:1.20',
    'default': 'mcr.microsoft.com/azure-cli:latest'
  };

  // Use public registry if configured
  if (config.containerRegistry.usePublicRegistry) {
    return publicImages[template] || publicImages.default;
  }

  // Use private registry
  const privateImages: Record<string, string> = {
    'node': `${config.containerRegistry.server}/appmaker/node-dev:latest`,
    'python': `${config.containerRegistry.server}/appmaker/python-dev:latest`,
    'dotnet': `${config.containerRegistry.server}/appmaker/dotnet-dev:latest`,
    'java': `${config.containerRegistry.server}/appmaker/java-dev:latest`,
    'go': `${config.containerRegistry.server}/appmaker/go-dev:latest`,
    'default': `${config.containerRegistry.server}/appmaker/base:latest`
  };

  return privateImages[template] || privateImages.default;
}
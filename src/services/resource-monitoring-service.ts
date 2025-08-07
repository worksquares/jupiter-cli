/**
 * Resource Monitoring Service
 * Real-time monitoring and metrics for Azure resources
 */

import { Logger } from '../utils/logger';
import { AzureAPIClient, ContainerMetricsResponse } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';

export interface ResourceMetrics {
  timestamp: string;
  cpu: {
    usage: number;
    percentage: number;
    limit: number;
  };
  memory: {
    usage: number;
    percentage: number;
    limit: number;
  };
  network?: {
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
  };
  disk?: {
    readBytes: number;
    writeBytes: number;
    readOps: number;
    writeOps: number;
  };
}

export interface ResourceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  lastCheck: string;
  issues: string[];
  uptime?: number;
  availability?: number;
}

export interface DomainStatus {
  domain: string;
  isActive: boolean;
  sslStatus: 'valid' | 'expiring' | 'expired' | 'none';
  sslExpiryDate?: string;
  dnsStatus: 'configured' | 'pending' | 'misconfigured';
  httpStatus?: number;
  responseTime?: number;
}

export interface AlertConfig {
  cpuThreshold?: number;      // Percentage (0-100)
  memoryThreshold?: number;    // Percentage (0-100)
  responseTimeThreshold?: number; // Milliseconds
  enableEmail?: boolean;
  enableWebhook?: boolean;
  webhookUrl?: string;
  emailAddresses?: string[];
}

export interface MetricsHistory {
  resource: string;
  type: 'aci' | 'app-service';
  metrics: ResourceMetrics[];
  aggregates: {
    avgCpu: number;
    maxCpu: number;
    avgMemory: number;
    maxMemory: number;
  };
}

export class ResourceMonitoringService {
  private logger: Logger;
  private azureClient: AzureAPIClient;
  private metricsCache: Map<string, ResourceMetrics>;
  private healthCache: Map<string, ResourceHealth>;
  private readonly CACHE_TTL = 30000; // 30 seconds
  private cacheTimestamps: Map<string, number>;

  constructor() {
    this.logger = Logger.getInstance();
    
    // Validate configuration
    if (!azureAPIConfig.baseUrl || !azureAPIConfig.apiKey) {
      throw new Error('Azure API configuration is required for ResourceMonitoringService');
    }
    
    try {
      this.azureClient = new AzureAPIClient(azureAPIConfig);
    } catch (error) {
      this.logger.error('Failed to initialize Azure API client', error);
      throw error;
    }
    
    this.metricsCache = new Map();
    this.healthCache = new Map();
    this.cacheTimestamps = new Map();
  }

  /**
   * Get current metrics for an Azure Container Instance
   */
  async getACIMetrics(containerName: string): Promise<ResourceMetrics> {
    if (!containerName || containerName.trim().length === 0) {
      throw new Error('Container name is required');
    }
    
    this.logger.info('Getting ACI metrics', { containerName });
    
    // Check cache
    const cacheKey = `aci-${containerName}`;
    const cached = this.getCachedMetrics(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.azureClient.getACIMetrics(containerName);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to get ACI metrics');
      }

      const metrics: ResourceMetrics = {
        timestamp: response.data.timestamp || new Date().toISOString(),
        cpu: {
          usage: response.data.cpu?.usage || 0,
          percentage: response.data.cpu?.percentage || 0,
          limit: response.data.cpu?.limit || 1
        },
        memory: {
          usage: response.data.memory?.usage || 0,
          percentage: response.data.memory?.percentage || 0,
          limit: response.data.memory?.limit || 1073741824
        },
        network: response.data.network
      };

      // Cache the metrics
      this.setCachedMetrics(cacheKey, metrics);
      
      this.logger.info('ACI metrics retrieved', { containerName, metrics });
      return metrics;

    } catch (error) {
      this.logger.error('Failed to get ACI metrics', error);
      throw new Error(`Failed to get metrics for container ${containerName}: ${(error as Error).message}`);
    }
  }

  /**
   * Get current metrics for an App Service
   */
  async getAppServiceMetrics(appName: string): Promise<ResourceMetrics> {
    if (!appName || appName.trim().length === 0) {
      throw new Error('App name is required');
    }
    
    this.logger.info('Getting App Service metrics', { appName });
    
    // Check cache
    const cacheKey = `app-${appName}`;
    const cached = this.getCachedMetrics(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.azureClient.getAppServiceMetrics(appName);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to get App Service metrics');
      }

      const metrics: ResourceMetrics = {
        timestamp: response.data.timestamp || new Date().toISOString(),
        cpu: {
          usage: response.data.cpu?.usage || 0,
          percentage: response.data.cpu?.percentage || 0,
          limit: response.data.cpu?.limit || 100
        },
        memory: {
          usage: response.data.memory?.usage || 0,
          percentage: response.data.memory?.percentage || 0,
          limit: response.data.memory?.limit || 1073741824
        },
        network: response.data.network,
        disk: response.data.disk
      };

      // Cache the metrics
      this.setCachedMetrics(cacheKey, metrics);
      
      this.logger.info('App Service metrics retrieved', { appName, metrics });
      return metrics;

    } catch (error) {
      this.logger.error('Failed to get App Service metrics', error);
      throw new Error(`Failed to get metrics for app ${appName}: ${(error as Error).message}`);
    }
  }

  /**
   * Get historical metrics for a resource
   */
  async getMetricsHistory(
    resourceType: 'aci' | 'app-service',
    resourceName: string,
    duration: string = '1h'
  ): Promise<MetricsHistory> {
    if (!resourceName || resourceName.trim().length === 0) {
      throw new Error('Resource name is required');
    }
    
    this.logger.info('Getting metrics history', { resourceType, resourceName, duration });

    try {
      const response = await this.azureClient.getMetricsHistory(resourceType, resourceName, duration);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to get metrics history');
      }

      // Calculate aggregates
      const metrics = response.data.metrics || [];
      const aggregates = this.calculateAggregates(metrics);

      const history: MetricsHistory = {
        resource: resourceName,
        type: resourceType,
        metrics: metrics,
        aggregates
      };

      this.logger.info('Metrics history retrieved', { 
        resourceName, 
        metricsCount: metrics.length,
        aggregates 
      });
      
      return history;

    } catch (error) {
      this.logger.error('Failed to get metrics history', error);
      throw new Error(`Failed to get metrics history: ${(error as Error).message}`);
    }
  }

  /**
   * Get health status of a resource
   */
  async getResourceHealth(
    resourceType: 'aci' | 'app-service',
    resourceName: string
  ): Promise<ResourceHealth> {
    if (!resourceName || resourceName.trim().length === 0) {
      throw new Error('Resource name is required');
    }
    
    this.logger.info('Getting resource health', { resourceType, resourceName });
    
    // Check cache
    const cacheKey = `health-${resourceType}-${resourceName}`;
    const cached = this.getCachedHealth(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.azureClient.getResourceHealth(resourceType, resourceName);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to get resource health');
      }

      const health: ResourceHealth = {
        status: this.determineHealthStatus(response.data),
        lastCheck: new Date().toISOString(),
        issues: response.data.issues || [],
        uptime: response.data.uptime,
        availability: response.data.availability
      };

      // Cache the health
      this.setCachedHealth(cacheKey, health);
      
      this.logger.info('Resource health retrieved', { resourceName, health });
      return health;

    } catch (error) {
      this.logger.error('Failed to get resource health', error);
      
      // Return unknown status on error
      return {
        status: 'unknown',
        lastCheck: new Date().toISOString(),
        issues: [`Failed to check health: ${(error as Error).message}`]
      };
    }
  }

  /**
   * Check domain status and health
   */
  async checkDomainStatus(domain: string): Promise<DomainStatus> {
    if (!domain || domain.trim().length === 0) {
      throw new Error('Domain is required');
    }
    
    // Validate domain format
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      throw new Error('Invalid domain format');
    }
    
    this.logger.info('Checking domain status', { domain });

    try {
      const response = await this.azureClient.getDomainStatus(domain);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to check domain status');
      }

      const status: DomainStatus = {
        domain,
        isActive: response.data.isActive !== false,
        sslStatus: response.data.sslStatus || 'none',
        sslExpiryDate: response.data.sslExpiryDate,
        dnsStatus: response.data.dnsStatus || 'pending',
        httpStatus: response.data.httpStatus,
        responseTime: response.data.responseTime
      };

      this.logger.info('Domain status retrieved', { domain, status });
      return status;

    } catch (error) {
      this.logger.error('Failed to check domain status', error);
      throw new Error(`Failed to check domain ${domain}: ${(error as Error).message}`);
    }
  }

  /**
   * Configure alerts for a resource
   */
  async configureAlerts(
    resourceType: 'aci' | 'app-service',
    resourceName: string,
    config: AlertConfig
  ): Promise<void> {
    if (!resourceName || resourceName.trim().length === 0) {
      throw new Error('Resource name is required');
    }
    
    // Validate alert configuration
    if (config.cpuThreshold !== undefined && (config.cpuThreshold < 0 || config.cpuThreshold > 100)) {
      throw new Error('CPU threshold must be between 0 and 100');
    }
    if (config.memoryThreshold !== undefined && (config.memoryThreshold < 0 || config.memoryThreshold > 100)) {
      throw new Error('Memory threshold must be between 0 and 100');
    }
    if (config.enableWebhook && !config.webhookUrl) {
      throw new Error('Webhook URL is required when webhook is enabled');
    }
    if (config.enableEmail && (!config.emailAddresses || config.emailAddresses.length === 0)) {
      throw new Error('Email addresses are required when email alerts are enabled');
    }
    
    this.logger.info('Configuring alerts', { resourceType, resourceName, config });

    try {
      const response = await this.azureClient.configureAlerts(resourceType, resourceName, config);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to configure alerts');
      }

      this.logger.info('Alerts configured successfully', { resourceName });

    } catch (error) {
      this.logger.error('Failed to configure alerts', error);
      throw new Error(`Failed to configure alerts: ${(error as Error).message}`);
    }
  }

  /**
   * Start monitoring a resource with periodic checks
   */
  startMonitoring(
    resourceType: 'aci' | 'app-service',
    resourceName: string,
    intervalMs: number = 60000,
    callback?: (metrics: ResourceMetrics) => void
  ): NodeJS.Timeout {
    if (intervalMs < 10000) {
      throw new Error('Monitoring interval must be at least 10 seconds');
    }
    
    this.logger.info('Starting resource monitoring', { 
      resourceType, 
      resourceName, 
      intervalMs 
    });

    const monitor = async () => {
      try {
        let metrics: ResourceMetrics;
        
        if (resourceType === 'aci') {
          metrics = await this.getACIMetrics(resourceName);
        } else {
          metrics = await this.getAppServiceMetrics(resourceName);
        }
        
        if (callback) {
          callback(metrics);
        }
        
        // Check for issues
        this.checkMetricsForIssues(metrics, resourceName);
        
      } catch (error) {
        this.logger.error('Monitoring check failed', { resourceName, error });
      }
    };

    // Initial check
    monitor();

    // Set up periodic monitoring
    return setInterval(monitor, intervalMs);
  }

  /**
   * Stop monitoring a resource
   */
  stopMonitoring(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
    this.logger.info('Stopped resource monitoring');
  }

  // Private helper methods

  private getCachedMetrics(key: string): ResourceMetrics | null {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp || Date.now() - timestamp > this.CACHE_TTL) {
      return null;
    }
    return this.metricsCache.get(key) || null;
  }

  private setCachedMetrics(key: string, metrics: ResourceMetrics): void {
    this.metricsCache.set(key, metrics);
    this.cacheTimestamps.set(key, Date.now());
    
    // Clean up old entries if cache is too large
    if (this.metricsCache.size > 100) {
      const oldestKey = this.cacheTimestamps.entries().next().value?.[0];
      if (oldestKey) {
        this.metricsCache.delete(oldestKey);
        this.cacheTimestamps.delete(oldestKey);
      }
    }
  }

  private getCachedHealth(key: string): ResourceHealth | null {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp || Date.now() - timestamp > this.CACHE_TTL) {
      return null;
    }
    return this.healthCache.get(key) || null;
  }

  private setCachedHealth(key: string, health: ResourceHealth): void {
    this.healthCache.set(key, health);
    this.cacheTimestamps.set(key, Date.now());
  }

  private calculateAggregates(metrics: any[]): MetricsHistory['aggregates'] {
    if (!metrics || metrics.length === 0) {
      return { avgCpu: 0, maxCpu: 0, avgMemory: 0, maxMemory: 0 };
    }

    const cpuValues = metrics.map(m => m.cpu?.percentage || 0);
    const memoryValues = metrics.map(m => m.memory?.percentage || 0);

    return {
      avgCpu: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length,
      maxCpu: Math.max(...cpuValues),
      avgMemory: memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length,
      maxMemory: Math.max(...memoryValues)
    };
  }

  private determineHealthStatus(data: any): ResourceHealth['status'] {
    if (!data) return 'unknown';
    
    if (data.status === 'healthy' || data.state === 'Running') {
      return 'healthy';
    }
    if (data.status === 'unhealthy' || data.state === 'Failed') {
      return 'unhealthy';
    }
    if (data.status === 'degraded' || data.issues?.length > 0) {
      return 'degraded';
    }
    
    return 'unknown';
  }

  private checkMetricsForIssues(metrics: ResourceMetrics, resourceName: string): void {
    const issues: string[] = [];
    
    // Check CPU usage
    if (metrics.cpu.percentage > 90) {
      issues.push(`High CPU usage: ${metrics.cpu.percentage}%`);
    }
    
    // Check memory usage
    if (metrics.memory.percentage > 90) {
      issues.push(`High memory usage: ${metrics.memory.percentage}%`);
    }
    
    if (issues.length > 0) {
      this.logger.warn('Resource metrics show issues', { resourceName, issues });
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.metricsCache.clear();
    this.healthCache.clear();
    this.cacheTimestamps.clear();
    this.logger.info('Monitoring cache cleared');
  }
}
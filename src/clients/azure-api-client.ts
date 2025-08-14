/**
 * Azure API Client
 * Comprehensive client for interacting with the Azure API service v1
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { Logger } from '../utils/logger';

export interface AzureAPIConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

// Container Instance Types
export interface ContainerDeploymentRequest {
  name: string;
  image: string;
  resourceGroup?: string;
  location?: string;
  cpu?: number;
  memoryGB?: number;
  ports?: Array<{ port: number; protocol: 'TCP' | 'UDP' }>;
  environmentVariables?: Record<string, string>;
  dnsLabel?: string;
  restartPolicy?: 'Always' | 'OnFailure' | 'Never';
  volumes?: Array<{
    name: string;
    mountPath: string;
    storageAccount: string;
    shareName: string;
  }>;
}

export interface ContainerExecuteRequest {
  command: string[];
  timeout?: number;
  stream?: boolean;
}

export interface ContainerMetricsResponse {
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
  network: {
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
  };
}

// App Service Types
export interface AppServiceDeploymentRequest {
  name: string;
  runtime: string;
  runtimeVersion?: string;
  resourceGroup?: string;
  location?: string;
  planName?: string;
  customDomain?: string;
  environmentVariables?: Record<string, string>;
}

// Static Web App Types
export interface SWADeploymentRequest {
  name: string;
  repositoryUrl: string;
  branch: string;
  resourceGroup?: string;
  location?: string;
  buildCommand?: string;
  apiLocation?: string;
  outputLocation?: string;
  customDomain?: string;
}

// Unified Deployment Types
export interface UnifiedDeploymentRequest {
  name?: string;
  projectName?: string;
  source: {
    type: 'github' | 'docker' | 'local';
    url?: string;
    branch?: string;
    dockerImage?: string;
  };
  serviceType?: 'auto' | 'app-service' | 'container-instance' | 'static-web-app';
  framework?: string;
  runtime?: string;
  hasBackend?: boolean;
  hasDatabase?: boolean;
  expectedTraffic?: 'low' | 'medium' | 'high';
  domain?: {
    custom?: string;
    generateUnique?: boolean;
  };
  resources?: {
    cpu?: number;
    memory?: number;
    sku?: string;
  };
  environment?: 'dev' | 'staging' | 'prod';
  environmentVariables?: Record<string, string>;
  autoScale?: boolean;
  enableSSL?: boolean;
  enableMonitoring?: boolean;
  tags?: Record<string, string>;
}

// Subdomain Types
export interface SubdomainGenerateRequest {
  projectName: string;
  description?: string;
  preferredName?: string;
  category?: string;
  includeRandom?: boolean;
  maxLength?: number;
}

export interface SubdomainServiceRequest {
  serviceName: string;
  serviceType: 'aci' | 'appservice' | 'swa';
  projectName?: string;
  description?: string;
}

export interface SubdomainBulkRequest {
  services: Array<{
    name: string;
    type: 'aci' | 'appservice' | 'swa';
    description?: string;
  }>;
}

// Resource Monitoring Types
export interface ResourceMetricsQuery {
  timeRange?: number; // in minutes
}

// Automation Types
export interface AutomationQuickDeployRequest {
  projectName: string;
  tier?: 'basic' | 'docker' | 'full' | 'enterprise';
  githubUrl?: string;
}

export interface AutomationDeployRequest {
  tier: 'basic' | 'docker' | 'full' | 'enterprise';
  projectName: string;
  description?: string;
  isPrivate?: boolean;
  language?: string;
  framework?: string;
  nodeVersion?: string;
  azureSubscriptionId?: string;
  azureResourceGroup?: string;
  azureRegion?: string;
  preset?: 'small' | 'medium' | 'large' | 'enterprise';
  customDomain?: string;
  enableSSL?: boolean;
  environments?: string[];
  enableMonitoring?: boolean;
  enableSecurityScanning?: boolean;
  enableAutoScaling?: boolean;
  secrets?: Record<string, string>;
}

// Blob Storage Types
export interface BlobStorageAccountRequest {
  name: string;
  location?: string;
  sku?: string;
  kind?: string;
  accessTier?: string;
  enableHttpsOnly?: boolean;
  tags?: Record<string, string>;
}

export interface BlobContainerRequest {
  name: string;
  publicAccess?: 'none' | 'blob' | 'container';
  metadata?: Record<string, string>;
}

export interface BlobUploadRequest {
  containerName: string;
  blobName: string;
  content: string | Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  overwrite?: boolean;
}

export interface StaticWebsiteRequest {
  indexDocument: string;
  errorDocument404?: string;
  defaultIndexDocumentPath?: string;
}

export interface StaticWebsiteDeployRequest {
  sourcePath: string;
  indexDocument?: string;
  errorDocument?: string;
  cleanDeploy?: boolean;
  excludePatterns?: string[];
  cdnEnabled?: boolean;
  customDomain?: string;
}

export interface SASTokenRequest {
  containerName: string;
  blobName?: string;
  permissions?: string;
  expiryMinutes?: number;
  ipRange?: string;
  protocol?: 'https' | 'http,https';
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp?: string;
}

export class AzureAPIClient {
  private client: AxiosInstance;
  private logger: Logger;
  private isHealthy: boolean = false;
  private lastHealthCheck: number = 0;
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute

  constructor(config: AzureAPIConfig) {
    this.logger = Logger.getInstance();
    
    // Validate configuration
    if (!config.baseUrl) {
      throw new Error('Azure API base URL is required');
    }
    if (!config.apiKey) {
      throw new Error('Azure API key is required');
    }
    
    // Normalize base URL (remove trailing slash)
    const baseURL = config.baseUrl.replace(/\/$/, '');
    
    this.client = axios.create({
      baseURL,
      timeout: config.timeout || 60000,
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use((req) => {
      this.logger.debug('Azure API Request', {
        method: req.method,
        url: req.url,
        data: req.data
      });
      return req;
    });

    // Add response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (res) => {
        this.logger.debug('Azure API Response', {
          status: res.status,
          data: res.data
        });
        return res;
      },
      (error: AxiosError) => {
        this.logger.error('Azure API Error', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
        throw this.enhanceError(error);
      }
    );
  }

  private enhanceError(error: AxiosError): Error {
    // Handle network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      const networkError = new Error('Azure API service is unavailable');
      (networkError as any).status = 503;
      (networkError as any).isNetworkError = true;
      return networkError;
    }
    
    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      const timeoutError = new Error('Azure API request timed out');
      (timeoutError as any).status = 408;
      (timeoutError as any).isTimeout = true;
      return timeoutError;
    }
    
    const response = error.response?.data as APIResponse;
    const enhancedError = new Error(
      response?.error || response?.message || error.message || 'Unknown Azure API error'
    );
    (enhancedError as any).status = error.response?.status;
    (enhancedError as any).details = response;
    (enhancedError as any).isApiError = true;
    return enhancedError;
  }

  // ==================== Health & Status ====================
  async health(): Promise<APIResponse> {
    try {
      const response = await this.client.get('/health');
      this.isHealthy = response.status === 200;
      this.lastHealthCheck = Date.now();
      return response.data;
    } catch (error) {
      this.isHealthy = false;
      throw error;
    }
  }
  
  async checkHealth(): Promise<boolean> {
    // Use cached health status if recent
    if (Date.now() - this.lastHealthCheck < this.HEALTH_CHECK_INTERVAL) {
      return this.isHealthy;
    }
    
    try {
      await this.health();
      return true;
    } catch {
      return false;
    }
  }

  // ==================== Container Instances API ====================
  async deployContainer(request: ContainerDeploymentRequest): Promise<APIResponse> {
    // Validate required fields
    if (!request.name || !request.image) {
      throw new Error('Container name and image are required');
    }
    
    // Sanitize container name
    request.name = this.sanitizeResourceName(request.name);
    
    const response = await this.client.post('/api/v1/container-instances/deploy', request);
    return response.data;
  }

  async getContainerStatus(name: string): Promise<APIResponse> {
    if (!name) {
      throw new Error('Container name is required');
    }
    
    const sanitizedName = this.sanitizeResourceName(name);
    const response = await this.client.get(`/api/v1/container-instances/${sanitizedName}/status`);
    return response.data;
  }

  async executeContainerCommand(name: string, request: ContainerExecuteRequest): Promise<APIResponse> {
    if (!name) {
      throw new Error('Container name is required');
    }
    if (!request.command || request.command.length === 0) {
      throw new Error('Command is required');
    }
    
    const sanitizedName = this.sanitizeResourceName(name);
    const response = await this.client.post(`/api/v1/container-instances/${sanitizedName}/execute`, request);
    return response.data;
  }

  async listContainers(resourceGroup?: string, state?: string): Promise<APIResponse> {
    const params = new URLSearchParams();
    if (resourceGroup) params.append('resourceGroup', resourceGroup);
    if (state) params.append('state', state);
    
    const response = await this.client.get('/api/v1/container-instances', { params });
    return response.data;
  }

  async stopContainer(name: string): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/container-instances/${name}/stop`);
    return response.data;
  }

  async startContainer(name: string): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/container-instances/${name}/start`);
    return response.data;
  }

  async restartContainer(name: string): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/container-instances/${name}/restart`);
    return response.data;
  }

  async updateContainer(name: string, updates: Partial<ContainerDeploymentRequest>): Promise<APIResponse> {
    const response = await this.client.put(`/api/v1/container-instances/${name}`, updates);
    return response.data;
  }

  async getContainerLogs(name: string, tail?: number, timestamps?: boolean): Promise<APIResponse> {
    const params = new URLSearchParams();
    if (tail) params.append('tail', tail.toString());
    if (timestamps) params.append('timestamps', 'true');
    
    const response = await this.client.get(`/api/v1/container-instances/${name}/logs`, { params });
    return response.data;
  }

  async deleteContainer(name: string): Promise<APIResponse> {
    const response = await this.client.delete(`/api/v1/container-instances/${name}`);
    return response.data;
  }

  async getContainerMetrics(name: string, timeRange?: number): Promise<APIResponse<ContainerMetricsResponse>> {
    const params = new URLSearchParams();
    if (timeRange) params.append('timeRange', timeRange.toString());
    
    const response = await this.client.get(`/api/v1/container-instances/${name}/metrics`, { params });
    return response.data;
  }

  // ==================== App Service API ====================
  async deployAppService(request: AppServiceDeploymentRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/app-service/deploy', request);
    return response.data;
  }

  async getAppServiceStatus(name: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/app-service/${name}/status`);
    return response.data;
  }

  async deleteAppService(name: string): Promise<APIResponse> {
    const response = await this.client.delete(`/api/v1/app-service/${name}`);
    return response.data;
  }

  // ==================== Static Web Apps API ====================
  async deploySWA(request: SWADeploymentRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/static-web-apps/deploy', request);
    return response.data;
  }

  async getSWAStatus(name: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/static-web-apps/${name}/status`);
    return response.data;
  }

  async deleteSWA(name: string): Promise<APIResponse> {
    const response = await this.client.delete(`/api/v1/static-web-apps/${name}`);
    return response.data;
  }

  // ==================== Unified Deployment API ====================
  async deploy(request: UnifiedDeploymentRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/deploy', request);
    return response.data;
  }

  async analyzeDeployment(request: UnifiedDeploymentRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/deploy/analyze', request);
    return response.data;
  }

  async getDeploymentStatus(deploymentId: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/deploy/${deploymentId}/status`);
    return response.data;
  }

  async updateDeployment(deploymentId: string, updates: Partial<UnifiedDeploymentRequest>): Promise<APIResponse> {
    const response = await this.client.put(`/api/v1/deploy/${deploymentId}`, updates);
    return response.data;
  }

  async rollbackDeployment(deploymentId: string, version?: string): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/deploy/${deploymentId}/rollback`, { version });
    return response.data;
  }

  async deleteDeployment(deploymentId: string): Promise<APIResponse> {
    const response = await this.client.delete(`/api/v1/deploy/${deploymentId}`);
    return response.data;
  }

  // ==================== Subdomain Management API ====================
  async generateSubdomain(request: SubdomainGenerateRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/subdomains/generate', request);
    return response.data;
  }

  async generateSubdomainForService(request: SubdomainServiceRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/subdomains/generate-for-service', request);
    return response.data;
  }

  async generateBulkSubdomains(request: SubdomainBulkRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/subdomains/bulk-generate', request);
    return response.data;
  }

  async checkSubdomainAvailability(subdomain: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/subdomains/check/${subdomain}`);
    return response.data;
  }

  async reserveSubdomain(subdomain: string, projectId: string): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/subdomains/reserve', { subdomain, projectId });
    return response.data;
  }

  async releaseSubdomain(subdomain: string): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/subdomains/release', { subdomain });
    return response.data;
  }

  // ==================== Resource Monitoring API ====================
  async getACIMetrics(name: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/resource-monitor/aci/${name}/metrics`);
    return response.data;
  }

  async getAppServiceMetrics(name: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/resource-monitor/app-service/${name}/metrics`);
    return response.data;
  }

  async getMetricsHistory(resourceType: 'aci' | 'app-service', name: string, duration?: string): Promise<APIResponse> {
    const params = new URLSearchParams();
    if (duration) params.append('duration', duration);
    
    const response = await this.client.get(`/api/v1/resource-monitor/${resourceType}/${name}/history`, { params });
    return response.data;
  }

  async getResourceHealth(resourceType: 'aci' | 'app-service', name: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/resource-monitor/${resourceType}/${name}/health`);
    return response.data;
  }

  async getDomainStatus(domain: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/resource-monitor/domain/${domain}/status`);
    return response.data;
  }

  async configureAlerts(resourceType: 'aci' | 'app-service', name: string, alerts: any): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/resource-monitor/${resourceType}/${name}/alerts`, alerts);
    return response.data;
  }

  // ==================== Automation API ====================
  async quickDeploy(request: AutomationQuickDeployRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/automation/quick-deploy', request);
    return response.data;
  }

  async automationDeploy(request: AutomationDeployRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/automation/deploy', request);
    return response.data;
  }

  async deployFromGitHub(githubUrl: string, preset?: string): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/automation/deploy-from-github', {
      githubUrl,
      preset
    });
    return response.data;
  }

  async getAutomationStatus(projectName: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/automation/status/${projectName}`);
    return response.data;
  }

  // ==================== Git Terminal API ====================
  async createGitSession(containerGroupName: string): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/git-terminal/sessions', {
      containerGroupName
    });
    return response.data;
  }

  async executeGitCommand(sessionId: string, command: string): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/git-terminal/sessions/${sessionId}/execute`, {
      command
    });
    return response.data;
  }

  async getGitSessionStatus(sessionId: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/git-terminal/sessions/${sessionId}`);
    return response.data;
  }

  async deleteGitSession(sessionId: string): Promise<APIResponse> {
    const response = await this.client.delete(`/api/v1/git-terminal/sessions/${sessionId}`);
    return response.data;
  }

  // ==================== DNS Management API ====================
  async configureDNS(domain: string, target: string, recordType: 'A' | 'CNAME' = 'CNAME'): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/dns/configure', {
      domain,
      target,
      recordType
    });
    return response.data;
  }

  async getDNSRecords(domain: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/dns/records/${domain}`);
    return response.data;
  }

  async deleteDNSRecord(domain: string, recordId: string): Promise<APIResponse> {
    const response = await this.client.delete(`/api/v1/dns/records/${domain}/${recordId}`);
    return response.data;
  }

  // ==================== SSL Management API ====================
  async configureSSL(domain: string, appName: string): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/ssl/configure', {
      domain,
      appName
    });
    return response.data;
  }

  async getSSLStatus(domain: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/ssl/status/${domain}`);
    return response.data;
  }

  async renewSSLCertificate(domain: string): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/ssl/renew/${domain}`);
    return response.data;
  }

  // ==================== Blob Storage API ====================
  async createStorageAccount(request: BlobStorageAccountRequest): Promise<APIResponse> {
    const response = await this.client.post('/api/v1/blob-storage/accounts', request);
    return response.data;
  }

  async getStorageAccount(accountName: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/blob-storage/accounts/${accountName}`);
    return response.data;
  }

  async listStorageAccounts(): Promise<APIResponse> {
    const response = await this.client.get('/api/v1/blob-storage/accounts');
    return response.data;
  }

  async deleteStorageAccount(accountName: string): Promise<APIResponse> {
    const response = await this.client.delete(`/api/v1/blob-storage/accounts/${accountName}`);
    return response.data;
  }

  async getStorageAccountKeys(accountName: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/blob-storage/accounts/${accountName}/keys`);
    return response.data;
  }

  async createContainer(accountName: string, request: BlobContainerRequest): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/blob-storage/${accountName}/containers`, request);
    return response.data;
  }

  async listBlobContainers(accountName: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/blob-storage/${accountName}/containers`);
    return response.data;
  }

  async deleteBlobContainer(accountName: string, containerName: string): Promise<APIResponse> {
    const response = await this.client.delete(`/api/v1/blob-storage/${accountName}/containers/${containerName}`);
    return response.data;
  }

  async uploadBlob(accountName: string, containerName: string, file: File | Buffer, options?: {
    blobName?: string;
    metadata?: Record<string, string>;
    overwrite?: boolean;
  }): Promise<APIResponse> {
    const formData = new FormData();
    if (file instanceof File) {
      formData.append('file', file);
    } else {
      formData.append('file', new Blob([file]));
    }
    if (options?.blobName) formData.append('blobName', options.blobName);
    if (options?.metadata) formData.append('metadata', JSON.stringify(options.metadata));
    if (options?.overwrite !== undefined) formData.append('overwrite', String(options.overwrite));

    const response = await this.client.post(
      `/api/v1/blob-storage/${accountName}/${containerName}/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  }

  async listBlobs(accountName: string, containerName: string, options?: {
    prefix?: string;
    maxResults?: number;
  }): Promise<APIResponse> {
    const params = new URLSearchParams();
    if (options?.prefix) params.append('prefix', options.prefix);
    if (options?.maxResults) params.append('maxResults', String(options.maxResults));
    
    const response = await this.client.get(
      `/api/v1/blob-storage/${accountName}/${containerName}/blobs`,
      { params }
    );
    return response.data;
  }

  async downloadBlob(accountName: string, containerName: string, blobName: string): Promise<APIResponse> {
    const response = await this.client.get(
      `/api/v1/blob-storage/${accountName}/${containerName}/blob/${blobName}`,
      { responseType: 'blob' }
    );
    return response.data;
  }

  async deleteBlob(accountName: string, containerName: string, blobName: string): Promise<APIResponse> {
    const response = await this.client.delete(
      `/api/v1/blob-storage/${accountName}/${containerName}/blob/${blobName}`
    );
    return response.data;
  }

  async generateBlobSASUrl(accountName: string, request: SASTokenRequest): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/blob-storage/${accountName}/sas`, request);
    return response.data;
  }

  async enableStaticWebsite(accountName: string, request: StaticWebsiteRequest): Promise<APIResponse> {
    const response = await this.client.post(
      `/api/v1/blob-storage/${accountName}/static-website/enable`,
      request
    );
    return response.data;
  }

  async disableStaticWebsite(accountName: string): Promise<APIResponse> {
    const response = await this.client.post(`/api/v1/blob-storage/${accountName}/static-website/disable`);
    return response.data;
  }

  async getStaticWebsiteStatus(accountName: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/blob-storage/${accountName}/static-website/status`);
    return response.data;
  }

  async deployStaticWebsite(accountName: string, request: StaticWebsiteDeployRequest): Promise<APIResponse> {
    const response = await this.client.post(
      `/api/v1/blob-storage/${accountName}/static-website/deploy`,
      request
    );
    return response.data;
  }

  async updateStaticWebsite(accountName: string, sourcePath: string, filesToUpdate?: string[]): Promise<APIResponse> {
    const response = await this.client.post(
      `/api/v1/blob-storage/${accountName}/static-website/update`,
      { sourcePath, filesToUpdate }
    );
    return response.data;
  }

  async getStaticWebsiteUrl(accountName: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/blob-storage/${accountName}/static-website/url`);
    return response.data;
  }

  async getStorageMetrics(accountName: string): Promise<APIResponse> {
    const response = await this.client.get(`/api/v1/blob-storage/${accountName}/metrics`);
    return response.data;
  }
  
  // ==================== Helper Methods ====================
  private sanitizeResourceName(name: string): string {
    // Azure resource names: lowercase alphanumeric and hyphens
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 63);
  }
  
  private encodePathParam(param: string): string {
    // Safely encode path parameters to prevent injection
    return encodeURIComponent(param);
  }
  
  /**
   * Check if the API is available before making requests
   */
  async ensureHealthy(): Promise<void> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new Error('Azure API service is not available');
    }
  }
}
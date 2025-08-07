/**
 * Azure API Adapter
 * Adapts the external Azure API client to match the existing interfaces
 */

import { AzureAPIClient } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';
import { Logger } from '../utils/logger';

// Initialize the Azure API client
const azureClient = new AzureAPIClient(azureAPIConfig);

/**
 * ACIManager Adapter
 * Provides backward compatibility for ACI operations
 */
export class ACIManager {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  async deployContainer(options: any): Promise<any> {
    this.logger.info('Deploying container via Azure API', { options });
    
    const request = {
      name: options.containerGroupName,
      image: options.image,
      resourceGroup: options.resourceGroup,
      location: options.location,
      cpu: options.cpu,
      memoryGB: options.memoryInGB,
      ports: options.ports,
      environmentVariables: options.environmentVariables,
      restartPolicy: options.restartPolicy
    };

    return azureClient.deployContainer(request);
  }

  async getContainerGroup(containerGroupName: string): Promise<any> {
    this.logger.info('Getting container group status via Azure API', { containerGroupName });
    return azureClient.getContainerStatus(containerGroupName);
  }

  async deleteContainerGroup(containerGroupName: string): Promise<any> {
    this.logger.info('Deleting container group via Azure API', { containerGroupName });
    return azureClient.deleteContainer(containerGroupName);
  }

  async executeCommand(containerGroupName: string, command: string): Promise<any> {
    this.logger.info('Executing command via Azure API', { containerGroupName, command });
    return azureClient.executeContainerCommand(containerGroupName, { command: [command] });
  }

  async createTerminalSession(containerGroupName: string): Promise<any> {
    this.logger.info('Creating terminal session via Azure API', { containerGroupName });
    return azureClient.createGitSession(containerGroupName);
  }

  async createProjectWorkspace(options: any): Promise<any> {
    // Map to deployContainer for backward compatibility
    return this.deployContainer({
      ...options,
      containerGroupName: options.containerGroupName || options.name
    });
  }
}

/**
 * StaticWebAppManager Adapter
 * Provides backward compatibility for Static Web App operations
 */
export class StaticWebAppManager {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  async create(options: any): Promise<any> {
    this.logger.info('Creating static web app via Azure API', { options });
    
    const request = {
      name: options.name,
      repositoryUrl: options.repositoryUrl,
      branch: options.branch || 'main',
      resourceGroup: options.resourceGroup,
      location: options.location,
      buildCommand: options.buildCommand,
      apiLocation: options.apiLocation,
      outputLocation: options.outputLocation,
      customDomain: options.customDomain
    };

    return azureClient.deploySWA(request);
  }

  async get(appName: string): Promise<any> {
    this.logger.info('Getting static web app status via Azure API', { appName });
    return azureClient.getSWAStatus(appName);
  }

  async delete(appName: string): Promise<any> {
    this.logger.info('Deleting static web app via Azure API', { appName });
    return azureClient.deleteSWA(appName);
  }

  async addCustomDomain(appName: string, domain: string): Promise<any> {
    this.logger.info('Adding custom domain via Azure API', { appName, domain });
    return azureClient.configureDNS(domain, `${appName}.azurestaticapps.net`);
  }
}

/**
 * AppServiceManager Adapter
 * Provides backward compatibility for App Service operations
 */
export class AppServiceManager {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  async create(options: any): Promise<any> {
    this.logger.info('Creating app service via Azure API', { options });
    
    const request = {
      name: options.name,
      runtime: options.runtime,
      resourceGroup: options.resourceGroup,
      location: options.location,
      planName: options.planName,
      customDomain: options.customDomain,
      environmentVariables: options.environmentVariables
    };

    return azureClient.deployAppService(request);
  }

  async get(appName: string): Promise<any> {
    this.logger.info('Getting app service status via Azure API', { appName });
    return azureClient.getAppServiceStatus(appName);
  }

  async delete(appName: string): Promise<any> {
    this.logger.info('Deleting app service via Azure API', { appName });
    return azureClient.deleteAppService(appName);
  }

  async addCustomDomain(appName: string, domain: string): Promise<any> {
    this.logger.info('Adding custom domain via Azure API', { appName, domain });
    await azureClient.configureDNS(domain, `${appName}.azurewebsites.net`);
    return azureClient.configureSSL(domain, appName);
  }
}

/**
 * Export singleton instances for backward compatibility
 */
export const aciManager = new ACIManager();
export const staticWebAppManager = new StaticWebAppManager();
export const appServiceManager = new AppServiceManager();
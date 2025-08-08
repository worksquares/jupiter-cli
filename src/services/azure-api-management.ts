/**
 * Azure API Management Service
 * Handles API routing and integration for static site serving
 */

import { Logger } from '../utils/logger';
import axios from 'axios';

export interface APIManagementConfig {
  serviceName: string;
  resourceGroup: string;
  subscriptionId: string;
  location?: string;
  sku?: 'Developer' | 'Basic' | 'Standard' | 'Premium';
}

export interface APIRoute {
  path: string;
  backend: string;
  methods?: string[];
  cache?: boolean;
  authentication?: boolean;
}

export class AzureAPIManagement {
  private logger: Logger;
  private config: APIManagementConfig;
  private baseUrl: string;

  constructor(config?: Partial<APIManagementConfig>) {
    this.logger = new Logger('AzureAPIManagement');
    
    this.config = {
      serviceName: config?.serviceName || process.env.AZURE_APIM_SERVICE || 'jupiter-apim',
      resourceGroup: config?.resourceGroup || process.env.AZURE_RESOURCE_GROUP || 'jupiter-ai-rg',
      subscriptionId: config?.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '',
      location: config?.location || 'eastus',
      sku: config?.sku || 'Developer'
    };

    this.baseUrl = `https://management.azure.com/subscriptions/${this.config.subscriptionId}/resourceGroups/${this.config.resourceGroup}/providers/Microsoft.ApiManagement/service/${this.config.serviceName}`;
  }

  /**
   * Create API Management service
   */
  async createService(): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const token = await this.getAccessToken();
      const apiVersion = '2021-08-01';
      
      const serviceConfig = {
        location: this.config.location,
        sku: {
          name: this.config.sku,
          capacity: 1
        },
        properties: {
          publisherEmail: process.env.PUBLISHER_EMAIL || 'admin@jupiter-ai.com',
          publisherName: 'Jupiter AI',
          customProperties: {
            'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls11': 'false',
            'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls10': 'false',
            'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Ssl30': 'false',
            'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TripleDes168': 'false',
            'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls11': 'false',
            'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls10': 'false',
            'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Ssl30': 'false'
          }
        }
      };

      const response = await axios.put(
        `${this.baseUrl}?api-version=${apiVersion}`,
        serviceConfig,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 200 || response.status === 201 || response.status === 202) {
        const gatewayUrl = `https://${this.config.serviceName}.azure-api.net`;
        this.logger.info(`API Management service created: ${gatewayUrl}`);
        
        return {
          success: true,
          url: gatewayUrl
        };
      }

      throw new Error(`Failed to create API Management service: ${response.status}`);

    } catch (error) {
      this.logger.error('API Management service creation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Creation failed'
      };
    }
  }

  /**
   * Configure API routes for static site serving
   */
  async configureStaticSiteRoutes(): Promise<{ success: boolean; error?: string }> {
    try {
      const routes: APIRoute[] = [
        {
          path: '/',
          backend: process.env.STATIC_SITE_URL || 'https://jupiter-ai.azurestaticapps.net',
          methods: ['GET'],
          cache: true
        },
        {
          path: '/app/*',
          backend: process.env.STATIC_SITE_URL || 'https://jupiter-ai.azurestaticapps.net',
          methods: ['GET'],
          cache: true
        },
        {
          path: '/api/*',
          backend: process.env.API_BACKEND_URL || 'https://jupiter-ai-api.azurewebsites.net',
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          authentication: true
        },
        {
          path: '/auth/*',
          backend: process.env.API_BACKEND_URL || 'https://jupiter-ai-api.azurewebsites.net',
          methods: ['POST'],
          authentication: false
        },
        {
          path: '/deploy/*',
          backend: process.env.API_BACKEND_URL || 'https://jupiter-ai-api.azurewebsites.net',
          methods: ['GET', 'POST'],
          authentication: true
        }
      ];

      for (const route of routes) {
        await this.createAPIRoute(route);
      }

      // Configure policies
      await this.configurePolicies();

      return { success: true };

    } catch (error) {
      this.logger.error('Route configuration failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Configuration failed'
      };
    }
  }

  /**
   * Create individual API route
   */
  private async createAPIRoute(route: APIRoute): Promise<void> {
    const token = await this.getAccessToken();
    const apiVersion = '2021-08-01';
    const apiId = 'jupiter-api';
    const operationId = route.path.replace(/[^a-zA-Z0-9]/g, '-');

    // Create API if not exists
    const apiConfig = {
      properties: {
        displayName: 'Jupiter AI API',
        path: 'v1',
        protocols: ['https'],
        serviceUrl: route.backend
      }
    };

    await axios.put(
      `${this.baseUrl}/apis/${apiId}?api-version=${apiVersion}`,
      apiConfig,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Create operation for each method
    for (const method of route.methods || ['GET']) {
      const operationConfig = {
        properties: {
          displayName: `${method} ${route.path}`,
          method: method,
          urlTemplate: route.path,
          responses: [
            {
              statusCode: 200,
              description: 'Success'
            }
          ]
        }
      };

      await axios.put(
        `${this.baseUrl}/apis/${apiId}/operations/${operationId}-${method.toLowerCase()}?api-version=${apiVersion}`,
        operationConfig,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Add policies if needed
      if (route.cache || route.authentication) {
        await this.addOperationPolicy(apiId, `${operationId}-${method.toLowerCase()}`, route);
      }
    }
  }

  /**
   * Add operation policy
   */
  private async addOperationPolicy(
    apiId: string,
    operationId: string,
    route: APIRoute
  ): Promise<void> {
    const token = await this.getAccessToken();
    const apiVersion = '2021-08-01';

    let policyXml = '<policies><inbound>';

    if (route.authentication) {
      policyXml += `
        <validate-jwt header-name="Authorization" failed-validation-httpcode="401" failed-validation-error-message="Unauthorized">
          <openid-config url="https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration" />
          <audiences>
            <audience>${process.env.API_AUDIENCE || 'api://jupiter-ai'}</audience>
          </audiences>
        </validate-jwt>`;
    }

    if (route.cache) {
      policyXml += `
        <cache-lookup vary-by-developer="false" vary-by-developer-groups="false">
          <vary-by-header>Accept</vary-by-header>
          <vary-by-header>Accept-Charset</vary-by-header>
        </cache-lookup>`;
    }

    policyXml += `
        <base />
      </inbound>
      <backend>
        <base />
      </backend>
      <outbound>`;

    if (route.cache) {
      policyXml += `
        <cache-store duration="3600" />`;
    }

    policyXml += `
        <base />
      </outbound>
      <on-error>
        <base />
      </on-error>
    </policies>`;

    await axios.put(
      `${this.baseUrl}/apis/${apiId}/operations/${operationId}/policies/policy?api-version=${apiVersion}`,
      {
        properties: {
          value: policyXml,
          format: 'xml'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  /**
   * Configure global policies
   */
  private async configurePolicies(): Promise<void> {
    const token = await this.getAccessToken();
    const apiVersion = '2021-08-01';

    const globalPolicy = `
      <policies>
        <inbound>
          <cors allow-credentials="true">
            <allowed-origins>
              <origin>${process.env.STATIC_SITE_URL || 'https://jupiter-ai.azurestaticapps.net'}</origin>
              <origin>https://localhost:3000</origin>
            </allowed-origins>
            <allowed-methods>
              <method>GET</method>
              <method>POST</method>
              <method>PUT</method>
              <method>DELETE</method>
              <method>OPTIONS</method>
            </allowed-methods>
            <allowed-headers>
              <header>*</header>
            </allowed-headers>
          </cors>
          <rate-limit calls="100" renewal-period="60" />
          <ip-filter action="allow">
            <address-range from="0.0.0.0" to="255.255.255.255" />
          </ip-filter>
          <set-header name="X-Powered-By" exists-action="override">
            <value>Jupiter AI</value>
          </set-header>
        </inbound>
        <backend>
          <forward-request timeout="30" />
        </backend>
        <outbound>
          <set-header name="Cache-Control" exists-action="override">
            <value>public, max-age=3600</value>
          </set-header>
          <set-header name="X-Content-Type-Options" exists-action="override">
            <value>nosniff</value>
          </set-header>
          <set-header name="X-Frame-Options" exists-action="override">
            <value>DENY</value>
          </set-header>
        </outbound>
        <on-error>
          <set-status code="500" reason="Internal Server Error" />
          <set-header name="Content-Type" exists-action="override">
            <value>application/json</value>
          </set-header>
          <set-body>{"error": "An error occurred processing your request"}</set-body>
        </on-error>
      </policies>`;

    await axios.put(
      `${this.baseUrl}/policies/policy?api-version=${apiVersion}`,
      {
        properties: {
          value: globalPolicy,
          format: 'xml'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  /**
   * Get Azure access token
   */
  private async getAccessToken(): Promise<string> {
    try {
      const { execSync } = require('child_process');
      const token = execSync('az account get-access-token --query accessToken -o tsv', {
        encoding: 'utf8'
      }).trim();
      
      return token;
    } catch (error) {
      // Fallback to managed identity
      const response = await axios.get(
        'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/',
        {
          headers: {
            'Metadata': 'true'
          }
        }
      );
      
      return response.data.access_token;
    }
  }

  /**
   * Get API Management gateway URL
   */
  getGatewayUrl(): string {
    return `https://${this.config.serviceName}.azure-api.net`;
  }
}
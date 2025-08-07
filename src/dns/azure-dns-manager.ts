import { DnsManagementClient } from '@azure/arm-dns';
import { DefaultAzureCredential } from '@azure/identity';
import { Logger } from '../utils/logger';

export class AzureDNSManager {
  private client: DnsManagementClient;
  private logger: Logger;
  
  constructor(
    private resourceGroup: string = 'jupiter-agents',
    private zoneName: string = 'digisquares.com'
  ) {
    this.logger = new Logger('AzureDNSManager');
    const credential = new DefaultAzureCredential();
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID!;
    this.client = new DnsManagementClient(credential, subscriptionId);
  }

  async createSubdomain(subdomain: string, ip: string, ttl: number = 300) {
    try {
      await this.client.recordSets.createOrUpdate(
        this.resourceGroup,
        this.zoneName,
        subdomain,
        'A',
        {
          ttl,
          aRecords: [{ ipv4Address: ip }]
        }
      );
      
      this.logger.info(`Created DNS record: ${subdomain}.${this.zoneName} → ${ip}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to create DNS record', error);
      throw error;
    }
  }

  async deleteSubdomain(subdomain: string) {
    try {
      await this.client.recordSets.delete(
        this.resourceGroup,
        this.zoneName,
        subdomain,
        'A'
      );
      
      this.logger.info(`Deleted DNS record: ${subdomain}.${this.zoneName}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete DNS record', error);
      throw error;
    }
  }

  async listSubdomains() {
    const records = [];
    try {
      for await (const record of this.client.recordSets.listByDnsZone(
        this.resourceGroup,
        this.zoneName
      )) {
        if (record.type === 'Microsoft.Network/dnszones/A' && record.aRecords) {
          records.push({
            name: record.name,
            fqdn: `${record.name}.${this.zoneName}`,
            ip: record.aRecords[0]?.ipv4Address,
            ttl: record.ttl
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to list DNS records', error);
      throw error;
    }
    return records;
  }
}
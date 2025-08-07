/**
 * Manual DNS Configuration for digisquares.com
 * Alternative approach when API access is limited
 */

import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface ManualDNSConfig {
  domain: string;
  defaultTTL: number;
  records: ManualDNSRecord[];
}

export interface ManualDNSRecord {
  subdomain: string;
  target: string;
  type: 'A' | 'CNAME';
  ttl: number;
  created: Date;
  containerName?: string;
}

export class ManualDNSManager {
  private logger: Logger;
  private configPath: string;
  private config: ManualDNSConfig;

  constructor(domain: string = 'digisquares.com') {
    this.logger = new Logger('ManualDNSManager');
    this.configPath = path.join(__dirname, '../../../config/manual-dns-records.json');
    
    this.config = this.loadConfig() || {
      domain,
      defaultTTL: 600,
      records: []
    };
  }

  /**
   * Generate DNS configuration for manual setup
   */
  generateDNSConfig(containerName: string, containerIP: string, subdomain: string): ManualDNSRecord {
    const record: ManualDNSRecord = {
      subdomain,
      target: containerIP,
      type: 'A',
      ttl: this.config.defaultTTL,
      created: new Date(),
      containerName
    };

    // Add to config
    this.config.records.push(record);
    this.saveConfig();

    this.logger.info('Generated DNS configuration', {
      subdomain: `${subdomain}.${this.config.domain}`,
      target: containerIP
    });

    return record;
  }

  /**
   * Get GoDaddy dashboard instructions
   */
  getManualInstructions(record: ManualDNSRecord): string {
    return `
🌐 Manual DNS Setup Instructions for ${record.subdomain}.${this.config.domain}

1. Log into GoDaddy: https://dcc.godaddy.com/domains/
2. Find "digisquares.com" and click "DNS"
3. Click "Add" to create new record
4. Enter these values:
   - Type: ${record.type}
   - Name: ${record.subdomain}
   - Value: ${record.target}
   - TTL: ${record.ttl} (or select "10 minutes")
5. Click "Save"

DNS will propagate in 5-10 minutes.
Test with: nslookup ${record.subdomain}.${this.config.domain}
`;
  }

  /**
   * Generate bulk import format for GoDaddy
   */
  generateBulkImport(): string {
    const headers = ['Type', 'Name', 'Value', 'TTL'];
    const rows = this.config.records.map(r => [
      r.type,
      r.subdomain,
      r.target,
      r.ttl.toString()
    ]);

    const csv = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    const filePath = path.join(__dirname, '../../../config/godaddy-dns-import.csv');
    fs.writeFileSync(filePath, csv);

    return filePath;
  }

  /**
   * Get PowerShell script for DNS updates
   */
  generatePowerShellScript(): string {
    const script = `# PowerShell script to update DNS records
# This uses GoDaddy's web interface automation

$domain = "${this.config.domain}"
$records = @(
${this.config.records.map(r => `    @{Name="${r.subdomain}"; Type="${r.type}"; Value="${r.target}"; TTL=${r.ttl}}`).join(",\n")}
)

Write-Host "Please manually add these DNS records to GoDaddy:"
foreach ($record in $records) {
    Write-Host "- $($record.Name).$domain -> $($record.Value)"
}

# Open GoDaddy DNS management
Start-Process "https://dcc.godaddy.com/control/$domain/dns"
`;

    const filePath = path.join(__dirname, '../../../config/update-godaddy-dns.ps1');
    fs.writeFileSync(filePath, script);

    return filePath;
  }

  /**
   * List all pending DNS configurations
   */
  listPendingDNS(): ManualDNSRecord[] {
    return this.config.records;
  }

  /**
   * Remove DNS record
   */
  removeDNSRecord(subdomain: string): boolean {
    const index = this.config.records.findIndex(r => r.subdomain === subdomain);
    if (index >= 0) {
      this.config.records.splice(index, 1);
      this.saveConfig();
      return true;
    }
    return false;
  }

  /**
   * Generate Azure DNS Zone alternative
   */
  generateAzureDNSConfig(): string {
    return `
# Alternative: Use Azure DNS instead of GoDaddy

# Create Azure DNS Zone
az network dns zone create \\
  --resource-group ${process.env.AZURE_RESOURCE_GROUP} \\
  --name ${this.config.domain}

# Add DNS records
${this.config.records.map(r => `az network dns record-set a add-record \\
  --resource-group ${process.env.AZURE_RESOURCE_GROUP} \\
  --zone-name ${this.config.domain} \\
  --record-set-name ${r.subdomain} \\
  --ipv4-address ${r.target}`).join('\n')}

# Get nameservers to update in GoDaddy
az network dns zone show \\
  --resource-group ${process.env.AZURE_RESOURCE_GROUP} \\
  --name ${this.config.domain} \\
  --query nameServers
`;
  }

  private loadConfig(): ManualDNSConfig | null {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      this.logger.error('Failed to load DNS config', error);
    }
    return null;
  }

  private saveConfig(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      this.logger.error('Failed to save DNS config', error);
    }
  }
}

/**
 * Helper to generate DNS records for containers
 */
export class ContainerDNSHelper {
  static generateSubdomain(userId: string, projectId: string): string {
    return `${userId}-${projectId}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 63);
  }

  static generateDNSInstructions(containerIP: string, subdomain: string): string {
    const manager = new ManualDNSManager();
    const record = manager.generateDNSConfig(`container-${Date.now()}`, containerIP, subdomain);
    return manager.getManualInstructions(record);
  }
}
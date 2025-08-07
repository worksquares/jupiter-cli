# Moving DigiSquares.com to Azure DNS

## Overview

You can use Azure DNS to manage your domain without transferring ownership. You keep the domain registered with GoDaddy but use Azure for DNS management.

## Option 1: Azure DNS Zone (Recommended) ✅

### What it does:
- Keep domain registered at GoDaddy
- Use Azure to manage all DNS records
- Full API access for automation
- Automatic subdomain creation for containers

### Cost:
- **Azure DNS Zone**: $0.50 per month per zone
- **DNS Queries**: $0.40 per million queries
- **Total**: ~$0.50-$1.00/month for typical usage

### Setup Steps:

```bash
# 1. Create DNS Zone in Azure
az network dns zone create \
  --resource-group jupiter-agents \
  --name digisquares.com

# 2. Get Azure nameservers
az network dns zone show \
  --resource-group jupiter-agents \
  --name digisquares.com \
  --query nameServers

# Output will be like:
# [
#   "ns1-01.azure-dns.com.",
#   "ns2-01.azure-dns.net.",
#   "ns3-01.azure-dns.org.",
#   "ns4-01.azure-dns.info."
# ]
```

### 3. Update nameservers in GoDaddy:
1. Log into GoDaddy
2. Go to digisquares.com → DNS
3. Click "Change Nameservers"
4. Choose "Custom"
5. Enter the Azure nameservers from step 2
6. Save

### 4. Add DNS records in Azure:

```bash
# Add A record for root domain
az network dns record-set a add-record \
  --resource-group jupiter-agents \
  --zone-name digisquares.com \
  --record-set-name "@" \
  --ipv4-address YOUR-WEB-SERVER-IP

# Add CNAME for www
az network dns record-set cname set-record \
  --resource-group jupiter-agents \
  --zone-name digisquares.com \
  --record-set-name www \
  --cname digisquares.com

# Add A record for container
az network dns record-set a add-record \
  --resource-group jupiter-agents \
  --zone-name digisquares.com \
  --record-set-name demo-webapp \
  --ipv4-address 4.156.115.152
```

## Option 2: Azure DNS Private Resolver

For internal/private DNS only:
- **Cost**: $0.36 per hour (~$260/month) - NOT recommended for public domains

## Option 3: Azure Front Door with Custom Domain

### What it does:
- Global CDN and load balancer
- Automatic SSL certificates
- Advanced routing rules

### Cost:
- **Base**: $35/month
- **Bandwidth**: $0.08/GB
- Good for production apps with global users

## Automated DNS Management Script

Once DNS is in Azure, you can automate everything:

```typescript
// azure-dns-manager.ts
import { DnsManagementClient } from '@azure/arm-dns';
import { DefaultAzureCredential } from '@azure/identity';

export class AzureDNSManager {
  private client: DnsManagementClient;
  private resourceGroup = 'jupiter-agents';
  private zoneName = 'digisquares.com';

  constructor() {
    const credential = new DefaultAzureCredential();
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID!;
    this.client = new DnsManagementClient(credential, subscriptionId);
  }

  // Create subdomain for container
  async createContainerDNS(subdomain: string, ip: string) {
    await this.client.recordSets.createOrUpdate(
      this.resourceGroup,
      this.zoneName,
      subdomain,
      'A',
      {
        ttl: 300,
        aRecords: [{ ipv4Address: ip }]
      }
    );
    
    console.log(`Created: ${subdomain}.${this.zoneName} → ${ip}`);
  }

  // Delete subdomain
  async deleteContainerDNS(subdomain: string) {
    await this.client.recordSets.delete(
      this.resourceGroup,
      this.zoneName,
      subdomain,
      'A'
    );
  }

  // List all subdomains
  async listSubdomains() {
    const records = [];
    for await (const record of this.client.recordSets.listByDnsZone(
      this.resourceGroup,
      this.zoneName
    )) {
      if (record.type === 'Microsoft.Network/dnszones/A') {
        records.push({
          name: record.name,
          ip: record.aRecords?.[0]?.ipv4Address
        });
      }
    }
    return records;
  }
}
```

## Comparison

| Feature | GoDaddy DNS | Azure DNS | 
|---------|-------------|-----------|
| Monthly Cost | Free (with domain) | $0.50 |
| API Access | Limited/Issues | Full Access |
| Automation | Manual/Complex | Fully Automated |
| Integration | External | Native Azure |
| Performance | Good | Excellent |
| Global Anycast | Yes | Yes |
| SLA | No | 99.99% |

## Quick Setup Commands

```bash
# 1. Create DNS Zone
az network dns zone create -g jupiter-agents -n digisquares.com

# 2. Get nameservers (update in GoDaddy)
az network dns zone show -g jupiter-agents -n digisquares.com --query nameServers

# 3. Import existing records (optional)
az network dns zone export -g jupiter-agents -n digisquares.com -f records.txt

# 4. Create container subdomain
az network dns record-set a add-record \
  -g jupiter-agents \
  -z digisquares.com \
  -n demo-webapp \
  --ipv4-address 4.156.115.152

# 5. Verify
nslookup demo-webapp.digisquares.com
```

## Benefits of Azure DNS

1. **Full API Access**: No authentication issues
2. **Native Integration**: Works seamlessly with ACI
3. **Cost Effective**: Only $0.50/month
4. **High Performance**: Global anycast network
5. **Reliability**: 99.99% SLA
6. **Security**: Azure RBAC and policies

## Migration Timeline

1. **Create Zone**: 5 minutes
2. **Update Nameservers**: 5 minutes
3. **DNS Propagation**: 0-48 hours (usually 2-4 hours)
4. **Full Automation**: Ready immediately after propagation

## Keeping Email with GoDaddy

If you use GoDaddy email:
1. Note your MX records before switching
2. Add them to Azure DNS zone
3. Email will continue working normally

## Rollback Plan

If needed, you can switch back:
1. Change nameservers back to GoDaddy
2. Delete Azure DNS zone
3. No permanent changes to domain

## Cost Summary

- **One-time**: $0 (no transfer fees)
- **Monthly**: $0.50 for DNS zone
- **Per million queries**: $0.40
- **Typical monthly total**: < $1.00

This is the most cost-effective solution for full DNS automation!
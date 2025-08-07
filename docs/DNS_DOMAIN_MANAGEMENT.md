# DNS and Domain Management Documentation

## Overview

The Intelligent Agent System includes comprehensive domain management capabilities for Azure services, supporting both Azure Container Instances (ACI) and Azure Static Web Apps. The system uses Azure DNS for automatic subdomain management and SSL certificate provisioning.

## Architecture

### Domain Provider: Azure DNS

After evaluating multiple options, we use Azure DNS as our primary domain provider:
- **Cost**: $0.50/month per DNS zone
- **Integration**: Native Azure integration with ACI and Static Web Apps
- **Performance**: Global DNS infrastructure with low latency
- **Automation**: Full API support for dynamic record management

### Components

1. **Azure DNS Manager** (`src/dns/azure-dns-manager.ts`)
   - Creates and manages DNS zones
   - Handles A, CNAME, and TXT records
   - Supports wildcard domains

2. **ACI DNS Integration** (`src/dns/azure-dns-integration.ts`)
   - Automatic subdomain creation for containers
   - IP address management
   - Container lifecycle integration

3. **Static Web Apps Integration** (`src/dns/static-web-apps-dns.ts`)
   - Custom domain mapping
   - SSL certificate automation
   - CNAME record management

## Setup Guide

### 1. Initial DNS Zone Setup

```bash
# Setup Azure DNS for your domain
npm run setup:azure-dns-in

# This will:
# - Create DNS zone in Azure
# - Provide nameservers for domain configuration
# - Set up initial records
```

### 2. Update Domain Nameservers

Update your domain registrar (GoDaddy, Namecheap, etc.) with Azure nameservers:
- ns1-XX.azure-dns.com
- ns2-XX.azure-dns.net
- ns3-XX.azure-dns.org
- ns4-XX.azure-dns.info

### 3. Environment Configuration

```env
# Azure DNS Configuration
AZURE_DNS_ZONE=digisquares.in
AZURE_DNS_RESOURCE_GROUP=jupiter-agents
DNS_PROVIDER=azure

# Optional: Multiple domains
AZURE_DNS_ZONES=digisquares.in,myapp.com
```

## Usage

### Container Deployment with DNS

```typescript
import { AzureDNSIntegration } from './src/dns/azure-dns-integration';
import { AzureContainerManager } from './src/azure/aci-manager';

// Initialize managers
const aciManager = new AzureContainerManager(config);
const dnsIntegration = new AzureDNSIntegration(aciManager, {
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
  resourceGroup: process.env.AZURE_DNS_RESOURCE_GROUP!,
  zoneName: process.env.AZURE_DNS_ZONE!
});

// Deploy container with automatic DNS
const result = await dnsIntegration.createContainerWithDNS(
  {
    userId: 'user123',
    projectId: 'myapp',
    taskId: 'v1'
  },
  {
    image: 'nginx:latest',
    cpu: 0.5,
    memoryGB: 1,
    ports: [{ protocol: 'TCP', port: 80 }]
  }
);

// Result:
// Container URL: http://user123-myapp.digisquares.in
// Container IP: 20.75.202.204
```

### Static Web App with Custom Domain

```typescript
import { StaticWebAppDNSManager } from './src/dns/static-web-apps-dns';

const swaManager = new StaticWebAppDNSManager({
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
  resourceGroup: 'my-static-apps',
  dnsZone: 'digisquares.in'
});

// Deploy static web app with custom domain
const app = await swaManager.deployWithCustomDomain({
  appName: 'my-blog',
  subdomain: 'blog',
  repositoryUrl: 'https://github.com/user/blog',
  branch: 'main'
});

// Result:
// App URL: https://blog.digisquares.in (SSL included)
```

## DNS Record Types

### For Container Instances (ACI)
- **A Records**: Direct IP mapping
- Example: `app.digisquares.in → 20.75.202.204`
- TTL: 300 seconds (5 minutes)

### For Static Web Apps
- **CNAME Records**: Points to Azure-provided domain
- Example: `blog.digisquares.in → proud-beach-12345.azurestaticapps.net`
- Automatic SSL via Azure

### Wildcard Domains
- **Pattern**: `*.app.digisquares.in`
- Use case: Dynamic multi-tenant applications
- Requires load balancer or traffic manager

## Advanced Features

### 1. Multi-Domain Support

```typescript
const multiDomainManager = new MultiDomainDNSManager({
  domains: ['digisquares.in', 'myapp.com'],
  defaultDomain: 'digisquares.in'
});

// Deploy to specific domain
await multiDomainManager.createRecord({
  domain: 'myapp.com',
  subdomain: 'api',
  target: '20.75.202.204'
});
```

### 2. SSL/TLS Configuration

#### For Container Instances
```typescript
// Using Let's Encrypt with ACI
const sslConfig = {
  enabled: true,
  provider: 'letsencrypt',
  email: 'admin@digisquares.in'
};

await dnsIntegration.createContainerWithSSL(context, dockerConfig, sslConfig);
```

#### For Static Web Apps
SSL is automatically provided by Azure for custom domains.

### 3. DNS Health Monitoring

```typescript
const monitor = new DNSHealthMonitor(dnsConfig);

// Check DNS propagation
const status = await monitor.checkPropagation('app.digisquares.in');
console.log(status); // { propagated: true, resolvers: [...] }

// Monitor all records
const health = await monitor.checkAllRecords();
```

## Best Practices

### 1. Subdomain Naming Convention
```
{service}-{environment}-{identifier}.{domain}
Examples:
- api-prod-v1.digisquares.in
- app-staging-user123.digisquares.in
- blog-dev-feature1.digisquares.in
```

### 2. DNS Record Management
- Use short TTLs (300s) during development
- Increase TTL (3600s) for production
- Clean up unused records regularly
- Implement record expiration

### 3. Security
- Enable Azure DNS logging
- Use Azure Private DNS for internal services
- Implement rate limiting for DNS queries
- Regular security audits

## Troubleshooting

### DNS Not Resolving
```bash
# Check nameserver propagation
nslookup -type=NS digisquares.in

# Check specific record
nslookup app.digisquares.in

# Use different DNS servers
nslookup app.digisquares.in 8.8.8.8
```

### Container Not Accessible
```bash
# Check container status
az container show -g jupiter-agents -n my-container

# Check DNS record in Azure
az network dns record-set a show -g jupiter-agents -z digisquares.in -n app

# Test direct IP access
curl http://20.75.202.204
```

### SSL Certificate Issues
- For ACI: Check Let's Encrypt logs in container
- For Static Web Apps: Verify CNAME record is correct
- Ensure domain ownership verification passed

## Cost Optimization

### DNS Costs
- DNS Zone: $0.50/month
- Queries: $0.40 per million
- Typical monthly cost: $0.50-$2.00

### Recommendations
1. Use single DNS zone for multiple subdomains
2. Implement DNS caching at application level
3. Clean up unused records
4. Use Azure Traffic Manager for geo-distribution

## Migration Guide

### From GoDaddy to Azure DNS
1. Export existing DNS records
2. Create Azure DNS zone
3. Import records to Azure
4. Update nameservers at registrar
5. Wait for propagation (2-48 hours)
6. Verify all services working

### From Manual to Automated DNS
1. Audit existing DNS records
2. Implement naming convention
3. Create automation scripts
4. Test with non-production domains
5. Gradually migrate services

## API Reference

### AzureDNSIntegration

```typescript
class AzureDNSIntegration {
  createContainerWithDNS(context, dockerConfig?, gitConfig?): Promise<{container, dns}>
  updateContainerDNS(containerName, newIP): Promise<boolean>
  deleteContainerDNS(containerName): Promise<boolean>
  listContainerDNS(): Promise<ContainerDNSRecord[]>
  checkDNSPropagation(subdomain): Promise<{propagated, resolvedIP?}>
  setupWildcardDomain(prefix, targetIP): Promise<void>
  getDNSZoneInfo(): Promise<{nameservers, recordCount}>
}
```

### StaticWebAppDNSManager

```typescript
class StaticWebAppDNSManager {
  deployWithCustomDomain(config): Promise<StaticWebApp>
  addCustomDomain(appName, domain): Promise<void>
  removeCustomDomain(appName, domain): Promise<void>
  validateDomain(domain): Promise<boolean>
  listCustomDomains(appName): Promise<string[]>
}
```

## Future Enhancements

1. **Multi-Region Support**
   - Azure Traffic Manager integration
   - Geo-DNS routing
   - Failover configuration

2. **Advanced SSL**
   - Wildcard certificates
   - Certificate auto-renewal
   - Custom certificate support

3. **DNS Analytics**
   - Query metrics
   - Performance monitoring
   - Cost tracking

4. **Automation**
   - GitHub Actions integration
   - Terraform modules
   - ARM templates
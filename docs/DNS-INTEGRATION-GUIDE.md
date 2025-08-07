# Dynamic DNS Integration for Azure Container Instances

This guide explains how to automatically configure custom subdomains for your Azure Container Instances using GoDaddy DNS.

## Overview

The DNS integration allows you to:
- Automatically create subdomains for each container (e.g., `user123-project456.app.yourdomain.com`)
- Access containers via friendly URLs instead of Azure IP addresses
- Manage DNS lifecycle automatically (create/update/delete)
- Support wildcard domains for development environments

## Architecture

```
User Request → Custom Domain → GoDaddy DNS → Azure Container IP
                    ↓
            app.yourdomain.com
                    ↓
            52.188.35.8 (ACI)
```

## Setup Instructions

### 1. Prerequisites

- GoDaddy account with a registered domain
- GoDaddy API credentials (get from https://developer.godaddy.com/keys)
- Azure subscription with Container Instances enabled
- Node.js 16+ installed

### 2. Configure GoDaddy API

Run the setup script:

```bash
npm run setup:dns
```

This will:
- Prompt for your GoDaddy API credentials
- Verify domain ownership
- Save configuration to `.env`
- Create DNS configuration files

### 3. Environment Variables

The following variables will be added to your `.env`:

```env
# GoDaddy DNS Configuration
GODADDY_API_KEY=your-api-key
GODADDY_API_SECRET=your-api-secret
GODADDY_DOMAIN=yourdomain.com
GODADDY_ENVIRONMENT=production
```

## Usage Examples

### Basic Container with DNS

```typescript
import { ACIDNSIntegration } from './src/dns/aci-dns-integration';

// Deploy container with automatic subdomain
const result = await dnsIntegration.createContainerWithDNS(
  {
    userId: 'john',
    projectId: 'webapp',
    taskId: 'v1'
  },
  {
    image: 'nginx:alpine',
    cpu: 1,
    memoryGB: 2
  }
);

console.log(`Container URL: http://${result.dns.fqdn}`);
// Output: http://john-webapp-v1.app.yourdomain.com
```

### Run the Example

```bash
npm run example:aci-dns
```

This will:
1. Create a real Azure container
2. Configure DNS subdomain automatically
3. Display the custom URL
4. Start DNS monitoring

### DNS Helper Commands

List all subdomains:
```bash
npm run dns:helper list
```

Create subdomain manually:
```bash
npm run dns:helper create test-app 52.188.35.8
```

Delete subdomain:
```bash
npm run dns:helper delete test-app
```

## Subdomain Naming Convention

Subdomains are generated using the pattern:
```
{userId}-{projectId}-{taskId}.{prefix}.{domain}
```

Examples:
- `john-webapp-v1.app.yourdomain.com`
- `alice-api-prod.app.yourdomain.com`
- `test-123456.app.yourdomain.com`

## DNS Propagation

- DNS changes typically propagate within 5-10 minutes
- TTL is set to 300 seconds (5 minutes) by default
- Check propagation status at https://dnschecker.org

## Wildcard Domains

For development environments, you can setup wildcard domains:

```typescript
// Creates *.dev.yourdomain.com → target IP
await dnsIntegration.setupWildcardDNS('52.188.35.8');
```

This allows any subdomain under `dev.yourdomain.com` to resolve to your target.

## Automatic Cleanup

The integration includes automatic cleanup features:

```typescript
// Enable auto-cleanup in config
const dnsConfig = {
  autoCleanup: true,
  // ... other config
};

// Manually cleanup orphaned records
const cleaned = await dnsIntegration.cleanupOrphanedDNS();
```

## Monitoring

DNS records are monitored and updated automatically:

```typescript
// Start monitoring (checks every 5 minutes)
await dnsIntegration.startDNSMonitoring(300000);

// Listen for events
dnsIntegration.on('dns-configured', (mapping) => {
  console.log('DNS configured:', mapping.fqdn);
});

dnsIntegration.on('dns-deleted', (mapping) => {
  console.log('DNS deleted:', mapping.fqdn);
});
```

## Security Considerations

1. **API Credentials**: Store GoDaddy API credentials securely in `.env`
2. **Subdomain Validation**: Only alphanumeric characters and hyphens allowed
3. **Rate Limiting**: GoDaddy API has rate limits - avoid excessive updates
4. **Access Control**: Containers are still protected by Azure security groups

## Troubleshooting

### DNS Not Resolving
- Wait 5-10 minutes for propagation
- Check with `nslookup subdomain.yourdomain.com`
- Verify DNS record in GoDaddy dashboard

### Permission Errors
- Ensure GoDaddy API key has full access
- Check domain ownership in GoDaddy account

### Container Not Accessible
- Verify container is running: `az container show`
- Check Azure Network Security Group rules
- Ensure port 80/443 is exposed in container config

## Advanced Configuration

### Custom TTL
```typescript
await dnsManager.createSubdomain({
  subdomain: 'app',
  target: '52.188.35.8',
  ttl: 3600 // 1 hour
});
```

### Multiple Domains
```typescript
const domains = ['domain1.com', 'domain2.com'];
for (const domain of domains) {
  const dnsManager = new GoDaddyDNSManager({ 
    domain,
    // ... other config
  });
  await dnsManager.createSubdomain(config);
}
```

### SSL/TLS Support
SSL support is planned for future releases using Let's Encrypt.

## API Reference

### GoDaddyDNSManager

- `createSubdomain(config)` - Create or update subdomain
- `deleteSubdomain(name)` - Remove subdomain
- `listACISubdomains()` - List all container subdomains
- `updateSubdomain(name, ip)` - Update subdomain target

### ACIDNSIntegration

- `createContainerWithDNS()` - Deploy container with DNS
- `updateContainerDNS()` - Update DNS for existing container
- `deleteContainerDNS()` - Remove DNS when container deleted
- `cleanupOrphanedDNS()` - Remove DNS for deleted containers

## Best Practices

1. Use descriptive subdomain names
2. Implement proper cleanup on container deletion
3. Monitor DNS records for orphaned entries
4. Use wildcard domains for development only
5. Set reasonable TTL values (300-3600 seconds)

## Limitations

- GoDaddy API rate limits apply
- DNS propagation takes time (not instant)
- Maximum 500 DNS records per domain (GoDaddy limit)
- Subdomain length limited to 63 characters

## Future Enhancements

- [ ] Automatic SSL certificate provisioning
- [ ] Support for other DNS providers (Cloudflare, Route53)
- [ ] DNS load balancing for multiple containers
- [ ] Custom domain mapping UI
- [ ] Webhook notifications for DNS changes
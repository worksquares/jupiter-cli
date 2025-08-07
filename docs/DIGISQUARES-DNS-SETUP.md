# DigiSquares.com DNS Integration Setup

Quick setup guide for configuring dynamic subdomains on digisquares.com for Azure Container Instances.

## 🚀 Quick Start

### 1. Get GoDaddy API Credentials

1. Go to: https://developer.godaddy.com/keys
2. Sign in with your GoDaddy account (the one that owns digisquares.com)
3. Create a **Production** API key (not OTE/Test)
4. Copy both the **Key** and **Secret**

### 2. Add Credentials to .env

Add these lines to your `.env` file:

```env
# GoDaddy DNS Configuration
GODADDY_API_KEY=your-api-key-here
GODADDY_API_SECRET=your-secret-here
GODADDY_DOMAIN=digisquares.com
GODADDY_ENVIRONMENT=production
```

### 3. Run Setup

```bash
npm run setup:dns
```

This will verify your credentials and configure the DNS integration.

### 4. Deploy a Test Container

```bash
npm run deploy:digisquares
```

This will create containers accessible at:
- `demo-webapp.app.digisquares.com`
- `api-backend.app.digisquares.com`

## 📋 DNS Structure

Your containers will be accessible using this pattern:

```
{user}-{project}.{environment}.digisquares.com
```

Examples:
- `john-webapp.app.digisquares.com` (production)
- `test-api.dev.digisquares.com` (development)
- `demo-123.test.digisquares.com` (testing)

## 🛠️ Management Commands

### List All Subdomains
```bash
npm run dns:helper list
```

### Create Custom Subdomain
```bash
npm run dns:helper create myapp 52.188.35.8
```
Creates: `myapp.digisquares.com` → `52.188.35.8`

### Delete Subdomain
```bash
npm run dns:helper delete myapp
```

## 🔧 Configuration Options

### Environment Prefixes

Edit `config/digisquares-dns-config.json` to customize:

```json
{
  "subdomainStrategy": {
    "patterns": {
      "production": "{userId}-{projectId}.app",
      "development": "{userId}-{projectId}.dev",
      "testing": "{userId}-{projectId}.test"
    }
  }
}
```

### Wildcard Domains (Optional)

To enable wildcard domains for development:

1. Choose a target IP (e.g., your development server)
2. Run:
```typescript
await dnsIntegration.setupWildcardDNS('your-target-ip');
```

This creates:
- `*.dev.digisquares.com` → target IP
- `*.test.digisquares.com` → target IP

## 📊 Example Deployments

### Simple Web App
```typescript
const result = await dnsIntegration.createContainerWithDNS(
  {
    userId: 'mycompany',
    projectId: 'website',
    taskId: 'v1'
  },
  {
    image: 'nginx:alpine',
    cpu: 1,
    memoryGB: 2
  }
);
// Creates: mycompany-website.app.digisquares.com
```

### API Service
```typescript
const result = await dnsIntegration.createContainerWithDNS(
  {
    userId: 'api',
    projectId: 'users',
    taskId: 'prod'
  },
  {
    image: 'node:18-alpine',
    cpu: 2,
    memoryGB: 4
  }
);
// Creates: api-users.app.digisquares.com
```

## 🔍 DNS Propagation

After creating a subdomain:
1. DNS changes take 5-10 minutes to propagate
2. Check status: `nslookup subdomain.digisquares.com`
3. Or use: https://dnschecker.org

## ⚠️ Important Notes

1. **Rate Limits**: GoDaddy API has rate limits - avoid excessive updates
2. **TTL**: Default is 300 seconds (5 minutes)
3. **Cleanup**: Subdomains are automatically deleted when containers are removed
4. **Security**: Keep your API credentials secure - never commit to git

## 🆘 Troubleshooting

### "Domain not found" Error
- Verify digisquares.com is in your GoDaddy account
- Check API credentials are for production (not OTE)

### DNS Not Resolving
- Wait 5-10 minutes for propagation
- Clear local DNS cache: `ipconfig /flushdns` (Windows)
- Try different DNS server: `nslookup subdomain.digisquares.com 8.8.8.8`

### Container Not Accessible
- Verify container is running: `az container list`
- Check container has public IP
- Ensure port 80/443 is exposed

## 🎯 Next Steps

1. Deploy your first container with custom domain
2. Set up wildcard domains for development
3. Configure SSL/TLS (coming soon)
4. Monitor DNS usage in GoDaddy dashboard

## 📞 Support

- GoDaddy DNS API Docs: https://developer.godaddy.com/doc/endpoint/domains
- Azure Container Instances: https://docs.microsoft.com/en-us/azure/container-instances/
- DNS Propagation Checker: https://dnschecker.org
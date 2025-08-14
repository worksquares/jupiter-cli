# Static Website Deployment Guide

## 🎉 NEW: Automatic Digisquares.in Subdomain with SSL

**Every deployment automatically receives:**
- ✅ **Free subdomain** on `digisquares.in` domain
- 🔒 **SSL certificate** automatically provisioned and managed
- 🚀 **Instant DNS configuration** - no manual setup required
- 🌍 **Global accessibility** with professional URL

## Overview

Jupiter AI now supports two powerful options for deploying static websites to Azure, both with 100% automated deployment and automatic digisquares.in subdomain assignment:

1. **Azure Blob Storage with CDN** - Best for production sites with high traffic
2. **Azure Static Web Apps** - Best for GitHub integration and serverless APIs

## Deployment Options

### 1. Azure Blob Storage Static Websites

Deploy your static website to Azure Blob Storage with automatic CDN configuration for global distribution.

#### Features
- ✅ **Automatic Storage Account Creation** - Creates and configures storage account
- ✅ **Static Website Enablement** - Automatically enables static website hosting
- ✅ **$web Container Management** - Files uploaded to the special $web container
- ✅ **Azure CDN Integration** - Automatic CDN setup for global distribution
- ✅ **Custom Domain Support** - Configure custom domains with SSL
- ✅ **Intelligent Caching** - Pre-configured caching rules for optimal performance
- ✅ **Large File Support** - Support for sites up to 5TB

#### Usage

```typescript
import { UnifiedDeploymentService } from 'jupiter-ai';

const service = new UnifiedDeploymentService();

const deployment = await service.deploy({
  projectName: 'my-website',
  deploymentType: 'blob-storage',
  sourcePath: './dist',           // Your build output directory
  framework: 'react',
  enableCDN: true,                // Enable Azure CDN
  environment: 'prod',
  environmentVariables: {
    REACT_APP_API_URL: 'https://api.example.com'
  }
});

// Automatic subdomain assigned!
console.log(`Website deployed to: ${deployment.url}`);
// Output: Website deployed to: https://my-website.digisquares.in
```

### 2. Azure Static Web Apps

Deploy with GitHub integration for automatic deployments on every push.

#### Features
- ✅ **GitHub Integration** - Auto-deploy on push to repository
- ✅ **Free Hosting Tier** - Generous free tier for most projects
- ✅ **Built-in CDN** - Global distribution included
- ✅ **Preview Environments** - Automatic staging for pull requests
- ✅ **Serverless APIs** - Support for Azure Functions APIs
- ✅ **Authentication** - Built-in auth providers support
- ✅ **Custom Domains** - Free SSL certificates

#### Usage

```typescript
const deployment = await service.deploy({
  projectName: 'my-app',
  deploymentType: 'static-web-app',
  repositoryUrl: 'https://github.com/user/my-app',
  branch: 'main',
  framework: 'vue',
  environment: 'staging'
});

console.log(`Static Web App deployed to: ${deployment.url}`);
```

### 3. Automatic Deployment Type Selection

Let Jupiter AI choose the best deployment option based on your project characteristics.

```typescript
const deployment = await service.deploy({
  projectName: 'my-project',
  deploymentType: 'auto',  // Let system decide
  framework: 'react',
  sourcePath: './build'
});

console.log(`Deployed as: ${deployment.type}`);
console.log(`Reason: ${deployment.analysis.reason}`);
```

## Decision Matrix

The system automatically selects the best deployment type based on:

| Criteria | Blob Storage | Static Web Apps |
|----------|--------------|-----------------|
| Has GitHub repo | ❌ | ✅ |
| Needs CDN control | ✅ | ❌ |
| Local files only | ✅ | ❌ |
| High traffic expected | ✅ | ❌ |
| Needs serverless API | ❌ | ✅ |
| Free hosting needed | ❌ | ✅ |
| Large files (>250MB) | ✅ | ❌ |

## Automated Deployment Process

### Blob Storage Deployment Flow

1. **Storage Account Creation**
   - Generates unique storage account name
   - Creates account with optimal settings
   - Enables HTTPS-only traffic

2. **Static Website Configuration**
   - Enables static website hosting
   - Sets index.html as default document
   - Configures 404.html error page

3. **File Upload**
   - Scans source directory
   - Uploads all files to $web container
   - Sets correct content types

4. **CDN Configuration**
   - Creates CDN profile
   - Configures endpoint with origin
   - Sets up caching rules:
     - Static assets: 7 days
     - HTML files: 5 minutes

5. **Custom Domain Setup**
   - Configures DNS CNAME record
   - Enables HTTPS with managed certificate
   - Validates domain ownership

### Static Web Apps Deployment Flow

1. **App Creation**
   - Creates Static Web App resource
   - Links to GitHub repository
   - Configures build settings

2. **GitHub Actions Setup**
   - Creates workflow file
   - Sets up deployment token
   - Configures build commands

3. **Domain Configuration**
   - Generates default hostname
   - Configures custom domain if provided
   - Enables SSL automatically

## Configuration Options

### Common Options

```typescript
interface DeploymentOptions {
  projectName: string;           // Required: Your project name
  deploymentType?: 'auto' | 'blob-storage' | 'static-web-app';
  framework?: string;             // react, vue, angular, etc.
  environment?: 'dev' | 'staging' | 'prod';
  customDomain?: string;          // Your custom domain
  environmentVariables?: Record<string, string>;
}
```

### Blob Storage Specific

```typescript
{
  sourcePath: './dist',          // Local build directory
  enableCDN: true,               // Enable Azure CDN
  indexDocument: 'index.html',   // Default document
  errorDocument: '404.html'      // Error page
}
```

### Static Web Apps Specific

```typescript
{
  repositoryUrl: 'https://github.com/...',
  branch: 'main',                // Branch to deploy
  buildCommand: 'npm run build', // Build command
  outputLocation: 'dist'         // Build output folder
}
```

## Cost Comparison

### Azure Blob Storage
- **Storage**: ~$0.02/GB/month
- **CDN**: ~$0.08/GB bandwidth
- **Custom Domain**: Free
- **SSL Certificate**: Free
- **Estimated Monthly**: $5-10 for typical site

### Azure Static Web Apps
- **Free Tier**: 
  - 100 GB bandwidth/month
  - 2 custom domains
  - SSL certificates included
- **Standard Tier**: $9/month per app
- **Estimated Monthly**: $0-9

## Best Practices

### When to Use Blob Storage

✅ **Choose Blob Storage when you have:**
- Large static assets (videos, images)
- Existing CI/CD pipeline
- Need for CDN customization
- Sites larger than 250MB
- High traffic requirements

### When to Use Static Web Apps

✅ **Choose Static Web Apps when you have:**
- GitHub repository
- Need for serverless APIs
- Want automatic preview environments
- Small to medium sites (<250MB)
- Want zero-cost hosting

## Monitoring and Management

### View Deployment Status

```typescript
const deployments = service.getActiveDeployments();
deployments.forEach(d => {
  console.log(`${d.name}: ${d.status} - ${d.url}`);
});
```

### Update Deployment

```typescript
// For Blob Storage
await blobStorageManager.updateDeployment(
  deploymentId,
  './new-build'
);

// For Static Web Apps
// Simply push to GitHub - auto-deploys!
```

### Delete Deployment

```typescript
await blobStorageManager.deleteDeployment(deploymentId);
```

## Troubleshooting

### Common Issues

1. **Deployment Failed**
   - Check Azure credentials in .env
   - Verify resource group exists
   - Ensure subscription has required quotas

2. **CDN Not Working**
   - Wait 5-10 minutes for propagation
   - Check caching rules configuration
   - Verify origin is accessible

3. **Custom Domain Issues**
   - Verify DNS records are correct
   - Allow 24-48 hours for DNS propagation
   - Check domain ownership validation

## Automatic Subdomain Assignment

### How It Works

1. **Project Name → Subdomain**
   - `my-app` → `my-app.digisquares.in`
   - `MyPortfolio` → `myportfolio.digisquares.in`
   - `test_site_2024` → `test-site-2024.digisquares.in`

2. **Collision Handling**
   - If subdomain exists: `my-app-2.digisquares.in`
   - Alternative: `my-app-x7k2.digisquares.in`
   - Guaranteed unique subdomain

3. **SSL Certificate**
   - Automatically provisioned via Let's Encrypt
   - Domain validation handled automatically
   - Auto-renewal configured
   - HTTPS enforced by default

### Custom Subdomain Request

```typescript
// Request specific subdomain
const deployment = await service.deploy({
  projectName: 'my-blog',
  customDomain: 'awesome-blog',  // Will try awesome-blog.digisquares.in
  // ... other options
});
```

## Environment Variables

Configure in your `.env` file:

```env
# Azure Configuration
AZURE_SUBSCRIPTION_ID=xxx
AZURE_RESOURCE_GROUP=jupiter-resources
AZURE_LOCATION=eastus2

# Domain Configuration (defaults to digisquares.in)
BASE_DOMAIN=digisquares.in

# Database (for deployment tracking)
MYSQL_HOST=localhost
MYSQL_DATABASE=jupiterdb
MYSQL_USER=root
MYSQL_PASSWORD=xxx
```

## Database Schema

Deployments are tracked in the database for management:

```sql
-- Blob Storage Deployments
CREATE TABLE blob_storage_deployments (
  id VARCHAR(36) PRIMARY KEY,
  storage_account_name VARCHAR(24),
  cdn_endpoint VARCHAR(255),
  custom_domain VARCHAR(255),
  status VARCHAR(20),
  created_at TIMESTAMP
);

-- Static Web Apps
CREATE TABLE static_web_apps (
  id VARCHAR(36) PRIMARY KEY,
  app_name VARCHAR(255),
  default_hostname VARCHAR(255),
  repository_url VARCHAR(500),
  status VARCHAR(20),
  created_at TIMESTAMP
);
```

## Examples

See `/examples/deploy-static-website.ts` for complete working examples.

## Support

For issues or questions:
- Check deployment logs in Azure Portal
- Review CloudWatch metrics for CDN
- Contact support with deployment ID

---

*This feature provides 100% automated deployment without any manual intervention. All resources are created, configured, and managed automatically through the Jupiter AI deployment service.*
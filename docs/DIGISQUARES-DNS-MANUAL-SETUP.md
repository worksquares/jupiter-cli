# DigiSquares.com DNS Setup Guide

## Current Status

- ✅ Azure Container deployed: **4.156.115.152**
- ✅ Azure FQDN: **webapp-demo.eastus.azurecontainer.io**
- ❌ GoDaddy API: **Access Denied** (403 errors)

## Manual DNS Setup Instructions

Since the API key doesn't have domain management permissions, you need to manually configure DNS records in GoDaddy.

### Option 1: A Record (Direct IP)

1. **Log into GoDaddy**: https://www.godaddy.com/
2. **Go to**: My Products → Domains → digisquares.com → **DNS**
3. **Click**: Add → New Record
4. **Enter**:
   - **Type**: A
   - **Name**: demo-webapp
   - **Value**: 4.156.115.152
   - **TTL**: 600
5. **Save** the record

**Result**: `demo-webapp.digisquares.com` → `4.156.115.152`

### Option 2: CNAME Record (Recommended)

Using CNAME is better because it points to Azure's domain name instead of IP:

1. **Log into GoDaddy**: https://www.godaddy.com/
2. **Go to**: My Products → Domains → digisquares.com → **DNS**
3. **Click**: Add → New Record
4. **Enter**:
   - **Type**: CNAME
   - **Name**: demo-webapp
   - **Value**: webapp-demo.eastus.azurecontainer.io
   - **TTL**: 600
5. **Save** the record

**Result**: `demo-webapp.digisquares.com` → `webapp-demo.eastus.azurecontainer.io`

### Option 3: Wildcard Subdomain

For multiple containers, create a wildcard:

1. **Add CNAME**:
   - **Name**: *.app
   - **Value**: webapp-demo.eastus.azurecontainer.io
   - **TTL**: 600

**Result**: Any `*.app.digisquares.com` will point to your container

## Testing DNS

After adding the record, wait 5-10 minutes, then test:

```bash
# Windows
nslookup demo-webapp.digisquares.com

# Check propagation
ping demo-webapp.digisquares.com

# Access in browser
http://demo-webapp.digisquares.com
```

## API Key Troubleshooting

The API key `AZqVq5z8fD2_FRtXpefVfjg7K4jtGrWRiS` is authenticating but lacks permissions.

### To Get a Working API Key:

1. **Verify Domain Ownership**:
   - Log into GoDaddy
   - Check if digisquares.com appears in "My Domains"
   - Note which account owns it

2. **Create New API Key**:
   - Go to: https://developer.godaddy.com/keys
   - Sign in with the account that owns digisquares.com
   - Click "Create New API Key"
   - **IMPORTANT**: Select "Production" (not OTE)
   - Name: "Domain Management"
   - Copy both Key and Secret

3. **Common Issues**:
   - **OTE vs Production**: OTE keys only work in test environment
   - **Delegated Access**: Sub-accounts may not have API access
   - **Reseller Accounts**: May have different API endpoints

## Current Container Details

```yaml
Container Name: jupiter-demo-webapp-deploy-1754438075617
IP Address: 4.156.115.152
Azure FQDN: webapp-demo.eastus.azurecontainer.io
Region: East US
Status: Running
Access: http://4.156.115.152 or http://webapp-demo.eastus.azurecontainer.io
```

## Quick Commands

```bash
# View container
az container show -g jupiter-agents -n jupiter-demo-webapp-deploy-1754438075617

# Get logs
az container logs -g jupiter-agents -n jupiter-demo-webapp-deploy-1754438075617

# Delete container
az container delete -g jupiter-agents -n jupiter-demo-webapp-deploy-1754438075617 --yes
```

## Next Steps

1. **Manual Setup**: Add DNS record in GoDaddy dashboard
2. **Wait**: 5-10 minutes for DNS propagation
3. **Access**: http://demo-webapp.digisquares.com
4. **Future**: Get proper API key for automation

## Alternative Solutions

If you can't get API access working:

1. **Use Azure DNS**: Migrate DNS to Azure for full integration
2. **Use Cloudflare**: Free DNS with API access
3. **Webhook Integration**: Use Zapier/IFTTT to update DNS
4. **Manual Process**: Continue using manual DNS updates

The system is built and ready - it just needs either:
- Manual DNS configuration (works now), OR
- Proper API credentials (for automation)
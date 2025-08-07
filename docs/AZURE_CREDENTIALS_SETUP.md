# Azure Credentials Setup Guide

This guide explains how to configure Azure credentials for the Intelligent Agent System using Azure CLI.

## Prerequisites

1. **Azure CLI**: Install from [Azure CLI Installation Guide](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
2. **Azure Subscription**: An active Azure subscription
3. **Permissions**: Ability to create service principals and resources

## Quick Setup

### Windows (PowerShell)
```powershell
cd intelligent-agent-system\scripts
.\setup-azure-credentials.ps1
```

### Linux/macOS (Bash)
```bash
cd intelligent-agent-system/scripts
chmod +x setup-azure-credentials.sh
./setup-azure-credentials.sh
```

## What the Script Does

### 1. Azure Login
- Checks if you're logged into Azure CLI
- Prompts for login if needed
- Lists available subscriptions

### 2. Resource Creation
- **Resource Group**: `jupiter-agents` in `eastus`
- **Container Registry**: `jupiteracr` with admin access enabled
- **Service Principal**: For programmatic access

### 3. Role Assignments
The service principal gets these roles:
- `Contributor` on the resource group
- `Azure Container Instance Contributor`
- `Static Web App Contributor`
- `AcrPull` and `AcrPush` on the container registry

### 4. Environment File
Creates `.env` file with:
```env
# Azure Service Principal
AZURE_CLIENT_ID=<service-principal-app-id>
AZURE_CLIENT_SECRET=<service-principal-password>
AZURE_TENANT_ID=<azure-tenant-id>

# Azure Resources
AZURE_SUBSCRIPTION_ID=<your-subscription-id>
AZURE_RESOURCE_GROUP=jupiter-agents
AZURE_LOCATION=eastus
AZURE_CONTAINER_REGISTRY=jupiteracr
AZURE_CONTAINER_REGISTRY_USERNAME=<acr-username>
AZURE_CONTAINER_REGISTRY_PASSWORD=<acr-password>
```

## Manual Setup (Alternative)

If you prefer to set up manually:

### 1. Login to Azure
```bash
az login
az account set --subscription <your-subscription-id>
```

### 2. Create Resource Group
```bash
az group create --name jupiter-agents --location eastus
```

### 3. Create Container Registry
```bash
az acr create --name jupiteracr \
  --resource-group jupiter-agents \
  --location eastus \
  --sku Basic \
  --admin-enabled true
```

### 4. Create Service Principal
```bash
az ad sp create-for-rbac \
  --name sp-intelligent-agent-system \
  --role Contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/jupiter-agents
```

### 5. Get ACR Credentials
```bash
# Get ACR credentials
az acr credential show --name jupiteracr --resource-group jupiter-agents

# Get login server
az acr show --name jupiteracr --resource-group jupiter-agents --query loginServer
```

### 6. Additional Role Assignments
```bash
# Get the service principal ID
SP_ID=<service-principal-app-id>

# Assign Container Instance Contributor
az role assignment create --assignee $SP_ID \
  --role "Azure Container Instance Contributor" \
  --scope /subscriptions/<subscription-id>/resourceGroups/jupiter-agents

# Assign Static Web App Contributor
az role assignment create --assignee $SP_ID \
  --role "Static Web App Contributor" \
  --scope /subscriptions/<subscription-id>/resourceGroups/jupiter-agents

# Assign ACR permissions
ACR_ID=$(az acr show --name jupiteracr --resource-group jupiter-agents --query id -o tsv)
az role assignment create --assignee $SP_ID --role AcrPull --scope $ACR_ID
az role assignment create --assignee $SP_ID --role AcrPush --scope $ACR_ID
```

## Required Manual Updates

After running the setup script, update these values in `.env`:

1. **Database Password**: Replace `your-database-password` with actual password
2. **GitHub Token**: Generate from [GitHub Settings](https://github.com/settings/tokens)
3. **GitHub Organization**: Your GitHub org name
4. **CosmosAPI Key**: Your CosmosAPI key from https://cosmosapi.digisquares.com

## Authentication Methods

The system uses `DefaultAzureCredential` which tries these methods in order:

1. **Environment Variables** (what we set up)
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_TENANT_ID`

2. **Managed Identity** (for Azure-hosted apps)

3. **Azure CLI** (local development fallback)

4. **Visual Studio Code** (if VS Code Azure extension is signed in)

5. **Azure PowerShell** (Windows)

## Security Best Practices

1. **Never commit `.env` to git** - It's in `.gitignore`
2. **Rotate credentials regularly**
3. **Use least privilege** - Only grant necessary permissions
4. **Store backups securely** - The script creates `.env.azure-backup`
5. **Use Key Vault in production** for storing secrets

## Troubleshooting

### Permission Denied
```bash
# Make script executable (Linux/macOS)
chmod +x setup-azure-credentials.sh
```

### Service Principal Already Exists
```bash
# Delete existing service principal
az ad sp delete --id <service-principal-app-id>
```

### Role Assignment Fails
```bash
# Check your permissions
az role assignment list --assignee <your-user-id> --all
```

### Container Registry Login Issues
```bash
# Test ACR login
az acr login --name jupiteracr
```

## Validation

Run the validation script to check your setup:
```bash
npm run validate:azure
```

This checks:
- Azure CLI authentication
- Service principal credentials
- Resource access permissions
- Container registry connectivity

## Next Steps

1. Update manual values in `.env`
2. Run validation script
3. Test container deployment: `npm run test:aci`
4. Test static web app deployment: `npm run test:swa`

## Support

For issues:
1. Check Azure CLI is updated: `az upgrade`
2. Verify subscription access: `az account show`
3. Check service principal: `az ad sp show --id <client-id>`
4. Review error logs in `logs/azure-setup.log`
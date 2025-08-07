#!/bin/bash

# Azure App Service Deployment Script for Jupiter AI
# Uses Azure CLI to deploy the application

# Configuration
RESOURCE_GROUP="jupiter-agents"
APP_SERVICE_PLAN="digisquares-plan"
APP_NAME="jupiterapi"
LOCATION="eastus"
CUSTOM_DOMAIN="jupiterapi.digisquares.in"
RUNTIME="NODE:18-lts"

echo "🚀 Starting Jupiter AI deployment to Azure App Service..."

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first."
    exit 1
fi

# Login to Azure (if not already logged in)
if ! az account show &> /dev/null; then
    echo "📝 Logging in to Azure..."
    az login
fi

# Set subscription from .env
if [ -f "../.env" ]; then
    SUBSCRIPTION_ID=$(grep AZURE_SUBSCRIPTION_ID ../.env | cut -d '=' -f2)
    if [ ! -z "$SUBSCRIPTION_ID" ]; then
        echo "📋 Setting subscription: $SUBSCRIPTION_ID"
        az account set --subscription "$SUBSCRIPTION_ID"
    fi
fi

# Create resource group if it doesn't exist
echo "📦 Checking resource group..."
if ! az group show --name $RESOURCE_GROUP &> /dev/null; then
    echo "Creating resource group: $RESOURCE_GROUP"
    az group create --name $RESOURCE_GROUP --location $LOCATION
fi

# Create App Service Plan if it doesn't exist (use existing from azureapi)
echo "📋 Checking App Service Plan..."
if ! az appservice plan show --name $APP_SERVICE_PLAN --resource-group $RESOURCE_GROUP &> /dev/null; then
    echo "Creating App Service Plan: $APP_SERVICE_PLAN"
    az appservice plan create \
        --name $APP_SERVICE_PLAN \
        --resource-group $RESOURCE_GROUP \
        --location $LOCATION \
        --sku B1 \
        --is-linux
fi

# Create Web App
echo "🌐 Creating/Updating Web App: $APP_NAME"
az webapp create \
    --resource-group $RESOURCE_GROUP \
    --plan $APP_SERVICE_PLAN \
    --name $APP_NAME \
    --runtime "$RUNTIME" \
    --startup-file "npm start" \
    2>/dev/null || echo "Web App already exists, updating..."

# Configure deployment from local git
echo "🔧 Configuring deployment source..."
az webapp deployment source config-local-git \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP

# Get deployment credentials
DEPLOYMENT_USER=$(az webapp deployment list-publishing-credentials \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --query scmUri -o tsv)

echo "📝 Git deployment URL: $DEPLOYMENT_USER"

# Configure app settings
echo "⚙️ Configuring application settings..."
az webapp config appsettings set \
    --resource-group $RESOURCE_GROUP \
    --name $APP_NAME \
    --settings \
    NODE_ENV=production \
    PORT=8080 \
    WEBSITE_NODE_DEFAULT_VERSION="~18" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    AI_PROVIDER=cosmos \
    COSMOS_API_URL=https://cosmosapi.digisquares.com \
    AZURE_API_URL=https://azureapi.digisquares.in \
    BASE_URL=https://$CUSTOM_DOMAIN \
    ENABLE_ACI_LIFECYCLE=true

# Configure CORS
echo "🔒 Configuring CORS..."
az webapp cors add \
    --resource-group $RESOURCE_GROUP \
    --name $APP_NAME \
    --allowed-origins \
    https://jupiterapi.digisquares.in \
    https://jupiter-chat.digisquares.in \
    https://cosmosapi.digisquares.com \
    http://localhost:3000 \
    http://localhost:5000

# Add custom domain
echo "🌍 Adding custom domain: $CUSTOM_DOMAIN"
az webapp config hostname add \
    --webapp-name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --hostname $CUSTOM_DOMAIN \
    2>/dev/null || echo "Custom domain already configured"

# Enable Always On for Basic tier
echo "⚡ Enabling Always On..."
az webapp config set \
    --resource-group $RESOURCE_GROUP \
    --name $APP_NAME \
    --always-on true \
    2>/dev/null || echo "Always On might require Standard tier"

# Set up deployment credentials
echo "🔑 Setting deployment credentials..."
az webapp deployment user set \
    --user-name jupiterapi-deploy \
    --password "JupiterAPI2024Deploy!"

echo ""
echo "✅ Deployment configuration complete!"
echo ""
echo "📋 Next steps:"
echo "1. Add DNS CNAME record: $CUSTOM_DOMAIN -> $APP_NAME.azurewebsites.net"
echo "2. Deploy code:"
echo "   git remote add azure $DEPLOYMENT_USER"
echo "   git push azure main"
echo "3. Configure SSL certificate in Azure Portal"
echo ""
echo "🌐 URLs:"
echo "   Azure URL: https://$APP_NAME.azurewebsites.net"
echo "   Custom Domain: https://$CUSTOM_DOMAIN"
echo ""
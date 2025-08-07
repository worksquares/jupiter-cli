# Azure App Service Deployment Script for Jupiter AI
# This script deploys the Jupiter AI application to Azure App Service

param(
    [string]$ResourceGroup = "jupiter-agents",
    [string]$AppServicePlan = "digisquares-plan",
    [string]$AppName = "jupiterapi",
    [string]$Location = "eastus",
    [string]$CustomDomain = "jupiterapi.digisquares.in"
)

Write-Host "Starting Jupiter AI deployment to Azure App Service..." -ForegroundColor Green

# Check if logged in to Azure
$context = Get-AzContext -ErrorAction SilentlyContinue
if (-not $context) {
    Write-Host "Not logged in to Azure. Logging in..." -ForegroundColor Yellow
    Connect-AzAccount
}

# Set subscription from .env
$envContent = Get-Content ../.env
$subscriptionId = ($envContent | Where-Object { $_ -match "AZURE_SUBSCRIPTION_ID=" }) -replace "AZURE_SUBSCRIPTION_ID=", ""
if ($subscriptionId) {
    Set-AzContext -SubscriptionId $subscriptionId
}

# Check if resource group exists
$rg = Get-AzResourceGroup -Name $ResourceGroup -ErrorAction SilentlyContinue
if (-not $rg) {
    Write-Host "Creating resource group: $ResourceGroup" -ForegroundColor Yellow
    New-AzResourceGroup -Name $ResourceGroup -Location $Location
}

# Check if App Service Plan exists (use existing one from azureapi)
$plan = Get-AzAppServicePlan -ResourceGroupName $ResourceGroup -Name $AppServicePlan -ErrorAction SilentlyContinue
if (-not $plan) {
    Write-Host "App Service Plan not found. Creating new one..." -ForegroundColor Yellow
    $plan = New-AzAppServicePlan -ResourceGroupName $ResourceGroup `
        -Name $AppServicePlan `
        -Location $Location `
        -Tier "Basic" `
        -NumberofWorkers 1 `
        -WorkerSize "Small" `
        -Linux
}

# Create or update the Web App
$webapp = Get-AzWebApp -ResourceGroupName $ResourceGroup -Name $AppName -ErrorAction SilentlyContinue
if (-not $webapp) {
    Write-Host "Creating Web App: $AppName" -ForegroundColor Yellow
    $webapp = New-AzWebApp -ResourceGroupName $ResourceGroup `
        -Name $AppName `
        -AppServicePlan $AppServicePlan `
        -Location $Location
} else {
    Write-Host "Web App already exists. Updating configuration..." -ForegroundColor Yellow
}

# Configure Node.js runtime
Write-Host "Configuring Node.js runtime..." -ForegroundColor Yellow
Set-AzWebApp -ResourceGroupName $ResourceGroup `
    -Name $AppName `
    -AppSettings @{
        "WEBSITE_NODE_DEFAULT_VERSION" = "~18"
        "SCM_DO_BUILD_DURING_DEPLOYMENT" = "true"
    }

# Set application settings from .env
Write-Host "Setting application settings..." -ForegroundColor Yellow
$appSettings = @{
    "NODE_ENV" = "production"
    "PORT" = "8080"
}

# Read .env file and add settings
foreach ($line in $envContent) {
    if ($line -match "^([^#=]+)=(.+)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        
        # Skip sensitive local values
        if ($key -notmatch "^(DB_PASSWORD|GITHUB_TOKEN|AZURE_CLIENT_SECRET|COSMOS_API_KEY|AZURE_API_KEY)" -and $value) {
            $appSettings[$key] = $value
        }
    }
}

# Add production-specific settings
$appSettings["AZURE_API_URL"] = "https://azureapi.digisquares.in"
$appSettings["AI_PROVIDER"] = "cosmos"
$appSettings["COSMOS_API_URL"] = "https://cosmosapi.digisquares.com"
$appSettings["BASE_URL"] = "https://$CustomDomain"

# Apply settings
Set-AzWebAppSlot -ResourceGroupName $ResourceGroup `
    -Name $AppName `
    -Slot "production" `
    -AppSettings $appSettings

Write-Host "Application settings configured." -ForegroundColor Green

# Enable CORS
Write-Host "Configuring CORS..." -ForegroundColor Yellow
$cors = @{
    AllowedOrigins = @(
        "https://jupiterapi.digisquares.in",
        "https://jupiter-chat.digisquares.in",
        "https://cosmosapi.digisquares.com",
        "http://localhost:3000",
        "http://localhost:5000"
    )
}
Set-AzWebApp -ResourceGroupName $ResourceGroup -Name $AppName -Cors $cors

# Configure custom domain
Write-Host "Configuring custom domain: $CustomDomain" -ForegroundColor Yellow
$hostname = New-AzWebAppSSLBinding -ResourceGroupName $ResourceGroup `
    -WebAppName $AppName `
    -Name $CustomDomain `
    -SslState "Disabled" `
    -ErrorAction SilentlyContinue

if (-not $hostname) {
    # Add custom domain
    Set-AzWebApp -ResourceGroupName $ResourceGroup `
        -Name $AppName `
        -HostNames @($CustomDomain, "$AppName.azurewebsites.net")
}

Write-Host "Deployment configuration complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure DNS CNAME record: $CustomDomain -> $AppName.azurewebsites.net"
Write-Host "2. Deploy code using: git push azure main"
Write-Host "3. Set up SSL certificate in Azure Portal"
Write-Host "" -ForegroundColor White
Write-Host "Web App URL: https://$AppName.azurewebsites.net" -ForegroundColor Cyan
Write-Host "Custom Domain URL: https://$CustomDomain" -ForegroundColor Cyan
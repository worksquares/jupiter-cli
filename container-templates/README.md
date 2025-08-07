# Container Templates for DigiSquares ACI

Pre-built development container images stored in `digisquarescontainers.azurecr.io` for rapid Azure Container Instance deployment.

## 🚀 Benefits

1. **⚡ Instant Deployment** - No waiting for tool installation
2. **🔧 Pre-installed Tools** - All development tools ready to use
3. **📥 Auto Git Clone** - Automatically clone your repository on startup
4. **🔑 Credential Support** - Configure git credentials securely
5. **📦 Auto Dependencies** - Install project dependencies automatically
6. **🎯 Language Specific** - Optimized for each development stack

## 📦 Available Templates

### Node.js Development (`node`)
- **Image**: `digisquarescontainers.azurecr.io/dev-template-node:latest`
- **Base**: Node.js 18 Alpine
- **Tools**: git, npm, yarn, TypeScript, ESLint, Prettier, Jest, Webpack
- **Frameworks**: Express, React, Angular, Vue, Next.js
- **Auto-detects**: package.json → runs `npm install`

### Python Development (`python`)
- **Image**: `digisquarescontainers.azurecr.io/dev-template-python:latest`
- **Base**: Python 3.11 Alpine
- **Tools**: git, pip, poetry, pipenv, pytest, black, flake8, jupyter
- **Frameworks**: Django, Flask, FastAPI, Pandas, NumPy
- **Auto-detects**: requirements.txt, pyproject.toml, Pipfile

### .NET Development (`dotnet`)
- **Image**: `digisquarescontainers.azurecr.io/dev-template-dotnet:latest`
- **Base**: .NET 8.0 SDK Alpine
- **Tools**: git, dotnet CLI, Entity Framework CLI, Node.js
- **Frameworks**: ASP.NET Core, Blazor, Entity Framework
- **Auto-detects**: *.csproj, *.sln → runs `dotnet restore`

### Java Development (`java`)
- **Image**: `digisquarescontainers.azurecr.io/dev-template-java:latest`
- **Base**: Eclipse Temurin 17 JDK Alpine
- **Tools**: git, Maven, Gradle, Node.js
- **Frameworks**: Spring Boot, Spring Framework
- **Auto-detects**: pom.xml → `mvn install`, build.gradle → `gradle build`

### Go Development (`go`)
- **Image**: `digisquarescontainers.azurecr.io/dev-template-go:latest`
- **Base**: Go 1.21 Alpine
- **Tools**: git, air, golangci-lint, delve, swag
- **Frameworks**: Gin, Fiber, Echo
- **Auto-detects**: go.mod → runs `go mod download`

## 🔧 Building Templates

### Prerequisites
- Docker installed
- Access to digisquarescontainers registry

### Build and Push All Templates
```bash
# For Linux/Mac
chmod +x scripts/build-and-push-templates.sh
./scripts/build-and-push-templates.sh

# For Windows PowerShell
.\scripts\build-and-push-templates.ps1
```

### Build Individual Template
```bash
# Build Node.js template
docker build -t digisquarescontainers.azurecr.io/dev-template-node:latest \
  -f container-templates/node/Dockerfile \
  container-templates/node/

# Push to registry
docker push digisquarescontainers.azurecr.io/dev-template-node:latest
```

## 📝 Usage Examples

### 1. Basic Template Usage
```typescript
await api.executeAzureOperation(context, {
  operation: 'createContainer',
  parameters: {
    template: 'node'  // Uses Node.js template
  }
});
```

### 2. Template with Git Repository
```typescript
await api.executeAzureOperation(context, {
  operation: 'createContainer',
  parameters: {
    template: 'python',
    gitRepo: 'https://github.com/myorg/myproject.git'
  }
});
```

### 3. Template with Private Repository
```typescript
await api.executeAzureOperation(context, {
  operation: 'createContainer',
  parameters: {
    template: 'java',
    gitRepo: 'https://github.com/myorg/private-repo.git',
    gitToken: 'ghp_xxxxxxxxxxxxx'  // GitHub personal access token
  }
});
```

### 4. Template with Custom Environment
```typescript
await api.executeAzureOperation(context, {
  operation: 'createContainer',
  parameters: {
    template: 'dotnet',
    gitRepo: 'https://github.com/myorg/myapp.git',
    environmentVariables: {
      ASPNETCORE_ENVIRONMENT: 'Development',
      ConnectionStrings__Default: 'Server=...'
    }
  }
});
```

## 🔄 Container Startup Flow

1. **Container starts** with pre-installed tools
2. **Check GIT_REPO** environment variable
3. **Clone repository** if provided
4. **Configure git credentials** if GIT_TOKEN provided
5. **Install dependencies** based on project files
6. **Display available commands** (npm scripts, etc.)
7. **Keep container running** for development

## 🔑 Environment Variables

Each template supports these environment variables:

- `GIT_REPO` - Repository URL to clone on startup
- `GIT_TOKEN` - Personal access token for private repos
- `PROJECT_ID` - Automatically set by the system
- `TASK_ID` - Automatically set by the system
- Custom variables specific to your application

## 🏃 Performance Comparison

| Operation | Traditional | With Templates |
|-----------|------------|----------------|
| Container Creation | 30-60s | 5-10s |
| Tool Installation | 60-120s | 0s (pre-installed) |
| Git Clone | 10-30s | 10-30s |
| Dependencies | 30-180s | 30-180s |
| **Total Time to Code** | **2-6 min** | **45s-3min** |

## 🔐 Security

- All images are scanned for vulnerabilities
- Minimal Alpine base for smaller attack surface
- No root access by default
- Git credentials stored securely
- Regular updates to base images

## 🆕 Creating Custom Templates

To create your own template:

1. Create a new Dockerfile based on existing templates
2. Add your specific tools and configurations
3. Build and push to the registry
4. Update `container-templates.ts` with your template

Example custom template:
```dockerfile
FROM digisquarescontainers.azurecr.io/dev-template-node:latest

# Add your custom tools
RUN npm install -g your-custom-cli

# Add custom configuration
COPY custom-config /etc/custom/

# Your template is ready!
```

## 📊 Monitoring Template Usage

Templates automatically log:
- Container creation time
- Repository clone status
- Dependency installation status
- Available commands/scripts

## 🤝 Contributing

To add new templates:
1. Create Dockerfile in `container-templates/<language>/`
2. Follow the existing template structure
3. Include startup script with auto-clone logic
4. Update documentation
5. Test thoroughly before pushing

## 📞 Support

For issues with templates:
- Check container logs: `az container logs`
- Verify registry access
- Ensure environment variables are set correctly
- Contact DevOps team for registry access issues
# .NET Development Container Template
# Pre-configured with all common tools for rapid deployment
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine

# Install essential development tools
RUN apk add --no-cache \
    git \
    bash \
    curl \
    openssh-client \
    nodejs \
    npm \
    jq \
    vim \
    nano \
    wget \
    zip \
    unzip \
    tar

# Install .NET tools
RUN dotnet tool install --global dotnet-ef && \
    dotnet tool install --global dotnet-aspnet-codegenerator && \
    dotnet tool install --global dotnet-format

# Add .NET tools to PATH
ENV PATH="$PATH:/root/.dotnet/tools"

# Create workspace directory
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

# Configure git globally
RUN git config --global user.email "developer@digisquares.com" && \
    git config --global user.name "DigiSquares Developer" && \
    git config --global init.defaultBranch main && \
    git config --global core.editor nano

# Create startup script
RUN cat > /startup.sh << 'EOF'
#!/bin/bash
echo "🔷 DigiSquares .NET Development Container Started"
echo "📦 .NET SDK $(dotnet --version)"
echo "📦 Node $(node --version) | npm $(npm --version)"

# If GIT_REPO environment variable is set, clone it
if [ ! -z "$GIT_REPO" ]; then
    echo "📥 Cloning repository: $GIT_REPO"
    
    # Extract repo name from URL
    REPO_NAME=$(basename "$GIT_REPO" .git)
    
    # Clone the repository
    if git clone "$GIT_REPO" "/workspace/$REPO_NAME"; then
        cd "/workspace/$REPO_NAME"
        echo "✅ Repository cloned successfully to /workspace/$REPO_NAME"
        
        # Restore .NET dependencies
        if [ -f "*.csproj" ] || [ -f "*.sln" ]; then
            echo "📦 Restoring .NET dependencies..."
            dotnet restore
            echo "✅ Dependencies restored"
            
            # Check project type
            if grep -q "Microsoft.NET.Sdk.Web" *.csproj 2>/dev/null; then
                echo "🌐 ASP.NET Core project detected"
            elif grep -q "Microsoft.NET.Sdk" *.csproj 2>/dev/null; then
                echo "📱 .NET Console/Library project detected"
            fi
        fi
        
        # Check for frontend dependencies
        if [ -f "package.json" ]; then
            echo "📦 Installing npm dependencies..."
            npm install
            echo "✅ Frontend dependencies installed"
        fi
    else
        echo "❌ Failed to clone repository"
    fi
else
    echo "💡 Tip: Set GIT_REPO environment variable to auto-clone a repository"
fi

# If GIT_TOKEN is provided, configure it
if [ ! -z "$GIT_TOKEN" ]; then
    echo "🔑 Configuring Git credentials"
    git config --global credential.helper store
    echo "https://${GIT_TOKEN}@github.com" > ~/.git-credentials
fi

# Keep container running
echo "🟢 Container ready for development!"
exec tail -f /dev/null
EOF

RUN chmod +x /startup.sh

# Set the startup script as entrypoint
ENTRYPOINT ["/startup.sh"]

# Labels
LABEL maintainer="DigiSquares"
LABEL description=".NET development container with pre-installed tools"
LABEL version="1.0"
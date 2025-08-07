# Node.js Development Container Template
# Pre-configured with all common tools for rapid deployment
FROM node:18-alpine

# Install essential development tools
RUN apk add --no-cache \
    git \
    bash \
    curl \
    openssh-client \
    python3 \
    make \
    g++ \
    jq \
    vim \
    nano \
    wget \
    zip \
    unzip \
    tar

# Install global npm packages commonly used
RUN npm install -g \
    typescript \
    ts-node \
    nodemon \
    pm2 \
    eslint \
    prettier \
    jest \
    mocha \
    webpack \
    @angular/cli \
    @vue/cli \
    create-react-app \
    express-generator

# Create workspace directory
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

# Configure git globally
RUN git config --global user.email "developer@digisquares.com" && \
    git config --global user.name "DigiSquares Developer" && \
    git config --global init.defaultBranch main && \
    git config --global core.editor nano

# Create startup script that can clone a repo if GIT_REPO env var is provided
RUN cat > /startup.sh << 'EOF'
#!/bin/bash
echo "🚀 DigiSquares Node.js Development Container Started"
echo "📦 Node $(node --version) | npm $(npm --version)"
echo "🔧 TypeScript $(tsc --version || echo 'not global')"

# If GIT_REPO environment variable is set, clone it
if [ ! -z "$GIT_REPO" ]; then
    echo "📥 Cloning repository: $GIT_REPO"
    
    # Extract repo name from URL
    REPO_NAME=$(basename "$GIT_REPO" .git)
    
    # Clone the repository
    if git clone "$GIT_REPO" "/workspace/$REPO_NAME"; then
        cd "/workspace/$REPO_NAME"
        echo "✅ Repository cloned successfully to /workspace/$REPO_NAME"
        
        # If it's a Node.js project, install dependencies
        if [ -f "package.json" ]; then
            echo "📦 Installing npm dependencies..."
            npm install
            echo "✅ Dependencies installed"
        fi
        
        # Check for common startup scripts
        if [ -f "package.json" ]; then
            echo "📋 Available npm scripts:"
            npm run | grep -E "^  [a-zA-Z]" || echo "No scripts found"
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
LABEL description="Node.js development container with pre-installed tools"
LABEL version="1.0"
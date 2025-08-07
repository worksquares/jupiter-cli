# Go Development Container Template
# Pre-configured with all common tools for rapid deployment
FROM golang:1.21-alpine

# Install essential development tools
RUN apk add --no-cache \
    git \
    bash \
    curl \
    openssh-client \
    make \
    gcc \
    musl-dev \
    jq \
    vim \
    nano \
    wget \
    zip \
    unzip \
    tar

# Install common Go tools
RUN go install github.com/cosmtrek/air@latest && \
    go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest && \
    go install golang.org/x/tools/gopls@latest && \
    go install github.com/go-delve/delve/cmd/dlv@latest && \
    go install github.com/swaggo/swag/cmd/swag@latest

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
echo "🐹 DigiSquares Go Development Container Started"
echo "📦 Go $(go version)"

# If GIT_REPO environment variable is set, clone it
if [ ! -z "$GIT_REPO" ]; then
    echo "📥 Cloning repository: $GIT_REPO"
    
    # Extract repo name from URL
    REPO_NAME=$(basename "$GIT_REPO" .git)
    
    # Clone the repository
    if git clone "$GIT_REPO" "/workspace/$REPO_NAME"; then
        cd "/workspace/$REPO_NAME"
        echo "✅ Repository cloned successfully to /workspace/$REPO_NAME"
        
        # Install Go dependencies
        if [ -f "go.mod" ]; then
            echo "📦 Downloading Go modules..."
            go mod download
            go mod tidy
            echo "✅ Go modules downloaded"
            
            # Check for common Go frameworks
            if grep -q "gin-gonic/gin" go.mod 2>/dev/null; then
                echo "🌐 Gin web framework detected"
            elif grep -q "fiber" go.mod 2>/dev/null; then
                echo "🚀 Fiber web framework detected"
            elif grep -q "echo" go.mod 2>/dev/null; then
                echo "🔊 Echo web framework detected"
            fi
        else
            # Initialize go module if not exists
            echo "📦 Initializing Go module..."
            go mod init "$REPO_NAME"
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
LABEL description="Go development container with pre-installed tools"
LABEL version="1.0"
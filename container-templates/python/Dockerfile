# Python Development Container Template
# Pre-configured with all common tools for rapid deployment
FROM python:3.11-alpine

# Install essential development tools
RUN apk add --no-cache \
    git \
    bash \
    curl \
    openssh-client \
    gcc \
    musl-dev \
    linux-headers \
    postgresql-dev \
    jq \
    vim \
    nano \
    wget \
    zip \
    unzip \
    tar

# Install common Python packages
RUN pip install --no-cache-dir \
    requests \
    flask \
    django \
    fastapi \
    uvicorn \
    pandas \
    numpy \
    matplotlib \
    jupyter \
    pytest \
    black \
    flake8 \
    mypy \
    poetry \
    pipenv \
    virtualenv \
    sqlalchemy \
    redis \
    celery \
    boto3

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
echo "🐍 DigiSquares Python Development Container Started"
echo "📦 Python $(python --version)"
echo "📦 pip $(pip --version)"

# If GIT_REPO environment variable is set, clone it
if [ ! -z "$GIT_REPO" ]; then
    echo "📥 Cloning repository: $GIT_REPO"
    
    # Extract repo name from URL
    REPO_NAME=$(basename "$GIT_REPO" .git)
    
    # Clone the repository
    if git clone "$GIT_REPO" "/workspace/$REPO_NAME"; then
        cd "/workspace/$REPO_NAME"
        echo "✅ Repository cloned successfully to /workspace/$REPO_NAME"
        
        # Install Python dependencies
        if [ -f "requirements.txt" ]; then
            echo "📦 Installing requirements.txt..."
            pip install -r requirements.txt
            echo "✅ Dependencies installed"
        elif [ -f "pyproject.toml" ]; then
            echo "📦 Installing with poetry..."
            poetry install
            echo "✅ Dependencies installed"
        elif [ -f "Pipfile" ]; then
            echo "📦 Installing with pipenv..."
            pipenv install
            echo "✅ Dependencies installed"
        fi
        
        # Check for common Python files
        if [ -f "manage.py" ]; then
            echo "🌐 Django project detected"
        elif [ -f "app.py" ] || [ -f "main.py" ]; then
            echo "🚀 Python application detected"
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
LABEL description="Python development container with pre-installed tools"
LABEL version="1.0"
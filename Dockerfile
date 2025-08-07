# Jupiter Intelligent Agent System - Development Environment
# Base image with Node.js and development tools

FROM node:18-bullseye-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Version control
    git \
    # Build tools
    build-essential \
    python3 \
    python3-pip \
    # Network tools
    curl \
    wget \
    # Process management
    supervisor \
    # Editor
    nano \
    vim \
    # Shell
    bash \
    zsh \
    # Utilities
    jq \
    tree \
    htop \
    # SSL/TLS
    ca-certificates \
    openssl \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# Install global Node.js tools
RUN npm install -g \
    typescript \
    ts-node \
    nodemon \
    pm2 \
    pnpm \
    yarn \
    @angular/cli \
    @vue/cli \
    create-react-app \
    next \
    nx \
    lerna

# Install Python tools
RUN pip3 install --no-cache-dir \
    pipenv \
    poetry \
    virtualenv \
    black \
    flake8 \
    pylint \
    pytest

# Create workspace directory
WORKDIR /workspace

# Create project structure
RUN mkdir -p \
    /workspace/src \
    /workspace/tests \
    /workspace/docs \
    /workspace/config \
    /workspace/.git \
    /workspace/.vscode \
    /var/log/jupiter

# Set up Git configuration
RUN git config --global user.name "Jupiter Agent" && \
    git config --global user.email "agent@jupiter.ai" && \
    git config --global init.defaultBranch main && \
    git config --global core.editor vim

# Copy agent system files
COPY package*.json /agent/
COPY tsconfig.json /agent/
COPY src /agent/src

# Install agent dependencies
WORKDIR /agent
RUN npm ci && npm run build

# Create startup script
RUN echo '#!/bin/bash\n\
set -e\n\
# Start agent service\n\
echo "Starting Jupiter Agent..."\n\
cd /agent\n\
node dist/index.js &\n\
AGENT_PID=$!\n\
\n\
# Keep container running\n\
tail -f /dev/null' > /start.sh && \
    chmod +x /start.sh

# Supervisor configuration for process management
RUN echo '[supervisord]\n\
nodaemon=true\n\
logfile=/var/log/supervisor/supervisord.log\n\
\n\
[program:agent]\n\
command=node /agent/dist/index.js\n\
directory=/agent\n\
autostart=true\n\
autorestart=true\n\
stderr_logfile=/var/log/jupiter/agent.err.log\n\
stdout_logfile=/var/log/jupiter/agent.out.log\n\
\n\
[program:workspace-watcher]\n\
command=inotifywait -m -r /workspace\n\
autostart=false\n\
autorestart=true\n\
stderr_logfile=/var/log/jupiter/watcher.err.log\n\
stdout_logfile=/var/log/jupiter/watcher.out.log' > /etc/supervisor/conf.d/supervisord.conf

# Environment variables
ENV NODE_ENV=development \
    WORKSPACE_DIR=/workspace \
    AGENT_DIR=/agent \
    LOG_DIR=/var/log/jupiter \
    PORT=3000 \
    DEBUG=jupiter:*

# Expose ports
# 3000 - Development server
# 8080 - API server
# 9229 - Node.js debugger
EXPOSE 3000 8080 9229

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Volume for persistent workspace
VOLUME ["/workspace"]

# Working directory
WORKDIR /workspace

# Default command
CMD ["/start.sh"]

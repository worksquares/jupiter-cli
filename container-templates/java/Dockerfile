# Java Development Container Template
# Pre-configured with all common tools for rapid deployment
FROM eclipse-temurin:17-jdk-alpine

# Install essential development tools
RUN apk add --no-cache \
    git \
    bash \
    curl \
    openssh-client \
    maven \
    gradle \
    nodejs \
    npm \
    jq \
    vim \
    nano \
    wget \
    zip \
    unzip \
    tar

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
echo "☕ DigiSquares Java Development Container Started"
echo "📦 Java $(java -version 2>&1 | head -n 1)"
echo "📦 Maven $(mvn --version | head -n 1)"
echo "📦 Gradle $(gradle --version | grep Gradle)"

# If GIT_REPO environment variable is set, clone it
if [ ! -z "$GIT_REPO" ]; then
    echo "📥 Cloning repository: $GIT_REPO"
    
    # Extract repo name from URL
    REPO_NAME=$(basename "$GIT_REPO" .git)
    
    # Clone the repository
    if git clone "$GIT_REPO" "/workspace/$REPO_NAME"; then
        cd "/workspace/$REPO_NAME"
        echo "✅ Repository cloned successfully to /workspace/$REPO_NAME"
        
        # Build Java project
        if [ -f "pom.xml" ]; then
            echo "📦 Maven project detected. Running mvn install..."
            mvn install -DskipTests
            echo "✅ Maven dependencies installed"
        elif [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then
            echo "📦 Gradle project detected. Running gradle build..."
            gradle build -x test
            echo "✅ Gradle dependencies installed"
        fi
        
        # Check for Spring Boot
        if grep -q "spring-boot" pom.xml 2>/dev/null || grep -q "spring-boot" build.gradle* 2>/dev/null; then
            echo "🌱 Spring Boot project detected"
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
LABEL description="Java development container with pre-installed tools"
LABEL version="1.0"
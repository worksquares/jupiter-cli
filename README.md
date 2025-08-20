<div align="center">

<img src="https://dsazurefilestorage.blob.core.windows.net/public/jupiter-banner.svg" alt="Jupiter CLI" width="800">

# Jupiter CLI

### AI-Powered Coding Assistant by DigiSquares

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/worksquares/jupiter)
[![License](https://img.shields.io/badge/license-Dual%20Licensed-orange.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/worksquares/jupiter)

<p align="center">
  <strong>Transform your development workflow with AI-powered assistance directly in your terminal.</strong><br>
  Enterprise-ready. Multi-provider support. Beautiful UI with custom themes.
</p>

[**Get Started**](#quick-start) • [**Documentation**](https://jupiter.digisquares.com/docs) • [**Getting Started Guide**](https://jupiter.digisquares.com/docs/GETTING_STARTED.md) • [**Examples**](#use-cases) • [**Support**](#support)

</div>

---

## Overview

Jupiter CLI is an enterprise-grade AI coding assistant with multi-provider support and enhanced features. Build complete applications through continuous AI interaction, all from your terminal.

### Key Benefits

- **🚀 Build Complete Apps** - Generate full applications with continuous AI guidance
- **🌍 Multi-Provider Support** - DigiSquares, OpenAI, Anthropic, Azure, Google, Databricks
- **🔒 Enterprise Security** - Input sanitization, secure credential management
- **⚡ High Performance** - Streaming responses, efficient token usage
- **🛠️ Developer Experience** - File context, memory persistence, beautiful themes
- **✨ Modern UI** - Interactive interface with fixed bottom input, consistent colors across platforms
- **👥 User Friendly** - Clear feedback for all actions, no silent failures

---

## Quick Start

### Install from npm (Recommended)

```bash
# Install globally
npm install -g @digisquares/jupiter-cli

# Run Jupiter CLI
jupiter

# Or use npx without installing
npx @digisquares/jupiter-cli
```

### Build from Source

```bash
# Clone the repository
git clone https://github.com/worksquares/jupiter.git
cd jupiter

# Install dependencies
npm install

# Build the project
npm run build

# Run locally
./jupiter-cli.js

# Example: Create a complete API
jupiter> Create a task management REST API with Node.js and Express
```

### Example Session

```bash
jupiter> Build a user authentication system with JWT

🤖 I'll help you build a complete user authentication system with JWT...

Created files:
  ✓ src/models/User.js
  ✓ src/routes/auth.js
  ✓ src/middleware/authenticate.js
  ✓ src/utils/jwt.js
  ✓ src/validators/authValidator.js
  ✓ tests/auth.test.js
  ✓ README.md

Features implemented:
  • User registration with validation
  • Login with JWT tokens
  • Password hashing (bcrypt)
  • Token refresh mechanism
  • Role-based access control
  • Rate limiting
  • Comprehensive tests

Ready to run: npm install && npm start
```

---

## Supported AI Providers

### ✅ Production Ready

#### 1. **DigiSquares (Recommended)**
- **Models**: O4-mini, O3-mini, 4.1, Opus-4, Sonnet-4
- **Features**: Multi-model access with single API key
- **Context**: Up to 200K tokens
- **Special**: Unified API for all models

#### 2. **Azure OpenAI**
- **Models**: GPT-4, O-series (o3-mini, o4-mini)
- **Features**: Enterprise security, custom deployments
- **Context**: 100K-128K tokens
- **Special**: Reasoning tokens support in O-series

#### 3. **OpenAI**
- **Models**: O4-mini, O3-mini, 4.1
- **Features**: Chat, code generation, function calling
- **Context**: 8K-128K tokens
- **Special**: Vision support with GPT-4V

#### 4. **Anthropic Claude**
- **Models**: Opus-4, Sonnet-4
- **Features**: Chat, code generation, vision
- **Context**: 200K tokens
- **Special**: Superior code understanding

### ⚠️ Configuration Ready

#### 5. **Google Gemini**
- **Models**: Gemini 2.0 Flash (Experimental), Gemini 1.5 Pro, Gemini 1.5 Flash
- **Features**: Chat, code generation, vision
- **Context**: 32K-1M tokens
- **Special**: Multi-modal capabilities

#### 6. **Databricks**
- **Models**: Opus-4, Sonnet-4
- **Features**: Enterprise hosting, high performance
- **Context**: 200K tokens
- **Special**: Requires endpoint activation

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# DigiSquares (Recommended - Single API key for all models)
DIGISQUARES_API_KEY=DS_your-api-key
JUPITER_PROVIDER=digisquares
JUPITER_MODEL=o4-mini  # Options: o4-mini, o3-mini, 4.1, opus-4, sonnet-4

# OpenAI
OPENAI_API_KEY=your-openai-key
JUPITER_PROVIDER=openai
JUPITER_MODEL=o4-mini  # Options: o4-mini, o3-mini, 4.1

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-key
JUPITER_PROVIDER=anthropic
JUPITER_MODEL=opus-4  # Options: opus-4, sonnet-4

# Google Gemini
GOOGLE_API_KEY=your-google-key
JUPITER_PROVIDER=google
JUPITER_MODEL=gemini-2.0-flash-exp  # Options: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash

# Azure OpenAI
AZURE_OPENAI_API_KEY=your-azure-key
AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com
JUPITER_PROVIDER=azure
JUPITER_MODEL=o4-mini  # Options: o4-mini, o3-mini, 4.1

# Databricks
DATABRICKS_API_KEY=your-databricks-key
DATABRICKS_BASE_URL=https://your-workspace.azuredatabricks.net
JUPITER_PROVIDER=databricks
JUPITER_MODEL=opus-4  # Options: opus-4, sonnet-4
```

---

## Usage

### Interactive Mode

```bash
./jupiter-cli.js
```

Start an interactive session with context persistence and full CLI features.

**First Time Setup:**
- If no provider is configured, you'll see: "⚠️ No provider configured."
- Type any message and you'll get: "⚠️ No provider configured. Please use /provider to set up your AI provider."
- Use `/provider` to configure your preferred AI service

### Non-Interactive Mode

```bash
# Simple prompt
./jupiter-cli.js --prompt "Write a hello world function in Python"

# With specific provider
./jupiter-cli.js --provider digisquares --prompt "Explain microservices"

# With file context
./jupiter-cli.js --prompt "Find bugs in @src/app.js and fix them"
```

### Available Commands

In interactive mode, use these slash commands:

- `/help` - Show all available commands and shortcuts
- `/provider` - Configure AI provider (DigiSquares, OpenAI, Anthropic, etc.)
- `/provider clear` - Clear provider configuration
- `/clear-provider` - Clear provider configuration (alternative)
- `/theme` - Switch UI theme (Jupiter Dark, Light, Neo, Classic)
- `/clear` - Clear conversation history
- `/editor` - Configure preferred code editor
- `/privacy` - View privacy policy
- `/stats` - Show session statistics
- `/memory show` - Display current memory context
- `/memory refresh` - Refresh JUPITER.md memory
- `/memory add <text>` - Add to memory
- `/tools` - List available tools
- `/mcp` - Show MCP server status
- `/about` - Version and system information
- `/bug [description]` - Report a bug
- `/chat save <tag>` - Save conversation checkpoint
- `/chat resume <tag>` - Resume saved conversation
- `/chat list` - List saved conversations
- `/compress` - Compress chat history to save tokens
- `/quit` or `/exit` - Exit Jupiter CLI
- `/docs` - Open documentation in browser

---

## Advanced Features

### 📁 File Context

Include file contents in your prompts using the `@` syntax:

```bash
jupiter> Analyze @src/server.js and suggest performance improvements
jupiter> Fix the TypeScript errors in @components/Button.tsx
jupiter> Create tests for @services/userService.js
```

### 💾 Memory Persistence

Jupiter maintains context using `JUPITER.md` files:
- Automatically saves project context and decisions
- Loads previous context when starting new sessions
- Helps maintain consistency across long projects

### 🎨 Theme System & UI

Choose from 4 beautiful themes:
- **Jupiter Dark** - High contrast for long coding sessions (Default)
  - Main accent: #1ABC9C (Bright teal)
  - Secondary: #3498DB (Vivid blue)
  - Warning: #F1C40F (Bright gold)
  - Error: #E74C3C (Bright coral red)
- **Jupiter Light** - Clean and bright interface  
- **Neo Matrix** - Matrix-inspired green theme
- **Classic Terminal** - Traditional terminal colors

Switch themes with `/theme` command.

**UI Features:**
- 3-second welcome animation with falling code
- Custom Jupiter banner with spaced ASCII art
- Consistent theme colors across all platforms (no system-dependent changes)
- Fixed input box at bottom (similar to Gemini CLI)
- Professional, non-flashy design
- Provider configuration dialog with step-by-step wizard
- No confirmation prompts - immediate execution with status messages
- Clear feedback when no provider is configured
- User-friendly error messages and guidance

### 🔒 Security Features

- **Input Sanitization** - Prevents code injection
- **XSS Protection** - Safe HTML handling
- **Path Traversal Prevention** - Secure file access
- **Command Injection Prevention** - Shell command safety
- **Rate Limiting** - API call management
- **Sandbox Execution** - Optional Docker/Podman isolation for safe code execution
- **File Permissions** - Automatic security hardening with fix-permissions.sh

### 🐳 Sandbox Mode

Run Jupiter CLI in a secure, isolated environment:

```bash
# Enable sandbox with auto-detection
jupiter --sandbox

# Use specific sandbox backend
export JUPITER_SANDBOX=docker  # or podman, sandbox-exec (macOS)

# Custom sandbox image
export JUPITER_SANDBOX_IMAGE="custom-image:latest"

# Additional sandbox options
export SANDBOX_PORTS="3000,8080"                    # Expose ports
export SANDBOX_MOUNTS="/data:/data:ro"              # Additional mounts
export JUPITER_SANDBOX_PROXY_COMMAND="proxy-cmd"   # Network isolation
```

Sandbox backends:
- **Docker** - Container isolation (all platforms)
- **Podman** - Rootless containers (Linux)
- **sandbox-exec** - macOS native Seatbelt security

---

## Building Complete Applications

Jupiter excels at building full applications through continuous interaction:

### Example: Task Management API

```bash
# Step 1: Initialize project
jupiter> Create a package.json for a task management REST API with Express

# Step 2: Create structure
jupiter> Create the folder structure and main server file

# Step 3: Add models
jupiter> Create a Task model with CRUD operations

# Step 4: Add routes
jupiter> Create RESTful routes for task management

# Step 5: Add validation
jupiter> Add input validation using Joi

# Step 6: Add tests
jupiter> Create comprehensive tests for all endpoints

# Result: Complete, production-ready API!
```

---

## Architecture

Jupiter uses a modular architecture with provider abstraction:

```
┌─────────────────┐
│   Jupiter CLI   │
│     (Main)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Provider       │────▶│   UI/Theme      │────▶│   Security      │
│  Registry       │     │   System        │     │   Layer         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        AI Providers                              │
│  OpenAI │ Claude │ Azure │ Gemini │ Databricks │ Custom        │
└─────────────────────────────────────────────────────────────────┘
```

Key components:
- **Provider Registry** - Dynamic provider management with failover
- **UI System** - Beautiful themes, animations, and consistent branding
- **Security Layer** - Input validation, sanitization, and injection prevention
- **Configuration Manager** - Enhanced settings with provider-specific options

For detailed architecture, see [docs/architecture/](https://jupiter.digisquares.com/docs/architecture/)

---

## Troubleshooting

### Common Issues

#### "No provider configured" Message
- **Issue**: Seeing "⚠️ No provider configured" when starting Jupiter
- **Solution**: Use `/provider` command to set up your AI provider
- **Note**: Jupiter will remind you to configure a provider if you try to chat without one

#### Provider Configuration Issues
- **Issue**: API key not working
- **Solutions**:
  - DigiSquares keys must start with `DS_`
  - Check environment variables are set correctly
  - Try clearing and reconfiguring: `/provider clear` then `/provider`

#### Theme Colors Not Consistent
- **Issue**: Colors appear different on Windows vs Mac
- **Solution**: Update to v0.1.1+ which uses fixed hex colors

#### Commands Not Working
- **Issue**: Slash commands not recognized
- **Solutions**:
  - Commands must start with `/` (e.g., `/help`, `/provider`)
  - Type `/help` to see all available commands
  - Some commands require a configured provider

---

## Testing & Quality

### Verified Features ✅

- Multi-provider AI integration
- Complete application generation
- File context and analysis
- Memory persistence
- Theme system
- Security measures
- Error handling
- TypeScript support

### Test Coverage

- Unit tests for providers
- Integration tests for CLI
- End-to-end application building
- Security vulnerability testing

---

## Troubleshooting

### Common Issues

1. **Module Not Found**
   ```bash
   # Ensure dependencies are installed
   npm install
   
   # If TypeScript issues persist
   npm run build
   ```

2. **Provider Connection Failed**
   - Verify API keys in `.env`
   - Check network connectivity
   - Ensure correct endpoint URLs

3. **Databricks "TEMPORARILY_UNAVAILABLE"**
   - Log into Databricks workspace
   - Activate serving endpoint
   - Check endpoint status

### Debug Mode

```bash
# Run with debug output
DEBUG=jupiter:* ./jupiter-cli.js
```

---

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Project Structure

```
jupiter/
├── jupiter-app/         # Jupiter-specific code
│   ├── adapters/       # Gemini CLI adapter
│   ├── config/         # Configuration management
│   └── types/          # TypeScript definitions
├── jupiter-modules/     # Core modules
│   ├── providers/      # AI provider implementations
│   ├── security/       # Security features
│   └── ui/            # UI components and themes
├── src/                # Gemini CLI source (unmodified)
└── docs/              # Documentation
```

---

## Support

### Community

- **Documentation**: [jupiter.digisquares.com/docs](https://jupiter.digisquares.com/docs)
- **GitHub Issues**: [github.com/worksquares/jupiter/issues](https://github.com/worksquares/jupiter-cli/issues)
- **Discussions**: [github.com/worksquares/jupiter/discussions](https://github.com/worksquares/jupiter-cli/discussions)
- **npm Package**: [@digisquares/jupiter-cli](https://www.npmjs.com/package/@digisquares/jupiter-cli)

### Enterprise Support

For enterprise support and commercial licensing:
- **Website**: [jupiter.digisquares.com](https://jupiter.digisquares.com)
- **Email**: support@jupiter.digisquares.com

---

## License

Jupiter CLI is free for personal use with no restrictions.

For commercial use:
1. Get a DigiSquares API key from https://jupiter.digisquares.com
2. Set `DIGISQUARES_API_KEY=DS_your_key_here`
3. Access advanced features (YOLO mode, agents, sandbox)
4. Commercial license agreement required

## Attribution

Jupiter CLI is a derivative work based on [Gemini CLI](https://github.com/google/generative-ai-cli) by Google LLC, licensed under the Apache License, Version 2.0.

### Original Work
- **Project**: Gemini CLI (generative-ai-cli)
- **Copyright**: © 2025 Google LLC
- **License**: Apache License, Version 2.0
- **Repository**: https://github.com/google/generative-ai-cli

### Modifications
This derivative work includes substantial modifications:
- Complete rebranding to Jupiter CLI
- Multi-provider AI support (DigiSquares, OpenAI, Anthropic, Azure, Databricks)
- Enhanced security features and enterprise capabilities
- Custom UI themes and improved user experience
- Additional features for commercial use

### License Model
- **Personal Use**: Free to use without restrictions
- **Commercial Use**: Requires DigiSquares API key and license agreement

---

## Recent Updates

### Version 0.1.0 (2025)
- ✅ Fixed all TypeScript and build errors
- ✅ Updated environment variables (GEMINI_* → JUPITER_*)
- ✅ Added glob v7 compatibility
- ✅ Fixed @google/genai and OpenTelemetry imports
- ✅ Added error boundaries for better runtime error handling
- ✅ Created migration guide from Gemini CLI
- ✅ Enhanced security with file permissions script
- ✅ Improved cross-platform compatibility
- ✅ Complete Jupiter branding throughout the codebase

---

<div align="center">

**Built with ❤️ by [DigiSquares](https://jupiter.digisquares.com)**

© 2025 DigiSquares. All rights reserved.

Contains code from Gemini CLI © 2025 Google LLC, licensed under Apache 2.0

<sub>Version 0.1.0 - Alpha Release</sub>

</div>
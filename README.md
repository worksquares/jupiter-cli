<div align="center">

<img src="https://dsazurefilestorage.blob.core.windows.net/public/jupiter-banner.svg" alt="Jupiter CLI" width="800">

# Jupiter CLI

### AI-Powered Coding Assistant by DigiSquares

[![npm version](https://img.shields.io/npm/v/@digisquares/jupiter-cli.svg)](https://www.npmjs.com/package/@digisquares/jupiter-cli)
[![License](https://img.shields.io/badge/license-Dual%20Licensed-orange.svg)](#license)
[![Issues](https://img.shields.io/github/issues/worksquares/jupiter-cli.svg)](https://github.com/worksquares/jupiter-cli/issues)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/worksquares/jupiter-cli)

<p align="center">
  <strong>Transform your development workflow with AI-powered assistance directly in your terminal.</strong><br>
  Build complete applications through continuous AI interaction.
</p>

[**Install**](#installation) • [**Documentation**](#documentation) • [**Issues**](https://github.com/worksquares/jupiter-cli/issues) • [**Discussions**](https://github.com/worksquares/jupiter-cli/discussions)

</div>

---

## 🚀 Quick Start

```bash
# Install globally from npm
npm install -g @digisquares/jupiter-cli

# Run Jupiter CLI
jupiter

# Or use directly with npx
npx @digisquares/jupiter-cli
```

## 📋 About This Repository

This is the **public issue tracker and community hub** for Jupiter CLI. Use this repository to:

- 🐛 **Report bugs** and technical issues
- ✨ **Request features** and enhancements  
- 📊 **Track development** progress and roadmap
- 💬 **Join discussions** with the community
- 📖 **Find documentation** and usage guides

> **Note**: This repository does not contain the Jupiter CLI source code. It serves as the public interface for the npm package `@digisquares/jupiter-cli`.

## 🎯 Features

- **Multi-Provider Support** - OpenAI, Anthropic, Azure, Google, and more
- **Build Complete Apps** - Generate full applications with continuous AI guidance
- **Enterprise Security** - Input sanitization, secure credential management
- **Beautiful UI** - Interactive terminal interface with custom themes
- **Advanced Modes** - YOLO mode, planning agents, sandbox execution (commercial)

## 📦 Installation

### Global Installation (Recommended)
```bash
npm install -g @digisquares/jupiter-cli
```

### Local Installation
```bash
npm install @digisquares/jupiter-cli
```

### Using npx
```bash
npx @digisquares/jupiter-cli
```

### System Requirements
- Node.js >= 18.0.0
- npm >= 9.0.0
- Supported OS: Windows, macOS, Linux

## 🔧 Configuration

### Basic Setup
```bash
# Set your AI provider API key
export OPENAI_API_KEY=your-key-here
# or
export ANTHROPIC_API_KEY=your-key-here
# or
export GEMINI_API_KEY=your-key-here

# Run Jupiter
jupiter
```

### Commercial Usage (DigiSquares Provider)
```bash
# Get your key from https://digisquares.com/jupiter
export DIGISQUARES_API_KEY=DS_your_key_here

# Access advanced features
jupiter --yolo -p "build a complete REST API"
```

## 📖 Documentation

### Basic Commands
```bash
# Interactive mode
jupiter

# Non-interactive with prompt
jupiter -p "create a React component"

# With file context
jupiter -p "analyze @src/app.js"

# YOLO mode (commercial only)
jupiter --yolo -p "refactor entire codebase"
```

### Slash Commands
- `/help` - Show available commands
- `/provider` - Switch AI provider
- `/model` - Change AI model
- `/theme` - Change UI theme
- `/clear` - Clear conversation
- `/exit` - Exit Jupiter CLI

## 🐛 Reporting Issues

Before creating an issue:
1. Check [existing issues](https://github.com/worksquares/jupiter-cli/issues)
2. Update to the latest version: `npm update -g @digisquares/jupiter-cli`
3. Include:
   - Jupiter CLI version: `jupiter --version`
   - Node.js version: `node --version`
   - Operating system
   - Error messages and logs
   - Steps to reproduce

## ✨ Feature Requests

We welcome feature suggestions! Please:
1. Check the [roadmap](https://github.com/worksquares/jupiter-cli/projects)
2. Search [existing requests](https://github.com/worksquares/jupiter-cli/issues?q=is%3Aissue+label%3Aenhancement)
3. Use the feature request template
4. Provide use cases and examples

## 🗺️ Roadmap

View our [project board](https://github.com/worksquares/jupiter-cli/projects) for:
- Upcoming features
- Release planning
- Development priorities
- Community requests

## 💬 Community

Join our [Discussions](https://github.com/worksquares/jupiter-cli/discussions) to:
- Ask questions
- Share tips and tricks
- Show off what you've built
- Connect with other users

## 📄 License

Jupiter CLI is dual-licensed:

- **Free for personal use** - Individual developers and hobbyists
- **Commercial license required** - Businesses and organizations

To use commercially:
1. Get a DigiSquares API key from https://digisquares.com/jupiter
2. Set `DIGISQUARES_API_KEY=DS_your_key_here`
3. Access advanced features (YOLO mode, agents, sandbox)

Based on [Gemini CLI](https://github.com/google/generative-ai-cli) (Apache 2.0).

## 🔗 Links

- **npm Package**: [@digisquares/jupiter-cli](https://www.npmjs.com/package/@digisquares/jupiter-cli)
- **Issues**: [GitHub Issues](https://github.com/worksquares/jupiter-cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/worksquares/jupiter-cli/discussions)
- **Website**: [https://digisquares.com/jupiter](https://digisquares.com/jupiter)

## 📧 Support

- **Community**: Use [GitHub Issues](https://github.com/worksquares/jupiter-cli/issues) and [Discussions](https://github.com/worksquares/jupiter-cli/discussions)
- **Commercial**: support@digisquares.com
- **Security**: security@digisquares.com

---

<div align="center">

**Built with ❤️ by [DigiSquares](https://www.digisquares.com)**

© 2025 DigiSquares. All rights reserved.

</div>
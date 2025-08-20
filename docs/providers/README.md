# Jupiter CLI Provider Documentation

Jupiter CLI supports multiple AI providers through a flexible provider system. Each provider offers different capabilities, pricing, and performance characteristics.

## Available Providers

### Meta-Providers (Route to Multiple Backends)
- **[DigiSquares](./digisquares.md)** - Premium meta-provider with advanced features (YOLO mode, planning, agents)

### Direct AI Providers
- **OpenAI** - GPT-4, GPT-3.5 models
- **Anthropic** - Claude 3 family (Opus, Sonnet, Haiku)
- **Google** - Gemini Pro models
- **Azure OpenAI** - Azure-hosted OpenAI models
- **Azure Databricks** - Databricks-hosted models
- **Databricks** - Direct Databricks integration

## Provider Selection

Jupiter CLI automatically selects providers based on:

1. **Priority**: Higher priority providers are preferred (DigiSquares has highest at 100)
2. **Environment Variables**: Presence of API keys determines availability
3. **Explicit Selection**: Use `JUPITER_PROVIDER` environment variable
4. **Configuration**: Settings in `~/.jupiter/settings.json`

## Quick Start

### Using DigiSquares (Recommended for Advanced Features)
```bash
export DIGISQUARES_API_KEY=DS_your_key_here
export DIGISQUARES_SUB_PROVIDER=openai
export DIGISQUARES_SUB_KEY=sk_your_openai_key
jupiter --yolo -p "implement new feature"
```

### Using OpenAI Directly
```bash
export OPENAI_API_KEY=sk_your_key_here
jupiter -p "explain this code"
```

### Using Anthropic Claude
```bash
export CLAUDE_API_KEY=your_key_here
jupiter -p "refactor this function"
```

## Feature Comparison

| Feature | DigiSquares | OpenAI | Anthropic | Google |
|---------|------------|---------|-----------|---------|
| Basic Editing | ✅ | ✅ | ✅ | ✅ |
| YOLO Mode | ✅ | ❌ | ❌ | ❌ |
| Plan Mode* | ✅ | ❌ | ❌ | ❌ |
| Agent Mode* | ✅ | ❌ | ❌ | ❌ |
| Sandbox* | ✅ | ❌ | ❌ | ❌ |
| Vision | ✅ | ✅ | ✅ | ✅ |
| Tools | ✅ | ✅ | ✅ | ✅ |
| Streaming | ✅ | ✅ | ✅ | ✅ |

*Coming soon for DigiSquares users

## Provider Configuration

### Environment Variables
Each provider uses specific environment variables for configuration. See individual provider documentation for details.

### Priority System
Providers are selected based on priority when multiple are available:
- DigiSquares: 100 (highest)
- Azure OpenAI: 80
- OpenAI: 70
- Anthropic: 60
- Google: 50
- Databricks: 40

### Manual Selection
Force a specific provider:
```bash
export JUPITER_PROVIDER=digisquares
# or
export JUPITER_PROVIDER=openai
```

## Advanced Features (DigiSquares Only)

### YOLO Mode
Skip all confirmations for rapid development:
```bash
jupiter --yolo -p "fix all linting errors"
```

### Plan Mode (Coming Soon)
AI plans implementation before executing:
```bash
jupiter --plan -p "add authentication to the app"
```

### Agent Mode (Coming Soon)
Autonomous task completion:
```bash
jupiter --agent -p "optimize database queries"
```

## Troubleshooting

### Provider Not Found
- Ensure API keys are set in environment
- Check provider name spelling
- Verify provider is properly initialized

### Authentication Errors
- Validate API key format
- Check key permissions
- Ensure billing is active

### Feature Not Available
- Advanced features require DigiSquares provider
- Verify DS_* prefixed API key is set
- Check feature compatibility table above

## Getting API Keys

- **DigiSquares**: [https://digisquares.com](https://digisquares.com)
- **OpenAI**: [https://platform.openai.com](https://platform.openai.com)
- **Anthropic**: [https://console.anthropic.com](https://console.anthropic.com)
- **Google**: [https://makersuite.google.com](https://makersuite.google.com)

## Best Practices

1. **Use DigiSquares for Production**: Advanced features and better performance
2. **Test with Direct Providers**: Lower cost for development
3. **Set Fallback Providers**: Configure multiple providers for reliability
4. **Monitor Usage**: Track API costs across providers
5. **Secure Keys**: Never commit API keys to version control
# DigiSquares Provider Configuration

DigiSquares is a meta-provider that routes requests to underlying AI providers (OpenAI, Anthropic, Google) while providing advanced features exclusively for DigiSquares API key holders.

## Features

### Standard Features (All Users)
- Basic edit mode for file modifications
- Standard tool confirmations
- Access to all core tools

### Advanced Features (DigiSquares API Users Only)
- **YOLO Mode**: Automatically accept all tool executions without confirmation
- **Plan Mode**: AI plans implementation steps before executing (coming soon)
- **Agent Mode**: Autonomous decision-making capabilities (coming soon)
- **Sandbox Execution**: Run code in isolated environments (coming soon)
- **Extended Context**: Larger context windows for complex tasks
- **Priority Support**: Enhanced performance and dedicated resources

## Configuration

### Environment Variables

```bash
# DigiSquares API Key (required for advanced features)
export DIGISQUARES_API_KEY=DS_your_api_key_here
# or
export DS_API_KEY=DS_your_api_key_here

# Sub-provider configuration
export DIGISQUARES_SUB_PROVIDER=openai    # Options: openai, anthropic, google
export DIGISQUARES_SUB_MODEL=gpt-4-turbo-preview
export DIGISQUARES_SUB_URL=https://api.openai.com/v1  # Optional custom endpoint
export DIGISQUARES_SUB_KEY=your_openai_api_key
```

### Configuration Flow

When setting up DigiSquares provider, you'll be prompted for:

1. **DigiSquares API Key**: Your DS_* prefixed API key
2. **Sub-Provider Selection**: Choose between OpenAI, Anthropic, or Google
3. **Model Selection**: Pick the specific model to use
4. **API Endpoint**: (Optional) Custom endpoint URL
5. **Sub-Provider API Key**: API key for the selected sub-provider

### Example Setup

```bash
# Set up DigiSquares with OpenAI backend
export DIGISQUARES_API_KEY=DS_abc123...
export DIGISQUARES_SUB_PROVIDER=openai
export DIGISQUARES_SUB_MODEL=gpt-4-turbo-preview
export DIGISQUARES_SUB_KEY=sk-...

# Enable YOLO mode (DigiSquares users only)
jupiter --yolo -p "refactor this codebase"
```

## YOLO Mode Restriction

YOLO mode (`--yolo` or `-y` flag) is exclusively available for DigiSquares API users. If you attempt to use YOLO mode without a valid DigiSquares API key, you'll receive an error:

```
🔴 Jupiter Error: Configuration - YOLO mode is only available for DigiSquares API users
To use YOLO mode, please configure DigiSquares provider with your API key
```

## Sub-Provider Models

### OpenAI Models
- `gpt-4-turbo-preview` - GPT-4 Turbo (Latest)
- `gpt-4` - GPT-4
- `gpt-3.5-turbo` - GPT-3.5 Turbo

### Anthropic Models
- `claude-3-opus-20240229` - Claude 3 Opus (Most Capable)
- `claude-3-sonnet-20240229` - Claude 3 Sonnet (Balanced)
- `claude-3-haiku-20240307` - Claude 3 Haiku (Fast)

### Google Models
- `gemini-pro` - Gemini Pro
- `gemini-pro-vision` - Gemini Pro Vision

## Priority and Selection

DigiSquares provider has the highest priority (100) in the provider registry. When multiple providers are configured, DigiSquares will be selected by default if a valid API key is present.

## Getting a DigiSquares API Key

To obtain a DigiSquares API key and unlock advanced features:

1. Visit [https://jupiter.digisquares.com](https://jupiter.digisquares.com)
2. Sign up or log in
3. Generate your API key (will start with `DS_`)
4. Configure Jupiter CLI with your key

## Troubleshooting

### Invalid API Key Format
Ensure your API key starts with `DS_`. Keys with incorrect prefixes will be rejected.

### Sub-Provider Not Working
Verify that:
- Sub-provider API key is valid
- Selected model is available for your sub-provider account
- API endpoint (if custom) is correctly formatted

### YOLO Mode Not Available
Confirm that:
- `DIGISQUARES_API_KEY` or `DS_API_KEY` is set in environment
- API key starts with `DS_` prefix
- Key is valid and active
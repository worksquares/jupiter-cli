# Environment Variable Configuration

Jupiter CLI now supports automatic configuration through `.env` files, making it easier to set up for development without manual configuration steps.

## Quick Start

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your API keys:
```bash
# For DigiSquares (Recommended - Single API key for all models)
DIGISQUARES_API_KEY=DS_your-api-key-here
JUPITER_PROVIDER=digisquares
JUPITER_MODEL=o4-mini

# For OpenAI
OPENAI_API_KEY=sk-your-api-key-here
JUPITER_PROVIDER=openai

# For Anthropic/Claude
ANTHROPIC_API_KEY=your-anthropic-key-here
JUPITER_PROVIDER=anthropic

# For Azure OpenAI
AZURE_OPENAI_API_KEY=your-azure-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
JUPITER_PROVIDER=azure
```

3. Run Jupiter CLI:
```bash
npm start
# or
./jupiter-cli.js
```

Jupiter will automatically detect and use your environment variables!

## Supported Environment Variables

### DigiSquares (Recommended)
- `DIGISQUARES_API_KEY` - Your DigiSquares API key (required, starts with DS_)
- `JUPITER_PROVIDER` - Set to 'digisquares'
- `JUPITER_MODEL` - Model to use: o4-mini, o3-mini, 4.1, opus-4, sonnet-4

### OpenAI
- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `JUPITER_PROVIDER` - Set to 'openai'
- `JUPITER_MODEL` - Model to use: o4-mini, o3-mini, 4.1

### Anthropic/Claude
- `ANTHROPIC_API_KEY` - Your Anthropic API key (required)
- `JUPITER_PROVIDER` - Set to 'anthropic'
- `JUPITER_MODEL` - Model to use: opus-4, sonnet-4

### Azure OpenAI
- `AZURE_OPENAI_API_KEY` - Your Azure OpenAI API key (required)
- `AZURE_OPENAI_ENDPOINT` - Your Azure endpoint URL (required)
- `JUPITER_PROVIDER` - Set to 'azure'
- `JUPITER_MODEL` - Model to use: o4-mini, o3-mini, 4.1

### Google Gemini
- `GOOGLE_API_KEY` - Your Google API key (required)
- `JUPITER_PROVIDER` - Set to 'google'
- `JUPITER_MODEL` - Model to use: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash

### Databricks
- `DATABRICKS_API_KEY` - Your Databricks API key (required)
- `DATABRICKS_BASE_URL` - Databricks base URL (required)
- `JUPITER_PROVIDER` - Set to 'databricks'
- `JUPITER_MODEL` - Model to use: opus-4, sonnet-4

### Jupiter Configuration
- `JUPITER_PROVIDER` - Default provider: digisquares, openai, anthropic, google, azure, databricks
- `JUPITER_MODEL` - Default model for the selected provider
- `JUPITER_THEME` - Theme selection: jupiter-dark (default), jupiter-light, neo-matrix, classic-terminal
- `JUPITER_LOG_LEVEL` - Logging level: debug, info, warn, error
- `JUPITER_SANDBOX` - Enable sandbox mode (docker, podman, sandbox-exec)
- `JUPITER_SANDBOX_IMAGE` - Docker/Podman image to use for sandbox
- `JUPITER_SANDBOX_PROXY_COMMAND` - Command to run proxy alongside sandbox
- `JUPITER_CLI_INTEGRATION_TEST` - Flag for integration tests

### Backward Compatibility
For users migrating from Gemini CLI, the following legacy variables are still supported:
- `GEMINI_API_KEY` → Use `JUPITER_API_KEY` instead
- `GEMINI_MODEL` → Use `JUPITER_MODEL` instead
- `GEMINI_SANDBOX` → Use `JUPITER_SANDBOX` instead
- `GEMINI_SANDBOX_IMAGE` → Use `JUPITER_SANDBOX_IMAGE` instead
- `GEMINI_SANDBOX_PROXY_COMMAND` → Use `JUPITER_SANDBOX_PROXY_COMMAND` instead

### Development
- `NODE_ENV` - Set to 'development' for dev mode
- `DEBUG` - Set to 'jupiter:*' for debug logging

## Priority Order

Jupiter loads configuration in this order:
1. Command-line arguments (highest priority)
2. Existing `~/.jupiter/config.json` file
3. Environment variables from `.env` file
4. Interactive setup wizard (if no config found)

## Security Notes

- Never commit your `.env` file to version control
- The `.env` file is already in `.gitignore`
- API keys in `.env` are automatically loaded into the secure keys storage
- Use `.env.example` as a template for team members

## Development Workflow

For development, you can create a `.env` file with your API keys and Jupiter will automatically use them without requiring manual setup:

```bash
# .env for development
OPENAI_API_KEY=sk-your-dev-key
JUPITER_PROVIDER=openai
JUPITER_THEME=jupiter-classic-dark
NODE_ENV=development
DEBUG=jupiter:*
```

This allows you to:
- Skip the setup wizard entirely
- Switch between providers easily
- Test different configurations quickly
- Share example configs with team members

## Troubleshooting

### Environment variables not loading
- Ensure `.env` file is in the project root directory
- Check that the file has proper permissions
- Verify variable names match exactly (case-sensitive)

### Provider not detected
- Make sure you have both the API key and required fields
- For Azure/Databricks, endpoint URLs are required
- Check the debug output with `DEBUG=jupiter:*`

### Wrong provider selected
- Set `JUPITER_PROVIDER` explicitly in `.env`
- First configured provider becomes default if not specified
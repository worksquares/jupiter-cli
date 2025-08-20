# Getting Started with Jupiter CLI

## First Time Setup

When you first run Jupiter CLI, you'll need to configure an AI provider.

### Step 1: Start Jupiter CLI

```bash
jupiter
# or
./jupiter-cli.js
```

You'll see:
```
[Jupiter Banner]
Type /help for commands and shortcuts.
⚠️  No provider configured.
```

### Step 2: Configure Your AI Provider

If you try to type a message without a provider, you'll get a helpful reminder:

```
> hi

ℹ ⚠️  No provider configured. Please use /provider to set up your AI provider.
```

Run the provider configuration:

```
> /provider
```

This opens an interactive dialog where you can:
1. Select your AI provider (DigiSquares, OpenAI, Anthropic, etc.)
2. Choose your preferred model
3. Enter your API key
4. Complete any provider-specific configuration

### Step 3: Start Chatting!

Once configured, you can start using Jupiter CLI:

```
> Create a hello world function in Python

✦ I'll create a simple hello world function in Python for you.

```python
def hello_world():
    """Prints a greeting message to the console."""
    print("Hello, World!")

# Call the function
hello_world()
```
```

## Provider Options

### DigiSquares (Recommended)
- Single API key for multiple models
- Models: O4-mini, O3-mini, 4.1, Opus-4, Sonnet-4
- Get your key at: https://jupiter.digisquares.com

### Other Providers
- **OpenAI**: GPT models (O4-mini, O3-mini, 4.1)
- **Anthropic**: Claude models (Opus-4, Sonnet-4)
- **Google**: Gemini models
- **Azure**: Enterprise OpenAI deployments
- **Databricks**: Enterprise Claude hosting

## Essential Commands

- `/help` - Show all available commands
- `/provider` - Configure or change AI provider
- `/provider clear` - Remove current provider
- `/theme` - Change UI theme
- `/clear` - Clear conversation history
- `/quit` or `/exit` - Exit Jupiter CLI

## Tips for New Users

1. **No Silent Failures**: Jupiter always gives feedback. If something doesn't work, you'll see a clear message.

2. **No Confirmations**: Actions execute immediately. When you clear provider or perform other actions, you'll see status messages but won't need to confirm.

3. **File Context**: Include files in your prompts with `@filename`:
   ```
   > Fix the bug in @src/app.js
   ```

4. **Memory Persistence**: Jupiter remembers context using JUPITER.md files in your project.

5. **Themes**: Try different themes with `/theme` for the best coding experience.

## Next Steps

- Read the [full documentation](https://jupiter.digisquares.com/docs)
- Check out [example use cases](../README.md#use-cases)
- Learn about [advanced features](../README.md#advanced-features)
- Join our community for support and updates
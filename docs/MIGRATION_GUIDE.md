# Jupiter CLI Migration Guide

## Migrating from Gemini CLI to Jupiter CLI

This guide helps you migrate your existing Gemini CLI configuration to Jupiter CLI.

### Configuration Directory Migration

Jupiter CLI uses a similar configuration structure to Gemini CLI but stores files in a different location:

- **Gemini CLI**: `~/.gemini/`
- **Jupiter CLI**: `~/.jupiter/`

### Automatic Migration

When you first run Jupiter CLI, it will check for existing Gemini CLI configuration and offer to migrate your settings automatically.

### Manual Migration Steps

If you prefer to migrate manually or the automatic migration didn't work:

1. **Copy Configuration Files**
   ```bash
   # Create Jupiter config directory
   mkdir -p ~/.jupiter
   
   # Copy configuration files
   cp ~/.gemini/config.json ~/.jupiter/config.json 2>/dev/null
   cp ~/.gemini/settings.json ~/.jupiter/settings.json 2>/dev/null
   cp ~/.gemini/.keys ~/.jupiter/.keys 2>/dev/null
   ```

2. **Update File Permissions**
   ```bash
   # Run the fix-permissions script
   ./scripts/fix-permissions.sh
   ```

3. **Update Configuration Paths**
   
   If you have any custom scripts or aliases that reference Gemini CLI paths, update them:
   - Replace `~/.gemini/` with `~/.jupiter/`
   - Replace `gemini` command with `jupiter`

### Environment Variables

The following environment variables have been updated but remain backward compatible:
- `JUPITER_API_KEY` - New primary environment variable (replaces `GEMINI_API_KEY`)
- `JUPITER_MODEL` - New model selection variable (replaces `GEMINI_MODEL`)
- `JUPITER_SANDBOX` - New sandbox configuration (replaces `GEMINI_SANDBOX`)
- `JUPITER_SANDBOX_IMAGE` - New sandbox image variable (replaces `GEMINI_SANDBOX_IMAGE`)
- `JUPITER_SANDBOX_PROXY_COMMAND` - New proxy command variable (replaces `GEMINI_SANDBOX_PROXY_COMMAND`)

Legacy variables still supported for backward compatibility:
- `GEMINI_API_KEY` - Falls back to this if `JUPITER_API_KEY` not set
- `GEMINI_MODEL` - Falls back to this if `JUPITER_MODEL` not set
- `GEMINI_SANDBOX` - Falls back to this if `JUPITER_SANDBOX` not set
- `GEMINI_SANDBOX_IMAGE` - Falls back to this if `JUPITER_SANDBOX_IMAGE` not set
- `GEMINI_SANDBOX_PROXY_COMMAND` - Falls back to this if `JUPITER_SANDBOX_PROXY_COMMAND` not set

Other provider variables remain unchanged:
- `GOOGLE_API_KEY` - Still supported
- `OPENAI_API_KEY` - For OpenAI provider
- `ANTHROPIC_API_KEY` - For Anthropic/Claude provider
- `AZURE_OPENAI_API_KEY` - For Azure OpenAI
- `DATABRICKS_TOKEN` - For Databricks

### Context Files

Jupiter CLI uses `JUPITER.md` instead of `GEMINI.md` for context files:
- Rename any `GEMINI.md` files in your projects to `JUPITER.md`
- The file format and content structure remain the same

### Provider Configuration

Provider configurations remain the same. Jupiter CLI supports all the same providers:
- Gemini (Google AI)
- OpenAI
- Anthropic (Claude)
- Azure OpenAI
- Databricks

### Breaking Changes

1. **Command Name**: Use `jupiter` instead of `gemini`
2. **Config Directory**: `~/.jupiter/` instead of `~/.gemini/`
3. **Context File**: `JUPITER.md` instead of `GEMINI.md`
4. **Error Format**: Errors now use Jupiter branding format

### Troubleshooting

If you encounter issues during migration:

1. **Permission Errors**: Run `./scripts/fix-permissions.sh`
2. **Missing Configuration**: Check both `~/.gemini/` and `~/.jupiter/` directories
3. **API Key Issues**: Ensure your API keys are properly set in environment variables
4. **Context File Not Found**: Rename `GEMINI.md` to `JUPITER.md` in your projects

### Rollback

If you need to rollback to Gemini CLI:
- Your original configuration remains in `~/.gemini/`
- Simply use the `gemini` command instead of `jupiter`
- Both CLIs can coexist on the same system

## Support

For additional help with migration:
- Report issues at: https://github.com/worksquares/jupiter-cli/issues
- Check the documentation at: https://jupiter.digisquares.com/docs
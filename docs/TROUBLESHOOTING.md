# Jupiter CLI Troubleshooting Guide

This guide helps you resolve common issues with Jupiter CLI.

## Build and Installation Issues

### TypeScript Errors During Build

**Problem**: Getting TypeScript compilation errors when running `npm run build`

**Solution**:
```bash
# Clean and reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Run type check
npm run typecheck

# Build again
npm run build
```

### Module Not Found Errors

**Problem**: `Error: Cannot find module` when running Jupiter CLI

**Solution**:
1. Ensure all dependencies are installed:
   ```bash
   npm install
   ```

2. If using TypeScript files directly, ensure tsx is installed:
   ```bash
   npm install -g tsx
   ```

3. For persistent issues, rebuild:
   ```bash
   npm run clean
   npm install
   npm run build
   ```

### React Hook Import Errors

**Problem**: `TypeError: Cannot read properties of undefined (reading 'useState')`

**Solution**: This has been fixed in v0.1.0. If you still encounter it:
```bash
# Update to latest version
git pull origin main
npm install
npm run build
```

## Runtime Issues

### CLI Won't Start

**Problem**: Jupiter CLI fails to start or shows no output

**Solution**:
1. Check Node.js version:
   ```bash
   node --version  # Should be 18.0.0 or higher
   ```

2. Run in debug mode:
   ```bash
   DEBUG=jupiter:* npm start
   ```

3. Check for port conflicts if running server features

### API Key Not Recognized

**Problem**: "No API key configured" error despite setting environment variables

**Solution**:
1. Check environment variable names (use JUPITER_* not GEMINI_*):
   ```bash
   export JUPITER_API_KEY=your-key
   # or for backward compatibility
   export GEMINI_API_KEY=your-key
   ```

2. If using .env file, ensure it's in the project root:
   ```bash
   cat .env  # Should show your API keys
   ```

3. Check configuration file:
   ```bash
   cat ~/.jupiter/config.json
   ```

### Provider Connection Failed

**Problem**: Cannot connect to AI provider (OpenAI, Claude, etc.)

**Solution**:
1. Verify API key is correct
2. Check network connectivity
3. For Azure/Databricks, ensure endpoint URLs are set:
   ```bash
   export AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   export DATABRICKS_HOST=https://your-workspace.azuredatabricks.net
   ```

## Sandbox Issues

### Docker Not Found

**Problem**: "Docker command not found" when using sandbox

**Solution**:
1. Install Docker Desktop from https://docker.com
2. Ensure Docker is running
3. Or use Podman as alternative:
   ```bash
   export JUPITER_SANDBOX=podman
   ```

### Sandbox Permission Denied

**Problem**: Permission errors when running in sandbox

**Solution**:
1. On Linux, add user to docker group:
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

2. Or use rootless Podman:
   ```bash
   export JUPITER_SANDBOX=podman
   ```

3. On macOS, use native sandbox:
   ```bash
   export JUPITER_SANDBOX=sandbox-exec
   ```

### Sandbox Image Pull Failed

**Problem**: Cannot pull sandbox Docker image

**Solution**:
1. Check internet connectivity
2. Use a different image:
   ```bash
   export JUPITER_SANDBOX_IMAGE=ubuntu:latest
   ```

3. Build sandbox locally:
   ```bash
   export BUILD_SANDBOX=true
   ```

## Configuration Issues

### Settings Not Persisting

**Problem**: Jupiter CLI doesn't remember settings between sessions

**Solution**:
1. Check permissions on config directory:
   ```bash
   ls -la ~/.jupiter/
   ```

2. Run permissions fix script:
   ```bash
   ./scripts/fix-permissions.sh
   ```

3. Ensure config file is valid JSON:
   ```bash
   cat ~/.jupiter/config.json | jq .
   ```

### Migration from Gemini CLI

**Problem**: Settings from Gemini CLI not working

**Solution**:
1. Run migration:
   ```bash
   cp -r ~/.gemini ~/.jupiter
   ./scripts/fix-permissions.sh
   ```

2. Update environment variables:
   ```bash
   # Old
   export GEMINI_API_KEY=key
   # New
   export JUPITER_API_KEY=key
   ```

3. Rename context files:
   ```bash
   mv GEMINI.md JUPITER.md
   ```

## UI and Display Issues

### Broken Terminal Display

**Problem**: UI elements appear corrupted or misaligned

**Solution**:
1. Ensure terminal supports Unicode:
   ```bash
   echo $LANG  # Should include UTF-8
   ```

2. Try a different terminal emulator
3. Disable animations:
   ```bash
   export JUPITER_NO_ANIMATIONS=true
   ```

### Theme Not Loading

**Problem**: Theme selection not working

**Solution**:
1. Check theme name is correct
2. Clear theme cache:
   ```bash
   rm -rf ~/.jupiter/theme-cache
   ```

3. Set theme via environment:
   ```bash
   export JUPITER_THEME=jupiter-dark
   ```

## Common Error Messages

### "🔴 Jupiter Error: Provider - Connection failed"
- Check API key is set correctly
- Verify network connectivity
- Ensure provider endpoint is accessible

### "🔴 Jupiter Error: Configuration - Invalid settings"
- Check ~/.jupiter/config.json syntax
- Remove and recreate config file if corrupted

### "🔴 Jupiter Error: Runtime - Memory allocation failed"
- Increase Node.js memory limit:
  ```bash
  export NODE_OPTIONS="--max-old-space-size=4096"
  ```

### "🔴 Jupiter Error: Tool - File not found"
- Check file path is correct
- Ensure you're in the right directory
- File might be excluded by .gitignore

## Debug Mode

For detailed debugging information:

```bash
# Enable all debug output
DEBUG=jupiter:* npm start

# Debug specific modules
DEBUG=jupiter:provider npm start
DEBUG=jupiter:sandbox npm start
DEBUG=jupiter:config npm start
```

## Getting Help

If these solutions don't resolve your issue:

1. Check existing issues: https://github.com/digisquares/jupiter/issues
2. Create a new issue with:
   - Error message
   - Steps to reproduce
   - Environment details (OS, Node version)
   - Debug output
3. Contact support: contact@digisquares.com

## Known Issues

### Windows-Specific
- Long path names may cause issues
- Use PowerShell or Git Bash for best results

### macOS-Specific
- Gatekeeper may block first run
- Run `xattr -c jupiter-cli.js` if needed

### Linux-Specific
- SELinux may block sandbox operations
- AppArmor policies may need adjustment
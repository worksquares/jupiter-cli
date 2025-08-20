# Hidden Features and Keyboard Shortcuts

This document lists all features that are still functional but have their visual indicators hidden in the Jupiter CLI.

## Hidden Features That Still Work

### 1. Auto-Accept Mode
- **Toggle**: `Shift + Tab`
- **What it does**: Automatically accepts code edits without confirmation
- **Visual indicator hidden**: "accepting edits (shift + tab to toggle)" in green

### 2. YOLO Mode
- **Toggle**: `Ctrl + Y`
- **What it does**: Automatically accepts all changes without any confirmation
- **Visual indicator hidden**: "YOLO mode (ctrl + y to toggle)" in red
- **Warning**: Use with caution as it bypasses all safety checks

### 3. Shell Mode
- **Enter**: Type `!` when prompt is empty
- **Exit**: Press `Esc`
- **What it does**: Allows direct shell command execution
- **Visual indicator hidden**: "shell mode enabled (esc to disable)" in yellow
- **Visual cue**: Prompt changes from `Jupiter >` to `! ` when active

### 4. MCP Server Tools
- **Toggle descriptions**: `Ctrl + T`
- **What it does**: Shows/hides tool descriptions for MCP servers
- **Visual indicator hidden**: Tool count and toggle hint

### 5. Error Details
- **Toggle**: `Ctrl + O`
- **What it does**: Shows/hides detailed error messages
- **Still visible**: Error count in footer when errors exist

## Other Keyboard Shortcuts (Still Active)

### Navigation
- `Ctrl + P` - Previous command in history
- `Ctrl + N` - Next command in history
- `Ctrl + A` - Move cursor to beginning of line
- `Ctrl + E` - Move cursor to end of line

### Editing
- `Ctrl + K` - Delete from cursor to end of line
- `Ctrl + U` - Delete from cursor to beginning of line
- `Ctrl + X` - Open in external editor

### System
- `Ctrl + L` - Clear screen
- `Ctrl + C` - Exit (press twice)
- `Ctrl + D` - Exit (press twice when input is empty)

## Slash Commands (Still Available)

- `/help` - Show help (currently hidden)
- `/clear` - Clear the screen
- `/exit` or `/quit` - Exit Jupiter
- `/theme` - Change theme
- `/auth` - Configure authentication
- `/memory` - Refresh memory/context
- `/corgi` - Toggle corgi mode
- `/mcp` - MCP server commands

## Re-enabling Visual Indicators

To re-enable any hidden visual indicator, see `docs/ui-customization.md` for detailed instructions.

## Testing Hidden Features

To verify a hidden feature is still working:

1. **Auto-accept mode**: 
   - Press `Shift + Tab`
   - Ask Jupiter to edit a file
   - Changes should apply without confirmation prompts

2. **Shell mode**:
   - Type `!` at empty prompt
   - Notice prompt changes to `! `
   - Type shell commands like `ls` or `pwd`

3. **YOLO mode**:
   - Press `Ctrl + Y`
   - All operations will proceed without any confirmations

Remember: Even though visual indicators are hidden, all keyboard shortcuts and features remain fully functional.
# Jupiter CLI Commands and Keyboard Shortcuts Guide

## Overview

Jupiter CLI provides a comprehensive set of commands and keyboard shortcuts for efficient interaction. This guide covers all available commands, shortcuts, and their usage patterns.

## Command Categories

### 1. Slash Commands (/)

All commands in Jupiter CLI start with a forward slash. Type `/` to see available commands or start typing to filter.

#### Core Commands

| Command | Description | Usage Example |
|---------|-------------|---------------|
| `/help` | Display help and all available commands | `/help` |
| `/provider` | Configure or change AI provider | `/provider` |
| `/provider clear` | Clear current provider configuration | `/provider clear` |
| `/clear-provider` | Alternative to clear provider | `/clear-provider` |
| `/theme` | Open theme selector | `/theme` |
| `/clear` | Clear conversation history | `/clear` |
| `/quit` or `/exit` | Exit Jupiter CLI | `/quit` |

#### Configuration Commands

| Command | Description | Usage Example |
|---------|-------------|---------------|
| `/editor` | Configure external code editor | `/editor` |
| `/privacy` | View privacy policy | `/privacy` |
| `/about` | Show version and system information | `/about` |
| `/docs` | Open documentation in browser | `/docs` |

#### Session Management

| Command | Description | Usage Example |
|---------|-------------|---------------|
| `/stats` | Display session statistics | `/stats` |
| `/memory show` | Display current memory context | `/memory show` |
| `/memory refresh` | Refresh JUPITER.md memory | `/memory refresh` |
| `/memory add <text>` | Add information to memory | `/memory add Project uses TypeScript` |
| `/compress` | Compress chat history to save tokens | `/compress` |

#### Chat Management

| Command | Description | Usage Example |
|---------|-------------|---------------|
| `/chat save <tag>` | Save conversation checkpoint | `/chat save auth-implementation` |
| `/chat resume <tag>` | Resume saved conversation | `/chat resume auth-implementation` |
| `/chat list` | List all saved conversations | `/chat list` |
| `/chat delete <tag>` | Delete a saved conversation | `/chat delete old-session` |

#### Developer Tools

| Command | Description | Usage Example |
|---------|-------------|---------------|
| `/tools` | List available MCP tools | `/tools` |
| `/mcp` | Show MCP server status | `/mcp` |
| `/mcp restart` | Restart MCP servers | `/mcp restart` |
| `/bug [description]` | Report a bug | `/bug Input prompt freezes` |

## Keyboard Shortcuts

### Navigation Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `↑` / `↓` | Navigate through lists/menus | Dialogs, file picker |
| `Ctrl+P` | Previous command in history | Input prompt |
| `Ctrl+N` | Next command in history | Input prompt |
| `Tab` | Auto-complete files/commands | After @ or / |
| `Shift+Tab` | Toggle auto-accept mode | Global |
| `Esc` | Cancel current operation | Dialogs, file picker |

### Text Editing Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+A` | Move cursor to beginning of line | Input prompt |
| `Ctrl+E` | Move cursor to end of line | Input prompt |
| `Ctrl+K` | Delete from cursor to end of line | Input prompt |
| `Ctrl+U` | Delete from cursor to beginning | Input prompt |
| `Ctrl+W` | Delete word before cursor | Input prompt |
| `Alt+D` | Delete word after cursor | Input prompt |
| `Ctrl+L` | Clear screen | Global |
| `Ctrl+X` | Open in external editor | Input prompt |

### Mode Toggle Shortcuts

| Shortcut | Action | Visual Indicator |
|----------|--------|------------------|
| `Shift+Tab` | Toggle auto-accept mode | Green: "Auto-accepting edits" |
| `Ctrl+Y` | Toggle YOLO mode | Red: "YOLO MODE ACTIVE" |
| `!` | Enter shell mode (empty prompt) | Yellow prompt: `! ` |
| `Ctrl+T` | Toggle tool descriptions | Tool count in footer |
| `Ctrl+O` | Toggle error details | Error count indicator |

### System Shortcuts

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Ctrl+C` | Exit (press twice) | First press shows hint |
| `Ctrl+D` | Exit (when input empty) | Only works on empty line |
| `Ctrl+Z` | Suspend to background | Unix/Linux only |

## Special Input Patterns

### File References (@)

Include file contents in your prompts:

```
@ → Opens file picker
@src/ → Shows files in src directory
@src/app.js → Includes app.js content
@**/*.js → Include all JS files (glob pattern)
```

#### File Picker Navigation

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate files |
| `→` | Enter directory |
| `←` | Go up directory |
| `Enter` | Select file |
| `Space` | Multi-select (if enabled) |
| `Esc` | Cancel |

### Shell Commands (!)

Execute shell commands directly:

```
! → Enter shell mode
!ls → Quick shell command
!! → Repeat last shell command
!$ → Last argument of previous command
```

#### Shell Mode Commands

| Command | Description |
|---------|-------------|
| `exit` | Exit shell mode |
| `Esc` | Exit shell mode |
| `Ctrl+D` | Exit shell mode |

## Command Completion

### Slash Command Completion

```
/pr[Tab] → /provider
/th[Tab] → /theme
/me[Tab] → Shows: /memory show, /memory refresh, /memory add
```

### File Path Completion

```
@src/[Tab] → Shows all files in src/
@src/app[Tab] → Completes to @src/app.js
@src/**/[Tab] → Shows subdirectories
```

## Hidden Features and Shortcuts

These features are functional but have hidden visual indicators:

### 1. Corgi Mode

- **Toggle**: `/corgi`
- **Effect**: Adds playful elements to responses
- **Hidden**: No visual indicator

### 2. Debug Mode

- **Enable**: `Ctrl+Shift+D`
- **Effect**: Shows detailed debug information
- **Hidden**: Debug panel not shown by default

### 3. Performance Mode

- **Toggle**: `Ctrl+Shift+P`
- **Effect**: Disables animations for better performance
- **Hidden**: No visual confirmation

## Multi-Key Sequences

Some actions require key sequences:

### Vim-Style Navigation (in file picker)

| Sequence | Action |
|----------|--------|
| `gg` | Go to first item |
| `G` | Go to last item |
| `5j` | Move down 5 items |
| `5k` | Move up 5 items |

### Emacs-Style Commands

| Sequence | Action |
|----------|--------|
| `Ctrl+X Ctrl+S` | Save current state |
| `Ctrl+X Ctrl+C` | Exit |
| `Meta+<` | Beginning of history |
| `Meta+>` | End of history |

## Context-Sensitive Shortcuts

Shortcuts that change based on context:

### During AI Response

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Interrupt generation |
| `Space` | Pause/Resume streaming |
| `Enter` | Skip to end |

### During Tool Confirmation

| Shortcut | Action |
|----------|--------|
| `Y` / `Enter` | Accept |
| `N` / `Esc` | Reject |
| `A` | Accept all (batch) |
| `R` | Reject all (batch) |
| `E` | Edit before accepting |

### In Dialog Boxes

| Shortcut | Action |
|----------|--------|
| `Tab` | Next field |
| `Shift+Tab` | Previous field |
| `Enter` | Submit |
| `Esc` | Cancel |
| `Ctrl+Enter` | Submit and continue |

## Command Aliases

Many commands have shorter aliases:

| Full Command | Aliases |
|--------------|---------|
| `/quit` | `/q`, `/exit` |
| `/help` | `/h`, `/?` |
| `/clear` | `/cls`, `/c` |
| `/provider` | `/p` |
| `/theme` | `/t` |
| `/memory show` | `/m`, `/mem` |

## Platform-Specific Shortcuts

### macOS

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Clear screen |
| `Cmd+.` | Cancel operation |
| `Option+←/→` | Word navigation |

### Windows

| Shortcut | Action |
|----------|--------|
| `Alt+F4` | Exit application |
| `Ctrl+Break` | Force interrupt |
| `F7` | Command history dialog |

### Linux

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+L` | Clear and reset |
| `Alt+F10` | Maximize terminal |
| `Ctrl+Shift+C/V` | Copy/Paste |

## Quick Reference Card

### Essential Shortcuts

```
Navigation          Editing              Modes
─────────          ─────────            ─────────
↑/↓   = Navigate   Ctrl+A/E = Line      Shift+Tab = Auto-accept
Tab   = Complete   Ctrl+K/U = Delete    Ctrl+Y    = YOLO mode
Esc   = Cancel     Ctrl+L   = Clear     !         = Shell mode
Enter = Select     Ctrl+X   = Editor    Ctrl+T    = Tool info

Commands                     System
─────────                   ─────────
/help     = Show help       Ctrl+C×2 = Exit
/provider = Configure AI    Ctrl+D   = Exit (empty)
/theme    = Change theme    Ctrl+O   = Error details
/clear    = Clear chat      
```

## Command Chaining

Execute multiple commands in sequence:

```
/clear && /provider && /theme
```

Or use semicolons:

```
/memory refresh; /stats; /memory show
```

## Best Practices

### 1. Efficient Navigation

- Use `Tab` completion instead of typing full paths
- Use `Ctrl+P/N` for command history instead of arrows
- Use `/` filtering to quickly find commands

### 2. Workflow Optimization

- Set up `/editor` for complex edits
- Use `/memory add` to maintain context
- Save important conversations with `/chat save`

### 3. Keyboard-First Approach

- Learn mode toggle shortcuts for faster workflow
- Use `Ctrl+L` instead of `/clear` for speed
- Master text editing shortcuts for efficiency

### 4. Error Handling

- Use `Ctrl+O` to see full error details
- Check `/mcp` status if tools aren't working
- Use `/bug` to report issues

## Troubleshooting

### Shortcuts Not Working

1. **Check Terminal Emulator**: Some terminals intercept shortcuts
2. **Check Key Bindings**: Terminal may have conflicting bindings
3. **Try Alternative**: Most actions have multiple shortcuts
4. **Reset Configuration**: `/provider clear` and reconfigure

### Command Not Found

1. **Check Spelling**: Commands are case-sensitive
2. **Use Tab Completion**: Helps avoid typos
3. **Check Version**: Some commands are version-specific
4. **Use `/help`**: Shows all available commands

## Future Enhancements

### Planned Shortcuts

- `Ctrl+R` - Reverse search through history
- `Ctrl+F` - Find in conversation
- `Ctrl+B` - Bookmark current state
- `Ctrl+/` - Comment/uncomment code

### Planned Commands

- `/plugin` - Manage plugins
- `/workspace` - Workspace management
- `/snippet` - Code snippet library
- `/macro` - Record/play macros

## Conclusion

Mastering Jupiter CLI's commands and shortcuts significantly improves productivity. Start with essential shortcuts, gradually incorporate advanced features, and customize your workflow for maximum efficiency.

Remember: All features remain functional even if their visual indicators are hidden. The interface is designed to be discoverable through `/help` and responsive to user exploration.
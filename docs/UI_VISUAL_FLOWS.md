# Jupiter CLI Visual Flows and User Interactions

This document illustrates the visual flow and user interactions in Jupiter CLI with ASCII diagrams and examples.

## User Journey Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        JUPITER CLI START                         │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    3-SECOND ANIMATION                            │
│                  (Falling Code Effect)                           │
│     ██╗██╗   ██╗██████╗ ██╗████████╗███████╗██████╗           │
│     ██║██║   ██║██╔══██╗██║╚══██╔══╝██╔════╝██╔══██╗          │
│     ██║██║   ██║██████╔╝██║   ██║   █████╗  ██████╔╝          │
│██   ██║██║   ██║██╔═══╝ ██║   ██║   ██╔══╝  ██╔══██╗          │
│╚█████╔╝╚██████╔╝██║     ██║   ██║   ███████╗██║  ██║          │
│ ╚════╝  ╚═════╝ ╚═╝     ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝          │
│                         by DigiSquares                           │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CHECK CONFIGURATION                           │
│                                                                  │
│  ┌─────────────────┐ YES    ┌─────────────────────────────┐   │
│  │ Provider Config ├────────►│    Main Interface Ready     │   │
│  │    Exists?      │         └─────────────────────────────┘   │
│  └────────┬────────┘                                            │
│           │ NO                                                   │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         ⚠️  No provider configured.                      │   │
│  │    Type /help for commands and shortcuts.                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Main Interface Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Jupiter CLI v0.1.1 | Provider: DigiSquares | Model: o4-mini    │ <- Header
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 👤 You: Create a hello world function in Python                 │ <- User Message
│                                                                  │
│ 🤖 Jupiter: I'll create a simple hello world function for you.  │ <- AI Response
│                                                                  │
│ ```python                                                        │
│ def hello_world():                                               │ <- Code Block
│     """Prints a greeting message to the console."""             │
│     print("Hello, World!")                                       │
│                                                                  │
│ # Call the function                                              │
│ hello_world()                                                    │
│ ```                                                              │
│                                                                  │
│ Would you like me to:                                           │
│ 1. Save this to a file                                          │
│ 2. Add more functionality                                        │
│ 3. Create tests for it                                          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Tokens: 1,234/20,000 | Messages: 2 | Theme: Jupiter Dark       │ <- Status Bar
├─────────────────────────────────────────────────────────────────┤
│ > _                                                              │ <- Input Prompt
└─────────────────────────────────────────────────────────────────┘
  ↑ Ctrl+C to exit | /help for commands | Shift+Tab for auto-accept
```

## Provider Configuration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROVIDER CONFIGURATION                        │
│                                                                  │
│  Step 1: Select Provider                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Select your AI provider:                                 │   │
│  │                                                           │   │
│  │ ○ DigiSquares (Recommended)                             │   │
│  │ ○ OpenAI                                                │   │
│  │ ● Azure OpenAI         ← Selected                       │   │
│  │ ○ Anthropic (Claude)                                    │   │
│  │ ○ Google Gemini                                         │   │
│  │ ○ Databricks                                            │   │
│  │                                                           │   │
│  │ [↑↓ Navigate] [Space Select] [Enter Continue]           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  Step 2: Select Model                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Select Azure OpenAI model:                               │   │
│  │                                                           │   │
│  │ ● o4-mini (Latest reasoning model)                      │   │
│  │ ○ o3-mini (Fast reasoning)                              │   │
│  │ ○ gpt-4 (Most capable)                                  │   │
│  │ ○ gpt-3.5-turbo (Fast and efficient)                   │   │
│  │                                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  Step 3: Enter Credentials                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Enter your Azure OpenAI endpoint:                        │   │
│  │ > https://myresource.openai.azure.com_                   │   │
│  │                                                           │   │
│  │ Enter your Azure OpenAI API key:                         │   │
│  │ > ********************************                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ✅ Provider configured successfully!                     │   │
│  │ You can now start using Jupiter CLI.                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Theme Selection Interface

```
┌─────────────────────────────────────────────────────────────────┐
│                        THEME SELECTOR                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Select a theme:                                          │   │
│  │                                                           │   │
│  │ ● Jupiter Dark (Default)                                 │   │
│  │   Preview: ████ Main ████ Secondary ████ Warning        │   │
│  │                                                           │   │
│  │ ○ Jupiter Light                                          │   │
│  │   Preview: ████ Main ████ Secondary ████ Warning        │   │
│  │                                                           │   │
│  │ ○ Neo Matrix                                             │   │
│  │   Preview: ████ Main ████ Secondary ████ Warning        │   │
│  │                                                           │   │
│  │ ○ Classic Terminal                                       │   │
│  │   Preview: ████ Main ████ Secondary ████ Warning        │   │
│  │                                                           │   │
│  │ [↑↓ Navigate] [Enter Select] [Esc Cancel]               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## File Context Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     FILE CONTEXT (@)                             │
│                                                                  │
│  User types: "Fix the bug in @"                                 │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Select file:                                             │   │
│  │                                                           │   │
│  │ 📁 src/                                                  │   │
│  │   📄 app.js                                             │   │
│  │   📄 server.js          ← Highlighted                   │   │
│  │   📄 config.js                                          │   │
│  │ 📁 tests/                                               │   │
│  │   📄 app.test.js                                        │   │
│  │                                                           │   │
│  │ [↑↓ Navigate] [Tab Complete] [Esc Cancel]               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  Input becomes: "Fix the bug in @src/server.js"                │
└─────────────────────────────────────────────────────────────────┘
```

## Command Menu Flow (/)

```
┌─────────────────────────────────────────────────────────────────┐
│                     COMMAND MENU (/)                             │
│                                                                  │
│  User types: "/"                                                 │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Available commands:                                       │   │
│  │                                                           │   │
│  │ /help         - Show help and commands                   │   │
│  │ /provider     - Configure AI provider      ← Highlighted │   │
│  │ /theme        - Change UI theme                          │   │
│  │ /clear        - Clear conversation                       │   │
│  │ /stats        - Show session statistics                  │   │
│  │ /memory       - Memory commands...                       │   │
│  │ /chat         - Chat management...                       │   │
│  │ /quit         - Exit Jupiter CLI                         │   │
│  │                                                           │   │
│  │ [↑↓ Navigate] [Tab Complete] [Esc Cancel]               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Tool Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOOL EXECUTION FLOW                           │
│                                                                  │
│  AI Response: "I'll create the file for you."                   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔧 Tool: write_file                                      │   │
│  │                                                           │   │
│  │ Creating: src/hello.py                                   │   │
│  │                                                           │   │
│  │ Content preview:                                         │   │
│  │ ┌─────────────────────────────────────────────────┐     │   │
│  │ │ def hello_world():                               │     │   │
│  │ │     """Simple hello world function."""           │     │   │
│  │ │     print("Hello, World!")                       │     │   │
│  │ │                                                   │     │   │
│  │ │ if __name__ == "__main__":                       │     │   │
│  │ │     hello_world()                                 │     │   │
│  │ └─────────────────────────────────────────────────┘     │   │
│  │                                                           │   │
│  │ Accept this change? (Y/n): _                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                          Y pressed                               │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ✅ File created: src/hello.py                            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Error Display Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      ERROR DISPLAY                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ❌ Error: Failed to connect to provider                  │   │
│  │                                                           │   │
│  │ Details:                                                 │   │
│  │ • Check your internet connection                         │   │
│  │ • Verify your API key is correct                        │   │
│  │ • Ensure the endpoint URL is accessible                 │   │
│  │                                                           │   │
│  │ Error code: PROVIDER_CONNECTION_FAILED                   │   │
│  │                                                           │   │
│  │ [Press Ctrl+O to see full error details]                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Loading States

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOADING STATES                               │
│                                                                  │
│  Thinking:     ⠋ Thinking...                                    │
│                ⠙ Thinking...                                    │
│                ⠹ Thinking...                                    │
│                ⠸ Thinking...                                    │
│                                                                  │
│  Generating:   [████████████░░░░░░░░] 60% Generating response   │
│                                                                  │
│  Processing:   ⣾ Processing files... (3/10)                     │
│                                                                  │
│  Streaming:    🤖 Jupiter: I'll help you with that. Let me|     │
│                           ^ Cursor shows streaming text         │
└─────────────────────────────────────────────────────────────────┘
```

## Context Bar States

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT BAR STATES                            │
│                                                                  │
│  Low Usage (0-50%):                                              │
│  Context: [████████░░░░░░░░░░░░] 25% (5k/20k tokens)           │
│           └─ Green color                                         │
│                                                                  │
│  Medium Usage (50-80%):                                          │
│  Context: [████████████████░░░░] 75% (15k/20k tokens)          │
│           └─ Yellow color                                        │
│                                                                  │
│  High Usage (80-100%):                                           │
│  Context: [████████████████████░] 95% (19k/20k tokens)         │
│           └─ Red color                                           │
│                                                                  │
│  Full:                                                           │
│  Context: [████████████████████] 100% - Consider /compress      │
│           └─ Red with warning                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Mode Indicators

```
┌─────────────────────────────────────────────────────────────────┐
│                      MODE INDICATORS                             │
│                                                                  │
│  Normal Mode:                                                    │
│  > _                                                             │
│                                                                  │
│  Shell Mode (activated with !):                                  │
│  ! ls -la_                                                       │
│  └─ Yellow prompt, direct shell access                           │
│                                                                  │
│  YOLO Mode (Ctrl+Y):                                            │
│  > _  [YOLO MODE ACTIVE - All changes auto-accepted]            │
│       └─ Red warning indicator                                   │
│                                                                  │
│  Auto-Accept Mode (Shift+Tab):                                   │
│  > _  [Auto-accepting edits]                                     │
│       └─ Green indicator                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Keyboard Navigation Map

```
┌─────────────────────────────────────────────────────────────────┐
│                   KEYBOARD SHORTCUTS MAP                         │
│                                                                  │
│  Navigation:                                                     │
│  ├─ ↑/↓ ........... Navigate lists/history                      │
│  ├─ Ctrl+P/N ...... Previous/Next in history                   │
│  ├─ Tab ........... Complete file paths/commands               │
│  └─ Esc ........... Cancel current operation                   │
│                                                                  │
│  Editing:                                                        │
│  ├─ Ctrl+A/E ...... Beginning/End of line                      │
│  ├─ Ctrl+K/U ...... Delete to end/beginning                    │
│  ├─ Ctrl+L ........ Clear screen                               │
│  └─ Ctrl+X ........ Open in external editor                    │
│                                                                  │
│  Modes:                                                          │
│  ├─ Shift+Tab ..... Toggle auto-accept                         │
│  ├─ Ctrl+Y ........ Toggle YOLO mode                           │
│  ├─ ! ............. Enter shell mode                            │
│  └─ Ctrl+T ........ Toggle tool descriptions                   │
│                                                                  │
│  System:                                                         │
│  ├─ Ctrl+C ........ Exit (press twice)                         │
│  ├─ Ctrl+D ........ Exit (when input empty)                    │
│  └─ Ctrl+O ........ Show error details                         │
└─────────────────────────────────────────────────────────────────┘
```

## Session Statistics Display

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION STATISTICS                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Session Duration: 00:15:32                               │   │
│  │                                                           │   │
│  │ Messages:                                                 │   │
│  │ • User messages: 12                                       │   │
│  │ • AI responses: 12                                        │   │
│  │ • Total tokens: 4,567                                     │   │
│  │                                                           │   │
│  │ Tools Used:                                               │   │
│  │ • write_file: 3 times                                     │   │
│  │ • read_file: 5 times                                      │   │
│  │ • shell_command: 2 times                                  │   │
│  │                                                           │   │
│  │ Cost Estimate: $0.12                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Memory Context Display

```
┌─────────────────────────────────────────────────────────────────┐
│                    MEMORY CONTEXT (JUPITER.md)                   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Current Memory Context:                                   │   │
│  │                                                           │   │
│  │ Project: Task Management API                              │   │
│  │ Stack: Node.js, Express, MongoDB                          │   │
│  │                                                           │   │
│  │ Recent Decisions:                                         │   │
│  │ • Using JWT for authentication                           │   │
│  │ • RESTful API design                                     │   │
│  │ • MongoDB for data persistence                           │   │
│  │                                                           │   │
│  │ Files Created:                                            │   │
│  │ • src/models/Task.js                                     │   │
│  │ • src/routes/tasks.js                                    │   │
│  │ • src/middleware/auth.js                                 │   │
│  │                                                           │   │
│  │ [Last updated: 5 minutes ago]                            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Responsive Behavior

```
Terminal Width < 80 chars:          Terminal Width >= 80 chars:
┌────────────────────┐              ┌─────────────────────────────────────┐
│ Jupiter v0.1.1     │              │ Jupiter CLI v0.1.1 | Provider: ...  │
│ Provider: OpenAI   │              ├─────────────────────────────────────┤
│ Model: o4-mini     │              │ Full interface with all elements    │
├────────────────────┤              │ displayed side by side              │
│ Compact view with  │              │                                     │
│ stacked elements   │              │ More information visible            │
│                    │              │                                     │
└────────────────────┘              └─────────────────────────────────────┘
```

## Conclusion

These visual flows represent the complete user interaction patterns in Jupiter CLI. The interface is designed to be:

1. **Intuitive**: Clear visual hierarchy and navigation
2. **Responsive**: Adapts to different terminal sizes
3. **Informative**: Always shows current state and options
4. **Efficient**: Minimal steps to accomplish tasks
5. **Accessible**: Keyboard-first with clear indicators

The flows ensure users always know:
- Where they are in the interface
- What actions are available
- How to proceed or cancel
- What the system is doing
- How to get help when needed
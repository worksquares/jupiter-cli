# Jupiter CLI UI Components Guide

This comprehensive guide covers all UI elements in the Jupiter CLI, their functionality, and how they enhance the user experience.

## Table of Contents

1. [Overview](#overview)
2. [Main UI Components](#main-ui-components)
3. [Theme System](#theme-system)
4. [Interactive Elements](#interactive-elements)
5. [Message Components](#message-components)
6. [Dialog Components](#dialog-components)
7. [Status Indicators](#status-indicators)
8. [Input Components](#input-components)
9. [Animation and Effects](#animation-and-effects)
10. [Accessibility Features](#accessibility-features)

## Overview

Jupiter CLI features a modern, interactive terminal UI built with React and Ink, providing a rich user experience while maintaining the familiarity of command-line interfaces.

### Key UI Principles

- **Fixed Bottom Input**: Input prompt stays at the bottom of the terminal
- **Consistent Theming**: Colors remain consistent across all platforms
- **Clear Feedback**: Every action provides immediate visual feedback
- **No Silent Failures**: All errors and issues are clearly displayed
- **Progressive Disclosure**: Complex features are revealed as needed

## Main UI Components

### 1. Jupiter Banner (`JupiterBanner.tsx`)

The welcome banner displays when Jupiter CLI starts, featuring:

- **ASCII Art Logo**: Custom Jupiter branding
- **Version Information**: Current version display
- **Company Attribution**: "by DigiSquares" branding
- **Animation**: 3-second falling code effect on startup

```
     ██╗██╗   ██╗██████╗ ██╗████████╗███████╗██████╗ 
     ██║██║   ██║██╔══██╗██║╚══██╔══╝██╔════╝██╔══██╗
     ██║██║   ██║██████╔╝██║   ██║   █████╗  ██████╔╝
██   ██║██║   ██║██╔═══╝ ██║   ██║   ██╔══╝  ██╔══██╗
╚█████╔╝╚██████╔╝██║     ██║   ██║   ███████╗██║  ██║
 ╚════╝  ╚═════╝ ╚═╝     ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
                    by DigiSquares
```

### 2. Header Component (`JupiterHeader.tsx`)

Displays session information at the top:

- **Provider Status**: Shows current AI provider (or warning if none configured)
- **Model Information**: Current model being used
- **Session Stats**: Token usage, message count
- **Theme Indicator**: Current theme name

### 3. Footer Component (`JupiterFooter.tsx`)

Fixed footer showing:

- **Input Status**: Ready/Processing indicator
- **Keyboard Shortcuts**: Context-sensitive shortcuts
- **Mode Indicators**: Shell mode, YOLO mode, etc.
- **Error Count**: If errors exist

### 4. Input Prompt (`JupiterInputPrompt.tsx`)

The main input area featuring:

- **Fixed Position**: Always at bottom of screen
- **Multi-line Support**: Expands for longer inputs
- **Syntax Highlighting**: For code snippets
- **File Completion**: @ symbol triggers file picker
- **Command Completion**: / symbol shows available commands

## Theme System

### Available Themes

1. **Jupiter Dark** (Default)
   - Main: `#1ABC9C` (Bright teal)
   - Secondary: `#3498DB` (Vivid blue)
   - Warning: `#F1C40F` (Bright gold)
   - Error: `#E74C3C` (Bright coral red)
   - Background: `#0C0C0C`

2. **Jupiter Light**
   - Main: `#16A085` (Dark teal)
   - Secondary: `#2980B9` (Dark blue)
   - Warning: `#D68910` (Dark gold)
   - Error: `#C0392B` (Dark red)
   - Background: `#FFFFFF`

3. **Neo Matrix**
   - Main: `#00FF00` (Matrix green)
   - Secondary: `#00CC00` (Dark green)
   - Warning: `#FFFF00` (Yellow)
   - Error: `#FF0000` (Red)
   - Background: `#000000`

4. **Classic Terminal**
   - Main: `#00FF00` (Terminal green)
   - Secondary: `#FFFFFF` (White)
   - Warning: `#FFFF00` (Yellow)
   - Error: `#FF0000` (Red)
   - Background: `#000000`

### Theme Components

- **JupiterColors.ts**: Central color definitions
- **theme-system.ts**: Theme management logic
- **ThemeDialog.tsx**: Interactive theme selector

## Interactive Elements

### 1. Provider Selection Dialog (`ProviderSelectionDialog.tsx`)

Multi-step wizard for configuring AI providers:

- **Provider List**: Radio button selection
- **Model Selection**: Dropdown based on provider
- **API Key Input**: Secure password field
- **Configuration Summary**: Review before saving

### 2. Help Component (`Help.tsx`)

Comprehensive help display showing:

- **Available Commands**: All slash commands
- **Keyboard Shortcuts**: Platform-specific shortcuts
- **Tips and Tricks**: Usage suggestions
- **Examples**: Common use cases

### 3. About Box (`AboutBox.tsx`)

System information display:

- **Version Details**: Jupiter CLI version
- **System Info**: OS, Node.js version
- **Provider Info**: Current configuration
- **License Info**: Usage terms

## Message Components

### 1. Jupiter Message (`JupiterMessage.tsx`)

AI response messages featuring:

- **Avatar**: 🤖 icon for AI responses
- **Streaming Text**: Character-by-character display
- **Code Blocks**: Syntax-highlighted code
- **Markdown Rendering**: Rich text formatting

### 2. User Message (`UserMessage.tsx`)

User input display:

- **User Icon**: 👤 for user messages
- **File References**: Highlighted @ mentions
- **Command Highlighting**: / commands in different color

### 3. Error Message (`ErrorMessage.tsx`)

Error display with:

- **Error Icon**: ❌ or ⚠️ based on severity
- **Error Details**: Expandable stack traces
- **Suggestions**: Helpful next steps
- **Error Code**: For troubleshooting

### 4. Tool Messages

#### Tool Confirmation (`ToolConfirmationMessage.tsx`)
- **Action Description**: What the tool will do
- **File Preview**: Shows changes to be made
- **Accept/Reject Options**: Y/N prompts

#### Tool Group Message (`ToolGroupMessage.tsx`)
- **Batch Operations**: Groups related tool calls
- **Progress Indicator**: Shows completion status
- **Summary View**: Collapsed by default

## Dialog Components

### 1. Model Config Dialog (`ModelConfigDialog.tsx`)

Advanced model configuration:

- **Temperature Slider**: 0.0 to 2.0
- **Token Limits**: Max tokens setting
- **System Prompt**: Custom instructions
- **Advanced Options**: Provider-specific settings

### 2. Editor Settings Dialog (`EditorSettingsDialog.tsx`)

Configure external editor:

- **Editor Selection**: VS Code, Vim, Nano, etc.
- **Custom Command**: User-defined editor
- **Test Button**: Verify editor works

### 3. Theme Dialog (`SimpleThemeDialog.tsx`)

Quick theme switcher:

- **Theme Preview**: Live preview of colors
- **Arrow Navigation**: Up/down to select
- **Instant Apply**: No confirmation needed

## Status Indicators

### 1. Loading Indicator (`LoadingIndicator.tsx`)

Various loading states:

- **Thinking**: Animated dots (...)
- **Processing**: Spinner animation
- **Generating**: Progress bar
- **Custom Messages**: Context-specific text

### 2. Context Length Bar (`ContextLengthBar.tsx`)

Visual token usage:

```
Context: [████████████░░░░░░░] 75% (15k/20k tokens)
```

- **Color Coding**: Green → Yellow → Red
- **Percentage Display**: Current usage
- **Token Count**: Actual numbers

### 3. Auto-Accept Indicator (`AutoAcceptIndicator.tsx`)

Mode indicators:

- **YOLO Mode**: Red indicator when active
- **Auto-Accept**: Green indicator
- **Shell Mode**: Yellow indicator

### 4. Memory Usage Display (`MemoryUsageDisplay.tsx`)

System resource monitoring:

- **RAM Usage**: Current memory consumption
- **CPU Usage**: Processing load
- **Token Usage**: API consumption

## Input Components

### 1. Simple Text Input (`SimpleTextInput.tsx`)

Basic text input with:

- **Placeholder Text**: Helpful hints
- **Validation**: Real-time validation
- **Submit Handler**: Enter to submit

### 2. Radio Button Select (`RadioButtonSelect.tsx`)

Option selection:

```
○ Option 1
● Option 2 (selected)
○ Option 3
```

- **Arrow Navigation**: Up/down keys
- **Space Selection**: Toggle selection
- **Visual Feedback**: Highlighted selection

### 3. Shell Mode Indicator (`ShellModeIndicator.tsx`)

Shows when in shell mode:

- **Prompt Change**: `! ` instead of `>`
- **Yellow Warning**: Safety reminder
- **Exit Instructions**: How to leave mode

## Animation and Effects

### 1. Matrix Animation (`matrix-animation.ts`)

Falling code effect:

- **Startup Animation**: 3-second display
- **Character Rain**: Matrix-style effect
- **Fade Transition**: Smooth fade to main UI

### 2. Jupiter Responding Spinner (`JupiterRespondingSpinner.tsx`)

AI thinking animation:

- **Rotating Dots**: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
- **Pulsing Effect**: Brightness variation
- **Custom Messages**: "Thinking...", "Generating..."

### 3. Progress Bar (`JupiterProgressBar.tsx`)

Operation progress:

```
[████████████████████░░░░░░░░░░] 67% - Processing files...
```

- **Smooth Animation**: No jumps
- **Time Remaining**: ETA display
- **Cancel Option**: Ctrl+C to stop

## Accessibility Features

### 1. Screen Reader Support

- **ARIA Labels**: All interactive elements labeled
- **Role Attributes**: Proper semantic roles
- **Live Regions**: Updates announced

### 2. Keyboard Navigation

- **Tab Navigation**: All elements reachable
- **Arrow Keys**: List navigation
- **Escape Key**: Cancel/close dialogs
- **Enter Key**: Confirm actions

### 3. High Contrast Support

- **Theme Options**: High contrast themes available
- **Color Blindness**: Considered in color choices
- **Text Clarity**: Sufficient contrast ratios

### 4. Error Recovery (`ErrorRecovery.tsx`)

- **Graceful Degradation**: Fallback UI on errors
- **Clear Messages**: User-friendly error text
- **Recovery Options**: Suggested actions

## UI State Management

### 1. Session Context (`SessionContext.tsx`)

Manages:

- **Message History**: All conversations
- **Provider State**: Current configuration
- **User Preferences**: Theme, settings
- **Error State**: Global error handling

### 2. Streaming Context (`StreamingContext.tsx`)

Handles:

- **Real-time Updates**: Streaming responses
- **Buffer Management**: Efficient rendering
- **Cancellation**: Interrupt streams

### 3. Overflow Context (`OverflowContext.tsx`)

Controls:

- **Scroll Behavior**: Auto-scroll management
- **Content Overflow**: Long message handling
- **Focus Management**: Input focus control

## Best Practices for UI Development

### 1. Component Guidelines

- **Single Responsibility**: Each component has one job
- **Prop Validation**: TypeScript interfaces
- **Error Boundaries**: Prevent crashes
- **Memoization**: Performance optimization

### 2. Styling Approach

- **Inline Styles**: Using Ink's style prop
- **Theme Variables**: Consistent color usage
- **Responsive Design**: Terminal size aware
- **Animation Performance**: Minimal CPU usage

### 3. User Experience

- **Immediate Feedback**: No waiting without indication
- **Clear Messaging**: Avoid technical jargon
- **Progressive Enhancement**: Basic functionality first
- **Keyboard First**: Mouse optional

## Future UI Enhancements

### Planned Features

1. **Split Pane View**: Code and chat side-by-side
2. **File Tree Browser**: Visual file navigation
3. **Syntax Highlighting**: More language support
4. **Custom Layouts**: User-defined UI arrangements
5. **Plugin System**: Third-party UI components

### Experimental Features

1. **Voice Input**: Speech-to-text integration
2. **Touch Gestures**: Terminal app support
3. **3D Visualizations**: Data representation
4. **AR/VR Support**: Spatial computing

## Conclusion

The Jupiter CLI UI system provides a rich, modern interface while respecting terminal conventions. Its modular architecture allows for easy customization and extension while maintaining consistency across all components.

For developers looking to extend the UI, focus on:
- Following existing patterns
- Maintaining theme consistency
- Ensuring accessibility
- Providing clear user feedback
- Testing across different terminals

The UI is designed to be both powerful for advanced users and approachable for beginners, with progressive disclosure of features and consistent visual language throughout.
# Jupiter CLI Theme System Documentation

## Overview

The Jupiter CLI theme system provides a customizable visual experience with four pre-built themes and support for custom themes. All themes use fixed hex colors to ensure consistency across different platforms and terminals.

## Theme Architecture

### Core Components

1. **JupiterColors.ts** - Central color definitions
2. **theme-system.ts** - Theme management and switching logic
3. **theme-detector.ts** - Automatic theme detection based on terminal
4. **ThemeDialog.tsx** - Interactive theme selector UI
5. **export-terminal-theme.ts** - Terminal profile export functionality

## Built-in Themes

### 1. Jupiter Dark (Default)

The flagship theme designed for extended coding sessions with high contrast and vibrant colors.

```typescript
{
  name: 'jupiter-dark',
  displayName: 'Jupiter Dark',
  colors: {
    primary: '#1ABC9C',      // Bright teal - main brand color
    secondary: '#3498DB',    // Vivid blue - secondary actions
    accent: '#9B59B6',       // Purple - special highlights
    success: '#2ECC71',      // Green - success states
    warning: '#F1C40F',      // Bright gold - warnings
    error: '#E74C3C',        // Bright coral red - errors
    info: '#3498DB',         // Blue - information
    
    // Text colors
    text: '#ECF0F1',         // Off-white - main text
    textDim: '#95A5A6',      // Gray - secondary text
    textBright: '#FFFFFF',   // Pure white - emphasis
    
    // Background colors
    background: '#0C0C0C',   // Near black - main background
    backgroundAlt: '#1A1A1A', // Slightly lighter - panels
    border: '#2C3E50',       // Dark blue-gray - borders
    
    // Syntax highlighting
    code: {
      keyword: '#E74C3C',    // Red - keywords
      string: '#2ECC71',     // Green - strings
      number: '#F39C12',     // Orange - numbers
      comment: '#7F8C8D',    // Gray - comments
      function: '#3498DB',   // Blue - functions
      variable: '#9B59B6'    // Purple - variables
    }
  }
}
```

### 2. Jupiter Light

A clean, bright theme for well-lit environments with softer colors.

```typescript
{
  name: 'jupiter-light',
  displayName: 'Jupiter Light',
  colors: {
    primary: '#16A085',      // Dark teal
    secondary: '#2980B9',    // Dark blue
    accent: '#8E44AD',       // Dark purple
    success: '#27AE60',      // Dark green
    warning: '#D68910',      // Dark gold
    error: '#C0392B',        // Dark red
    info: '#2980B9',         // Dark blue
    
    text: '#2C3E50',         // Dark gray - main text
    textDim: '#7F8C8D',      // Medium gray - secondary
    textBright: '#000000',   // Black - emphasis
    
    background: '#FFFFFF',   // White - main background
    backgroundAlt: '#F8F9FA', // Light gray - panels
    border: '#E0E0E0',       // Light gray - borders
    
    code: {
      keyword: '#C0392B',    // Dark red
      string: '#27AE60',     // Dark green
      number: '#D68910',     // Dark orange
      comment: '#95A5A6',    // Light gray
      function: '#2980B9',   // Dark blue
      variable: '#8E44AD'    // Dark purple
    }
  }
}
```

### 3. Neo Matrix

Inspired by the Matrix movies with monochromatic green aesthetic.

```typescript
{
  name: 'neo-matrix',
  displayName: 'Neo Matrix',
  colors: {
    primary: '#00FF00',      // Bright matrix green
    secondary: '#00CC00',    // Darker green
    accent: '#00FF88',       // Green-cyan
    success: '#00FF00',      // Bright green
    warning: '#FFFF00',      // Yellow
    error: '#FF0000',        // Red
    info: '#00FFFF',         // Cyan
    
    text: '#00FF00',         // Green text
    textDim: '#008800',      // Dark green
    textBright: '#88FF88',   // Light green
    
    background: '#000000',   // Pure black
    backgroundAlt: '#001100', // Very dark green
    border: '#003300',       // Dark green border
    
    code: {
      keyword: '#88FF88',    // Light green
      string: '#00FF00',     // Bright green
      number: '#FFFF00',     // Yellow
      comment: '#006600',    // Dark green
      function: '#00FFFF',   // Cyan
      variable: '#00FF88'    // Green-cyan
    }
  }
}
```

### 4. Classic Terminal

Traditional terminal colors with green-on-black aesthetic.

```typescript
{
  name: 'classic-terminal',
  displayName: 'Classic Terminal',
  colors: {
    primary: '#00FF00',      // Terminal green
    secondary: '#FFFFFF',    // White
    accent: '#FFFF00',       // Yellow
    success: '#00FF00',      // Green
    warning: '#FFFF00',      // Yellow
    error: '#FF0000',        // Red
    info: '#00FFFF',         // Cyan
    
    text: '#00FF00',         // Green text
    textDim: '#888888',      // Gray
    textBright: '#FFFFFF',   // White
    
    background: '#000000',   // Black
    backgroundAlt: '#111111', // Dark gray
    border: '#333333',       // Gray border
    
    code: {
      keyword: '#FFFFFF',    // White
      string: '#00FF00',     // Green
      number: '#FFFF00',     // Yellow
      comment: '#666666',    // Dark gray
      function: '#00FFFF',   // Cyan
      variable: '#FF00FF'    // Magenta
    }
  }
}
```

## Theme Components Usage

### 1. Text Styling

```typescript
import { useTheme } from './theme-system';

const MyComponent = () => {
  const theme = useTheme();
  
  return (
    <Text color={theme.colors.primary}>Primary Text</Text>
    <Text color={theme.colors.textDim}>Secondary Text</Text>
    <Text color={theme.colors.error}>Error Message</Text>
  );
};
```

### 2. Box/Container Styling

```typescript
<Box 
  borderStyle="round"
  borderColor={theme.colors.border}
  backgroundColor={theme.colors.backgroundAlt}
  padding={1}
>
  <Text color={theme.colors.text}>Content</Text>
</Box>
```

### 3. Syntax Highlighting

```typescript
const highlightCode = (code: string, language: string) => {
  const theme = useTheme();
  
  return highlight(code, {
    keyword: theme.colors.code.keyword,
    string: theme.colors.code.string,
    number: theme.colors.code.number,
    comment: theme.colors.code.comment,
    function: theme.colors.code.function,
    variable: theme.colors.code.variable
  });
};
```

## Theme Selection UI

The theme selector provides:

1. **Live Preview** - See colors before applying
2. **Keyboard Navigation** - Arrow keys to navigate
3. **Instant Apply** - No confirmation needed
4. **Persistent Selection** - Saved to user config

```
┌─────────────────────────────────────────────────┐
│             Select Theme                         │
├─────────────────────────────────────────────────┤
│                                                  │
│ ▶ Jupiter Dark (Default)                        │
│   ████ ████ ████ ████                          │
│                                                  │
│   Jupiter Light                                  │
│   ████ ████ ████ ████                          │
│                                                  │
│   Neo Matrix                                     │
│   ████ ████ ████ ████                          │
│                                                  │
│   Classic Terminal                               │
│   ████ ████ ████ ████                          │
│                                                  │
│ [↑↓ Navigate] [Enter Select] [Esc Cancel]       │
└─────────────────────────────────────────────────┘
```

## Custom Theme Creation

### Theme Interface

```typescript
interface JupiterTheme {
  name: string;
  displayName: string;
  colors: {
    // Primary colors
    primary: string;
    secondary: string;
    accent: string;
    
    // Status colors
    success: string;
    warning: string;
    error: string;
    info: string;
    
    // Text colors
    text: string;
    textDim: string;
    textBright: string;
    
    // Background colors
    background: string;
    backgroundAlt: string;
    border: string;
    
    // Code highlighting
    code: {
      keyword: string;
      string: string;
      number: string;
      comment: string;
      function: string;
      variable: string;
    };
  };
}
```

### Creating a Custom Theme

```typescript
// custom-theme.ts
export const myCustomTheme: JupiterTheme = {
  name: 'my-custom',
  displayName: 'My Custom Theme',
  colors: {
    primary: '#FF6B6B',
    secondary: '#4ECDC4',
    accent: '#45B7D1',
    success: '#51CF66',
    warning: '#FFD93D',
    error: '#FF6B6B',
    info: '#339AF0',
    
    text: '#FFFFFF',
    textDim: '#ADB5BD',
    textBright: '#FFFFFF',
    
    background: '#1C1C1C',
    backgroundAlt: '#2C2C2C',
    border: '#3C3C3C',
    
    code: {
      keyword: '#FF6B6B',
      string: '#51CF66',
      number: '#FFD93D',
      comment: '#6C757D',
      function: '#339AF0',
      variable: '#45B7D1'
    }
  }
};
```

### Registering Custom Theme

```typescript
import { registerTheme } from './theme-system';
import { myCustomTheme } from './custom-theme';

// Register the theme
registerTheme(myCustomTheme);

// Theme will now appear in theme selector
```

## Theme Context and Hooks

### useTheme Hook

```typescript
import { useTheme } from './hooks/useTheme';

const Component = () => {
  const { theme, setTheme } = useTheme();
  
  return (
    <Text color={theme.colors.primary}>
      Current theme: {theme.displayName}
    </Text>
  );
};
```

### ThemeProvider

```typescript
import { ThemeProvider } from './contexts/ThemeContext';

const App = () => (
  <ThemeProvider initialTheme="jupiter-dark">
    <YourApp />
  </ThemeProvider>
);
```

## Platform-Specific Considerations

### Terminal Capabilities

The theme system automatically adjusts based on terminal capabilities:

```typescript
const getTerminalCapabilities = () => {
  return {
    colorDepth: process.stdout.getColorDepth(),
    has256Colors: process.stdout.getColorDepth() >= 8,
    hasTrueColor: process.stdout.getColorDepth() >= 24,
    isWindows: process.platform === 'win32',
    isMac: process.platform === 'darwin',
    isLinux: process.platform === 'linux'
  };
};
```

### Color Fallbacks

For terminals with limited color support:

```typescript
const getFallbackColor = (hexColor: string, colorDepth: number) => {
  if (colorDepth >= 24) return hexColor; // True color
  if (colorDepth >= 8) return nearest256(hexColor); // 256 colors
  if (colorDepth >= 4) return nearest16(hexColor); // 16 colors
  return nearestBasic(hexColor); // Basic 8 colors
};
```

## Theme Persistence

Themes are saved to user configuration:

```json
{
  "theme": "jupiter-dark",
  "customThemes": [
    {
      "name": "my-custom",
      "colors": { ... }
    }
  ]
}
```

### Loading Theme on Startup

```typescript
const loadTheme = async () => {
  const config = await loadConfig();
  const savedTheme = config.theme || 'jupiter-dark';
  
  // Check if theme exists
  if (themeExists(savedTheme)) {
    setTheme(savedTheme);
  } else {
    // Fallback to default
    setTheme('jupiter-dark');
  }
};
```

## Terminal Profile Export

Jupiter CLI can export theme settings for popular terminals:

### iTerm2 Export

```typescript
const exportToITerm = (theme: JupiterTheme) => {
  return {
    "Ansi 0 Color": hexToITermColor(theme.colors.background),
    "Ansi 1 Color": hexToITermColor(theme.colors.error),
    "Ansi 2 Color": hexToITermColor(theme.colors.success),
    "Ansi 3 Color": hexToITermColor(theme.colors.warning),
    "Ansi 4 Color": hexToITermColor(theme.colors.secondary),
    "Ansi 5 Color": hexToITermColor(theme.colors.accent),
    "Ansi 6 Color": hexToITermColor(theme.colors.info),
    "Ansi 7 Color": hexToITermColor(theme.colors.text),
    // ... more colors
  };
};
```

### VS Code Terminal Export

```typescript
const exportToVSCode = (theme: JupiterTheme) => {
  return {
    "terminal.background": theme.colors.background,
    "terminal.foreground": theme.colors.text,
    "terminalCursor.background": theme.colors.background,
    "terminalCursor.foreground": theme.colors.primary,
    // ... more settings
  };
};
```

## Accessibility Features

### High Contrast Mode

Automatically enhances contrast for accessibility:

```typescript
const enhanceContrast = (theme: JupiterTheme): JupiterTheme => {
  return {
    ...theme,
    colors: {
      ...theme.colors,
      text: ensureContrast(theme.colors.text, theme.colors.background, 7.0),
      textDim: ensureContrast(theme.colors.textDim, theme.colors.background, 4.5),
      // ... enhance all colors
    }
  };
};
```

### Color Blindness Support

Themes are tested for various types of color blindness:

- Protanopia (red-blind)
- Deuteranopia (green-blind)
- Tritanopia (blue-blind)

## Theme Testing

### Visual Test Suite

```typescript
const testTheme = (theme: JupiterTheme) => {
  console.log(chalk.hex(theme.colors.primary)('Primary Color'));
  console.log(chalk.hex(theme.colors.secondary)('Secondary Color'));
  console.log(chalk.hex(theme.colors.success)('✓ Success Message'));
  console.log(chalk.hex(theme.colors.warning)('⚠ Warning Message'));
  console.log(chalk.hex(theme.colors.error)('✗ Error Message'));
  
  // Test code highlighting
  const code = `
    function ${chalk.hex(theme.colors.code.function)('hello')}() {
      const ${chalk.hex(theme.colors.code.variable)('message')} = ${chalk.hex(theme.colors.code.string)('"Hello World"')};
      return ${chalk.hex(theme.colors.code.variable)('message')};
    }
  `;
  console.log(code);
};
```

## Performance Optimization

### Theme Caching

Themes are cached to avoid recomputation:

```typescript
const themeCache = new Map<string, ProcessedTheme>();

const getProcessedTheme = (themeName: string) => {
  if (themeCache.has(themeName)) {
    return themeCache.get(themeName);
  }
  
  const processed = processTheme(themes[themeName]);
  themeCache.set(themeName, processed);
  return processed;
};
```

### Lazy Loading

Custom themes are loaded on demand:

```typescript
const loadCustomTheme = async (themeName: string) => {
  const themePath = path.join(customThemesDir, `${themeName}.json`);
  const themeData = await fs.readFile(themePath, 'utf8');
  return JSON.parse(themeData) as JupiterTheme;
};
```

## Future Enhancements

1. **Theme Marketplace** - Share and download community themes
2. **Dynamic Themes** - Time-based theme switching
3. **AI-Generated Themes** - Create themes based on preferences
4. **Theme Inheritance** - Extend existing themes
5. **Live Theme Editor** - Real-time theme customization

## Best Practices

1. **Contrast Ratios** - Ensure WCAG AA compliance (4.5:1 minimum)
2. **Color Consistency** - Use semantic color names
3. **Platform Testing** - Test on Windows, macOS, and Linux
4. **Terminal Testing** - Test on various terminal emulators
5. **Performance** - Cache processed themes
6. **Accessibility** - Provide high contrast options

## Conclusion

The Jupiter CLI theme system provides a flexible, accessible, and beautiful visual experience. With fixed hex colors ensuring consistency across platforms and comprehensive customization options, users can create the perfect coding environment for their needs.
/**
 * Output Mode System
 * Allows different output formats for the agent
 */

export interface OutputMode {
  name: string;
  displayName: string;
  modeSpecificPrompt: string;
  formatter?: (content: string) => string;
}

export class OutputModeManager {
  private modes: Map<string, OutputMode> = new Map();
  private currentMode: OutputMode | null = null;

  constructor() {
    this.registerDefaultModes();
  }

  private registerDefaultModes() {
    // Standard mode - default behavior
    this.registerMode({
      name: 'standard',
      displayName: 'Standard',
      modeSpecificPrompt: ''
    });

    // Concise mode - minimal output
    this.registerMode({
      name: 'concise',
      displayName: 'Concise',
      modeSpecificPrompt: `You must be extremely concise. Use minimal words. Prefer single-word or short phrase responses.
Examples:
- Question: "What's 2+2?" Answer: "4"
- Question: "Is this code correct?" Answer: "Yes" or "No, line 5"
- Question: "What file?" Answer: "config.js"`,
      formatter: (content) => content.split('\n')[0].substring(0, 100)
    });

    // Detailed mode - comprehensive explanations
    this.registerMode({
      name: 'detailed',
      displayName: 'Detailed',
      modeSpecificPrompt: `Provide comprehensive, detailed responses. Include:
- Full explanations of concepts
- Step-by-step breakdowns
- Examples and edge cases
- Alternative approaches
- Best practices and recommendations`
    });

    // Code-only mode - only code output
    this.registerMode({
      name: 'code-only',
      displayName: 'Code Only',
      modeSpecificPrompt: `Output ONLY code. No explanations, no comments unless in code.
If asked a question that requires non-code response, respond with a code comment.
Example: User asks "What's this do?" You respond: // This function handles user authentication`,
      formatter: (content) => {
        // Extract only code blocks
        const codeMatch = content.match(/```[\s\S]*?```/g);
        return codeMatch ? codeMatch.join('\n') : `\`\`\`\n${content}\n\`\`\``;
      }
    });

    // JSON mode - structured output
    this.registerMode({
      name: 'json',
      displayName: 'JSON',
      modeSpecificPrompt: `All responses must be valid JSON. Structure your response as:
{
  "response": "your answer here",
  "type": "answer|code|error|info",
  "data": {} // optional additional data
}`,
      formatter: (content) => {
        try {
          JSON.parse(content);
          return content;
        } catch {
          return JSON.stringify({ response: content, type: 'answer' }, null, 2);
        }
      }
    });
  }

  registerMode(mode: OutputMode) {
    this.modes.set(mode.name, mode);
  }

  setMode(modeName: string): boolean {
    const mode = this.modes.get(modeName);
    if (mode) {
      this.currentMode = mode;
      return true;
    }
    return false;
  }

  getCurrentMode(): OutputMode | null {
    return this.currentMode;
  }

  getAvailableModes(): string[] {
    return Array.from(this.modes.keys());
  }

  formatOutput(content: string): string {
    if (this.currentMode?.formatter) {
      return this.currentMode.formatter(content);
    }
    return content;
  }

  getModePrompt(): string {
    return this.currentMode?.modeSpecificPrompt || '';
  }
}
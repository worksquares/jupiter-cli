import { Tool, ToolResult } from '../types';

export interface ToolCall {
  tool: string;
  parameters: Record<string, any>;
}

export class Tools {
  private _tools: Map<string, Tool> = new Map();
  
  get tools(): Map<string, Tool> {
    return this._tools;
  }
  
  registerTool(tool: Tool): void {
    this._tools.set(tool.name, tool);
  }
  
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this._tools.get(toolCall.tool);
    
    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolCall.tool}' not found`,
        output: ''
      };
    }
    
    try {
      // Validate parameters
      const validationResult = this.validateParameters(tool, toolCall.parameters);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Invalid parameters: ${validationResult.error}`,
          output: ''
        };
      }
      
      // Execute tool
      const result = await tool.execute(toolCall.parameters);
      
      return {
        success: true,
        output: result,
        metadata: {
          tool: tool.name,
          executedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        output: ''
      };
    }
  }
  
  async executeMultiple(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    // Execute tools in parallel for better performance
    return Promise.all(toolCalls.map(call => this.execute(call)));
  }
  
  private validateParameters(
    tool: Tool, 
    parameters: Record<string, any>
  ): { valid: boolean; error?: string } {
    // Check required parameters
    for (const param of tool.parameters) {
      if (param.required && !(param.name in parameters)) {
        return {
          valid: false,
          error: `Missing required parameter: ${param.name}`
        };
      }
      
      // Type validation
      if (param.name in parameters) {
        const value = parameters[param.name];
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        
        if (param.type !== actualType && value !== null && value !== undefined) {
          return {
            valid: false,
            error: `Parameter '${param.name}' must be of type ${param.type}, got ${actualType}`
          };
        }
      }
    }
    
    return { valid: true };
  }
  
  getAvailableTools(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  getToolByName(name: string): Tool | undefined {
    return this.tools.get(name);
  }
}
/**
 * MCP Tool Adapter
 * Integrates MCP server tools with the Jupiter tool system
 */

import { BaseToolAdapter } from '../base-adapter';
import { MCPManager } from '../../mcp/mcp-manager';
import { MCPTool, MCPToolExecutionRequest } from '../../mcp/types';
import { z } from 'zod';
import { Logger } from '../../utils/logger';

/**
 * MCP tool adapter for individual tools
 */
export class MCPToolAdapter extends BaseToolAdapter<any, any> {
  protected logger: Logger;
  private mcpTool: MCPTool;
  private mcpManager: MCPManager;
  
  name: string;
  description: string;
  parameters: any;

  constructor(mcpTool: MCPTool, mcpManager: MCPManager) {
    super();
    this.mcpTool = mcpTool;
    this.mcpManager = mcpManager;
    this.logger = new Logger(`MCPToolAdapter:${mcpTool.serverName}:${mcpTool.name}`);

    // Set adapter properties
    this.name = `mcp_${mcpTool.serverName}_${mcpTool.name}`;
    this.description = `${mcpTool.description} (via MCP server: ${mcpTool.serverName})`;
    
    // Convert schema to parameters if available
    if (mcpTool.inputSchema) {
      this.parameters = this.zodSchemaToParameters(mcpTool.inputSchema);
    } else {
      this.parameters = {
        params: {
          type: 'object' as const,
          description: 'Tool parameters',
          required: true
        }
      };
    }
  }

  /**
   * Execute the MCP tool
   */
  async execute(params: any): Promise<any> {
    try {
      const request: MCPToolExecutionRequest = {
        serverName: this.mcpTool.serverName,
        toolName: this.mcpTool.name,
        parameters: params
      };

      const result = await this.mcpManager.executeTool(request);

      if (!result.success) {
        this.error(result.error || 'Tool execution failed', 'MCP_TOOL_ERROR');
      }

      return this.success(result.result);
    } catch (error) {
      this.logger.error('Tool execution failed', error);
      this.error(
        `MCP tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'MCP_TOOL_ERROR'
      );
    }
  }

  /**
   * Validate parameters
   */
  validate(params: any): boolean {
    if (this.mcpTool.inputSchema) {
      try {
        this.mcpTool.inputSchema.parse(params);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Convert Zod schema to tool parameters
   */
  private zodSchemaToParameters(schema: z.ZodSchema<any>): Record<string, any> {
    // This is a simplified conversion - in production you'd want more comprehensive mapping
    const params: Record<string, any> = {};

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      for (const [key, value] of Object.entries(shape)) {
        params[key] = {
          type: this.getZodType(value as z.ZodSchema<any>),
          description: (value as any).description || `Parameter ${key}`,
          required: !(value as any).isOptional()
        };
      }
    } else {
      // For non-object schemas, wrap in a single parameter
      params.value = {
        type: this.getZodType(schema),
        description: 'Tool input',
        required: true
      };
    }

    return params;
  }

  /**
   * Get parameter type from Zod schema
   */
  private getZodType(schema: z.ZodSchema<any>): string {
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 'number';
    if (schema instanceof z.ZodBoolean) return 'boolean';
    if (schema instanceof z.ZodArray) return 'array';
    if (schema instanceof z.ZodObject) return 'object';
    return 'any';
  }

  /**
   * Get tool metadata
   */
  getMetadata(): {
    serverName: string;
    originalName: string;
    category?: string;
    examples?: any[];
  } {
    return {
      serverName: this.mcpTool.serverName,
      originalName: this.mcpTool.name,
      category: this.mcpTool.category,
      examples: this.mcpTool.examples
    };
  }
}

/**
 * MCP tool registry that manages all MCP tools
 */
export class MCPToolRegistry {
  private mcpManager: MCPManager;
  private adapters: Map<string, MCPToolAdapter> = new Map();
  private logger: Logger;

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
    this.logger = new Logger('MCPToolRegistry');

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Setup MCP manager event handlers
   */
  private setupEventHandlers(): void {
    this.mcpManager.on('server:tools-updated', (serverName, tools) => {
      this.updateServerTools(serverName, tools);
    });

    this.mcpManager.on('server:disconnected', (serverName) => {
      this.removeServerTools(serverName);
    });
  }

  /**
   * Update tools for a server
   */
  private updateServerTools(serverName: string, tools: MCPTool[]): void {
    // Remove existing tools for this server
    this.removeServerTools(serverName);

    // Add new tools
    for (const tool of tools) {
      const adapter = new MCPToolAdapter(tool, this.mcpManager);
      this.adapters.set(adapter.name, adapter);
      this.logger.info(`Registered MCP tool: ${adapter.name}`);
    }
  }

  /**
   * Remove all tools for a server
   */
  private removeServerTools(serverName: string): void {
    const toRemove: string[] = [];
    
    for (const [name, adapter] of this.adapters) {
      if (adapter.getMetadata().serverName === serverName) {
        toRemove.push(name);
      }
    }

    for (const name of toRemove) {
      this.adapters.delete(name);
      this.logger.info(`Removed MCP tool: ${name}`);
    }
  }

  /**
   * Get all MCP tool adapters
   */
  getAllAdapters(): MCPToolAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapter by name
   */
  getAdapter(name: string): MCPToolAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get adapters for a specific server
   */
  getServerAdapters(serverName: string): MCPToolAdapter[] {
    return this.getAllAdapters().filter(
      adapter => adapter.getMetadata().serverName === serverName
    );
  }

  /**
   * Refresh all tools
   */
  async refreshTools(): Promise<void> {
    // Clear all adapters
    this.adapters.clear();

    // Get all tools from MCP manager
    const allTools = this.mcpManager.getAllTools();
    
    // Create adapters for each tool
    for (const tool of allTools) {
      const adapter = new MCPToolAdapter(tool, this.mcpManager);
      this.adapters.set(adapter.name, adapter);
    }

    this.logger.info(`Refreshed ${this.adapters.size} MCP tools`);
  }

  /**
   * Get tool count by server
   */
  getToolCountByServer(): Map<string, number> {
    const counts = new Map<string, number>();
    
    for (const adapter of this.adapters.values()) {
      const serverName = adapter.getMetadata().serverName;
      counts.set(serverName, (counts.get(serverName) || 0) + 1);
    }

    return counts;
  }
}
/**
 * MCP (Model Context Protocol) Server Support
 * Handles MCP server instructions and integration
 */

export interface MCPServer {
  name: string;
  type: 'connected' | 'disconnected';
  instructions?: string;
  tools?: string[];
  resources?: string[];
}

export class MCPServerManager {
  private servers: Map<string, MCPServer> = new Map();

  /**
   * Register an MCP server
   */
  registerServer(server: MCPServer) {
    this.servers.set(server.name, server);
  }

  /**
   * Get all connected servers with instructions
   */
  getConnectedServersWithInstructions(): MCPServer[] {
    return Array.from(this.servers.values())
      .filter(server => server.type === 'connected' && server.instructions);
  }

  /**
   * Format MCP server instructions for prompt
   */
  formatInstructionsForPrompt(servers: MCPServer[]): string {
    const connectedWithInstructions = servers.filter(
      s => s.type === 'connected' && s.instructions
    );

    if (connectedWithInstructions.length === 0) {
      return '';
    }

    return `
# MCP Server Instructions

The following MCP servers have provided instructions for how to use their tools and resources:

${connectedWithInstructions.map(server => {
  return `## ${server.name}
${server.instructions}`;
}).join('\n\n')}
`;
  }

  /**
   * Get all available tools from MCP servers
   */
  getAvailableTools(): string[] {
    const tools: string[] = [];
    
    for (const server of this.servers.values()) {
      if (server.type === 'connected' && server.tools) {
        tools.push(...server.tools);
      }
    }

    return tools;
  }

  /**
   * Get all available resources from MCP servers
   */
  getAvailableResources(): string[] {
    const resources: string[] = [];
    
    for (const server of this.servers.values()) {
      if (server.type === 'connected' && server.resources) {
        resources.push(...server.resources);
      }
    }

    return resources;
  }

  /**
   * Update server status
   */
  updateServerStatus(serverName: string, type: 'connected' | 'disconnected') {
    const server = this.servers.get(serverName);
    if (server) {
      server.type = type;
    }
  }

  /**
   * Get server by name
   */
  getServer(name: string): MCPServer | undefined {
    return this.servers.get(name);
  }

  /**
   * Get all servers
   */
  getAllServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }
}
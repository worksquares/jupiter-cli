/**
 * MCP Manager
 * Manages multiple MCP server connections and provides unified access
 */

import { EventEmitter } from 'eventemitter3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';
import {
  MCPClient,
  MCPServerConfig,
  MCPManagerConfig,
  MCPEvents,
  MCPTool,
  MCPConnectionResult,
  MCPTransport,
  MCPClientState,
  MCPToolExecutionRequest,
  MCPToolExecutionResult,
  MCPServersConfigSchema,
  MCPServerInfo
} from './types';
import { STDIOMCPClient } from './clients/stdio-client';
import { HTTPMCPClient } from './clients/http-client';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<MCPManagerConfig> = {
  serversFile: path.join(process.cwd(), '.jupiter', 'mcp-servers.json'),
  autoConnect: true,
  connectionTimeout: 30000,
  maxReconnectAttempts: 3,
  reconnectDelay: 5000
};

/**
 * MCP Manager implementation
 */
export class MCPManager extends EventEmitter<MCPEvents> {
  private config: Required<MCPManagerConfig>;
  private clients: Map<string, MCPClient> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private logger: Logger;
  private reconnectAttempts: Map<string, number> = new Map();
  private connectionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config?: MCPManagerConfig) {
    super();
    this.logger = new Logger('MCPManager');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize MCP manager
   */
  async initialize(): Promise<void> {
    // Load server configurations
    const servers = await this.loadServerConfigs();
    
    if (servers.length === 0) {
      this.logger.info('No MCP servers configured');
      return;
    }

    // Create clients
    for (const serverConfig of servers) {
      try {
        await this.addServer(serverConfig);
      } catch (error) {
        this.logger.error(`Failed to add server ${serverConfig.name}`, error);
      }
    }

    // Auto-connect if enabled
    if (this.config.autoConnect) {
      await this.connectAll();
    }
  }

  /**
   * Add a new MCP server
   */
  async addServer(config: MCPServerConfig): Promise<MCPClient> {
    // Validate config
    MCPServersConfigSchema.shape.servers.element.parse(config);

    // Check if already exists
    if (this.clients.has(config.name)) {
      throw new Error(`Server '${config.name}' already exists`);
    }

    // Create appropriate client
    const client = this.createClient(config);

    // Setup client events
    this.setupClientEvents(client);

    // Store client
    this.clients.set(config.name, client);
    
    this.logger.info(`Added MCP server: ${config.name}`);
    return client;
  }

  /**
   * Remove an MCP server
   */
  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`Server '${name}' not found`);
    }

    // Disconnect if connected
    if (client.state === MCPClientState.Connected) {
      await client.disconnect();
    }

    // Remove tools
    if (client.tools) {
      for (const tool of client.tools) {
        this.tools.delete(`${name}:${tool.name}`);
      }
    }

    // Clear timers
    const timer = this.connectionTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.connectionTimers.delete(name);
    }

    // Remove client
    this.clients.delete(name);
    this.reconnectAttempts.delete(name);
    
    this.logger.info(`Removed MCP server: ${name}`);
  }

  /**
   * Connect to a specific server
   */
  async connectServer(name: string): Promise<MCPConnectionResult> {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`Server '${name}' not found`);
    }

    try {
      // Set connection timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.connectionTimeout);
        
        this.connectionTimers.set(name, timer);
      });

      // Connect with timeout
      await Promise.race([client.connect(), timeoutPromise]);

      // Clear timeout
      const timer = this.connectionTimers.get(name);
      if (timer) {
        clearTimeout(timer);
        this.connectionTimers.delete(name);
      }

      // Reset reconnect attempts
      this.reconnectAttempts.delete(name);

      return {
        client,
        type: client.state
      };
    } catch (error) {
      // Clear timeout
      const timer = this.connectionTimers.get(name);
      if (timer) {
        clearTimeout(timer);
        this.connectionTimers.delete(name);
      }

      return {
        client,
        type: client.state,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`Server '${name}' not found`);
    }

    await client.disconnect();
  }

  /**
   * Reconnect to a specific server
   */
  async reconnectServer(name: string): Promise<MCPConnectionResult> {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`Server '${name}' not found`);
    }

    // Check reconnect attempts
    const attempts = this.reconnectAttempts.get(name) || 0;
    if (attempts >= this.config.maxReconnectAttempts) {
      return {
        client,
        type: MCPClientState.Failed,
        error: 'Maximum reconnection attempts exceeded'
      };
    }

    this.reconnectAttempts.set(name, attempts + 1);
    
    try {
      await client.reconnect();
      this.reconnectAttempts.delete(name);
      
      return {
        client,
        type: client.state
      };
    } catch (error) {
      // Schedule another reconnect if not at max attempts
      if (attempts + 1 < this.config.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnectServer(name).catch(err => {
            this.logger.error(`Auto-reconnect failed for ${name}`, err);
          });
        }, this.config.reconnectDelay);
      }

      return {
        client,
        type: client.state,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Connect to all servers
   */
  async connectAll(): Promise<Map<string, MCPConnectionResult>> {
    const results = new Map<string, MCPConnectionResult>();
    
    const promises = Array.from(this.clients.entries()).map(async ([name, _]) => {
      const result = await this.connectServer(name);
      results.set(name, result);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.clients.keys()).map(name => 
      this.disconnectServer(name).catch(error => {
        this.logger.error(`Failed to disconnect ${name}`, error);
      })
    );

    await Promise.all(promises);
  }

  /**
   * Get all servers
   */
  getServers(): MCPServerInfo[] {
    const servers: MCPServerInfo[] = [];
    
    for (const [name, client] of this.clients) {
      const httpClient = client as HTTPMCPClient;
      
      servers.push({
        name,
        client,
        transport: client.config.type,
        scope: client.config.scope,
        isAuthenticated: httpClient.isAuthenticated ? 
          httpClient.isAuthenticated().then(auth => auth).catch(() => false) as any : 
          undefined,
        config: client.config
      });
    }

    return servers;
  }

  /**
   * Get server by name
   */
  getServer(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  /**
   * Get all tools
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools for a specific server
   */
  getServerTools(serverName: string): MCPTool[] {
    const client = this.clients.get(serverName);
    return client?.tools || [];
  }

  /**
   * Execute a tool
   */
  async executeTool(request: MCPToolExecutionRequest): Promise<MCPToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const client = this.clients.get(request.serverName);
      if (!client) {
        throw new Error(`Server '${request.serverName}' not found`);
      }

      if (client.state !== MCPClientState.Connected) {
        throw new Error(`Server '${request.serverName}' is not connected`);
      }

      const result = await client.executeTool(request.toolName, request.parameters);

      const executionResult: MCPToolExecutionResult = {
        success: true,
        result,
        duration: Date.now() - startTime,
        serverName: request.serverName,
        toolName: request.toolName
      };

      this.emit('tool:executed', request.serverName, request.toolName, result);
      
      return executionResult;
    } catch (error) {
      const executionResult: MCPToolExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        serverName: request.serverName,
        toolName: request.toolName
      };

      this.emit('tool:error', request.serverName, request.toolName, error as Error);
      
      return executionResult;
    }
  }

  /**
   * Authenticate with a server
   */
  async authenticateServer(serverName: string, token?: string): Promise<boolean> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server '${serverName}' not found`);
    }

    const httpClient = client as HTTPMCPClient;
    if (!httpClient.authenticate) {
      throw new Error(`Server '${serverName}' does not support authentication`);
    }

    return httpClient.authenticate(token);
  }

  /**
   * Check if server is authenticated
   */
  async isServerAuthenticated(serverName: string): Promise<boolean> {
    const client = this.clients.get(serverName);
    if (!client) {
      return false;
    }

    const httpClient = client as HTTPMCPClient;
    if (!httpClient.isAuthenticated) {
      return true; // STDIO doesn't require auth
    }

    return httpClient.isAuthenticated();
  }

  /**
   * Save server configurations
   */
  async saveServerConfigs(): Promise<void> {
    const configs: MCPServerConfig[] = [];
    
    for (const client of this.clients.values()) {
      configs.push(client.config);
    }

    const data = {
      version: '1.0',
      servers: configs,
      globalSettings: {
        autoConnect: this.config.autoConnect,
        connectionTimeout: this.config.connectionTimeout,
        maxReconnectAttempts: this.config.maxReconnectAttempts
      }
    };

    // Ensure directory exists
    const dir = path.dirname(this.config.serversFile);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(this.config.serversFile, JSON.stringify(data, null, 2));
    
    this.logger.info(`Saved ${configs.length} server configurations`);
  }

  /**
   * Load server configurations
   */
  private async loadServerConfigs(): Promise<MCPServerConfig[]> {
    try {
      const data = await fs.readFile(this.config.serversFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Validate
      const validated = MCPServersConfigSchema.parse(parsed);
      
      // Apply global settings
      if (validated.globalSettings) {
        this.config = { ...this.config, ...validated.globalSettings };
      }

      return validated.servers;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        this.logger.info('No server configuration file found');
        return [];
      }
      
      this.logger.error('Failed to load server configurations', error);
      return [];
    }
  }

  /**
   * Create client based on transport type
   */
  private createClient(config: MCPServerConfig): MCPClient {
    switch (config.type) {
      case MCPTransport.STDIO:
        return new STDIOMCPClient(config);
      
      case MCPTransport.HTTP:
      case MCPTransport.SSE:
        return new HTTPMCPClient(config);
      
      default:
        throw new Error(`Unsupported transport type: ${config.type}`);
    }
  }

  /**
   * Setup client event handlers
   */
  private setupClientEvents(client: MCPClient): void {
    const clientEvents = client as unknown as EventEmitter<any>;
    
    clientEvents.on('connected', () => {
      this.emit('server:connected', client.name);
    });

    clientEvents.on('disconnected', (error?: Error) => {
      this.emit('server:disconnected', client.name, error);
      
      // Auto-reconnect if configured and not manually disconnected
      if (error && this.config.autoConnect) {
        setTimeout(() => {
          this.reconnectServer(client.name).catch(err => {
            this.logger.error(`Auto-reconnect failed for ${client.name}`, err);
          });
        }, this.config.reconnectDelay);
      }
    });

    clientEvents.on('auth-required', () => {
      this.emit('server:auth-required', client.name);
    });

    clientEvents.on('tools-updated', (tools: MCPTool[]) => {
      // Update tools map
      for (const tool of tools) {
        this.tools.set(`${client.name}:${tool.name}`, tool);
      }
      
      this.emit('server:tools-updated', client.name, tools);
    });

    clientEvents.on('error', (error: Error) => {
      this.emit('server:error', client.name, error);
    });
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    await this.disconnectAll();
    
    // Clear all timers
    for (const timer of this.connectionTimers.values()) {
      clearTimeout(timer);
    }
    this.connectionTimers.clear();
    
    this.clients.clear();
    this.tools.clear();
    this.reconnectAttempts.clear();
    this.removeAllListeners();
  }
}
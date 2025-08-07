/**
 * STDIO MCP Client
 * Manages MCP servers that communicate via standard input/output
 */

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../utils/logger';
import {
  MCPClient,
  MCPClientState,
  MCPServerConfig,
  MCPTool,
  MCPResource,
  MCPTransport
} from '../types';

/**
 * JSON-RPC message interface
 */
interface JSONRPCMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * STDIO client events
 */
interface STDIOClientEvents {
  'connected': () => void;
  'disconnected': (error?: Error) => void;
  'tools-updated': (tools: MCPTool[]) => void;
  'error': (error: Error) => void;
  'message': (message: JSONRPCMessage) => void;
}

/**
 * STDIO MCP client implementation
 */
export class STDIOMCPClient extends EventEmitter<STDIOClientEvents> implements MCPClient {
  name: string;
  config: MCPServerConfig;
  state: MCPClientState = MCPClientState.Disconnected;
  error?: string;
  lastConnected?: Date;
  tools?: MCPTool[];
  resources?: MCPResource[];

  private process?: ChildProcess;
  private logger: Logger;
  private messageBuffer: string = '';
  private pendingRequests: Map<string | number, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private requestCounter: number = 0;
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  constructor(config: MCPServerConfig) {
    super();
    
    if (config.type !== MCPTransport.STDIO) {
      throw new Error('Invalid transport type for STDIO client');
    }
    
    if (!config.command) {
      throw new Error('Command is required for STDIO transport');
    }

    this.name = config.name;
    this.config = config;
    this.logger = new Logger(`STDIOMCPClient:${config.name}`);
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.state === MCPClientState.Connected) {
      return;
    }

    try {
      this.state = MCPClientState.Pending;
      
      // Spawn the process
      this.process = spawn(this.config.command!, this.config.args || [], {
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Setup event handlers
      this.setupProcessHandlers();

      // Send initialize request
      await this.initialize();

      // Discover capabilities
      await this.discoverCapabilities();

      this.state = MCPClientState.Connected;
      this.lastConnected = new Date();
      this.error = undefined;
      
      this.emit('connected');
      this.logger.info('Connected to MCP server');
    } catch (error) {
      this.state = MCPClientState.Failed;
      this.error = error instanceof Error ? error.message : String(error);
      
      this.cleanup();
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.state === MCPClientState.Disconnected) {
      return;
    }

    try {
      // Send shutdown notification
      if (this.state === MCPClientState.Connected) {
        await this.sendNotification('shutdown');
      }
    } catch (error) {
      this.logger.warn('Error during shutdown', error);
    }

    this.cleanup();
    this.state = MCPClientState.Disconnected;
    this.emit('disconnected');
    this.logger.info('Disconnected from MCP server');
  }

  /**
   * Reconnect to the server
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, params: any): Promise<any> {
    if (this.state !== MCPClientState.Connected) {
      throw new Error('Client is not connected');
    }

    const tool = this.tools?.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    try {
      const result = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: params
      });

      return result;
    } catch (error) {
      this.logger.error(`Tool execution failed: ${toolName}`, error);
      throw error;
    }
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    // Handle stdout (messages from server)
    this.process.stdout?.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString();
      this.processMessageBuffer();
    });

    // Handle stderr (error output)
    this.process.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      this.logger.debug('Server stderr:', error);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.logger.info(`Process exited with code ${code}, signal ${signal}`);
      this.handleProcessExit(code, signal);
    });

    // Handle process errors
    this.process.on('error', (error) => {
      this.logger.error('Process error', error);
      this.handleProcessError(error);
    });
  }

  /**
   * Process buffered messages
   */
  private processMessageBuffer(): void {
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as JSONRPCMessage;
          this.handleMessage(message);
        } catch (error) {
          this.logger.warn('Failed to parse message:', line);
        }
      }
    }
  }

  /**
   * Handle incoming JSON-RPC message
   */
  private handleMessage(message: JSONRPCMessage): void {
    this.emit('message', message);

    // Handle responses to our requests
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }
    }

    // Handle notifications from server
    if (message.method && !message.id) {
      this.handleNotification(message.method, message.params);
    }
  }

  /**
   * Handle server notifications
   */
  private handleNotification(method: string, params: any): void {
    switch (method) {
      case 'tools/updated':
        this.handleToolsUpdated(params);
        break;
      
      case 'resources/updated':
        this.handleResourcesUpdated(params);
        break;
      
      default:
        this.logger.debug(`Unhandled notification: ${method}`, params);
    }
  }

  /**
   * Handle tools updated notification
   */
  private handleToolsUpdated(params: any): void {
    if (params.tools && Array.isArray(params.tools)) {
      this.tools = params.tools.map((tool: any) => ({
        ...tool,
        serverName: this.name
      }));
      this.emit('tools-updated', this.tools || []);
    }
  }

  /**
   * Handle resources updated notification
   */
  private handleResourcesUpdated(params: any): void {
    if (params.resources && Array.isArray(params.resources)) {
      this.resources = params.resources.map((resource: any) => ({
        ...resource,
        serverName: this.name
      }));
    }
  }

  /**
   * Send JSON-RPC request
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Process is not connected');
    }

    const id = ++this.requestCounter;
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      // Setup timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.REQUEST_TIMEOUT);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send message
      const messageStr = JSON.stringify(message) + '\n';
      this.process!.stdin!.write(messageStr, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  /**
   * Send JSON-RPC notification
   */
  private async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Process is not connected');
    }

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method,
      params
    };

    const messageStr = JSON.stringify(message) + '\n';
    
    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(messageStr, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Initialize connection
   */
  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '1.0',
      capabilities: {
        tools: true,
        resources: true
      },
      clientInfo: {
        name: 'Jupiter Agent',
        version: '1.0.0'
      }
    });

    if (result.protocolVersion !== '1.0') {
      throw new Error(`Unsupported protocol version: ${result.protocolVersion}`);
    }

    this.logger.debug('Initialized with server capabilities:', result.capabilities);
  }

  /**
   * Discover server capabilities
   */
  private async discoverCapabilities(): Promise<void> {
    // List tools
    try {
      const toolsResult = await this.sendRequest('tools/list');
      if (toolsResult.tools && Array.isArray(toolsResult.tools)) {
        this.tools = toolsResult.tools.map((tool: any) => ({
          ...tool,
          serverName: this.name
        }));
        this.emit('tools-updated', this.tools || []);
      }
    } catch (error) {
      this.logger.warn('Failed to list tools', error);
    }

    // List resources
    try {
      const resourcesResult = await this.sendRequest('resources/list');
      if (resourcesResult.resources && Array.isArray(resourcesResult.resources)) {
        this.resources = resourcesResult.resources.map((resource: any) => ({
          ...resource,
          serverName: this.name
        }));
      }
    } catch (error) {
      this.logger.warn('Failed to list resources', error);
    }
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(code: number | null, signal: string | null): void {
    const wasConnected = this.state === MCPClientState.Connected;
    
    this.cleanup();
    this.state = MCPClientState.Disconnected;

    if (wasConnected) {
      const error = new Error(`Process exited unexpectedly (code: ${code}, signal: ${signal})`);
      this.emit('disconnected', error);
      this.emit('error', error);
    }
  }

  /**
   * Handle process error
   */
  private handleProcessError(error: Error): void {
    this.error = error.message;
    this.state = MCPClientState.Failed;
    
    this.cleanup();
    this.emit('error', error);
    this.emit('disconnected', error);
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();

    // Kill process if running
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }

    // Clear buffers
    this.messageBuffer = '';
  }
}
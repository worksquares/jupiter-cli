/**
 * HTTP/SSE MCP Client
 * Manages MCP servers that communicate via HTTP or Server-Sent Events
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { EventEmitter } from 'eventemitter3';
import { Logger } from '../../utils/logger';
import {
  MCPClient,
  MCPClientState,
  MCPServerConfig,
  MCPTool,
  MCPResource,
  MCPTransport,
  MCPAuthToken
} from '../types';

/**
 * HTTP client events
 */
interface HTTPClientEvents {
  'connected': () => void;
  'disconnected': (error?: Error) => void;
  'auth-required': () => void;
  'tools-updated': (tools: MCPTool[]) => void;
  'error': (error: Error) => void;
}

/**
 * HTTP/SSE MCP client implementation
 */
export class HTTPMCPClient extends EventEmitter<HTTPClientEvents> implements MCPClient {
  name: string;
  config: MCPServerConfig;
  state: MCPClientState = MCPClientState.Disconnected;
  error?: string;
  lastConnected?: Date;
  tools?: MCPTool[];
  resources?: MCPResource[];

  private axiosInstance: AxiosInstance;
  private logger: Logger;
  private authToken?: MCPAuthToken;
  private eventSource?: EventSource;
  private reconnectTimer?: NodeJS.Timeout;
  private readonly RECONNECT_DELAY = 5000;

  constructor(config: MCPServerConfig) {
    super();
    
    if (config.type !== MCPTransport.HTTP && config.type !== MCPTransport.SSE) {
      throw new Error('Invalid transport type for HTTP client');
    }
    
    if (!config.url) {
      throw new Error('URL is required for HTTP/SSE transport');
    }

    this.name = config.name;
    this.config = config;
    this.logger = new Logger(`HTTPMCPClient:${config.name}`);

    // Create axios instance
    this.axiosInstance = axios.create({
      baseURL: config.url,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      }
    });

    // Setup request interceptor for authentication
    this.setupAuthInterceptor();
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

      // Check server health
      await this.checkHealth();

      // Initialize connection
      await this.initialize();

      // Setup SSE if applicable
      if (this.config.type === MCPTransport.SSE) {
        await this.setupSSE();
      }

      // Discover capabilities
      await this.discoverCapabilities();

      this.state = MCPClientState.Connected;
      this.lastConnected = new Date();
      this.error = undefined;
      
      this.emit('connected');
      this.logger.info('Connected to MCP server');
    } catch (error) {
      if (this.isAuthError(error)) {
        this.state = MCPClientState.NeedsAuth;
        this.emit('auth-required');
      } else {
        this.state = MCPClientState.Failed;
        this.error = error instanceof Error ? error.message : String(error);
      }
      
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

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Close SSE connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    // Send disconnect notification
    try {
      if (this.state === MCPClientState.Connected) {
        await this.axiosInstance.post('/disconnect');
      }
    } catch (error) {
      this.logger.warn('Error during disconnect', error);
    }

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
      const response = await this.axiosInstance.post('/tools/call', {
        name: toolName,
        arguments: params
      });

      return response.data.result;
    } catch (error) {
      this.logger.error(`Tool execution failed: ${toolName}`, error);
      
      if (this.isAuthError(error)) {
        this.state = MCPClientState.NeedsAuth;
        this.emit('auth-required');
      }
      
      throw error;
    }
  }

  /**
   * Authenticate with the server
   */
  async authenticate(token?: string): Promise<boolean> {
    try {
      if (!token && !this.authToken) {
        throw new Error('No authentication token provided');
      }

      const authToken = token || this.authToken?.token;
      
      // Test authentication
      const response = await this.axiosInstance.post('/auth/verify', {}, {
        headers: {
          'Authorization': `${this.config.authType === 'bearer' ? 'Bearer' : ''} ${authToken}`.trim()
        }
      });

      if (response.data.authenticated) {
        // Store token
        this.authToken = {
          serverName: this.name,
          token: authToken!,
          type: this.config.authType || 'bearer',
          expiresAt: response.data.expiresAt ? new Date(response.data.expiresAt) : undefined
        };

        // Update auth header
        this.axiosInstance.defaults.headers.common['Authorization'] = 
          `${this.config.authType === 'bearer' ? 'Bearer' : ''} ${authToken}`.trim();

        // Try to connect if not connected
        if (this.state === MCPClientState.NeedsAuth) {
          await this.connect();
        }

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Authentication failed', error);
      return false;
    }
  }

  /**
   * Check if authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    if (!this.authToken) {
      return false;
    }

    // Check if token is expired
    if (this.authToken.expiresAt && this.authToken.expiresAt < new Date()) {
      return false;
    }

    try {
      const response = await this.axiosInstance.get('/auth/status');
      return response.data.authenticated === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Setup authentication interceptor
   */
  private setupAuthInterceptor(): void {
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add auth token if available
        if (this.authToken && !config.headers['Authorization']) {
          config.headers['Authorization'] = 
            `${this.config.authType === 'bearer' ? 'Bearer' : ''} ${this.authToken.token}`.trim();
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (this.isAuthError(error) && this.state === MCPClientState.Connected) {
          this.state = MCPClientState.NeedsAuth;
          this.emit('auth-required');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check server health
   */
  private async checkHealth(): Promise<void> {
    const response = await this.axiosInstance.get('/health');
    
    if (response.data.status !== 'ok') {
      throw new Error(`Server health check failed: ${response.data.message || 'Unknown error'}`);
    }
  }

  /**
   * Initialize connection
   */
  private async initialize(): Promise<void> {
    const response = await this.axiosInstance.post('/initialize', {
      protocolVersion: '1.0',
      capabilities: {
        tools: true,
        resources: true,
        streaming: this.config.type === MCPTransport.SSE
      },
      clientInfo: {
        name: 'Jupiter Agent',
        version: '1.0.0'
      }
    });

    if (response.data.protocolVersion !== '1.0') {
      throw new Error(`Unsupported protocol version: ${response.data.protocolVersion}`);
    }

    this.logger.debug('Initialized with server capabilities:', response.data.capabilities);
  }

  /**
   * Setup Server-Sent Events
   */
  private async setupSSE(): Promise<void> {
    if (!this.config.url) {
      throw new Error('URL is required for SSE');
    }

    const sseUrl = new URL('/events', this.config.url).toString();
    
    // Add auth header if available
    const headers: Record<string, string> = { ...this.config.headers };
    if (this.authToken) {
      headers['Authorization'] = 
        `${this.config.authType === 'bearer' ? 'Bearer' : ''} ${this.authToken.token}`.trim();
    }

    // Create EventSource
    this.eventSource = new EventSource(sseUrl, {
      withCredentials: true
    });

    // Setup event handlers
    this.eventSource.onopen = () => {
      this.logger.debug('SSE connection opened');
    };

    this.eventSource.onerror = (error) => {
      this.logger.error('SSE error', error);
      this.handleSSEError();
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleSSEMessage(data);
      } catch (error) {
        this.logger.warn('Failed to parse SSE message', error);
      }
    };

    // Setup custom event listeners
    this.eventSource.addEventListener('tools-updated', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        this.handleToolsUpdated(data);
      } catch (error) {
        this.logger.warn('Failed to parse tools-updated event', error);
      }
    });

    this.eventSource.addEventListener('resources-updated', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        this.handleResourcesUpdated(data);
      } catch (error) {
        this.logger.warn('Failed to parse resources-updated event', error);
      }
    });
  }

  /**
   * Handle SSE message
   */
  private handleSSEMessage(data: any): void {
    if (data.type === 'ping') {
      // Server heartbeat
      return;
    }

    this.logger.debug('SSE message:', data);
  }

  /**
   * Handle SSE error
   */
  private handleSSEError(): void {
    if (this.state === MCPClientState.Connected) {
      this.logger.warn('SSE connection lost, attempting reconnect...');
      
      // Schedule reconnect
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          this.reconnect().catch(error => {
            this.logger.error('Reconnect failed', error);
          });
        }, this.RECONNECT_DELAY);
      }
    }
  }

  /**
   * Discover server capabilities
   */
  private async discoverCapabilities(): Promise<void> {
    // List tools
    try {
      const response = await this.axiosInstance.get('/tools');
      if (response.data.tools && Array.isArray(response.data.tools)) {
        this.tools = response.data.tools.map((tool: any) => ({
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
      const response = await this.axiosInstance.get('/resources');
      if (response.data.resources && Array.isArray(response.data.resources)) {
        this.resources = response.data.resources.map((resource: any) => ({
          ...resource,
          serverName: this.name
        }));
      }
    } catch (error) {
      this.logger.warn('Failed to list resources', error);
    }
  }

  /**
   * Handle tools updated event
   */
  private handleToolsUpdated(data: any): void {
    if (data.tools && Array.isArray(data.tools)) {
      this.tools = data.tools.map((tool: any) => ({
        ...tool,
        serverName: this.name
      }));
      this.emit('tools-updated', this.tools || []);
    }
  }

  /**
   * Handle resources updated event
   */
  private handleResourcesUpdated(data: any): void {
    if (data.resources && Array.isArray(data.resources)) {
      this.resources = data.resources.map((resource: any) => ({
        ...resource,
        serverName: this.name
      }));
    }
  }

  /**
   * Check if error is authentication error
   */
  private isAuthError(error: any): boolean {
    if (error instanceof AxiosError) {
      return error.response?.status === 401 || error.response?.status === 403;
    }
    return false;
  }
}
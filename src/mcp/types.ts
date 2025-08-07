/**
 * MCP (Model Context Protocol) Types
 * Types and interfaces for the MCP server system
 */

import { z } from 'zod';

/**
 * MCP transport types
 */
export enum MCPTransport {
  STDIO = 'stdio',
  HTTP = 'http',
  SSE = 'sse'
}

/**
 * MCP server connection state
 */
export enum MCPClientState {
  Connected = 'connected',
  NeedsAuth = 'needs-auth',
  Pending = 'pending',
  Failed = 'failed',
  Disconnected = 'disconnected'
}

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  name: string;
  type: MCPTransport;
  scope?: string;
  description?: string;
  
  // Transport-specific config
  command?: string; // For stdio
  args?: string[]; // For stdio
  env?: Record<string, string>; // For stdio
  
  url?: string; // For http/sse
  headers?: Record<string, string>; // For http/sse
  authType?: 'bearer' | 'basic' | 'custom'; // For http/sse
}

/**
 * MCP client instance
 */
export interface MCPClient {
  name: string;
  config: MCPServerConfig;
  state: MCPClientState;
  error?: string;
  lastConnected?: Date;
  tools?: MCPTool[];
  resources?: MCPResource[];
  
  // Connection methods
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  
  // Tool execution
  executeTool(toolName: string, params: any): Promise<any>;
  
  // Authentication (for http/sse)
  authenticate?(token?: string): Promise<boolean>;
  isAuthenticated?(): Promise<boolean>;
}

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: z.ZodSchema<any>;
  outputSchema?: z.ZodSchema<any>;
  serverName: string;
  category?: string;
  examples?: MCPToolExample[];
}

/**
 * MCP tool example
 */
export interface MCPToolExample {
  description: string;
  input: any;
  output?: any;
}

/**
 * MCP resource definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverName: string;
}

/**
 * MCP server info with client
 */
export interface MCPServerInfo {
  name: string;
  client: MCPClient;
  transport: MCPTransport;
  scope?: string;
  isAuthenticated?: boolean;
  config: MCPServerConfig;
}

/**
 * MCP manager configuration
 */
export interface MCPManagerConfig {
  serversFile?: string;
  autoConnect?: boolean;
  connectionTimeout?: number;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

/**
 * MCP events
 */
export interface MCPEvents {
  'server:connected': (serverName: string) => void;
  'server:disconnected': (serverName: string, error?: Error) => void;
  'server:auth-required': (serverName: string) => void;
  'server:tools-updated': (serverName: string, tools: MCPTool[]) => void;
  'server:error': (serverName: string, error: Error) => void;
  'tool:executed': (serverName: string, toolName: string, result: any) => void;
  'tool:error': (serverName: string, toolName: string, error: Error) => void;
}

/**
 * Authentication token info
 */
export interface MCPAuthToken {
  serverName: string;
  token: string;
  type: 'bearer' | 'basic' | 'custom';
  expiresAt?: Date;
}

/**
 * Server connection result
 */
export interface MCPConnectionResult {
  client: MCPClient;
  type: MCPClientState;
  error?: string;
}

/**
 * MCP server configuration schema
 */
export const MCPServerConfigSchema = z.object({
  name: z.string(),
  type: z.nativeEnum(MCPTransport),
  scope: z.string().optional(),
  description: z.string().optional(),
  
  // STDIO config
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  
  // HTTP/SSE config
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
  authType: z.enum(['bearer', 'basic', 'custom']).optional()
});

/**
 * MCP servers configuration file schema
 */
export const MCPServersConfigSchema = z.object({
  version: z.string(),
  servers: z.array(MCPServerConfigSchema),
  globalSettings: z.object({
    autoConnect: z.boolean().optional(),
    connectionTimeout: z.number().optional(),
    maxReconnectAttempts: z.number().optional()
  }).optional()
});

/**
 * Tool execution request
 */
export interface MCPToolExecutionRequest {
  serverName: string;
  toolName: string;
  parameters: any;
  timeout?: number;
}

/**
 * Tool execution result
 */
export interface MCPToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  serverName: string;
  toolName: string;
}
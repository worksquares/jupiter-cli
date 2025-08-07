/**
 * WebSocket Client for Azure Container Instance Command Execution
 * Provides real command execution instead of mock results
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WebSocketExecOptions {
  timeout?: number;
  encoding?: BufferEncoding;
  onData?: (data: string) => void;
  onError?: (error: string) => void;
}

export class WebSocketExecClient extends EventEmitter {
  private logger = Logger.getInstance().child({ component: 'WebSocketExecClient' });
  private ws: WebSocket | null = null;
  private connected = false;
  private outputBuffer = '';
  private errorBuffer = '';
  private exitCode = -1;
  private resolveExec?: (result: ExecResult) => void;
  private rejectExec?: (error: Error) => void;
  private timeout?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;

  constructor(private webSocketUri: string, private password: string) {
    super();
  }

  /**
   * Connect to the WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Add password to WebSocket URL
        const url = new URL(this.webSocketUri);
        url.searchParams.set('password', this.password);
        
        this.logger.info('Connecting to ACI WebSocket', { 
          host: url.hostname,
          pathname: url.pathname 
        });

        this.ws = new WebSocket(url.toString(), {
          headers: {
            'User-Agent': 'ACI-Exec-Client/1.0'
          }
        });
        
        if (!this.ws) {
          throw new Error('Failed to create WebSocket');
        }

        this.ws.on('open', () => {
          this.connected = true;
          this.logger.info('WebSocket connected');
          
          // Send password as first message if provided
          if (this.password) {
            this.logger.debug('Sending password authentication');
            this.ws!.send(this.password);
          }
          
          // Wait a bit for authentication to complete
          setTimeout(() => resolve(), 500);
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          this.logger.error('WebSocket error', error);
          this.emit('error', error);
          if (!this.connected) {
            reject(error);
          }
        });

        this.ws.on('close', (code, reason) => {
          this.logger.info('WebSocket closed', { code, reason: reason.toString() });
          this.connected = false;
          this.emit('close', code, reason);
          
          // Handle unexpected closure
          if (code !== 1000 && this.rejectExec) {
            // Attempt reconnection if we haven't exceeded attempts
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.logger.warn('Unexpected closure, attempting reconnection', {
                attempt: this.reconnectAttempts + 1,
                maxAttempts: this.maxReconnectAttempts
              });
              this.attemptReconnection();
              return;
            }
            
            // Reject with connection error
            this.rejectExec(new Error(`WebSocket closed unexpectedly: ${code} ${reason}`));
          } else if (this.resolveExec) {
            // Normal closure, resolve with collected output
            this.resolveExec({
              stdout: this.outputBuffer,
              stderr: this.errorBuffer,
              exitCode: this.exitCode
            });
          }
        });

        // Set connection timeout
        setTimeout(() => {
          if (!this.connected) {
            this.ws?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 30000); // 30 second timeout

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Execute a command and get the result
   */
  async execute(command: string, options: WebSocketExecOptions = {}): Promise<ExecResult> {
    if (!this.connected || !this.ws) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      this.resolveExec = resolve;
      this.rejectExec = reject;
      
      // Reset buffers
      this.outputBuffer = '';
      this.errorBuffer = '';
      this.exitCode = -1;

      // Set execution timeout
      if (options.timeout) {
        this.timeout = setTimeout(() => {
          this.close();
          reject(new Error(`Command execution timeout after ${options.timeout}ms`));
        }, options.timeout);
      }

      // Set up data handlers
      if (options.onData) {
        this.on('stdout', options.onData);
      }
      if (options.onError) {
        this.on('stderr', options.onError);
      }

      // Send command
      // Azure Container Instance WebSocket protocol for command execution
      // The command is sent as plain text after connection
      this.logger.debug('Sending command', { command: command.substring(0, 50) + '...' });
      
      // Send the command directly as text
      this.ws!.send(command + '\n');
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: Buffer): void {
    try {
      // Azure Container Instance WebSocket protocol:
      // - First byte indicates message type
      // - Rest is the payload
      
      if (data.length === 0) return;
      
      const messageType = data[0];
      const payload = data.length > 1 ? data.slice(1) : Buffer.alloc(0);
      
      switch (messageType) {
        case 1: // STDOUT
          const stdoutText = payload.toString('utf8');
          this.outputBuffer += stdoutText;
          this.emit('stdout', stdoutText);
          break;
          
        case 2: // STDERR
          const stderrText = payload.toString('utf8');
          this.errorBuffer += stderrText;
          this.emit('stderr', stderrText);
          break;
          
        case 3: // EXIT
          // Exit code is sent as a 4-byte integer
          if (payload.length >= 4) {
            this.exitCode = payload.readInt32LE(0);
          } else {
            this.exitCode = 0;
          }
          this.logger.debug('Command exited', { exitCode: this.exitCode });
          
          // Clear timeout
          if (this.timeout) {
            clearTimeout(this.timeout);
          }
          
          // Resolve the execution
          if (this.resolveExec) {
            this.resolveExec({
              stdout: this.outputBuffer,
              stderr: this.errorBuffer,
              exitCode: this.exitCode
            });
          }
          
          // Close connection after a small delay to ensure all data is received
          setTimeout(() => this.close(), 100);
          break;
          
        default:
          // Unknown message type, treat as raw output
          const rawText = data.toString('utf8');
          this.outputBuffer += rawText;
          this.emit('stdout', rawText);
      }
    } catch (error) {
      this.logger.error('Error handling message', error);
      
      // Fallback: treat entire message as stdout
      const fallbackText = data.toString('utf8');
      this.outputBuffer += fallbackText;
      this.emit('stdout', fallbackText);
    }
  }

  /**
   * Send input to the running command
   */
  sendInput(input: string): void {
    if (!this.connected || !this.ws) {
      throw new Error('WebSocket not connected');
    }

    // Azure Container Instance expects stdin input to be sent with message type 0
    const messageType = Buffer.from([0]); // STDIN message type
    const payload = Buffer.from(input, 'utf8');
    const message = Buffer.concat([messageType, payload]);
    
    this.ws.send(message);
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    
    // Clear timeout
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    
    // Remove all listeners
    this.removeAllListeners();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Attempt to reconnect after unexpected closure
   */
  private async attemptReconnection(): Promise<void> {
    this.reconnectAttempts++;
    
    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    
    try {
      // Close existing socket if any
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.close();
        this.ws = null;
      }
      
      // Attempt to reconnect
      await this.connect();
      
      this.logger.info('Reconnection successful');
      this.reconnectAttempts = 0;
      
      // If we have a pending command, resend it
      if (this.resolveExec) {
        this.logger.info('Resending command after reconnection');
        // Note: Command resending would need to be handled by the caller
        // as we don't store the original command
      }
    } catch (error) {
      this.logger.error('Reconnection failed', error);
      
      if (this.rejectExec) {
        this.rejectExec(new Error(`Failed to reconnect: ${error}`));
      }
    }
  }
}

/**
 * Alternative implementation using raw TCP for older ACI versions
 */
export class TCPExecClient {
  private logger = Logger.getInstance().child({ component: 'TCPExecClient' });
  
  async execute(
    host: string,
    port: number,
    command: string,
    options: WebSocketExecOptions = {}
  ): Promise<ExecResult> {
    // This would implement TCP-based execution for older ACI versions
    // For now, we'll focus on WebSocket implementation
    throw new Error('TCP execution not yet implemented');
  }
}
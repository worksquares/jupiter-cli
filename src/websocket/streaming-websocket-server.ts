/**
 * Streaming WebSocket Server
 * Enhanced WebSocket server with real-time streaming and conversation logging
 */

import { Server as HTTPServer } from 'http';
import { Socket } from 'socket.io';
import { SegregatedWebSocketServer } from './websocket-server';
import { JupiterAuthProvider } from '../auth/jupiter-auth';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { ConversationLogger, ConversationMessage, StreamChunk } from '../services/conversation-logger';
import { Agent } from '../core/agent';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { 
  SegregationContext,
  validateSegregationContext,
  hasSegregationContext
} from '../core/segregation-types';
import { TaskType, TaskStatus, Priority } from '../core/unified-types';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  sessionId?: string;
  context?: SegregationContext;
}

interface StreamingMessage {
  sessionId: string;
  messageId: string;
  content: string;
  context?: any;
  metadata?: any;
}

interface AgentStreamOptions {
  sessionId: string;
  messageId: string;
  content: string;
  context: SegregationContext;
  streamToClient?: boolean;
  saveChunks?: boolean;
}

export class StreamingWebSocketServer extends SegregatedWebSocketServer {
  private conversationLogger: ConversationLogger;
  private agent: Agent | null = null;
  protected streamingLogger: Logger;
  private activeStreams: Map<string, AbortController> = new Map();
  private streamBuffers: Map<string, string[]> = new Map();
  private chunkCounters: Map<string, number> = new Map();

  constructor(
    httpServer: HTTPServer,
    authProvider: JupiterAuthProvider,
    dbClient: JupiterDBClient,
    agent?: Agent
  ) {
    super(httpServer, authProvider);
    this.streamingLogger = new Logger('StreamingWebSocketServer');
    this.conversationLogger = new ConversationLogger(dbClient);
    this.agent = agent || null;
    this.initializeStreamHandlers();
  }

  /**
   * Initialize streaming-specific handlers
   */
  private initializeStreamHandlers(): void {
    // Streaming-specific initialization
    // Connection handling is already done in parent class
  }

  /**
   * Handle streaming connection
   */
  private async handleStreamingConnection(socket: AuthenticatedSocket): Promise<void> {
    const userId = socket.userId!;
    
    // Call parent connection handler
    // @ts-ignore - Access protected method
    super.handleConnection(socket);

    // Track connection in database
    const clientIp = socket.handshake.address;
    const userAgent = socket.handshake.headers['user-agent'];
    await this.conversationLogger.trackConnection(
      socket.id,
      userId,
      null,
      clientIp,
      userAgent
    );

    // Setup streaming event handlers
    this.setupStreamingEventHandlers(socket);

    // Handle disconnection with cleanup
    socket.on('disconnect', async () => {
      await this.handleStreamingDisconnection(socket);
    });
  }

  /**
   * Setup streaming event handlers
   */
  private setupStreamingEventHandlers(socket: AuthenticatedSocket): void {
    // Start conversation session
    socket.on('conversation.start', async (data: any) => {
      try {
        const sessionId = await this.startConversationSession(socket, data);
        socket.sessionId = sessionId;
        socket.emit('conversation.started', { sessionId, success: true });
      } catch (error) {
        this.streamingLogger.error('Failed to start conversation', error);
        socket.emit('error', { 
          message: 'Failed to start conversation',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Handle user messages with streaming response
    socket.on('user.message', async (data: StreamingMessage) => {
      if (!hasSegregationContext(data)) {
        socket.emit('error', { message: 'Invalid request: missing context' });
        return;
      }

      try {
        const context = validateSegregationContext(data.context);
        
        // Verify user access
        if (context.userId !== socket.userId) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Start or get session
        const sessionId = data.sessionId || socket.sessionId || 
          await this.startConversationSession(socket, { context });

        // Log user message
        const userMessageId = await this.conversationLogger.logMessage(sessionId, {
          type: 'user_input',
          role: 'user',
          content: data.content,
          metadata: data.metadata
        });

        // Update connection activity
        await this.conversationLogger.updateConnectionActivity(socket.id, 0, 1);

        // Process with AI agent if available
        if (this.agent) {
          await this.processWithStreamingAgent({
            sessionId,
            messageId: userMessageId,
            content: data.content,
            context,
            streamToClient: true,
            saveChunks: true
          });
        } else {
          // Echo response if no agent available
          await this.sendMockStreamingResponse(socket, sessionId, userMessageId, data.content);
        }
      } catch (error) {
        this.streamingLogger.error('Failed to process user message', error);
        socket.emit('error', { 
          message: 'Failed to process message',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Handle stream control
    socket.on('stream.pause', async (data: { messageId: string }) => {
      this.pauseStream(data.messageId);
      socket.emit('stream.paused', { messageId: data.messageId });
    });

    socket.on('stream.resume', async (data: { messageId: string }) => {
      this.resumeStream(data.messageId);
      socket.emit('stream.resumed', { messageId: data.messageId });
    });

    socket.on('stream.cancel', async (data: { messageId: string }) => {
      this.cancelStream(data.messageId);
      socket.emit('stream.cancelled', { messageId: data.messageId });
    });

    // Get conversation history
    socket.on('conversation.history', async (data: { sessionId: string }) => {
      try {
        const history = await this.conversationLogger.getConversationHistory(data.sessionId);
        socket.emit('conversation.history', { sessionId: data.sessionId, messages: history });
      } catch (error) {
        socket.emit('error', { message: 'Failed to get history' });
      }
    });

    // Get user sessions
    socket.on('sessions.list', async () => {
      try {
        const sessions = await this.conversationLogger.getUserSessions(socket.userId!);
        socket.emit('sessions.list', { sessions });
      } catch (error) {
        socket.emit('error', { message: 'Failed to get sessions' });
      }
    });
  }

  /**
   * Start a conversation session
   */
  private async startConversationSession(
    socket: AuthenticatedSocket,
    data: any
  ): Promise<string> {
    const context = data.context ? validateSegregationContext(data.context) : null;
    
    const sessionId = await this.conversationLogger.startSession(
      socket.userId!,
      context?.projectId,
      context?.taskId,
      data.sessionType || 'chat',
      data.title
    );

    // Update WebSocket connection with session
    await this.conversationLogger.trackConnection(
      socket.id,
      socket.userId!,
      sessionId
    );

    this.streamingLogger.info('Started conversation session', { 
      sessionId, 
      userId: socket.userId,
      projectId: context?.projectId 
    });

    return sessionId;
  }

  /**
   * Process message with streaming AI agent
   */
  private async processWithStreamingAgent(options: AgentStreamOptions): Promise<void> {
    const { sessionId, messageId, content, context, streamToClient = true, saveChunks = true } = options;

    if (!this.agent) {
      this.streamingLogger.warn('No agent available for streaming');
      return;
    }

    try {
      // Log agent response start
      const responseId = await this.conversationLogger.logMessage(sessionId, {
        type: 'agent_response',
        role: 'assistant',
        content: '',
        isStreaming: true,
        parentId: messageId
      });

      // Create abort controller for this stream
      const abortController = new AbortController();
      this.activeStreams.set(responseId, abortController);

      // Initialize buffers
      this.streamBuffers.set(responseId, []);
      this.chunkCounters.set(responseId, 0);

      // Generate response using agent's task processing
      // TODO: Implement actual streaming when agent supports it
      const task = {
        id: responseId,
        type: TaskType.GENERAL,
        description: content,
        context: {
          workingDirectory: './',
          files: []
        },
        status: TaskStatus.PENDING,
        priority: Priority.MEDIUM,
        userId: context.userId,
        projectId: context.projectId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const response = await this.agent.processTask(task);
      
      // Simulate streaming by chunking the response
      const stream = this.createStreamFromResponse(response, abortController.signal);

      let fullContent = '';
      let chunkIndex = 0;
      let tokensUsed = 0;

      // Process stream chunks
      for await (const chunk of stream) {
        // Check if stream was cancelled
        if (abortController.signal.aborted) {
          break;
        }

        // Buffer the chunk
        this.streamBuffers.get(responseId)?.push(chunk.content);
        fullContent += chunk.content;
        
        // Send chunk to client if streaming is enabled
        if (streamToClient) {
          this.emitToTask(context, 'agent.chunk', {
            sessionId,
            messageId: responseId,
            chunk: chunk.content,
            chunkIndex,
            isComplete: chunk.isComplete || false,
            metadata: chunk.metadata
          });
        }

        // Save chunk to database if enabled
        if (saveChunks) {
          await this.conversationLogger.storeChunk(
            responseId,
            chunkIndex,
            chunk.content,
            chunk.type || 'text',
            chunk.metadata
          );
        }

        // Update counters
        chunkIndex++;
        if (chunk.tokensUsed) {
          tokensUsed += chunk.tokensUsed;
        }

        // Handle completion
        if (chunk.isComplete) {
          await this.finalizeStreamingResponse(
            sessionId,
            responseId,
            fullContent,
            tokensUsed,
            context
          );
          break;
        }
      }

      // Update connection activity
      // Since taskSubscriptions is private in parent, track locally
      // Use the responseId as the socket identifier
      await this.conversationLogger.updateConnectionActivity(responseId, 1, 0);

    } catch (error) {
      this.streamingLogger.error('Failed to process streaming agent response', error);
      
      // Log error message
      await this.conversationLogger.logMessage(sessionId, {
        type: 'error',
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        parentId: messageId
      });

      // Emit error to client
      this.emitToTask(context, 'agent.error', {
        sessionId,
        messageId,
        error: error instanceof Error ? error.message : 'Processing failed'
      });
    } finally {
      // Cleanup
      this.activeStreams.delete(messageId);
      this.streamBuffers.delete(messageId);
      this.chunkCounters.delete(messageId);
    }
  }

  /**
   * Finalize streaming response
   */
  private async finalizeStreamingResponse(
    sessionId: string,
    messageId: string,
    fullContent: string,
    tokensUsed: number,
    context: SegregationContext
  ): Promise<void> {
    // Update message in database
    await this.conversationLogger.finalizeStreamingMessage(
      messageId,
      fullContent,
      tokensUsed
    );

    // Emit completion event
    this.emitToTask(context, 'agent.complete', {
      sessionId,
      messageId,
      fullContent,
      tokensUsed,
      timestamp: new Date()
    });

    this.streamingLogger.info('Finalized streaming response', { 
      sessionId, 
      messageId, 
      contentLength: fullContent.length,
      tokensUsed 
    });
  }

  /**
   * Send mock streaming response (for testing without agent)
   */
  private async sendMockStreamingResponse(
    socket: AuthenticatedSocket,
    sessionId: string,
    parentMessageId: string,
    userContent: string
  ): Promise<void> {
    const responseId = await this.conversationLogger.logMessage(sessionId, {
      type: 'agent_response',
      role: 'assistant',
      content: '',
      isStreaming: true,
      parentId: parentMessageId
    });

    const mockResponse = `I received your message: "${userContent}". This is a simulated streaming response to demonstrate the WebSocket streaming capability.`;
    const words = mockResponse.split(' ');
    
    let fullContent = '';
    let chunkIndex = 0;

    for (const word of words) {
      const chunk = word + ' ';
      fullContent += chunk;

      // Emit chunk
      socket.emit('agent.chunk', {
        sessionId,
        messageId: responseId,
        chunk,
        chunkIndex,
        isComplete: false
      });

      // Store chunk
      await this.conversationLogger.storeChunk(responseId, chunkIndex, chunk);
      
      chunkIndex++;
      
      // Simulate streaming delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Finalize message
    await this.conversationLogger.finalizeStreamingMessage(responseId, fullContent.trim());
    
    socket.emit('agent.complete', {
      sessionId,
      messageId: responseId,
      fullContent: fullContent.trim(),
      timestamp: new Date()
    });
  }

  /**
   * Pause a stream
   */
  private pauseStream(messageId: string): void {
    const controller = this.activeStreams.get(messageId);
    if (controller) {
      // Note: Actual pause implementation would require stream protocol support
      this.streamingLogger.info('Stream pause requested', { messageId });
    }
  }

  /**
   * Resume a stream
   */
  private resumeStream(messageId: string): void {
    const controller = this.activeStreams.get(messageId);
    if (controller) {
      // Note: Actual resume implementation would require stream protocol support
      this.streamingLogger.info('Stream resume requested', { messageId });
    }
  }

  /**
   * Cancel a stream
   */
  private cancelStream(messageId: string): void {
    const controller = this.activeStreams.get(messageId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(messageId);
      this.streamingLogger.info('Stream cancelled', { messageId });
    }
  }

  /**
   * Handle streaming disconnection
   */
  private async handleStreamingDisconnection(socket: AuthenticatedSocket): Promise<void> {
    // Cancel any active streams for this socket
    for (const [messageId, controller] of this.activeStreams.entries()) {
      if (messageId.startsWith(socket.id)) {
        controller.abort();
        this.activeStreams.delete(messageId);
      }
    }

    // Mark connection as disconnected
    await this.conversationLogger.disconnectConnection(socket.id);

    // End active session if exists
    if (socket.sessionId) {
      await this.conversationLogger.endSession(socket.sessionId, 'active');
    }

    // Call parent disconnection handler
    // @ts-ignore - Access protected method
    super.handleDisconnection(socket);
    
    this.streamingLogger.info('Streaming connection closed', { 
      socketId: socket.id,
      userId: socket.userId 
    });
  }

  /**
   * Get streaming statistics
   */
  getStreamingStats(): any {
    return {
      activeStreams: this.activeStreams.size,
      connectedUsers: this.getConnectedUsersCount(),
      activeProjects: this.getActiveProjectsCount(),
      activeTasks: this.getActiveTasksCount(),
      streamBuffers: this.streamBuffers.size
    };
  }

  /**
   * Cleanup old sessions periodically
   */
  async startCleanupTask(intervalMinutes: number = 30): Promise<void> {
    setInterval(async () => {
      try {
        const cleaned = await this.conversationLogger.cleanupOldSessions();
        if (cleaned > 0) {
          this.streamingLogger.info(`Cleaned up ${cleaned} inactive sessions`);
        }
      } catch (error) {
        this.streamingLogger.error('Failed to cleanup sessions', error);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Create a simulated stream from a response
   */
  private async *createStreamFromResponse(
    response: any,
    signal: AbortSignal
  ): AsyncGenerator<any> {
    // Convert response to string
    const text = typeof response === 'string' ? response : JSON.stringify(response);
    
    // Chunk the response into smaller pieces
    const chunkSize = 50; // Characters per chunk
    for (let i = 0; i < text.length; i += chunkSize) {
      if (signal.aborted) break;
      
      const chunk = text.slice(i, Math.min(i + chunkSize, text.length));
      yield {
        content: chunk,
        tokens: chunk.split(' ').length // Approximate token count
      };
      
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}
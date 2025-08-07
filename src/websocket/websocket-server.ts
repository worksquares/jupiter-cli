/**
 * WebSocket Server with Segregation
 * Handles real-time communication with strict userId/projectId/taskId isolation
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Logger } from '../utils/logger';
import { 
  SegregationContext, 
  SegregatedWebSocketMessage,
  WebSocketTaskCreateRequest,
  WebSocketConsoleStreamRequest,
  WebSocketActionExecuteRequest,
  validateSegregationContext,
  hasSegregationContext
} from '../core/segregation-types';
import { JupiterAuthProvider } from '../auth/jupiter-auth';
import { v4 as uuidv4 } from 'uuid';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  projectIds?: Set<string>;
  taskIds?: Set<string>;
  context?: SegregationContext;
}

interface UserSession {
  userId: string;
  socketId: string;
  projects: Set<string>;
  tasks: Set<string>;
  connectedAt: Date;
}

export class SegregatedWebSocketServer {
  private io: SocketIOServer;
  private logger: Logger;
  private userSessions: Map<string, UserSession> = new Map();
  private projectRooms: Map<string, Set<string>> = new Map(); // projectId -> socketIds
  private taskSubscriptions: Map<string, Set<string>> = new Map(); // taskId -> socketIds
  private authProvider: JupiterAuthProvider;

  constructor(
    httpServer: HTTPServer,
    authProvider: JupiterAuthProvider
  ) {
    this.logger = new Logger('WebSocketServer');
    this.authProvider = authProvider;
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupConnectionHandlers();
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Validate JWT token with JupiterAPI
        const payload = await this.authProvider.validateToken(token);
        
        socket.userId = payload.userId;
        socket.data = { ...socket.data, userId: payload.userId, payload };
        
        this.logger.info(`Socket authenticated for user: ${payload.userId}`);
        next();
      } catch (error) {
        this.logger.error('Socket authentication failed', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup connection handlers
   */
  private setupConnectionHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;
    
    // Create user session
    const session: UserSession = {
      userId,
      socketId: socket.id,
      projects: new Set(),
      tasks: new Set(),
      connectedAt: new Date()
    };
    
    this.userSessions.set(socket.id, session);
    
    // Join user room
    socket.join(`user:${userId}`);
    
    this.logger.info(`User connected: ${userId}`, { socketId: socket.id });

    // Setup event handlers
    this.setupSocketEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketEventHandlers(socket: AuthenticatedSocket): void {
    // Subscribe to project/task
    socket.on('subscribe', async (data: any) => {
      if (!hasSegregationContext(data)) {
        socket.emit('error', { message: 'Invalid request: missing segregation context' });
        return;
      }

      try {
        const context = validateSegregationContext(data.context);
        
        // Verify user has access to this project/task
        if (context.userId !== socket.userId) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        await this.subscribeToContext(socket, context);
      } catch (error) {
        socket.emit('error', { 
          message: 'Subscription failed', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Handle task creation
    socket.on('task.create', async (data: WebSocketTaskCreateRequest) => {
      if (!hasSegregationContext(data)) {
        socket.emit('error', { message: 'Invalid request: missing segregation context' });
        return;
      }

      try {
        const context = validateSegregationContext(data.context);
        
        // Verify user owns this context
        if (context.userId !== socket.userId) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Emit to task handlers
        this.io.to(`task-handlers`).emit('task.create', {
          context,
          data: data.data,
          timestamp: new Date(),
          messageId: uuidv4()
        });

        socket.emit('task.created', { 
          context, 
          success: true,
          messageId: uuidv4()
        });
      } catch (error) {
        socket.emit('error', { 
          message: 'Task creation failed', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Handle console streaming toggle
    socket.on('console.stream', async (data: WebSocketConsoleStreamRequest) => {
      if (!hasSegregationContext(data)) {
        socket.emit('error', { message: 'Invalid request: missing segregation context' });
        return;
      }

      const context = validateSegregationContext(data.context);
      const enable = data.enable !== false;

      if (enable) {
        socket.join(`console:${context.taskId}`);
      } else {
        socket.leave(`console:${context.taskId}`);
      }

      socket.emit('console.stream.updated', { context, enabled: enable });
    });

    // Handle action execution
    socket.on('action.execute', async (data: WebSocketActionExecuteRequest) => {
      if (!hasSegregationContext(data)) {
        socket.emit('error', { message: 'Invalid request: missing segregation context' });
        return;
      }

      const context = validateSegregationContext(data.context);
      
      // Forward to action handlers
      this.io.to(`action-handlers`).emit('action.execute', {
        context,
        action: data.action,
        confirmed: data.confirmed || false,
        timestamp: new Date(),
        messageId: uuidv4()
      });
    });
  }

  /**
   * Subscribe socket to project/task context
   */
  private async subscribeToContext(
    socket: AuthenticatedSocket,
    context: SegregationContext
  ): Promise<void> {
    const session = this.userSessions.get(socket.id);
    if (!session) return;

    // Join segregated rooms
    socket.join(`project:${context.projectId}`);
    socket.join(`task:${context.taskId}`);
    
    // Update session
    session.projects.add(context.projectId);
    session.tasks.add(context.taskId);

    // Update room mappings
    if (!this.projectRooms.has(context.projectId)) {
      this.projectRooms.set(context.projectId, new Set());
    }
    this.projectRooms.get(context.projectId)!.add(socket.id);

    if (!this.taskSubscriptions.has(context.taskId)) {
      this.taskSubscriptions.set(context.taskId, new Set());
    }
    this.taskSubscriptions.get(context.taskId)!.add(socket.id);

    socket.emit('subscribed', { context, success: true });
    
    this.logger.info('Socket subscribed to context', { 
      socketId: socket.id, 
      context 
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: AuthenticatedSocket): void {
    const session = this.userSessions.get(socket.id);
    if (!session) return;

    // Clean up room memberships
    session.projects.forEach(projectId => {
      const room = this.projectRooms.get(projectId);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) {
          this.projectRooms.delete(projectId);
        }
      }
    });

    session.tasks.forEach(taskId => {
      const subs = this.taskSubscriptions.get(taskId);
      if (subs) {
        subs.delete(socket.id);
        if (subs.size === 0) {
          this.taskSubscriptions.delete(taskId);
        }
      }
    });

    this.userSessions.delete(socket.id);
    
    this.logger.info('User disconnected', { 
      userId: session.userId, 
      socketId: socket.id 
    });
  }

  /**
   * Emit event to specific task subscribers
   */
  emitToTask<T = any>(
    context: SegregationContext,
    event: string,
    data: T
  ): void {
    const message: SegregatedWebSocketMessage<T> = {
      context,
      event,
      data,
      timestamp: new Date(),
      messageId: uuidv4()
    };

    this.io.to(`task:${context.taskId}`).emit(event, message);
    
    this.logger.debug('Emitted to task', { 
      taskId: context.taskId, 
      event,
      subscribers: this.taskSubscriptions.get(context.taskId)?.size || 0
    });
  }

  /**
   * Emit event to project subscribers
   */
  emitToProject<T = any>(
    context: SegregationContext,
    event: string,
    data: T
  ): void {
    const message: SegregatedWebSocketMessage<T> = {
      context,
      event,
      data,
      timestamp: new Date(),
      messageId: uuidv4()
    };

    this.io.to(`project:${context.projectId}`).emit(event, message);
  }

  /**
   * Emit event to specific user
   */
  emitToUser<T = any>(
    userId: string,
    event: string,
    data: T
  ): void {
    this.io.to(`user:${userId}`).emit(event, {
      event,
      data,
      timestamp: new Date(),
      messageId: uuidv4()
    });
  }

  /**
   * Stream console output
   */
  streamConsoleOutput(
    context: SegregationContext,
    output: string,
    type: 'stdout' | 'stderr' = 'stdout'
  ): void {
    this.emitToTask(context, 'console.output', {
      output,
      type,
      timestamp: new Date()
    });
  }

  /**
   * Send action confirmation request
   */
  requestActionConfirmation(
    context: SegregationContext,
    action: any,
    preview?: string
  ): void {
    this.emitToTask(context, 'action.confirmation', {
      action,
      preview,
      requiresConfirmation: true,
      timestamp: new Date()
    });
  }

  /**
   * Send task progress update
   */
  updateTaskProgress(
    context: SegregationContext,
    status: string,
    progress: number,
    currentAction?: string
  ): void {
    this.emitToTask(context, 'task.progress', {
      status,
      progress,
      currentAction,
      timestamp: new Date()
    });
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return new Set(Array.from(this.userSessions.values()).map(s => s.userId)).size;
  }

  /**
   * Get active projects count
   */
  getActiveProjectsCount(): number {
    return this.projectRooms.size;
  }

  /**
   * Get active tasks count
   */
  getActiveTasksCount(): number {
    return this.taskSubscriptions.size;
  }

  /**
   * Shutdown WebSocket server
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down WebSocket server...');
    
    // Disconnect all clients
    this.io.sockets.sockets.forEach(socket => {
      socket.disconnect(true);
    });

    // Close the server
    this.io.close();
    
    this.logger.info('WebSocket server shutdown complete');
  }
}
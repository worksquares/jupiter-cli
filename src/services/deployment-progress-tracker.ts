/**
 * Real-time Deployment Progress Tracker
 * Provides WebSocket-based progress updates for deployment workflows
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { DeploymentWorkflow, WorkflowStep } from '../orchestration/deployment-workflow-orchestrator';

export interface ProgressUpdate {
  workflowId: string;
  type: 'workflow' | 'step' | 'log' | 'error';
  timestamp: Date;
  data: any;
}

export interface ProgressSubscription {
  userId: string;
  workflowId: string;
  socketId: string;
  subscribedAt: Date;
}

export class DeploymentProgressTracker extends EventEmitter {
  private logger = Logger.getInstance().child({ component: 'ProgressTracker' });
  private io: SocketIOServer;
  private subscriptions: Map<string, ProgressSubscription[]> = new Map();
  private workflowHistory: Map<string, ProgressUpdate[]> = new Map();
  
  constructor(httpServer: HTTPServer) {
    super();
    
    // Initialize Socket.IO
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      },
      path: '/deployment-progress'
    });

    this.setupSocketHandlers();
  }

  /**
   * Set up Socket.IO event handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      this.logger.info('Client connected', { socketId: socket.id });

      // Handle subscription to workflow updates
      socket.on('subscribe', (data: { userId: string; workflowId: string }) => {
        this.handleSubscription(socket, data);
      });

      // Handle unsubscription
      socket.on('unsubscribe', (data: { workflowId: string }) => {
        this.handleUnsubscription(socket, data.workflowId);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // Handle status request
      socket.on('getStatus', (data: { workflowId: string }) => {
        this.sendWorkflowStatus(socket, data.workflowId);
      });
    });
  }

  /**
   * Handle workflow subscription
   */
  private handleSubscription(socket: any, data: { userId: string; workflowId: string }): void {
    const { userId, workflowId } = data;
    
    // Join workflow room
    socket.join(`workflow:${workflowId}`);
    
    // Store subscription
    const subscription: ProgressSubscription = {
      userId,
      workflowId,
      socketId: socket.id,
      subscribedAt: new Date()
    };

    const subs = this.subscriptions.get(workflowId) || [];
    subs.push(subscription);
    this.subscriptions.set(workflowId, subs);

    this.logger.info('Client subscribed to workflow', { socketId: socket.id, workflowId });

    // Send historical updates
    this.sendHistoricalUpdates(socket, workflowId);
  }

  /**
   * Handle unsubscription
   */
  private handleUnsubscription(socket: any, workflowId: string): void {
    socket.leave(`workflow:${workflowId}`);
    
    const subs = this.subscriptions.get(workflowId) || [];
    const filtered = subs.filter(s => s.socketId !== socket.id);
    
    if (filtered.length > 0) {
      this.subscriptions.set(workflowId, filtered);
    } else {
      this.subscriptions.delete(workflowId);
    }

    this.logger.info('Client unsubscribed from workflow', { socketId: socket.id, workflowId });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(socket: any): void {
    // Remove all subscriptions for this socket
    for (const [workflowId, subs] of this.subscriptions.entries()) {
      const filtered = subs.filter(s => s.socketId !== socket.id);
      if (filtered.length > 0) {
        this.subscriptions.set(workflowId, filtered);
      } else {
        this.subscriptions.delete(workflowId);
      }
    }

    this.logger.info('Client disconnected', { socketId: socket.id });
  }

  /**
   * Send historical updates to newly connected client
   */
  private sendHistoricalUpdates(socket: any, workflowId: string): void {
    const history = this.workflowHistory.get(workflowId) || [];
    
    if (history.length > 0) {
      socket.emit('historicalUpdates', {
        workflowId,
        updates: history
      });
    }
  }

  /**
   * Send current workflow status
   */
  private sendWorkflowStatus(socket: any, workflowId: string): void {
    const history = this.workflowHistory.get(workflowId) || [];
    const latestWorkflowUpdate = history
      .filter(u => u.type === 'workflow')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (latestWorkflowUpdate) {
      socket.emit('workflowStatus', {
        workflowId,
        status: latestWorkflowUpdate.data
      });
    }
  }

  /**
   * Track workflow created
   */
  trackWorkflowCreated(workflow: DeploymentWorkflow): void {
    const update: ProgressUpdate = {
      workflowId: workflow.id,
      type: 'workflow',
      timestamp: new Date(),
      data: {
        event: 'created',
        workflow: this.sanitizeWorkflow(workflow)
      }
    };

    this.storeAndBroadcast(update);
  }

  /**
   * Track workflow started
   */
  trackWorkflowStarted(workflow: DeploymentWorkflow): void {
    const update: ProgressUpdate = {
      workflowId: workflow.id,
      type: 'workflow',
      timestamp: new Date(),
      data: {
        event: 'started',
        workflow: this.sanitizeWorkflow(workflow)
      }
    };

    this.storeAndBroadcast(update);
  }

  /**
   * Track step update
   */
  trackStepUpdate(workflow: DeploymentWorkflow, step: WorkflowStep): void {
    const update: ProgressUpdate = {
      workflowId: workflow.id,
      type: 'step',
      timestamp: new Date(),
      data: {
        stepId: step.id,
        stepName: step.name,
        status: step.status,
        output: step.output,
        error: step.error,
        duration: step.startTime && step.endTime 
          ? step.endTime.getTime() - step.startTime.getTime() 
          : undefined
      }
    };

    this.storeAndBroadcast(update);

    // Calculate and send progress percentage
    const completedSteps = workflow.steps.filter(s => 
      s.status === 'completed' || s.status === 'skipped'
    ).length;
    const progressPercentage = Math.round((completedSteps / workflow.steps.length) * 100);

    this.io.to(`workflow:${workflow.id}`).emit('progressUpdate', {
      workflowId: workflow.id,
      percentage: progressPercentage,
      currentStep: step.name,
      stepsCompleted: completedSteps,
      totalSteps: workflow.steps.length
    });
  }

  /**
   * Track log message
   */
  trackLogMessage(workflowId: string, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const update: ProgressUpdate = {
      workflowId,
      type: 'log',
      timestamp: new Date(),
      data: {
        message,
        level
      }
    };

    this.storeAndBroadcast(update);
  }

  /**
   * Track workflow completed
   */
  trackWorkflowCompleted(workflow: DeploymentWorkflow): void {
    const update: ProgressUpdate = {
      workflowId: workflow.id,
      type: 'workflow',
      timestamp: new Date(),
      data: {
        event: 'completed',
        workflow: this.sanitizeWorkflow(workflow),
        duration: workflow.startTime && workflow.endTime
          ? workflow.endTime.getTime() - workflow.startTime.getTime()
          : undefined,
        deploymentUrl: workflow.deploymentUrl
      }
    };

    this.storeAndBroadcast(update);
  }

  /**
   * Track workflow failed
   */
  trackWorkflowFailed(workflow: DeploymentWorkflow): void {
    const update: ProgressUpdate = {
      workflowId: workflow.id,
      type: 'workflow',
      timestamp: new Date(),
      data: {
        event: 'failed',
        workflow: this.sanitizeWorkflow(workflow),
        error: workflow.error,
        failedStep: workflow.steps[workflow.currentStep]?.name
      }
    };

    this.storeAndBroadcast(update);
  }

  /**
   * Track error
   */
  trackError(workflowId: string, error: Error, context?: any): void {
    const update: ProgressUpdate = {
      workflowId,
      type: 'error',
      timestamp: new Date(),
      data: {
        message: error.message,
        stack: error.stack,
        context
      }
    };

    this.storeAndBroadcast(update);
  }

  /**
   * Store update and broadcast to subscribers
   */
  private storeAndBroadcast(update: ProgressUpdate): void {
    // Store in history
    const history = this.workflowHistory.get(update.workflowId) || [];
    history.push(update);
    
    // Keep only last 1000 updates per workflow
    if (history.length > 1000) {
      history.shift();
    }
    
    this.workflowHistory.set(update.workflowId, history);

    // Broadcast to all subscribers
    this.io.to(`workflow:${update.workflowId}`).emit('update', update);

    // Emit event for other services
    this.emit('update', update);
  }

  /**
   * Sanitize workflow data for client
   */
  private sanitizeWorkflow(workflow: DeploymentWorkflow): any {
    return {
      id: workflow.id,
      userId: workflow.userId,
      projectId: workflow.projectId,
      status: workflow.status,
      currentStep: workflow.currentStep,
      steps: workflow.steps.map(step => ({
        id: step.id,
        name: step.name,
        description: step.description,
        status: step.status,
        startTime: step.startTime,
        endTime: step.endTime,
        hasOutput: !!step.output,
        hasError: !!step.error
      })),
      startTime: workflow.startTime,
      endTime: workflow.endTime,
      deploymentUrl: workflow.deploymentUrl,
      hasError: !!workflow.error
    };
  }

  /**
   * Get active subscriptions count
   */
  getActiveSubscriptions(): Map<string, number> {
    const counts = new Map<string, number>();
    
    for (const [workflowId, subs] of this.subscriptions.entries()) {
      counts.set(workflowId, subs.length);
    }
    
    return counts;
  }

  /**
   * Clean up old workflow history
   */
  cleanupOldHistory(olderThanHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    for (const [workflowId, history] of this.workflowHistory.entries()) {
      // Check if workflow is old and completed
      const lastUpdate = history[history.length - 1];
      if (lastUpdate && lastUpdate.timestamp < cutoffTime) {
        const workflowUpdate = history.find(u => 
          u.type === 'workflow' && 
          (u.data.event === 'completed' || u.data.event === 'failed')
        );
        
        if (workflowUpdate) {
          this.workflowHistory.delete(workflowId);
          this.logger.info('Cleaned up old workflow history', { workflowId });
        }
      }
    }
  }
}
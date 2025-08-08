/**
 * Conversation Logger Service
 * Handles persistence of WebSocket streaming conversations to Jupiter DB
 */

import { JupiterDBClient } from '../database/jupiter-db-client';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationMessage {
  id?: string;
  type: 'user_input' | 'agent_response' | 'system' | 'error' | 'tool_call' | 'tool_result';
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  contentType?: 'text' | 'code' | 'json' | 'markdown' | 'html';
  isStreaming?: boolean;
  parentId?: string | null;
  toolName?: string;
  toolParams?: any;
  toolResult?: any;
  metadata?: any;
  tokensUsed?: number;
}

export interface ConversationSession {
  id?: string;
  userId: string;
  projectId?: string;
  taskId?: string;
  sessionType?: 'chat' | 'task_execution' | 'code_generation' | 'debugging';
  title?: string;
  status?: 'active' | 'paused' | 'completed' | 'error';
  metadata?: any;
}

export interface StreamChunk {
  messageId: string;
  chunkIndex: number;
  content: string;
  chunkType?: 'text' | 'code' | 'tool_call' | 'tool_result' | 'error';
  isComplete?: boolean;
  fullContent?: string;
  metadata?: any;
}

export class ConversationLogger {
  private logger: Logger;

  constructor(private dbClient: JupiterDBClient) {
    this.logger = new Logger('ConversationLogger');
  }

  /**
   * Start a new conversation session
   */
  async startSession(
    userId: string,
    projectId?: string,
    taskId?: string,
    sessionType: string = 'chat',
    title?: string
  ): Promise<string> {
    try {
      const sessionId = uuidv4();
      
      await this.dbClient.execute(
        `INSERT INTO conversation_sessions 
         (id, user_id, project_id, task_id, session_type, title, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())`,
        [sessionId, userId, projectId || null, taskId || null, sessionType, title || 'AI Conversation']
      );

      this.logger.info('Started conversation session', { sessionId, userId, projectId, taskId });
      return sessionId;
    } catch (error) {
      this.logger.error('Failed to start session', error);
      throw error;
    }
  }

  /**
   * End a conversation session
   */
  async endSession(sessionId: string, status: string = 'completed'): Promise<void> {
    try {
      await this.dbClient.execute(
        `UPDATE conversation_sessions 
         SET status = ?, ended_at = NOW()
         WHERE id = ?`,
        [status, sessionId]
      );

      this.logger.info('Ended conversation session', { sessionId, status });
    } catch (error) {
      this.logger.error('Failed to end session', error);
      throw error;
    }
  }

  /**
   * Log a message in the conversation
   */
  async logMessage(
    sessionId: string,
    message: ConversationMessage
  ): Promise<string> {
    try {
      const messageId = message.id || uuidv4();
      
      // Get next sequence number
      const [sequenceResult] = await this.dbClient.query<{ next_seq: number }>(
        `SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
         FROM conversation_messages
         WHERE session_id = ?`,
        [sessionId]
      );
      
      const sequenceNumber = sequenceResult?.next_seq || 1;

      await this.dbClient.execute(
        `INSERT INTO conversation_messages 
         (id, session_id, message_type, role, content, content_type,
          tool_name, tool_params, tool_result, is_streaming, 
          tokens_used, metadata, parent_message_id, sequence_number, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          messageId,
          sessionId,
          message.type,
          message.role,
          message.content,
          message.contentType || 'text',
          message.toolName || null,
          message.toolParams ? JSON.stringify(message.toolParams) : null,
          message.toolResult ? JSON.stringify(message.toolResult) : null,
          message.isStreaming || false,
          message.tokensUsed || null,
          message.metadata ? JSON.stringify(message.metadata) : null,
          message.parentId || null,
          sequenceNumber
        ]
      );

      this.logger.debug('Logged message', { sessionId, messageId, type: message.type });
      return messageId;
    } catch (error) {
      this.logger.error('Failed to log message', error);
      throw error;
    }
  }

  /**
   * Store a streaming chunk
   */
  async storeChunk(
    messageId: string,
    chunkIndex: number,
    content: string,
    chunkType: string = 'text',
    metadata?: any
  ): Promise<void> {
    try {
      const chunkId = uuidv4();
      
      await this.dbClient.execute(
        `INSERT INTO streaming_chunks 
         (id, message_id, chunk_index, chunk_content, chunk_type, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          chunkId,
          messageId,
          chunkIndex,
          content,
          chunkType,
          metadata ? JSON.stringify(metadata) : null
        ]
      );

      this.logger.debug('Stored streaming chunk', { messageId, chunkIndex });
    } catch (error) {
      this.logger.error('Failed to store chunk', error);
      throw error;
    }
  }

  /**
   * Update a streaming message as complete
   */
  async finalizeStreamingMessage(
    messageId: string,
    fullContent: string,
    tokensUsed?: number
  ): Promise<void> {
    try {
      await this.dbClient.execute(
        `UPDATE conversation_messages 
         SET content = ?, stream_completed = TRUE, tokens_used = ?
         WHERE id = ?`,
        [fullContent, tokensUsed || null, messageId]
      );

      this.logger.debug('Finalized streaming message', { messageId });
    } catch (error) {
      this.logger.error('Failed to finalize message', error);
      throw error;
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    sessionId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<ConversationMessage[]> {
    try {
      const messages = await this.dbClient.query<any>(
        `SELECT 
          id, message_type as type, role, content, content_type as contentType,
          tool_name as toolName, tool_params as toolParams, tool_result as toolResult,
          is_streaming as isStreaming, tokens_used as tokensUsed,
          metadata, parent_message_id as parentId, sequence_number, created_at
         FROM conversation_messages
         WHERE session_id = ?
         ORDER BY sequence_number
         LIMIT ? OFFSET ?`,
        [sessionId, limit, offset]
      );

      return messages.map(msg => ({
        ...msg,
        toolParams: msg.toolParams ? JSON.parse(msg.toolParams) : null,
        toolResult: msg.toolResult ? JSON.parse(msg.toolResult) : null,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : null
      }));
    } catch (error) {
      this.logger.error('Failed to get conversation history', error);
      throw error;
    }
  }

  /**
   * Get user sessions
   */
  async getUserSessions(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<ConversationSession[]> {
    try {
      const sessions = await this.dbClient.query<any>(
        `SELECT 
          cs.id, cs.user_id as userId, cs.project_id as projectId,
          cs.task_id as taskId, cs.session_type as sessionType,
          cs.title, cs.status, cs.metadata,
          cs.started_at as startedAt, cs.ended_at as endedAt,
          COUNT(cm.id) as messageCount,
          MAX(cm.created_at) as lastMessageAt
         FROM conversation_sessions cs
         LEFT JOIN conversation_messages cm ON cs.id = cm.session_id
         WHERE cs.user_id = ?
         GROUP BY cs.id
         ORDER BY cs.started_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );

      return sessions.map(session => ({
        ...session,
        metadata: session.metadata ? JSON.parse(session.metadata) : null
      }));
    } catch (error) {
      this.logger.error('Failed to get user sessions', error);
      throw error;
    }
  }

  /**
   * Log an agent action
   */
  async logAgentAction(
    sessionId: string,
    messageId: string | null,
    actionType: string,
    actionName: string,
    actionParams?: any,
    status: string = 'pending'
  ): Promise<string> {
    try {
      const actionId = uuidv4();
      
      await this.dbClient.execute(
        `INSERT INTO agent_actions_log 
         (id, session_id, message_id, action_type, action_name, 
          action_params, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          actionId,
          sessionId,
          messageId,
          actionType,
          actionName,
          actionParams ? JSON.stringify(actionParams) : null,
          status
        ]
      );

      this.logger.debug('Logged agent action', { sessionId, actionId, actionType });
      return actionId;
    } catch (error) {
      this.logger.error('Failed to log agent action', error);
      throw error;
    }
  }

  /**
   * Update agent action status
   */
  async updateAgentAction(
    actionId: string,
    status: string,
    result?: any,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.dbClient.execute(
        `UPDATE agent_actions_log 
         SET status = ?, action_result = ?, error_message = ?, 
             completed_at = CASE WHEN ? IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE NULL END
         WHERE id = ?`,
        [
          status,
          result ? JSON.stringify(result) : null,
          errorMessage || null,
          status,
          actionId
        ]
      );

      this.logger.debug('Updated agent action', { actionId, status });
    } catch (error) {
      this.logger.error('Failed to update agent action', error);
      throw error;
    }
  }

  /**
   * Track WebSocket connection
   */
  async trackConnection(
    socketId: string,
    userId: string,
    sessionId: string | null,
    clientIp?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await this.dbClient.execute(
        `INSERT INTO websocket_connections 
         (socket_id, user_id, session_id, client_ip, user_agent, connected_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
         session_id = VALUES(session_id),
         last_activity_at = NOW()`,
        [socketId, userId, sessionId, clientIp || null, userAgent || null]
      );

      this.logger.debug('Tracked WebSocket connection', { socketId, userId });
    } catch (error) {
      this.logger.error('Failed to track connection', error);
      throw error;
    }
  }

  /**
   * Update connection activity
   */
  async updateConnectionActivity(
    socketId: string,
    messagesSent: number = 0,
    messagesReceived: number = 0
  ): Promise<void> {
    try {
      await this.dbClient.execute(
        `UPDATE websocket_connections 
         SET last_activity_at = NOW(),
             total_messages_sent = total_messages_sent + ?,
             total_messages_received = total_messages_received + ?
         WHERE socket_id = ?`,
        [messagesSent, messagesReceived, socketId]
      );
    } catch (error) {
      this.logger.error('Failed to update connection activity', error);
    }
  }

  /**
   * Mark connection as disconnected
   */
  async disconnectConnection(socketId: string): Promise<void> {
    try {
      await this.dbClient.execute(
        `UPDATE websocket_connections 
         SET disconnected_at = NOW()
         WHERE socket_id = ?`,
        [socketId]
      );

      this.logger.debug('Marked connection as disconnected', { socketId });
    } catch (error) {
      this.logger.error('Failed to disconnect connection', error);
    }
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(sessionId: string): Promise<any> {
    try {
      const analytics = await this.dbClient.queryOne<any>(
        `SELECT 
          COUNT(*) as total_messages,
          SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_messages,
          SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as agent_messages,
          SUM(CASE WHEN message_type = 'tool_call' THEN 1 ELSE 0 END) as tool_calls,
          SUM(CASE WHEN message_type = 'error' THEN 1 ELSE 0 END) as errors_count,
          SUM(tokens_used) as total_tokens_used,
          MIN(created_at) as first_message_at,
          MAX(created_at) as last_message_at
         FROM conversation_messages
         WHERE session_id = ?`,
        [sessionId]
      );

      const sessionInfo = await this.dbClient.queryOne<any>(
        `SELECT 
          started_at, ended_at,
          TIMESTAMPDIFF(SECOND, started_at, IFNULL(ended_at, NOW())) as duration_seconds
         FROM conversation_sessions
         WHERE id = ?`,
        [sessionId]
      );

      return {
        ...analytics,
        ...sessionInfo
      };
    } catch (error) {
      this.logger.error('Failed to get session analytics', error);
      throw error;
    }
  }

  /**
   * Clean up old sessions
   */
  async cleanupOldSessions(hoursInactive: number = 1): Promise<number> {
    try {
      // Mark inactive sessions as completed
      const result = await this.dbClient.execute(
        `UPDATE conversation_sessions 
         SET status = 'completed', ended_at = NOW()
         WHERE status = 'active' 
         AND NOT EXISTS (
           SELECT 1 FROM conversation_messages 
           WHERE session_id = conversation_sessions.id 
           AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
         )`,
        [hoursInactive]
      );

      const affectedRows = result.affectedRows;
      if (affectedRows > 0) {
        this.logger.info(`Cleaned up ${affectedRows} inactive sessions`);
      }

      return affectedRows;
    } catch (error) {
      this.logger.error('Failed to cleanup old sessions', error);
      throw error;
    }
  }
}

// Create singleton instance
let conversationLogger: ConversationLogger | null = null;

export function createConversationLogger(dbClient: JupiterDBClient): ConversationLogger {
  if (!conversationLogger) {
    conversationLogger = new ConversationLogger(dbClient);
  }
  return conversationLogger;
}

export function getConversationLogger(): ConversationLogger {
  if (!conversationLogger) {
    throw new Error('Conversation logger not initialized. Call createConversationLogger first.');
  }
  return conversationLogger;
}
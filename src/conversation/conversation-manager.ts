/**
 * Conversation Manager
 * Manages conversation history, resumption, and bookmarking
 */

import { EventEmitter } from 'eventemitter3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import {
  ConversationLog,
  ConversationState,
  ConversationMessage,
  ConversationContext,
  ConversationFilter,
  ConversationSummary,
  ConversationExport,
  ConversationEvents,
  ConversationStats,
  MessageRole,
  ResumeOptions,
  BookmarkMetadata,
  ConversationLogSchema
} from './types';

/**
 * Configuration for conversation manager
 */
export interface ConversationManagerConfig {
  storageDir?: string;
  maxConversations?: number;
  maxMessagesPerConversation?: number;
  autoSave?: boolean;
  saveInterval?: number;
  compressionEnabled?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<ConversationManagerConfig> = {
  storageDir: path.join(process.cwd(), '.jupiter', 'conversations'),
  maxConversations: 1000,
  maxMessagesPerConversation: 10000,
  autoSave: true,
  saveInterval: 60000, // 1 minute
  compressionEnabled: true
};

/**
 * Conversation manager implementation
 */
export class ConversationManager extends EventEmitter<ConversationEvents> {
  private config: Required<ConversationManagerConfig>;
  private activeConversations: Map<string, ConversationState> = new Map();
  private conversationLogs: Map<string, ConversationLog> = new Map();
  private bookmarks: Map<string, BookmarkMetadata> = new Map();
  private logger: Logger;
  private saveTimer?: NodeJS.Timeout;
  private isDirty: boolean = false;

  constructor(config?: ConversationManagerConfig) {
    super();
    this.logger = new Logger('ConversationManager');
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start auto-save if enabled
    if (this.config.autoSave) {
      this.startAutoSave();
    }
  }

  /**
   * Initialize conversation manager
   */
  async initialize(): Promise<void> {
    // Ensure storage directory exists
    await fs.mkdir(this.config.storageDir, { recursive: true });

    // Load existing conversations
    await this.loadConversations();
    await this.loadBookmarks();

    this.logger.info(`Initialized with ${this.conversationLogs.size} conversations`);
  }

  /**
   * Create a new conversation
   */
  createConversation(context?: Partial<ConversationContext>): ConversationState {
    const id = uuidv4();
    const sessionId = uuidv4();

    const conversation: ConversationState = {
      id,
      currentSessionId: sessionId,
      messages: [],
      context: {
        workingDirectory: context?.workingDirectory || process.cwd(),
        gitBranch: context?.gitBranch,
        environment: context?.environment,
        activeTools: context?.activeTools || [],
        customContext: context?.customContext
      },
      created: new Date(),
      lastActive: new Date(),
      isActive: true
    };

    this.activeConversations.set(id, conversation);
    this.emit('conversation:created', conversation);
    
    this.logger.info(`Created conversation: ${id}`);
    return conversation;
  }

  /**
   * Add message to conversation
   */
  addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: ConversationMessage['metadata']
  ): ConversationMessage {
    const conversation = this.activeConversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const message: ConversationMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date(),
      sessionId: conversation.currentSessionId,
      metadata
    };

    conversation.messages.push(message);
    conversation.lastActive = new Date();
    
    this.isDirty = true;
    this.emit('message:added', conversationId, message);
    this.emit('conversation:updated', conversation);

    // Check message limit
    if (conversation.messages.length > this.config.maxMessagesPerConversation) {
      this.logger.warn(`Conversation ${conversationId} exceeded message limit`);
      // Optionally truncate old messages
    }

    return message;
  }

  /**
   * End a conversation
   */
  async endConversation(conversationId: string): Promise<ConversationLog> {
    const conversation = this.activeConversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.isActive = false;

    // Create conversation log
    const log = await this.createConversationLog(conversation);
    
    // Store log
    this.conversationLogs.set(log.id, log);
    
    // Remove from active
    this.activeConversations.delete(conversationId);
    
    // Save immediately
    await this.saveConversation(log);
    
    this.emit('conversation:ended', conversationId);
    this.logger.info(`Ended conversation: ${conversationId}`);
    
    return log;
  }

  /**
   * Resume a conversation
   */
  async resumeConversation(options: ResumeOptions): Promise<ConversationState> {
    // Find conversation log by session ID
    let log: ConversationLog | undefined;
    
    for (const convLog of this.conversationLogs.values()) {
      if (convLog.messages.some(m => m.sessionId === options.sessionId)) {
        log = convLog;
        break;
      }
    }

    if (!log) {
      throw new Error(`Conversation not found for session: ${options.sessionId}`);
    }

    // Create new conversation state
    const conversation: ConversationState = {
      id: uuidv4(),
      currentSessionId: uuidv4(),
      messages: [],
      context: {
        workingDirectory: log.workingDirectory || process.cwd(),
        gitBranch: log.gitBranch,
        activeTools: log.metadata?.tools || []
      },
      created: new Date(),
      lastActive: new Date(),
      isActive: true
    };

    // Copy relevant messages
    if (options.includeContext !== false) {
      const messages = options.messageLimit ? 
        log.messages.slice(-options.messageLimit) : 
        log.messages;
      
      // Update session IDs for resumed messages
      conversation.messages = messages.map(msg => ({
        ...msg,
        sessionId: conversation.currentSessionId
      }));
    }

    this.activeConversations.set(conversation.id, conversation);
    this.emit('conversation:resumed', conversation);
    
    this.logger.info(`Resumed conversation from log: ${log.id}`);
    return conversation;
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(filter?: ConversationFilter): Promise<ConversationLog[]> {
    let logs = Array.from(this.conversationLogs.values());

    // Apply filters
    if (filter) {
      if (filter.bookmarked !== undefined) {
        logs = logs.filter(log => log.isBookmarked === filter.bookmarked);
      }

      if (filter.sidechain !== undefined) {
        logs = logs.filter(log => log.isSidechain === filter.sidechain);
      }

      if (filter.gitBranch) {
        logs = logs.filter(log => log.gitBranch === filter.gitBranch);
      }

      if (filter.tags && filter.tags.length > 0) {
        logs = logs.filter(log => 
          log.tags?.some(tag => filter.tags!.includes(tag))
        );
      }

      if (filter.startDate) {
        logs = logs.filter(log => log.created >= filter.startDate!);
      }

      if (filter.endDate) {
        logs = logs.filter(log => log.created <= filter.endDate!);
      }

      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        logs = logs.filter(log => 
          log.summary?.toLowerCase().includes(searchLower) ||
          log.firstPrompt.toLowerCase().includes(searchLower) ||
          log.messages.some(m => m.content.toLowerCase().includes(searchLower))
        );
      }
    }

    // Sort by modified date (newest first)
    logs.sort((a, b) => b.modified.getTime() - a.modified.getTime());

    // Apply pagination
    if (filter?.offset) {
      logs = logs.slice(filter.offset);
    }
    if (filter?.limit) {
      logs = logs.slice(0, filter.limit);
    }

    return logs;
  }

  /**
   * Bookmark a conversation
   */
  async bookmarkConversation(
    conversationId: string,
    metadata?: Partial<BookmarkMetadata>
  ): Promise<void> {
    const log = this.conversationLogs.get(conversationId);
    if (!log) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    log.isBookmarked = true;
    
    // Create bookmark metadata
    const bookmark: BookmarkMetadata = {
      id: uuidv4(),
      conversationId,
      title: metadata?.title,
      description: metadata?.description,
      created: new Date(),
      tags: metadata?.tags
    };

    this.bookmarks.set(conversationId, bookmark);
    this.isDirty = true;
    
    this.emit('conversation:bookmarked', conversationId);
    this.logger.info(`Bookmarked conversation: ${conversationId}`);
  }

  /**
   * Remove bookmark from conversation
   */
  async unbookmarkConversation(conversationId: string): Promise<void> {
    const log = this.conversationLogs.get(conversationId);
    if (!log) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    log.isBookmarked = false;
    this.bookmarks.delete(conversationId);
    this.isDirty = true;
    
    this.emit('conversation:unbookmarked', conversationId);
    this.logger.info(`Unbookmarked conversation: ${conversationId}`);
  }

  /**
   * Generate conversation summary
   */
  async generateSummary(conversationId: string): Promise<ConversationSummary> {
    const log = this.conversationLogs.get(conversationId);
    if (!log) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Extract key information
    const toolsUsed = new Set<string>();
    let totalTokens = 0;
    
    for (const msg of log.messages) {
      if (msg.metadata?.toolName) {
        toolsUsed.add(msg.metadata.toolName);
      }
      if (msg.metadata?.tokens) {
        totalTokens += msg.metadata.tokens;
      }
    }

    // Generate summary (in production, use AI)
    const summary: ConversationSummary = {
      id: conversationId,
      summary: log.summary || this.generateBasicSummary(log),
      keyTopics: this.extractKeyTopics(log),
      toolsUsed: Array.from(toolsUsed),
      messageCount: log.messageCount,
      duration: log.modified.getTime() - log.created.getTime(),
      created: log.created
    };

    // Update log with summary
    log.summary = summary.summary;
    log.metadata = {
      ...log.metadata,
      tools: summary.toolsUsed,
      totalTokens
    };

    this.isDirty = true;
    return summary;
  }

  /**
   * Export conversations
   */
  async exportConversations(filter?: ConversationFilter): Promise<ConversationExport> {
    const conversations = await this.getConversationHistory(filter);
    
    const exported: ConversationExport = {
      version: '1.0',
      exported: new Date(),
      conversations,
      metadata: {
        totalConversations: conversations.length,
        totalMessages: conversations.reduce((sum, conv) => sum + conv.messageCount, 0),
        dateRange: conversations.length > 0 ? {
          start: conversations[conversations.length - 1].created,
          end: conversations[0].created
        } : undefined
      }
    };

    this.emit('conversation:exported', conversations.length);
    return exported;
  }

  /**
   * Import conversations
   */
  async importConversations(data: ConversationExport): Promise<number> {
    let imported = 0;

    for (const conversation of data.conversations) {
      try {
        // Validate
        ConversationLogSchema.parse(conversation);
        
        // Check if already exists
        if (!this.conversationLogs.has(conversation.id)) {
          this.conversationLogs.set(conversation.id, conversation);
          imported++;
        }
      } catch (error) {
        this.logger.error(`Failed to import conversation ${conversation.id}`, error);
      }
    }

    if (imported > 0) {
      this.isDirty = true;
      await this.saveAllConversations();
    }

    this.logger.info(`Imported ${imported} conversations`);
    return imported;
  }

  /**
   * Get conversation statistics
   */
  async getStatistics(): Promise<ConversationStats> {
    const conversations = Array.from(this.conversationLogs.values());
    
    // Calculate tool usage
    const toolUsage = new Map<string, number>();
    let totalMessages = 0;
    let totalDuration = 0;
    
    for (const conv of conversations) {
      totalMessages += conv.messageCount;
      totalDuration += conv.modified.getTime() - conv.created.getTime();
      
      if (conv.metadata?.tools) {
        for (const tool of conv.metadata.tools) {
          toolUsage.set(tool, (toolUsage.get(tool) || 0) + 1);
        }
      }
    }

    // Calculate conversations by day
    const byDay = new Map<string, number>();
    for (const conv of conversations) {
      const day = conv.created.toISOString().split('T')[0];
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }

    const stats: ConversationStats = {
      totalConversations: conversations.length,
      totalMessages,
      bookmarkedCount: conversations.filter(c => c.isBookmarked).length,
      sidechainCount: conversations.filter(c => c.isSidechain).length,
      averageMessageCount: conversations.length > 0 ? totalMessages / conversations.length : 0,
      averageDuration: conversations.length > 0 ? totalDuration / conversations.length : 0,
      mostUsedTools: Array.from(toolUsage.entries())
        .map(([tool, count]) => ({ tool, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      conversationsByDay: Array.from(byDay.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))
    };

    return stats;
  }

  /**
   * Create conversation log from state
   */
  private async createConversationLog(state: ConversationState): Promise<ConversationLog> {
    const firstUserMessage = state.messages.find(m => m.role === MessageRole.User);
    
    const log: ConversationLog = {
      id: state.id,
      value: state.id, // Used for resuming
      created: state.created,
      modified: new Date(),
      messages: state.messages,
      messageCount: state.messages.length,
      summary: undefined, // Generated later if needed
      firstPrompt: firstUserMessage?.content || 'No user messages',
      gitBranch: state.context.gitBranch,
      workingDirectory: state.context.workingDirectory,
      isBookmarked: false,
      isSidechain: false, // Determine based on context
      tags: [],
      metadata: {
        tools: state.context.activeTools
      }
    };

    return log;
  }

  /**
   * Generate basic summary
   */
  private generateBasicSummary(log: ConversationLog): string {
    const toolCount = log.metadata?.tools?.length || 0;
    const duration = log.modified.getTime() - log.created.getTime();
    const durationMinutes = Math.round(duration / 60000);
    
    return `Conversation with ${log.messageCount} messages${
      toolCount > 0 ? ` using ${toolCount} tools` : ''
    } over ${durationMinutes} minutes`;
  }

  /**
   * Extract key topics from conversation
   */
  private extractKeyTopics(log: ConversationLog): string[] {
    // In production, use NLP or AI to extract topics
    const topics = new Set<string>();
    
    // Extract tool names as topics
    if (log.metadata?.tools) {
      log.metadata.tools.forEach(tool => topics.add(tool));
    }

    // Extract from first prompt (simplified)
    const words = log.firstPrompt.toLowerCase().split(/\s+/);
    const keywords = ['create', 'update', 'fix', 'build', 'test', 'deploy', 'review'];
    
    for (const word of words) {
      if (keywords.includes(word)) {
        topics.add(word);
      }
    }

    return Array.from(topics).slice(0, 5);
  }

  /**
   * Load conversations from disk
   */
  private async loadConversations(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.storageDir);
      const conversationFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of conversationFiles) {
        try {
          const data = await fs.readFile(
            path.join(this.config.storageDir, file),
            'utf-8'
          );
          
          const log = JSON.parse(data, (key, value) => {
            // Parse dates
            if (key === 'created' || key === 'modified' || key === 'timestamp') {
              return new Date(value);
            }
            return value;
          });
          
          // Validate
          ConversationLogSchema.parse(log);
          this.conversationLogs.set(log.id, log);
        } catch (error) {
          this.logger.error(`Failed to load conversation ${file}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load conversations', error);
    }
  }

  /**
   * Load bookmarks
   */
  private async loadBookmarks(): Promise<void> {
    try {
      const bookmarksFile = path.join(this.config.storageDir, 'bookmarks.json');
      const data = await fs.readFile(bookmarksFile, 'utf-8');
      const bookmarks = JSON.parse(data);
      
      for (const [id, bookmark] of Object.entries(bookmarks)) {
        this.bookmarks.set(id, bookmark as BookmarkMetadata);
      }
    } catch (error) {
      // Bookmarks file might not exist
      this.logger.debug('No bookmarks file found');
    }
  }

  /**
   * Save conversation to disk
   */
  private async saveConversation(log: ConversationLog): Promise<void> {
    const filename = `${log.id}.json`;
    const filepath = path.join(this.config.storageDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(log, null, 2));
  }

  /**
   * Save all conversations
   */
  private async saveAllConversations(): Promise<void> {
    // Save conversation logs
    for (const log of this.conversationLogs.values()) {
      await this.saveConversation(log);
    }

    // Save bookmarks
    const bookmarksFile = path.join(this.config.storageDir, 'bookmarks.json');
    const bookmarksData = Object.fromEntries(this.bookmarks.entries());
    await fs.writeFile(bookmarksFile, JSON.stringify(bookmarksData, null, 2));

    this.isDirty = false;
    this.logger.debug('Saved all conversations');
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    this.saveTimer = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.saveAllConversations();
        } catch (error) {
          this.logger.error('Auto-save failed', error);
        }
      }
    }, this.config.saveInterval);
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    // Stop auto-save
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }

    // Save any pending changes
    if (this.isDirty) {
      await this.saveAllConversations();
    }

    // Clear data
    this.activeConversations.clear();
    this.conversationLogs.clear();
    this.bookmarks.clear();
    this.removeAllListeners();
  }
}
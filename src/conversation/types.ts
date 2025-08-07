/**
 * Conversation Management Types
 * Types and interfaces for conversation history and management
 */

import { z } from 'zod';

/**
 * Message role in conversation
 */
export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
  Tool = 'tool'
}

/**
 * Conversation message
 */
export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  sessionId?: string;
  metadata?: {
    toolName?: string;
    toolResult?: any;
    error?: string;
    tokens?: number;
    model?: string;
  };
}

/**
 * Conversation log entry
 */
export interface ConversationLog {
  id: string;
  value: string; // Unique identifier for resuming
  created: Date;
  modified: Date;
  messages: ConversationMessage[];
  messageCount: number;
  summary?: string;
  firstPrompt: string;
  gitBranch?: string;
  workingDirectory?: string;
  isBookmarked: boolean;
  isSidechain: boolean;
  tags?: string[];
  metadata?: {
    model?: string;
    totalTokens?: number;
    duration?: number;
    tools?: string[];
  };
}

/**
 * Conversation state
 */
export interface ConversationState {
  id: string;
  currentSessionId: string;
  messages: ConversationMessage[];
  context: ConversationContext;
  created: Date;
  lastActive: Date;
  isActive: boolean;
}

/**
 * Conversation context
 */
export interface ConversationContext {
  workingDirectory: string;
  gitBranch?: string;
  environment?: Record<string, string>;
  activeTools?: string[];
  customContext?: Record<string, any>;
}

/**
 * Conversation filter options
 */
export interface ConversationFilter {
  bookmarked?: boolean;
  sidechain?: boolean;
  gitBranch?: string;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Conversation summary
 */
export interface ConversationSummary {
  id: string;
  summary: string;
  keyTopics: string[];
  toolsUsed: string[];
  messageCount: number;
  duration: number;
  created: Date;
}

/**
 * Conversation export format
 */
export interface ConversationExport {
  version: string;
  exported: Date;
  conversations: ConversationLog[];
  metadata?: {
    totalConversations: number;
    totalMessages: number;
    dateRange?: {
      start: Date;
      end: Date;
    };
  };
}

/**
 * Resume options
 */
export interface ResumeOptions {
  sessionId: string;
  messageLimit?: number;
  includeContext?: boolean;
  continueFromMessage?: string;
}

/**
 * Bookmark metadata
 */
export interface BookmarkMetadata {
  id: string;
  conversationId: string;
  title?: string;
  description?: string;
  created: Date;
  tags?: string[];
}

/**
 * Conversation schemas for validation
 */
export const ConversationMessageSchema = z.object({
  id: z.string(),
  role: z.nativeEnum(MessageRole),
  content: z.string(),
  timestamp: z.date(),
  sessionId: z.string().optional(),
  metadata: z.object({
    toolName: z.string().optional(),
    toolResult: z.any().optional(),
    error: z.string().optional(),
    tokens: z.number().optional(),
    model: z.string().optional()
  }).optional()
});

export const ConversationLogSchema = z.object({
  id: z.string(),
  value: z.string(),
  created: z.date(),
  modified: z.date(),
  messages: z.array(ConversationMessageSchema),
  messageCount: z.number(),
  summary: z.string().optional(),
  firstPrompt: z.string(),
  gitBranch: z.string().optional(),
  workingDirectory: z.string().optional(),
  isBookmarked: z.boolean(),
  isSidechain: z.boolean(),
  tags: z.array(z.string()).optional(),
  metadata: z.object({
    model: z.string().optional(),
    totalTokens: z.number().optional(),
    duration: z.number().optional(),
    tools: z.array(z.string()).optional()
  }).optional()
});

/**
 * Conversation events
 */
export interface ConversationEvents {
  'conversation:created': (conversation: ConversationState) => void;
  'conversation:updated': (conversation: ConversationState) => void;
  'conversation:ended': (conversationId: string) => void;
  'conversation:resumed': (conversation: ConversationState) => void;
  'message:added': (conversationId: string, message: ConversationMessage) => void;
  'conversation:bookmarked': (conversationId: string) => void;
  'conversation:unbookmarked': (conversationId: string) => void;
  'conversation:exported': (count: number) => void;
}

/**
 * Conversation statistics
 */
export interface ConversationStats {
  totalConversations: number;
  totalMessages: number;
  bookmarkedCount: number;
  sidechainCount: number;
  averageMessageCount: number;
  averageDuration: number;
  mostUsedTools: Array<{ tool: string; count: number }>;
  conversationsByDay: Array<{ date: string; count: number }>;
}
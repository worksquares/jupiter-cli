/**
 * Background Shell Management Types
 * Types and interfaces for managing background bash shells
 */

import { EventEmitter } from 'eventemitter3';
import { ChildProcess } from 'child_process';

/**
 * Shell status
 */
export enum ShellStatus {
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Killed = 'killed'
}

/**
 * Background shell configuration
 */
export interface BackgroundShellConfig {
  id: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  maxOutputSize?: number;
}

/**
 * Background shell instance
 */
export interface BackgroundShell {
  id: string;
  command: string;
  status: ShellStatus;
  process?: ChildProcess;
  pid?: number;
  stdout: string;
  stderr: string;
  exitCode?: number;
  startTime: Date;
  endTime?: Date;
  runtime: number; // in milliseconds
  eventEmitter: EventEmitter;
}

/**
 * Shell execution result
 */
export interface ShellExecutionResult {
  id: string;
  success: boolean;
  exitCode?: number;
  stdout: string;
  stderr: string;
  runtime: number;
  killed: boolean;
}

/**
 * Shell output chunk
 */
export interface ShellOutputChunk {
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: Date;
}

/**
 * Shell event types
 */
export enum ShellEventType {
  Started = 'started',
  Output = 'output',
  Error = 'error',
  Completed = 'completed',
  Killed = 'killed'
}

/**
 * Shell event data
 */
export interface ShellEvent {
  type: ShellEventType;
  shellId: string;
  data?: any;
  timestamp: Date;
}

/**
 * Shell manager configuration
 */
export interface ShellManagerConfig {
  maxConcurrentShells?: number;
  defaultTimeout?: number;
  maxOutputSize?: number;
  cleanupInterval?: number;
  persistShells?: boolean;
  shellHistoryLimit?: number;
}

/**
 * Shell list item for display
 */
export interface ShellListItem {
  id: string;
  command: string;
  status: ShellStatus;
  runtime: number;
  startTime: Date;
  exitCode?: number;
}
/**
 * Tool Adapters Index - Exports all tool adapters
 */

export { default as readAdapter } from './read-adapter';
export { default as writeAdapter } from './write-adapter';
export { default as editAdapter } from './edit-adapter';
export { default as multiEditAdapter } from './multiedit-adapter';
export { default as grepAdapter } from './grep-adapter';
export { default as globAdapter } from './glob-adapter';
export { default as bashAdapter } from './bash-adapter';
export { default as lsAdapter } from './ls-adapter';
export { default as taskAdapter } from './task-adapter';
export { default as webSearchAdapter } from './websearch-adapter';
export { WebFetchAdapter as webFetchAdapter } from './webfetch-adapter';
export { default as todoWriteAdapter } from './todowrite-adapter';
export { default as exitPlanModeAdapter } from './exitplanmode-adapter';
export { default as notebookReadAdapter } from './notebookread-adapter';
export { default as notebookEditAdapter } from './notebookedit-adapter';
export { default as codegenAdapter } from './codegen-adapter';

// Import all adapters
import readAdapter from './read-adapter';
import writeAdapter from './write-adapter';
import editAdapter from './edit-adapter';
import multiEditAdapter from './multiedit-adapter';
import grepAdapter from './grep-adapter';
import globAdapter from './glob-adapter';
import bashAdapter from './bash-adapter';
import lsAdapter from './ls-adapter';
import taskAdapter from './task-adapter';
import webSearchAdapter from './websearch-adapter';
import { WebFetchAdapter } from './webfetch-adapter';
import todoWriteAdapter from './todowrite-adapter';
import exitPlanModeAdapter from './exitplanmode-adapter';
import notebookReadAdapter from './notebookread-adapter';
import notebookEditAdapter from './notebookedit-adapter';
import codegenAdapter from './codegen-adapter';

// Export as array for easy registration
export const allAdapters = [
  readAdapter,
  writeAdapter,
  editAdapter,
  multiEditAdapter,
  grepAdapter,
  globAdapter,
  bashAdapter,
  lsAdapter,
  taskAdapter,
  webSearchAdapter,
  new WebFetchAdapter(),
  todoWriteAdapter,
  exitPlanModeAdapter,
  notebookReadAdapter,
  notebookEditAdapter,
  codegenAdapter
];
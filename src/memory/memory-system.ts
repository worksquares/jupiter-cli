/**
 * Unified Memory System - Manages all memory types for the agent
 */

import { Memory, MemoryType } from '../core/unified-types';
import { v4 as uuidv4 } from 'uuid';
import { LRUCache } from 'lru-cache';
import {
  MemoryInterface,
  MemoryQuery,
  MemoryStatistics,
  MemoryConfig,
  RetentionType
} from '../core/types';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'eventemitter3';
import { Mutex, withMutex } from '../utils/mutex';

interface MemoryStore {
  memories: Map<string, Memory>;
  index: MemoryIndex;
  cache: LRUCache<string, Memory>;
}

interface MemoryIndex {
  byType: Map<MemoryType, Set<string>>;
  byImportance: Map<number, Set<string>>;
  byKeyword: Map<string, Set<string>>;
  byAssociation: Map<string, Set<string>>;
}

export class MemorySystem implements MemoryInterface {
  private stores: Map<MemoryType, MemoryStore>;
  private globalIndex: Map<string, MemoryType>;
  private config: MemoryConfig;
  private logger: Logger;
  private eventBus: EventEmitter;
  private consolidationTimer?: NodeJS.Timer;
  private memoryMutex: Mutex;
  private statistics: MemoryStatistics;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.stores = new Map();
    this.globalIndex = new Map();
    this.logger = new Logger('MemorySystem');
    this.eventBus = new EventEmitter();
    this.memoryMutex = new Mutex();
    
    this.statistics = {
      totalMemories: 0,
      byType: {},
      totalAccessCount: 0,
      averageImportance: 0
    };

    this.initializeStores();
    this.startConsolidation();
  }

  /**
   * Store a memory
   */
  @withMutex('memoryMutex')
  async store(memory: Memory): Promise<void> {
    // Validate memory
    if (!memory.id) {
      memory.id = uuidv4();
    }

    // Get or create store for memory type
    const store = this.getStore(memory.type);
    
    // Store memory
    store.memories.set(memory.id, memory);
    this.globalIndex.set(memory.id, memory.type);
    
    // Update indices
    this.updateIndices(store, memory);
    
    // Update cache
    store.cache.set(memory.id, memory);
    
    // Update statistics
    this.updateStatistics('add', memory);
    
    // Emit event
    this.eventBus.emit('memory:stored', memory);
    
    this.logger.debug(`Stored memory: ${memory.id} of type ${memory.type}`);
  }

  /**
   * Update a memory
   */
  async update(_id: string, updates: Partial<Memory>): Promise<void> {
    const memoryType = this.globalIndex.get(_id);
    if (!memoryType) {
      throw new Error(`Memory not found: ${_id}`);
    }

    const store = this.getStore(memoryType);
    const memory = store.memories.get(_id);
    
    if (!memory) {
      throw new Error(`Memory not found: ${_id}`);
    }
    
    // Remove from indices before update
    this.removeFromIndices(store, memory);
    
    // Update the memory
    Object.assign(memory, updates, {
      updatedAt: new Date(),
      lastAccessed: new Date()
    });
    
    // Re-add to indices with updated values
    this.updateIndices(store, memory);
    
    // Update cache
    store.cache.set(_id, memory);
    
    // Emit event
    this.eventBus.emit('memory:updated', memory);
    
    this.logger.debug(`Updated memory: ${_id}`);
  }

  /**
   * Retrieve memories based on query
   */
  async retrieve(query: MemoryQuery): Promise<Memory[]> {
    const results: Memory[] = [];
    const limit = query.limit || 10;

    // Determine which stores to search
    const storesToSearch = query.type 
      ? [this.getStore(query.type)]
      : Array.from(this.stores.values());

    for (const store of storesToSearch) {
      // Check cache first for recent memories
      const cacheHits = this.searchCache(store, query);
      results.push(...cacheHits);

      // Search main store if needed
      if (results.length < limit) {
        const storeHits = this.searchStore(store, query, limit - results.length);
        results.push(...storeHits);
      }
    }

    // Sort by relevance
    const sorted = this.sortByRelevance(results, query);
    
    // Update access counts
    for (const memory of sorted.slice(0, limit)) {
      memory.accessCount++;
      memory.lastAccessed = new Date();
    }

    return sorted.slice(0, limit);
  }

  /**
   * Query memories - alias for retrieve
   */
  async query(query: MemoryQuery): Promise<Memory[]> {
    return this.retrieve(query);
  }

  /**
   * Delete a memory
   */
  @withMutex('memoryMutex')
  async delete(_id: string): Promise<void> {
    const memoryType = this.globalIndex.get(_id);
    if (!memoryType) {
      this.logger.warn(`Memory not found: ${_id}`);
      return;
    }

    const store = this.getStore(memoryType);
    const memory = store.memories.get(_id);
    
    if (memory) {
      // Remove from store
      store.memories.delete(_id);
      this.globalIndex.delete(_id);
      
      // Remove from indices
      this.removeFromIndices(store, memory);
      
      // Remove from cache
      store.cache.delete(_id);
      
      // Update statistics
      this.updateStatistics('remove', memory);
      
      // Emit event
      this.eventBus.emit('memory:deleted', memory);
      
      this.logger.debug(`Deleted memory: ${_id}`);
    }
  }

  /**
   * Consolidate memories
   */
  async consolidate(): Promise<void> {
    this.logger.info('Starting memory consolidation...');
    
    const release = await this.memoryMutex.acquire();
    try {
      for (const [type, store] of this.stores) {
        await this.consolidateStore(type, store);
      }
      
      // Consolidation completed
      this.eventBus.emit('memory:consolidated');
      
      this.logger.info('Memory consolidation complete');
    } finally {
      release();
    }
  }

  /**
   * Get memory statistics
   */
  async getStatistics(): Promise<MemoryStatistics> {
    return { ...this.statistics };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer as any);
    }
    this.eventBus.removeAllListeners();
    this.stores.clear();
    this.globalIndex.clear();
  }

  /**
   * Private methods
   */
  private initializeStores(): void {
    // Initialize a store for each memory type
    Object.values(MemoryType).forEach(type => {
      this.stores.set(type, {
        memories: new Map(),
        index: {
          byType: new Map([[type, new Set()]]),
          byImportance: new Map(),
          byKeyword: new Map(),
          byAssociation: new Map()
        },
        cache: new LRUCache<string, Memory>({
          max: 100, // Default cache size
          ttl: 1000 * 60 * 5 // 5 minutes
        })
      });
      
      this.statistics.byType[type] = 0;
    });
  }

  private getStore(_type: MemoryType): MemoryStore {
    const store = this.stores.get(_type);
    if (!store) {
      throw new Error(`Unknown memory type: ${_type}`);
    }
    return store;
  }

  private updateIndices(store: MemoryStore, memory: Memory): void {
    // By type
    const typeSet = store.index.byType.get(memory.type) || new Set();
    typeSet.add(memory.id);
    store.index.byType.set(memory.type, typeSet);

    // By importance
    const importanceKey = Math.round(memory.importance * 10) / 10;
    const importanceSet = store.index.byImportance.get(importanceKey) || new Set();
    importanceSet.add(memory.id);
    store.index.byImportance.set(importanceKey, importanceSet);

    // By keywords (extract from content)
    const keywords = this.extractKeywords(memory);
    keywords.forEach(keyword => {
      const keywordSet = store.index.byKeyword.get(keyword) || new Set();
      keywordSet.add(memory.id);
      store.index.byKeyword.set(keyword, keywordSet);
    });

    // By associations
    memory.associations.forEach(assoc => {
      const assocSet = store.index.byAssociation.get(assoc) || new Set();
      assocSet.add(memory.id);
      store.index.byAssociation.set(assoc, assocSet);
    });
  }

  private removeFromIndices(store: MemoryStore, memory: Memory): void {
    // Remove from all indices
    store.index.byType.get(memory.type)?.delete(memory.id);
    
    const importanceKey = Math.round(memory.importance * 10) / 10;
    store.index.byImportance.get(importanceKey)?.delete(memory.id);
    
    const keywords = this.extractKeywords(memory);
    keywords.forEach(keyword => {
      store.index.byKeyword.get(keyword)?.delete(memory.id);
    });
    
    memory.associations.forEach(assoc => {
      store.index.byAssociation.get(assoc)?.delete(memory.id);
    });
  }

  private searchCache(store: MemoryStore, query: MemoryQuery): Memory[] {
    const results: Memory[] = [];
    
    // Get all cache entries
    store.cache.forEach((memory, id) => {
      if (this.matchesQuery(memory, query)) {
        results.push(memory);
      }
    });
    
    return results;
  }

  private searchStore(store: MemoryStore, query: MemoryQuery, limit: number): Memory[] {
    const results: Memory[] = [];
    const candidates = new Set<string>();

    // Search by keywords
    if (query.keywords && query.keywords.length > 0) {
      query.keywords.forEach(keyword => {
        const matches = store.index.byKeyword.get(keyword.toLowerCase());
        if (matches) {
          matches.forEach(id => candidates.add(id));
        }
      });
    } else {
      // No keywords, search all
      store.memories.forEach((_, id) => candidates.add(id));
    }

    // Filter candidates
    for (const id of candidates) {
      const memory = store.memories.get(id);
      if (memory && this.matchesQuery(memory, query)) {
        results.push(memory);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  private matchesQuery(memory: Memory, query: MemoryQuery): boolean {
    // Type filter
    if (query.type && memory.type !== query.type) {
      return false;
    }

    // Time range filter
    if (query.startDate || query.endDate) {
      const memTime = memory.timestamp.getTime();
      if (query.startDate && memTime < query.startDate.getTime()) {
        return false;
      }
      if (query.endDate && memTime > query.endDate.getTime()) {
        return false;
      }
    }

    // Importance filter
    if (query.minImportance !== undefined && memory.importance < query.minImportance) {
      return false;
    }

    return true;
  }

  private sortByRelevance(memories: Memory[], query: MemoryQuery): Memory[] {
    return memories.sort((a, b) => {
      // Primary: importance
      let scoreA = a.importance;
      let scoreB = b.importance;

      // Bonus for keyword matches
      if (query.keywords) {
        const keywordsA = this.extractKeywords(a);
        const keywordsB = this.extractKeywords(b);
        
        query.keywords.forEach(keyword => {
          if (keywordsA.includes(keyword.toLowerCase())) scoreA += 0.1;
          if (keywordsB.includes(keyword.toLowerCase())) scoreB += 0.1;
        });
      }

      // Bonus for recent access
      const now = Date.now();
      const ageA = a.lastAccessed ? now - a.lastAccessed.getTime() : Infinity;
      const ageB = b.lastAccessed ? now - b.lastAccessed.getTime() : Infinity;
      scoreA += Math.max(0, 1 - ageA / (1000 * 60 * 60 * 24)); // Decay over 24h
      scoreB += Math.max(0, 1 - ageB / (1000 * 60 * 60 * 24));

      return scoreB - scoreA;
    });
  }

  private async consolidateStore(type: MemoryType, store: MemoryStore): Promise<void> {
    const memories = Array.from(store.memories.values());
    const toRemove: string[] = [];

    // Apply retention policy
    for (const memory of memories) {
      if (this.shouldRemove(memory)) {
        toRemove.push(memory.id);
      }
    }

    // Remove memories
    for (const id of toRemove) {
      await this.delete(id);
    }

    // Merge similar memories if needed
    if (memories.length > this.config.maxMemories * 0.8) {
      await this.mergeSimilarMemories(type, store);
    }

    this.logger.info(`Consolidated ${type}: removed ${toRemove.length} memories`);
  }

  private shouldRemove(memory: Memory): boolean {
    const policy = this.config.retentionPolicy;
    
    if (!policy) {
      return false;
    }
    
    switch (policy.type) {
      case RetentionType.TIME_BASED:
        const age = Date.now() - memory.timestamp.getTime();
        return age > (policy.duration || 7 * 24 * 60 * 60 * 1000);
        
      case RetentionType.COUNT_BASED:
        // Handled at store level
        return false;
        
      case RetentionType.IMPORTANCE_BASED:
        return memory.importance < (policy.importanceThreshold || 0.3);
        
      case RetentionType.HYBRID:
        const isOld = Date.now() - memory.timestamp.getTime() > (policy.duration || 7 * 24 * 60 * 60 * 1000);
        const isUnimportant = memory.importance < (policy.importanceThreshold || 0.3);
        const isUnaccessed = memory.accessCount === 0;
        return (isOld && isUnimportant) || (isOld && isUnaccessed);
        
      default:
        return false;
    }
  }

  private async mergeSimilarMemories(_type: MemoryType, store: MemoryStore): Promise<void> {
    // Simple similarity based on keywords
    const groups = new Map<string, Memory[]>();
    
    store.memories.forEach(memory => {
      const key = this.extractKeywords(memory).slice(0, 3).join('-');
      const group = groups.get(key) || [];
      group.push(memory);
      groups.set(key, group);
    });

    // Merge groups with multiple memories
    for (const [_key, group] of groups) {
      if (group.length > 2) {
        const merged = this.mergeMemories(group);
        // Remove old memories
        for (const mem of group) {
          await this.delete(mem.id);
        }
        // Store merged memory
        await this.store(merged);
      }
    }
  }

  private mergeMemories(memories: Memory[]): Memory {
    // Sort by importance and recency
    memories.sort((a, b) => {
      const scoreA = a.importance + (a.lastAccessed ? (1 / (Date.now() - a.lastAccessed.getTime())) : 0);
      const scoreB = b.importance + (b.lastAccessed ? (1 / (Date.now() - b.lastAccessed.getTime())) : 0);
      return scoreB - scoreA;
    });

    const primary = memories[0];
    const associations = new Set<string>();
    let totalAccessCount = 0;
    let maxImportance = 0;

    // Merge properties
    for (const mem of memories) {
      mem.associations.forEach(a => associations.add(a));
      totalAccessCount += mem.accessCount;
      maxImportance = Math.max(maxImportance, mem.importance);
    }

    return {
      ...primary,
      id: uuidv4(),
      associations: Array.from(associations),
      accessCount: totalAccessCount,
      importance: maxImportance,
      metadata: {
        ...primary.metadata,
        merged: true,
        mergedCount: memories.length,
        mergedIds: memories.map(m => m.id)
      }
    };
  }

  private extractKeywords(memory: Memory): string[] {
    // Simple keyword extraction from content
    let text = '';
    
    if (typeof memory.content === 'string') {
      text = memory.content;
    } else if (memory.content && typeof memory.content === 'object') {
      text = JSON.stringify(memory.content);
    }

    const words = text.toLowerCase().split(/\W+/);
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was'
    ]);

    return words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 10);
  }

  private updateStatistics(action: 'add' | 'remove', memory: Memory): void {
    if (action === 'add') {
      this.statistics.totalMemories++;
      this.statistics.byType[memory.type] = (this.statistics.byType[memory.type] || 0) + 1;
    } else {
      this.statistics.totalMemories--;
      this.statistics.byType[memory.type] = Math.max(0, (this.statistics.byType[memory.type] || 0) - 1);
    }

    // Update averages
    if (this.statistics.totalMemories > 0) {
      let totalAccess = 0;
      let totalImportance = 0;
      
      this.stores.forEach(store => {
        store.memories.forEach(mem => {
          totalAccess += mem.accessCount;
          totalImportance += mem.importance;
        });
      });

      this.statistics.totalAccessCount = totalAccess;
      this.statistics.averageImportance = totalImportance / this.statistics.totalMemories;
    }
  }

  private startConsolidation(): void {
    if (this.config.consolidationInterval > 0) {
      this.consolidationTimer = setInterval(
        () => this.consolidate(),
        this.config.consolidationInterval
      );
    }
  }
}

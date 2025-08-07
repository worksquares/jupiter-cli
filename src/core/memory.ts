import { Memory as MemoryType } from '../types';
import { MemorySystem } from '../memory/memory-system';

export class Memory {
  private memories: Map<string, MemoryType> = new Map();
  
  constructor(_memorySystem: MemorySystem) {
    // memorySystem parameter kept for future use
  }
  
  async storeMemory(memory: MemoryType): Promise<void> {
    this.memories.set(memory.id, memory);
    // Also store in unified memory if needed
  }
  
  async retrieveMemory(id: string): Promise<MemoryType | undefined> {
    return this.memories.get(id);
  }
  
  async searchMemories(query: string): Promise<MemoryType[]> {
    const results: MemoryType[] = [];
    
    for (const memory of this.memories.values()) {
      // Simple text search
      const content = JSON.stringify(memory.content).toLowerCase();
      if (content.includes(query.toLowerCase())) {
        results.push(memory);
      }
    }
    
    return results;
  }
  
  async getRecentMemories(limit: number = 10): Promise<MemoryType[]> {
    const sorted = Array.from(this.memories.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return sorted.slice(0, limit);
  }
  
  async clearMemories(): Promise<void> {
    this.memories.clear();
  }
}
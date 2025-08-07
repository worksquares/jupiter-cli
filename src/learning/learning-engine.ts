/**
 * Learning Engine - Manages learning and pattern recognition
 */

import {
  LearningEvent,
  MemoryType,
  Pattern,
  PatternType,
  Trigger,
  TriggerType,
  ActionType,
  Feedback,
  LearningEventType,
  LearningConfig
} from '../core/unified-types';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentInterface,
  Action
} from '../core/types';
import { Logger } from '../utils/logger';

interface LearnedPattern {
  pattern: Pattern;
  occurrences: number;
  successRate: number;
  lastUsed: Date;
  contexts: Map<string, number>;
}

interface LearningModel {
  patterns: Map<string, LearnedPattern>;
  associations: Map<string, Set<string>>;
  weights: Map<string, number>;
  biases: Map<string, number>;
  patternPerformance: Map<string, { successRate: number; count: number }>;
}

interface ReinforcementData {
  actionId: string;
  reward: number;
  context: any;
  timestamp: Date;
}

export class LearningEngine {
  private agent: AgentInterface;
  private config: LearningConfig;
  private logger: Logger;
  private model: LearningModel;
  private eventHistory: LearningEvent[];
  private reinforcementBuffer: Map<string, ReinforcementData>;

  constructor(agent: AgentInterface, config: LearningConfig) {
    this.agent = agent;
    this.config = config;
    this.logger = new Logger('LearningEngine');
    
    this.model = {
      patterns: new Map(),
      associations: new Map(),
      weights: new Map(),
      biases: new Map(),
      patternPerformance: new Map()
    };

    this.eventHistory = [];
    this.reinforcementBuffer = new Map();
  }

  async initialize(): Promise<void> {
    this.logger.info('LearningEngine initialized');
    
    // Load existing patterns from memory
    await this.loadPatternsFromMemory();
    
    // Start periodic evaluation
    if (this.config.evaluationInterval && this.config.evaluationInterval > 0) {
      setInterval(() => this.evaluateAndOptimize(), this.config.evaluationInterval);
    }
  }

  /**
   * Process a learning event
   */
  async process(event: LearningEvent): Promise<void> {
    if (!this.config.enabled) return;

    this.logger.debug(`Processing learning event: ${event.type}`);
    
    // Store event
    this.eventHistory.push(event);
    if (this.eventHistory.length > 1000) {
      this.eventHistory.shift();
    }

    // Process based on event type
    switch (event.type) {
      case LearningEventType.TASK_EXECUTION:
        await this.learnFromExecution(event);
        break;
      
      case LearningEventType.ERROR_RECOVERY:
        await this.learnFromErrorRecovery(event);
        break;
      
      case LearningEventType.PATTERN_RECOGNITION:
        await this.learnFromPatternRecognition(event);
        break;
      
      case LearningEventType.FEEDBACK_INTEGRATION:
        await this.learnFromFeedback(event);
        break;
    }

    // Update model if threshold reached
    if (this.shouldUpdateModel()) {
      await this.updateModel();
    }
  }

  /**
   * Apply learning to improve performance
   */
  async apply(context: any): Promise<any> {
    // Find applicable patterns
    const patterns = await this.findApplicablePatterns(context);
    
    // Apply pattern-based improvements
    const improvements = [];
    for (const pattern of patterns) {
      const improvement = await this.applyPattern(pattern, context);
      if (improvement) {
        improvements.push(improvement);
      }
    }
    
    return improvements;
  }

  /**
   * Provide feedback for reinforcement learning
   */
  async reinforce(actionId: string, reward: number, context?: any): Promise<void> {
    this.reinforcementBuffer.set(actionId, {
      actionId,
      reward,
      context,
      timestamp: new Date()
    });
    
    // Process reinforcement if buffer is full
    if (this.reinforcementBuffer.size >= 10) {
      await this.processReinforcement();
    }
  }

  /**
   * Get learning insights
   */
  async getInsights(): Promise<LearningInsights> {
    const patterns = Array.from(this.model.patterns.values())
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 10);
    
    const associations = this.findStrongAssociations();
    const improvements = await this.identifyImprovementAreas();
    
    return {
      topPatterns: patterns.map(p => ({
        pattern: p.pattern,
        successRate: p.successRate,
        usage: p.occurrences
      })),
      associations,
      improvements,
      modelMetrics: {
        totalPatterns: this.model.patterns.size,
        averageSuccessRate: this.calculateAverageSuccessRate(),
        learningRate: this.config.learningRate
      },
      totalPatterns: this.model.patterns.size
    };
  }

  /**
   * Private methods
   */
  private async loadPatternsFromMemory(): Promise<void> {
    const memories = await this.agent.memory.retrieve({
      type: MemoryType.PROCEDURAL,
      limit: 100
    });
    
    for (const memory of memories) {
      if (memory.content?.pattern) {
        const pattern = memory.content.pattern as Pattern;
        this.model.patterns.set(pattern.id, {
          pattern,
          occurrences: memory.accessCount || 0,
          successRate: memory.importance || 0.5,
          lastUsed: memory.lastAccessed,
          contexts: new Map()
        });
      }
    }
    
    this.logger.info(`Loaded ${this.model.patterns.size} patterns from memory`);
  }

  private async learnFromExecution(event: LearningEvent): Promise<void> {
    const { input, output, outcome } = event;
    
    // Extract patterns from successful executions
    if (outcome && outcome.success && outcome.confidence > this.config.minConfidence) {
      const pattern = await this.extractPattern(input, output, outcome);
      if (pattern) {
        await this.addPattern(pattern);
      }
    }
    
    // Update weights based on outcome
    await this.updateWeights(input, output, outcome);
  }

  private async learnFromErrorRecovery(event: LearningEvent): Promise<void> {
    // For error recovery, the data structure is different
    const data = event.data || {};
    const error = data.error || {};
    
    // Learn error patterns
    const errorPattern: Pattern = {
      id: uuidv4(),
      name: `error-recovery-${Date.now()}`,
      type: PatternType.ERROR_PATTERN,
      trigger: {
        type: TriggerType.EVENT,
        condition: error.message || error.errorMessage || 'Unknown error'
      },
      action: {
        type: ActionType.PROCESS_DATA,
        parameters: { recovery: data.recovery || {} }
      },
      confidence: event.success ? 0.8 : 0.2,
      frequency: 1,
      lastOccurred: new Date(),
      examples: []
    };
    
    await this.addPattern(errorPattern);
  }

  private async learnFromPatternRecognition(event: LearningEvent): Promise<void> {
    const { input, output } = event;
    
    // Strengthen recognized patterns
    if (output?.patternId) {
      const learned = this.model.patterns.get(output.patternId);
      if (learned) {
        learned.occurrences++;
        learned.lastUsed = new Date();
        
        // Update context frequency
        const contextKey = JSON.stringify(input?.context || {});
        const contextCount = learned.contexts.get(contextKey) || 0;
        learned.contexts.set(contextKey, contextCount + 1);
      }
    }
  }

  private async learnFromFeedback(event: LearningEvent): Promise<void> {
    const feedback = event.feedback as Feedback;
    if (!feedback) return;
    
    // Adjust pattern confidence based on feedback
    const targetId = (feedback as any).targetId;
    if (targetId) {
      const learned = this.model.patterns.get(targetId);
      if (learned) {
        const adjustment = (feedback as any).value * this.config.learningRate;
        learned.successRate = Math.max(0, Math.min(1, learned.successRate + adjustment));
      }
    }
    
    // Store feedback for future learning
    await this.storeFeedback(feedback);
  }

  private async extractPattern(
    input: any,
    output: any,
    outcome: any
  ): Promise<Pattern | null> {
    // Simple pattern extraction - can be made more sophisticated
    let trigger: Trigger | undefined = undefined;
    
    // Extract triggers from input
    if (input?.keywords && input.keywords.length > 0) {
      trigger = {
        type: TriggerType.PATTERN,
        condition: input.keywords[0]
      };
    }
    
    if (!trigger) return null;
    
    // Create pattern
    const pattern: Pattern = {
      id: uuidv4(),
      name: `learned-${Date.now()}`,
      type: PatternType.BEHAVIORAL,
      trigger,
      action: {
        type: ActionType.PROCESS_DATA,
        parameters: output
      },
      confidence: outcome.confidence,
      frequency: 1,
      lastOccurred: new Date(),
      examples: []
    };
    
    return pattern;
  }

  private async addPattern(pattern: Pattern): Promise<void> {
    const existing = this.model.patterns.get(pattern.id);
    
    if (existing) {
      // Update existing pattern
      existing.occurrences++;
      existing.lastUsed = new Date();
      existing.pattern.confidence = 
        (existing.pattern.confidence + pattern.confidence) / 2;
    } else {
      // Add new pattern
      this.model.patterns.set(pattern.id, {
        pattern,
        occurrences: 1,
        successRate: pattern.confidence,
        lastUsed: new Date(),
        contexts: new Map()
      });
      
      // Store in memory
      await this.storePattern(pattern);
    }
  }

  private async storePattern(pattern: Pattern): Promise<void> {
    await this.agent.memory.store({
      id: pattern.id,
      type: MemoryType.PROCEDURAL,
      content: { pattern },
      importance: pattern.confidence,
      associations: [],
      timestamp: new Date(),
      accessCount: 0,
      lastAccessed: new Date()
    });
  }

  private async updateWeights(input: any, _output: any, outcome: any): Promise<void> {
    if (!outcome) return;
    
    // Simple weight update based on outcome
    const features = this.extractFeatures(input);
    
    for (const feature of features) {
      const currentWeight = this.model.weights.get(feature) || 0.5;
      const adjustment = outcome.success 
        ? this.config.learningRate 
        : -this.config.learningRate;
      
      const newWeight = Math.max(0, Math.min(1, currentWeight + adjustment));
      this.model.weights.set(feature, newWeight);
    }
  }

  private extractFeatures(input: any): string[] {
    const features: string[] = [];
    
    // Extract simple features
    if (input?.type) features.push(`type:${input.type}`);
    if (input?.category) features.push(`category:${input.category}`);
    if (input?.tool) features.push(`tool:${input.tool}`);
    
    // Extract keywords as features
    if (input?.keywords) {
      for (const keyword of input.keywords.slice(0, 5)) {
        features.push(`keyword:${keyword}`);
      }
    }
    
    return features;
  }

  private shouldUpdateModel(): boolean {
    // Update model based on various criteria
    const eventsSinceUpdate = this.eventHistory.length;
    
    return eventsSinceUpdate >= 50 || 
           this.reinforcementBuffer.size >= 10;
  }

  private async updateModel(): Promise<void> {
    this.logger.info('Updating learning model...');
    
    // Process reinforcement learning
    if (this.reinforcementBuffer.size > 0) {
      await this.processReinforcement();
    }
    
    // Prune low-performing patterns
    await this.prunePatterns();
    
    // Update associations
    await this.updateAssociations();
    
    // Save model state
    await this.saveModel();
  }

  private async processReinforcement(): Promise<void> {
    const reinforcements = Array.from(this.reinforcementBuffer.values());
    
    for (const data of reinforcements) {
      // Find related patterns
      const patterns = await this.findRelatedPatterns(data.context);
      
      for (const pattern of patterns) {
        const learned = this.model.patterns.get(pattern.id);
        if (learned) {
          // Update success rate based on reward
          const adjustment = data.reward * this.config.learningRate;
          learned.successRate = Math.max(0, Math.min(1, 
            learned.successRate + adjustment
          ));
        }
      }
    }
    
    this.reinforcementBuffer.clear();
  }

  private async prunePatterns(): Promise<void> {
    const toRemove: string[] = [];
    
    for (const [id, learned] of this.model.patterns) {
      // Remove patterns with low success rate and low usage
      if (learned.successRate < 0.3 && learned.occurrences < 5) {
        toRemove.push(id);
      }
      
      // Remove old unused patterns
      const daysSinceUse = (Date.now() - learned.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUse > 30 && learned.occurrences < 10) {
        toRemove.push(id);
      }
    }
    
    for (const id of toRemove) {
      this.model.patterns.delete(id);
      await this.removePattern(id);
    }
    
    if (toRemove.length > 0) {
      this.logger.info(`Pruned ${toRemove.length} underperforming patterns`);
    }
  }

  private async removePattern(patternId: string): Promise<void> {
    await this.agent.memory.delete(patternId);
  }

  private async updateAssociations(): Promise<void> {
    // Build associations between frequently co-occurring patterns
    const coOccurrences = new Map<string, Map<string, number>>();
    
    // Analyze event history for co-occurrences
    for (let i = 0; i < this.eventHistory.length - 1; i++) {
      const current = this.eventHistory[i];
      const next = this.eventHistory[i + 1];
      
      if (current.output?.patternId && next.output?.patternId) {
        const key = current.output.patternId;
        const counts = coOccurrences.get(key) || new Map();
        const count = counts.get(next.output.patternId) || 0;
        counts.set(next.output.patternId, count + 1);
        coOccurrences.set(key, counts);
      }
    }
    
    // Update associations
    for (const [pattern1, counts] of coOccurrences) {
      const associations = new Set<string>();
      
      for (const [pattern2, count] of counts) {
        if (count >= 3) { // Threshold for association
          associations.add(pattern2);
        }
      }
      
      if (associations.size > 0) {
        this.model.associations.set(pattern1, associations);
      }
    }
  }

  private async saveModel(): Promise<void> {
    // Save model state to memory
    const modelState = {
      patterns: Array.from(this.model.patterns.entries()).map(([id, learned]) => ({
        id,
        pattern: learned.pattern,
        stats: {
          occurrences: learned.occurrences,
          successRate: learned.successRate,
          lastUsed: learned.lastUsed
        }
      })),
      weights: Array.from(this.model.weights.entries()),
      associations: Array.from(this.model.associations.entries()).map(([k, v]) => [k, Array.from(v)])
    };
    
    await this.agent.memory.store({
      id: uuidv4(),
      type: MemoryType.SEMANTIC,
      content: {
        type: 'learning-model',
        state: modelState,
        timestamp: new Date()
      },
      importance: 0.9,
      associations: [],
      timestamp: new Date(),
      accessCount: 0,
      lastAccessed: new Date()
    });
  }

  private async findApplicablePatterns(context: any): Promise<Pattern[]> {
    const applicable: Pattern[] = [];
    
    for (const [_id, learned] of this.model.patterns) {
      if (this.isPatternApplicable(learned.pattern, context)) {
        applicable.push(learned.pattern);
      }
    }
    
    // Sort by success rate and recency
    applicable.sort((a, b) => {
      const learnedA = this.model.patterns.get(a.id)!;
      const learnedB = this.model.patterns.get(b.id)!;
      
      const scoreA = learnedA.successRate * (1 / (Date.now() - learnedA.lastUsed.getTime()));
      const scoreB = learnedB.successRate * (1 / (Date.now() - learnedB.lastUsed.getTime()));
      
      return scoreB - scoreA;
    });
    
    return applicable.slice(0, 5); // Top 5 patterns
  }

  private isPatternApplicable(pattern: Pattern, context: any): boolean {
    // Check if trigger matches
    if (pattern.trigger) {
      return this.matchesTrigger(pattern.trigger, context);
    }
    return true;
  }

  private matchesTrigger(trigger: Trigger, context: any): boolean {
    switch (trigger.type) {
      case TriggerType.PATTERN:
        return context.keywords?.includes(trigger.condition) || 
               context.description?.includes(trigger.condition);
               
      case TriggerType.CONDITION:
        return context.taskType === trigger.condition;
        
      case TriggerType.EVENT:
        return context.event === trigger.condition;
        
      default:
        return false;
    }
  }

  private async applyPattern(pattern: Pattern, context: any): Promise<any> {
    const learned = this.model.patterns.get(pattern.id);
    if (!learned) return null;
    
    // Apply pattern action
    if (pattern.action) {
      try {
        const result = await this.executeAction(pattern.action, context);
        
        // Update pattern usage
        learned.occurrences++;
        learned.lastUsed = new Date();
        
        return result;
      } catch (error) {
        this.logger.error(`Failed to apply pattern ${pattern.id}`, error);
        learned.successRate *= 0.9; // Decrease confidence on failure
        return null;
      }
    }
    
    return null;
  }

  private async executeAction(action: Action, _context: any): Promise<any> {
    // Execute pattern action
    switch (action.type) {
      case ActionType.TOOL:
        return { suggestion: 'use-tool', tool: action.tool, parameters: action.parameters };
        
      case ActionType.PROCESS_DATA:
        return { suggestion: 'process-data', parameters: action.parameters };
        
      case ActionType.STORE:
        return { suggestion: 'store-memory', data: action.data };
        
      default:
        return null;
    }
  }

  private async storeFeedback(feedback: Feedback): Promise<void> {
    await this.agent.memory.store({
      id: uuidv4(),
      type: MemoryType.EPISODIC,
      content: {
        type: 'feedback',
        feedback,
        timestamp: new Date()
      },
      importance: Math.abs((feedback as any).value || 0.5),
      associations: [],
      timestamp: new Date(),
      accessCount: 0,
      lastAccessed: new Date()
    });
  }

  private findStrongAssociations(): Array<{ from: string; to: string; strength: number }> {
    const associations: Array<{ from: string; to: string; strength: number }> = [];
    
    for (const [from, tos] of this.model.associations) {
      for (const to of tos) {
        const fromPattern = this.model.patterns.get(from);
        const toPattern = this.model.patterns.get(to);
        
        if (fromPattern && toPattern) {
          const strength = (fromPattern.successRate + toPattern.successRate) / 2;
          associations.push({ from, to, strength });
        }
      }
    }
    
    return associations.sort((a, b) => b.strength - a.strength).slice(0, 10);
  }

  private async identifyImprovementAreas(): Promise<string[]> {
    const areas: string[] = [];
    
    // Analyze failure patterns
    const failurePatterns = Array.from(this.model.patterns.values())
      .filter(p => p.successRate < 0.5)
      .sort((a, b) => a.successRate - b.successRate);
    
    for (const pattern of failurePatterns.slice(0, 5)) {
      areas.push(`Improve pattern: ${pattern.pattern.name} (success rate: ${pattern.successRate.toFixed(2)})`);
    }
    
    // Analyze underutilized patterns
    const underutilized = Array.from(this.model.patterns.values())
      .filter(p => p.successRate > 0.7 && p.occurrences < 5)
      .sort((a, b) => b.successRate - a.successRate);
    
    for (const pattern of underutilized.slice(0, 3)) {
      areas.push(`Underutilized pattern: ${pattern.pattern.name} (high success but low usage)`);
    }
    
    return areas;
  }

  private calculateAverageSuccessRate(): number {
    if (this.model.patterns.size === 0) return 0;
    
    let totalSuccess = 0;
    for (const learned of this.model.patterns.values()) {
      totalSuccess += learned.successRate;
    }
    
    return totalSuccess / this.model.patterns.size;
  }

  private async findRelatedPatterns(context: any): Promise<Pattern[]> {
    const related: Pattern[] = [];
    
    for (const [_id, learned] of this.model.patterns) {
      // Check if pattern was used in similar context
      for (const [ctxKey] of learned.contexts) {
        const storedContext = JSON.parse(ctxKey);
        if (this.isSimilarContext(storedContext, context)) {
          related.push(learned.pattern);
          break;
        }
      }
    }
    
    return related;
  }

  private isSimilarContext(ctx1: any, ctx2: any): boolean {
    // Simple context similarity check
    if (ctx1.type === ctx2.type) return true;
    if (ctx1.tool === ctx2.tool) return true;
    if (ctx1.taskType === ctx2.taskType) return true;
    
    // Check keyword overlap
    if (ctx1.keywords && ctx2.keywords) {
      const set1 = new Set(ctx1.keywords);
      const set2 = new Set(ctx2.keywords);
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      return intersection.size > 0;
    }
    
    return false;
  }

  private async evaluateAndOptimize(): Promise<void> {
    this.logger.debug('Running periodic evaluation and optimization');
    
    // Evaluate model performance
    const metrics = {
      averageSuccessRate: this.calculateAverageSuccessRate(),
      totalPatterns: this.model.patterns.size,
      activePatterns: Array.from(this.model.patterns.values())
        .filter(p => Date.now() - p.lastUsed.getTime() < 24 * 60 * 60 * 1000).length
    };
    
    // Adjust learning rate based on performance
    if (metrics.averageSuccessRate > 0.8) {
      // Decrease learning rate when performing well
      this.config.learningRate = Math.max(0.001, this.config.learningRate * 0.9);
    } else if (metrics.averageSuccessRate < 0.5) {
      // Increase learning rate when performing poorly
      this.config.learningRate = Math.min(0.1, this.config.learningRate * 1.1);
    }
    
    // Update model
    await this.updateModel();
    
    this.logger.info('Evaluation complete', metrics);
  }

  /**
   * Optimize patterns by removing low-performing ones
   */
  optimizePatterns(): void {
    // Remove patterns with low success rate
    for (const [id] of this.model.patterns.entries()) {
      const successRate = this.model.patternPerformance.get(id)?.successRate || 0;
      if (successRate < 0.3 && (this.model.patternPerformance.get(id)?.count || 0) > 10) {
        this.model.patterns.delete(id);
        this.model.patternPerformance.delete(id);
        this.logger.info(`Removed low-performing pattern: ${id}`);
      }
    }
    
    // Keep only top patterns if we exceed max
    if (this.model.patterns.size > this.config.maxPatterns) {
      const sortedPatterns = Array.from(this.model.patterns.entries())
        .sort((a, b) => {
          const perfA = this.model.patternPerformance.get(a[0])?.successRate || 0;
          const perfB = this.model.patternPerformance.get(b[0])?.successRate || 0;
          return perfB - perfA;
        });
      
      // Keep top patterns
      this.model.patterns.clear();
      sortedPatterns.slice(0, this.config.maxPatterns).forEach(([id, learned]) => {
        this.model.patterns.set(id, learned);
      });
    }
  }
}

// Types
interface LearningInsights {
  topPatterns: Array<{
    pattern: Pattern;
    successRate: number;
    usage: number;
  }>;
  associations: Array<{
    from: string;
    to: string;
    strength: number;
  }>;
  improvements: string[];
  modelMetrics: {
    totalPatterns: number;
    averageSuccessRate: number;
    learningRate: number;
  };
  totalPatterns: number;
}
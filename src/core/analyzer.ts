/**
 * Task Analyzer - Analyzes tasks to determine requirements and approach
 */

import { Task, TaskType, MemoryType } from './unified-types';
import {
  AgentInterface,
  ComplexityLevel,
  Pattern
} from './types';
import { Logger } from '../utils/logger';

export interface Analysis {
  taskType: TaskType;
  confidence: number;
  complexity: ComplexityLevel;
  requirements: Requirement[];
  constraints: Constraint[];
  risks: Risk[];
  suggestedCapabilities: string[];
  suggestedTools: string[];
  estimatedDuration: number;
  patterns: Pattern[];
}

export { ComplexityLevel };

export interface Requirement {
  id: string;
  description: string;
  type: RequirementType;
  priority: 'must-have' | 'should-have' | 'nice-to-have';
  satisfied: boolean;
}

export interface Constraint {
  id: string;
  description: string;
  type: ConstraintType;
  severity: 'blocker' | 'critical' | 'major' | 'minor';
}

export interface Risk {
  id: string;
  description: string;
  probability: number;
  impact: number;
  mitigation?: string;
}

export enum RequirementType {
  FUNCTIONAL = 'functional',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  USABILITY = 'usability',
  COMPATIBILITY = 'compatibility'
}

export enum ConstraintType {
  TECHNICAL = 'technical',
  RESOURCE = 'resource',
  TIME = 'time',
  REGULATORY = 'regulatory',
  BUSINESS = 'business'
}

export class Analyzer {
  private agent: AgentInterface;
  private logger: Logger;
  private patternCache: Map<string, Pattern[]>;

  constructor(agent: AgentInterface) {
    this.agent = agent;
    this.logger = new Logger('TaskAnalyzer');
    this.patternCache = new Map();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Task Analyzer...');
    await this.loadPatterns();
  }

  /**
   * Analyze a task to determine requirements and approach
   */
  async analyze(task: Task): Promise<Analysis> {
    this.logger.info(`Analyzing task: ${task.id}`);

    const analysis: Analysis = {
      taskType: task.type,
      confidence: 0,
      complexity: ComplexityLevel.SIMPLE,
      requirements: [],
      constraints: [],
      risks: [],
      suggestedCapabilities: [],
      suggestedTools: [],
      estimatedDuration: 0,
      patterns: []
    };

    // Perform various analyses in parallel
    const [
      requirements,
      constraints,
      risks,
      complexity,
      patterns,
      capabilities,
      tools
    ] = await Promise.all([
      this.extractRequirements(task),
      this.identifyConstraints(task),
      this.assessRisks(task),
      this.determineComplexity(task),
      this.findRelevantPatterns(task),
      this.suggestCapabilities(task),
      this.suggestTools(task)
    ]);

    // Update analysis
    analysis.requirements = requirements;
    analysis.constraints = constraints;
    analysis.risks = risks;
    analysis.complexity = complexity;
    analysis.patterns = patterns;
    analysis.suggestedCapabilities = capabilities;
    analysis.suggestedTools = tools;
    analysis.estimatedDuration = this.estimateDuration(analysis);
    analysis.confidence = this.calculateConfidence(analysis);

    return analysis;
  }

  /**
   * Extract requirements from task
   */
  private async extractRequirements(task: Task): Promise<Requirement[]> {
    const requirements: Requirement[] = [];

    // Explicit requirements
    if (task.context.requirements) {
      task.context.requirements.forEach((req, index) => {
        requirements.push({
          id: `req-${index}`,
          description: req,
          type: this.classifyRequirement(req),
          priority: 'must-have',
          satisfied: false
        });
      });
    }

    // Implicit requirements based on task type
    const implicitReqs = this.getImplicitRequirements(task.type);
    requirements.push(...implicitReqs);

    // Requirements from similar past tasks
    const historicalReqs = await this.getHistoricalRequirements(task);
    requirements.push(...historicalReqs);

    return requirements;
  }

  /**
   * Identify constraints
   */
  private async identifyConstraints(task: Task): Promise<Constraint[]> {
    const constraints: Constraint[] = [];

    // Explicit constraints
    if (task.context.constraints) {
      task.context.constraints.forEach((con, index) => {
        constraints.push({
          id: `con-${index}`,
          description: con,
          type: this.classifyConstraint(con),
          severity: 'major'
        });
      });
    }

    // Technical constraints
    if (task.context.language) {
      constraints.push({
        id: 'con-lang',
        description: `Must use ${task.context.language}`,
        type: ConstraintType.TECHNICAL,
        severity: 'blocker'
      });
    }

    // Resource constraints
    const memoryUsage = await this.estimateMemoryUsage(task);
    if (memoryUsage > 1000) {
      constraints.push({
        id: 'con-memory',
        description: 'High memory usage expected',
        type: ConstraintType.RESOURCE,
        severity: 'major'
      });
    }

    return constraints;
  }

  /**
   * Assess risks
   */
  private async assessRisks(task: Task): Promise<Risk[]> {
    const risks: Risk[] = [];

    // Complexity risk
    const complexity = await this.determineComplexity(task);
    if (complexity >= ComplexityLevel.COMPLEX) {
      risks.push({
        id: 'risk-complexity',
        description: 'High task complexity may lead to errors',
        probability: 0.6,
        impact: 0.8,
        mitigation: 'Break down into smaller subtasks'
      });
    }

    // Pattern matching risk
    const patterns = await this.findRelevantPatterns(task);
    if (patterns.length === 0) {
      risks.push({
        id: 'risk-novelty',
        description: 'No similar patterns found - novel task',
        probability: 0.7,
        impact: 0.6,
        mitigation: 'Proceed with caution and validate frequently'
      });
    }

    // File modification risk
    if (task.context.files && task.context.files.length > 5) {
      risks.push({
        id: 'risk-files',
        description: 'Multiple files to modify increases error risk',
        probability: 0.5,
        impact: 0.7,
        mitigation: 'Create backups and test incrementally'
      });
    }

    return risks;
  }

  /**
   * Determine task complexity
   */
  private async determineComplexity(task: Task): Promise<ComplexityLevel> {
    let score = 0;

    // File count
    const fileCount = task.context.files?.length || 0;
    score += fileCount * 0.5;

    // Requirement count
    const reqCount = task.context.requirements?.length || 0;
    score += reqCount * 0.3;

    // Task type complexity
    const typeComplexity = {
      [TaskType.CODE_GENERATION]: 3,
      [TaskType.BUG_FIXING]: 4,
      [TaskType.REFACTORING]: 5,
      [TaskType.ANALYSIS]: 2,
      [TaskType.DOCUMENTATION]: 1,
      [TaskType.TESTING]: 3,
      [TaskType.OPTIMIZATION]: 5,
      [TaskType.RESEARCH]: 2,
      [TaskType.GENERAL]: 3
    };
    score += typeComplexity[task.type] || 3;

    // Description length (proxy for complexity)
    score += task.description.length / 100;

    // Map score to complexity level
    if (score < 3) return ComplexityLevel.SIMPLE;
    if (score < 6) return ComplexityLevel.MODERATE;
    if (score < 10) return ComplexityLevel.COMPLEX;
    return ComplexityLevel.VERY_COMPLEX;
  }

  /**
   * Find relevant patterns from memory
   */
  private async findRelevantPatterns(task: Task): Promise<Pattern[]> {
    // Check cache first
    const cacheKey = `${task.type}-${task.description.substring(0, 50)}`;
    const cached = this.patternCache.get(cacheKey);
    if (cached) return cached;

    // Query memory for patterns
    const memories = await this.agent.recall({
      type: MemoryType.PROCEDURAL,
      keywords: this.extractKeywords(task),
      limit: 10
    });

    const patterns: Pattern[] = [];
    for (const memory of memories) {
      if (memory.content?.pattern) {
        patterns.push(memory.content.pattern);
      }
    }

    // Cache results
    this.patternCache.set(cacheKey, patterns);
    return patterns;
  }

  /**
   * Suggest capabilities needed
   */
  private async suggestCapabilities(task: Task): Promise<string[]> {
    const capabilities = new Set<string>();

    // Based on task type
    const typeCapabilities: Record<TaskType, string[]> = {
      [TaskType.CODE_GENERATION]: ['code-generation', 'syntax-validation'],
      [TaskType.BUG_FIXING]: ['code-analysis', 'debugging'],
      [TaskType.REFACTORING]: ['code-analysis', 'code-transformation'],
      [TaskType.ANALYSIS]: ['code-analysis', 'pattern-recognition'],
      [TaskType.DOCUMENTATION]: ['documentation-generation'],
      [TaskType.TESTING]: ['test-generation', 'test-execution'],
      [TaskType.OPTIMIZATION]: ['performance-analysis', 'code-optimization'],
      [TaskType.RESEARCH]: ['information-retrieval', 'summarization'],
      [TaskType.GENERAL]: ['general-purpose']
    };

    const taskCaps = typeCapabilities[task.type] || ['general-purpose'];
    taskCaps.forEach(cap => capabilities.add(cap));

    // Based on context
    if (task.context.files && task.context.files.length > 0) {
      capabilities.add('file-manipulation');
    }

    if (task.context.language) {
      capabilities.add(`language-${task.context.language.toLowerCase()}`);
    }

    return Array.from(capabilities);
  }

  /**
   * Suggest tools needed
   */
  private async suggestTools(task: Task): Promise<string[]> {
    const tools = new Set<string>();

    // Always useful tools
    tools.add('read');

    // Based on task type
    switch (task.type) {
      case TaskType.CODE_GENERATION:
        tools.add('write');
        tools.add('edit');
        break;
      case TaskType.BUG_FIXING:
        tools.add('grep');
        tools.add('edit');
        tools.add('bash');
        break;
      case TaskType.REFACTORING:
        tools.add('grep');
        tools.add('multiEdit');
        break;
      case TaskType.ANALYSIS:
        tools.add('grep');
        tools.add('glob');
        break;
      case TaskType.DOCUMENTATION:
        tools.add('write');
        break;
      case TaskType.TESTING:
        tools.add('write');
        tools.add('bash');
        break;
      case TaskType.OPTIMIZATION:
        tools.add('grep');
        tools.add('edit');
        break;
      case TaskType.RESEARCH:
        tools.add('webSearch');
        tools.add('webFetch');
        break;
    }

    // Based on context
    if (task.description.toLowerCase().includes('todo') || 
        task.description.toLowerCase().includes('task')) {
      tools.add('todoWrite');
    }

    return Array.from(tools);
  }

  /**
   * Estimate task duration
   */
  private estimateDuration(analysis: Analysis): number {
    let duration = 0;

    // Base duration by complexity
    const complexityDuration = {
      [ComplexityLevel.SIMPLE]: 5,
      [ComplexityLevel.MODERATE]: 15,
      [ComplexityLevel.COMPLEX]: 30,
      [ComplexityLevel.VERY_COMPLEX]: 60
    };
    duration += complexityDuration[analysis.complexity] || 15;

    // Add time for requirements
    duration += analysis.requirements.length * 2;

    // Add time for risks
    duration += analysis.risks.filter(r => r.probability * r.impact > 0.5).length * 5;

    // Add time for constraints
    duration += analysis.constraints.filter(c => c.severity === 'blocker').length * 10;

    return duration; // in minutes
  }

  /**
   * Calculate confidence in analysis
   */
  private calculateConfidence(analysis: Analysis): number {
    let confidence = 0.5; // Base confidence

    // Pattern availability increases confidence
    if (analysis.patterns.length > 0) {
      confidence += 0.2 * Math.min(1, analysis.patterns.length / 3);
    }

    // Clear requirements increase confidence
    if (analysis.requirements.length > 0) {
      confidence += 0.1;
    }

    // Known task type increases confidence
    if (analysis.taskType !== TaskType.GENERAL) {
      confidence += 0.1;
    }

    // High risk decreases confidence
    const highRisks = analysis.risks.filter(r => r.probability * r.impact > 0.6);
    confidence -= highRisks.length * 0.05;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Helper methods
   */
  private async loadPatterns(): Promise<void> {
    // Load common patterns from memory
    const patterns = await this.agent.recall({
      type: MemoryType.PROCEDURAL,
      limit: 100
    });

    for (const memory of patterns) {
      if (memory.content?.pattern) {
        const key = `${memory.content.pattern.type}-generic`;
        const existing = this.patternCache.get(key) || [];
        existing.push(memory.content.pattern);
        this.patternCache.set(key, existing);
      }
    }
  }

  private classifyRequirement(req: string): RequirementType {
    const lower = req.toLowerCase();
    if (lower.includes('performance') || lower.includes('fast') || lower.includes('speed')) {
      return RequirementType.PERFORMANCE;
    }
    if (lower.includes('secure') || lower.includes('safety') || lower.includes('auth')) {
      return RequirementType.SECURITY;
    }
    if (lower.includes('user') || lower.includes('interface') || lower.includes('ui')) {
      return RequirementType.USABILITY;
    }
    if (lower.includes('compatible') || lower.includes('support')) {
      return RequirementType.COMPATIBILITY;
    }
    return RequirementType.FUNCTIONAL;
  }

  private classifyConstraint(con: string): ConstraintType {
    const lower = con.toLowerCase();
    if (lower.includes('technology') || lower.includes('language') || lower.includes('framework')) {
      return ConstraintType.TECHNICAL;
    }
    if (lower.includes('memory') || lower.includes('cpu') || lower.includes('resource')) {
      return ConstraintType.RESOURCE;
    }
    if (lower.includes('deadline') || lower.includes('time') || lower.includes('duration')) {
      return ConstraintType.TIME;
    }
    if (lower.includes('compliance') || lower.includes('regulation') || lower.includes('law')) {
      return ConstraintType.REGULATORY;
    }
    return ConstraintType.BUSINESS;
  }

  private getImplicitRequirements(taskType: TaskType): Requirement[] {
    const reqs: Requirement[] = [];

    switch (taskType) {
      case TaskType.CODE_GENERATION:
        reqs.push({
          id: 'impl-clean-code',
          description: 'Generate clean, readable code',
          type: RequirementType.FUNCTIONAL,
          priority: 'must-have',
          satisfied: false
        });
        break;
      case TaskType.BUG_FIXING:
        reqs.push({
          id: 'impl-fix-bug',
          description: 'Fix the bug without introducing new issues',
          type: RequirementType.FUNCTIONAL,
          priority: 'must-have',
          satisfied: false
        });
        break;
      case TaskType.TESTING:
        reqs.push({
          id: 'impl-coverage',
          description: 'Achieve good test coverage',
          type: RequirementType.FUNCTIONAL,
          priority: 'should-have',
          satisfied: false
        });
        break;
    }

    return reqs;
  }

  private async getHistoricalRequirements(task: Task): Promise<Requirement[]> {
    // Query similar past tasks
    const memories = await this.agent.recall({
      type: MemoryType.EPISODIC,
      keywords: this.extractKeywords(task),
      limit: 5
    });

    const reqs: Requirement[] = [];
    for (const memory of memories) {
      if (memory.content?.requirements) {
        // Extract requirements from past similar tasks
        const pastReqs = memory.content.requirements as string[];
        pastReqs.forEach((req, index) => {
          reqs.push({
            id: `hist-${memory.id}-${index}`,
            description: req,
            type: RequirementType.FUNCTIONAL,
            priority: 'nice-to-have',
            satisfied: false
          });
        });
      }
    }

    return reqs;
  }

  private async estimateMemoryUsage(task: Task): Promise<number> {
    let estimate = 100; // Base memory in MB

    // File operations
    if (task.context.files) {
      estimate += task.context.files.length * 50;
    }

    // Complex operations
    if (task.type === TaskType.OPTIMIZATION || task.type === TaskType.ANALYSIS) {
      estimate += 200;
    }

    return estimate;
  }

  private extractKeywords(task: Task): string[] {
    const text = `${task.description} ${task.context.requirements?.join(' ') || ''}`;
    const words = text.toLowerCase().split(/W+/);
    
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was'
    ]);

    return words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 10);
  }
}

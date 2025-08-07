/**
 * Prompt Builder - Dynamic prompt generation system
 */

import {
  AgentInterface,
  Task,
  TaskType,
  PromptTemplate,
  PromptVariable,
  VariableType,
  OutputFormat,
  
  Example,
  Memory,
  MemoryType,
  Pattern
} from '../core/types';
import { Analysis } from '../core/analyzer';
import { Logger } from '../utils/logger';

interface PromptContext {
  task: Task;
  analysis?: Analysis;
  memories?: Memory[];
  patterns?: Pattern[];
  examples?: Example[];
  style?: PromptStyle;
}

interface PromptStyle {
  tone: 'formal' | 'casual' | 'technical' | 'friendly';
  verbosity: 'minimal' | 'normal' | 'detailed';
  structure: 'linear' | 'hierarchical' | 'modular';
}

export class PromptBuilder {
  private agent: AgentInterface;
  // private logger: Logger;
  private templates: Map<string, PromptTemplate>;
  private cachedPrompts: Map<string, string>;

  constructor(agent: AgentInterface) {
    this.agent = agent;
    // this.logger = new _Logger('PromptBuilder');
    this.templates = new Map();
    this.cachedPrompts = new Map();
    
    this.loadDefaultTemplates();
  }

  /**
   * Build a prompt for a task
   */
  async buildPrompt(context: PromptContext): Promise<string> {
    const { task } = context;
    
    // Check cache
    const cacheKey = this.getCacheKey(context);
    const cached = this.cachedPrompts.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Select appropriate template
    const template = await this.selectTemplate(context);
    
    // Gather context information
    const enrichedContext = await this.enrichContext(context);
    
    // Build prompt sections
    const sections = [
      this.buildSystemSection(enrichedContext),
      this.buildTaskSection(enrichedContext),
      this.buildContextSection(enrichedContext),
      this.buildExamplesSection(enrichedContext),
      this.buildConstraintsSection(enrichedContext),
      this.buildOutputSection(enrichedContext)
    ];

    // Combine sections
    const prompt = sections.filter(s => s).join('\n\n');
    
    // Cache result
    this.cachedPrompts.set(cacheKey, prompt);
    
    return prompt;
  }

  /**
   * Build a chain of thought prompt
   */
  async buildChainOfThoughtPrompt(context: PromptContext): Promise<string> {
    const base = await this.buildPrompt(context);
    
    const chainOfThought = `
Let's approach this step by step:

Step 1: Understand the requirements
${this.extractRequirements(context)}

Step 2: Analyze the context
${this.analyzeContext(context)}

Step 3: Plan the approach
${this.planApproach(context)}

Step 4: Execute the plan
[Your implementation here]

Step 5: Verify the solution
[Verification steps]
`;

    return `${base}\n\n${chainOfThought}`;
  }

  /**
   * Build a reflection prompt
   */
  async buildReflectionPrompt(
    originalPrompt: string,
    output: any,
    feedback?: string
  ): Promise<string> {
    return `
Original Task:
${originalPrompt}

Your Output:
${JSON.stringify(output, null, 2)}

${feedback ? `User Feedback:\n${feedback}\n` : ''}

Please reflect on your output and consider:
1. Did you fully address the requirements?
2. Are there any errors or improvements needed?
3. What could be done better?
4. Are there edge cases not handled?

Provide an improved solution if needed.
`;
  }

  /**
   * Build a few-shot prompt
   */
  async buildFewShotPrompt(
    context: PromptContext,
    examples: Example[]
  ): Promise<string> {
    const base = await this.buildPrompt(context);
    
    const examplesSection = examples.map((ex, i) => `
Example ${i + 1}:
Input: ${ex.input}
Output: ${ex.output}
${ex.description ? `Explanation: ${ex.description}` : ''}
`).join('\n');

    return `${base}\n\nExamples:\n${examplesSection}\n\nNow, please complete the task:`;
  }

  /**
   * Build a multi-modal prompt
   */
  async buildMultiModalPrompt(
    context: PromptContext,
    images?: string[],
    diagrams?: string[]
  ): Promise<string> {
    const base = await this.buildPrompt(context);
    
    let multiModalSection = '';
    
    if (images && images.length > 0) {
      multiModalSection += `\nImages provided:\n${images.map((img, i) => `- Image ${i + 1}: ${img}`).join('\n')}`;
    }
    
    if (diagrams && diagrams.length > 0) {
      multiModalSection += `\nDiagrams provided:\n${diagrams.map((diag, i) => `- Diagram ${i + 1}: ${diag}`).join('\n')}`;
    }

    return `${base}${multiModalSection}`;
  }

  /**
   * Private helper methods
   */
  private loadDefaultTemplates(): void {
    // Code generation template
    this.templates.set('code_generation', {
      id: 'code_generation',
      name: 'Code Generation Template',
      template: `Generate {language} code that {description}.

Requirements:
{requirements}

Constraints:
{constraints}

The code should follow {style} conventions and include {features}.`,
      variables: [
        { name: 'language', type: VariableType.STRING, required: true },
        { name: 'description', type: VariableType.STRING, required: true },
        { name: 'requirements', type: VariableType.ARRAY, required: false },
        { name: 'constraints', type: VariableType.ARRAY, required: false },
        { name: 'style', type: VariableType.STRING, required: false, default: 'standard' },
        { name: 'features', type: VariableType.ARRAY, required: false }
      ],
      format: OutputFormat.CODE
    });

    // Bug fixing template
    this.templates.set('bug_fixing', {
      id: 'bug_fixing',
      name: 'Bug Fixing Template',
      template: `Fix the following bug in the {language} code:

Bug Description:
{bug_description}

Current Code:
{current_code}

Error Message:
{error_message}

Expected Behavior:
{expected_behavior}

Please provide a fix that addresses the root cause.`,
      variables: [
        { name: 'language', type: VariableType.STRING, required: true },
        { name: 'bug_description', type: VariableType.STRING, required: true },
        { name: 'current_code', type: VariableType.STRING, required: true },
        { name: 'error_message', type: VariableType.STRING, required: false },
        { name: 'expected_behavior', type: VariableType.STRING, required: true }
      ],
      format: OutputFormat.CODE
    });

    // Analysis template
    this.templates.set('analysis', {
      id: 'analysis',
      name: 'Analysis Template',
      template: `Analyze {target} and provide insights on:

Focus Areas:
{focus_areas}

Context:
{context}

Please structure your analysis with:
1. Overview
2. Key findings
3. Recommendations
4. Potential issues`,
      variables: [
        { name: 'target', type: VariableType.STRING, required: true },
        { name: 'focus_areas', type: VariableType.ARRAY, required: true },
        { name: 'context', type: VariableType.OBJECT, required: false }
      ],
      format: { type: 'structured' } as unknown as OutputFormat
    });

    // Documentation template
    this.templates.set('documentation', {
      id: 'documentation',
      name: 'Documentation Template',
      template: `Create comprehensive documentation for {target}.

Documentation Type: {doc_type}
Audience: {audience}
Format: {format}

Include:
{include_sections}

The documentation should be clear, complete, and follow {style_guide} guidelines.`,
      variables: [
        { name: 'target', type: VariableType.STRING, required: true },
        { name: 'doc_type', type: VariableType.STRING, required: true },
        { name: 'audience', type: VariableType.STRING, required: false, default: 'developers' },
        { name: 'format', type: VariableType.STRING, required: false, default: 'markdown' },
        { name: 'include_sections', type: VariableType.ARRAY, required: false },
        { name: 'style_guide', type: VariableType.STRING, required: false, default: 'standard' }
      ],
      format: { type: 'markdown' } as unknown as OutputFormat
    });

    // Testing template
    this.templates.set('testing', {
      id: 'testing',
      name: 'Testing Template',
      template: `Create {test_type} tests for:

Code/Component:
{target_code}

Test Framework: {framework}
Coverage Goal: {coverage}%

Test cases should include:
- Happy path scenarios
- Edge cases
- Error handling
- Performance considerations`,
      variables: [
        { name: 'test_type', type: VariableType.STRING, required: true },
        { name: 'target_code', type: VariableType.STRING, required: true },
        { name: 'framework', type: VariableType.STRING, required: true },
        { name: 'coverage', type: VariableType.NUMBER, required: false, default: 80 }
      ],
      format: OutputFormat.CODE
    });
  }

  private async selectTemplate(context: PromptContext): Promise<PromptTemplate> {
    const { task } = context;
    
    // Map task type to template
    const templateMap: Record<TaskType, string> = {
      [TaskType.CODE_GENERATION]: 'code_generation',
      [TaskType.BUG_FIXING]: 'bug_fixing',
      [TaskType.REFACTORING]: 'code_generation',
      [TaskType.ANALYSIS]: 'analysis',
      [TaskType.DOCUMENTATION]: 'documentation',
      [TaskType.TESTING]: 'testing',
      [TaskType.OPTIMIZATION]: 'analysis',
      [TaskType.RESEARCH]: 'analysis',
      [TaskType.GENERAL]: 'code_generation'
    };

    const templateId = templateMap[task.type] || 'code_generation';
    const template = this.templates.get(templateId);
    
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return template;
  }

  private async enrichContext(context: PromptContext): Promise<PromptContext> {
    // Add memories if not provided
    if (!context.memories) {
      context.memories = await this.agent.memory.retrieve({
        keywords: this.extractKeywords(context.task),
        limit: 5
      });
    }

    // Add patterns if not provided
    if (!context.patterns) {
      const patterns = await this.agent.memory.retrieve({
        type: MemoryType.PROCEDURAL,
        limit: 3
      });
      
      context.patterns = patterns
        .map(m => m.content?.pattern)
        .filter(p => p) as Pattern[];
    }

    // Add examples from similar tasks
    if (!context.examples) {
      context.examples = await this.findExamples(context);
    }

    // Determine style if not provided
    if (!context.style) {
      context.style = this.determineStyle(context);
    }

    return context;
  }

  private buildSystemSection(context: PromptContext): string {
    const { task, style } = context;
    
    let tone = '';
    switch (style?.tone) {
      case 'formal':
        tone = 'You are a professional software engineer. Provide formal, detailed responses.';
        break;
      case 'casual':
        tone = 'You are a helpful coding assistant. Provide clear, friendly explanations.';
        break;
      case 'technical':
        tone = 'You are a technical expert. Focus on precision and technical accuracy.';
        break;
      default:
        tone = 'You are an intelligent coding assistant. Provide helpful, accurate responses.';
    }

    return `${tone}

Task Type: ${task.type}
Priority: ${task.priority}
${task.context.language ? `Language: ${task.context.language}` : ''}
${task.context.framework ? `Framework: ${task.context.framework}` : ''}`;
  }

  private buildTaskSection(context: PromptContext): string {
    const { task } = context;
    
    return `Task Description:
${task.description}`;
  }

  private buildContextSection(context: PromptContext): string {
    const { task, analysis, memories } = context;
    
    let contextSection = '';

    // Add file context
    if (task.context.files && task.context.files.length > 0) {
      contextSection += `Files involved:\n${task.context.files.map(f => `- ${f}`).join('\n')}\n`;
    }

    // Add analysis insights
    if (analysis) {
      contextSection += `\nComplexity: ${analysis.complexity}\n`;
      
      if (analysis.risks.length > 0) {
        contextSection += `\nRisks to consider:\n${analysis.risks.map(r => `- ${r.description}`).join('\n')}\n`;
      }
    }

    // Add relevant memories
    if (memories && memories.length > 0) {
      contextSection += `\nRelevant past experience:\n`;
      memories.slice(0, 3).forEach((memory, i) => {
        contextSection += `${i + 1}. ${this.summarizeMemory(memory)}\n`;
      });
    }

    return contextSection || 'No additional context.';
  }

  private buildExamplesSection(context: PromptContext): string {
    const { examples } = context;
    
    if (!examples || examples.length === 0) {
      return '';
    }

    return `Examples:
${examples.map((ex, i) => `
Example ${i + 1}:
Input: ${ex.input}
Output: ${ex.output}
${ex.description ? `Note: ${ex.description}` : ''}
`).join('\n')}`;
  }

  private buildConstraintsSection(context: PromptContext): string {
    const { task, analysis } = context;
    
    const constraints: string[] = [];

    // Add explicit constraints
    if (task.context.constraints) {
      constraints.push(...task.context.constraints);
    }

    // Add analysis constraints
    if (analysis?.constraints) {
      constraints.push(...analysis.constraints.map(c => c.description));
    }

    // Add implicit constraints
    if (task.context.userPreferences?.codeStyle) {
      const style = task.context.userPreferences.codeStyle;
      constraints.push(`Use ${style.indentation === 'tabs' ? 'tabs' : `${style.indentSize} spaces`} for indentation`);
      constraints.push(`Use ${style.quotes} quotes`);
      if (style.semicolons) constraints.push('Include semicolons');
    }

    if (constraints.length === 0) {
      return '';
    }

    return `Constraints:
${constraints.map(c => `- ${c}`).join('\n')}`;
  }

  private buildOutputSection(context: PromptContext): string {
    const { task } = context;
    const format: OutputFormat = (task.context.userPreferences?.outputFormat || 'text') as OutputFormat;
    
    let outputSection = '\nOutput Requirements:\n';

    switch (format) {
      case 'code':
        outputSection += '- Provide clean, well-commented code\n';
        outputSection += '- Include error handling\n';
        outputSection += '- Follow best practices\n';
        break;
      
      case 'json':
        outputSection += '- Return valid JSON format\n';
        outputSection += '- Include all required fields\n';
        break;
      
      case 'markdown':
        outputSection += '- Use proper markdown formatting\n';
        outputSection += '- Include code blocks where appropriate\n';
        break;
      
      case 'structured':
        outputSection += '- Organize response with clear sections\n';
        outputSection += '- Use numbered or bulleted lists\n';
        break;
    }

    if (task.context.requirements && task.context.requirements.length > 0) {
      outputSection += '\nSpecific Requirements:\n';
      outputSection += task.context.requirements.map(r => `- ${r}`).join('\n');
    }

    return outputSection;
  }

  private getCacheKey(context: PromptContext): string {
    const { task } = context;
    return `${task.type}:${task.id}:${task.description.substring(0, 50)}`;
  }

  private extractKeywords(task: Task): string[] {
    const text = `${task.description} ${task.context.requirements?.join(' ') || ''}`;
    const words = text.toLowerCase().split(/\W+/);
    
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was'
    ]);

    return words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 10);
  }

  private async findExamples(context: PromptContext): Promise<Example[]> {
    const memories = await this.agent.memory.retrieve({
      type: MemoryType.EPISODIC,
      keywords: this.extractKeywords(context.task),
      limit: 3
    });

    return memories
      .filter(m => m.content?.example)
      .map(m => m.content.example as Example);
  }

  private determineStyle(context: PromptContext): PromptStyle {
    const { task } = context;
    
    // Determine based on task type and context
    let tone: PromptStyle['tone'] = 'technical';
    let verbosity: PromptStyle['verbosity'] = 'normal';
    let structure: PromptStyle['structure'] = 'linear';

    if (task.context.userPreferences?.verbosity) {
      verbosity = task.context.userPreferences.verbosity as PromptStyle['verbosity'];
    }

    if (task.type === TaskType.DOCUMENTATION) {
      tone = 'friendly';
      structure = 'hierarchical';
    } else if (task.type === TaskType.ANALYSIS) {
      structure = 'modular';
      verbosity = 'detailed';
    }

    return { tone, verbosity, structure };
  }

  private summarizeMemory(memory: Memory): string {
    if (typeof memory.content === 'string') {
      return memory.content.substring(0, 100) + '...';
    }
    
    if (memory.content?.description) {
      return memory.content.description;
    }
    
    return 'Previous similar task experience';
  }

  private extractRequirements(context: PromptContext): string {
    const { task, analysis } = context;
    const requirements: string[] = [];

    if (task.context.requirements) {
      requirements.push(...task.context.requirements);
    }

    if (analysis?.requirements) {
      requirements.push(...analysis.requirements
        .filter(r => !r.satisfied)
        .map(r => r.description));
    }

    return requirements.map(r => `- ${r}`).join('\n') || '- No specific requirements';
  }

  private analyzeContext(context: PromptContext): string {
    const { task, analysis } = context;
    const points: string[] = [];

    if (task.context.files && task.context.files.length > 0) {
      points.push(`Working with ${task.context.files.length} files`);
    }

    if (analysis?.complexity) {
      points.push(`Task complexity: ${analysis.complexity}`);
    }

    if (analysis?.suggestedTools) {
      points.push(`Tools needed: ${analysis.suggestedTools.join(', ')}`);
    }

    return points.map(p => `- ${p}`).join('\n') || '- Standard context';
  }

  private planApproach(context: PromptContext): string {
    const { analysis } = context;
    
    if (!analysis) {
      return '- Standard approach';
    }

    const steps: string[] = [];

    if (analysis.suggestedCapabilities.includes('code-analysis')) {
      steps.push('Analyze existing code structure');
    }

    if (analysis.suggestedTools.includes('grep')) {
      steps.push('Search for relevant patterns');
    }

    if (analysis.suggestedTools.includes('write')) {
      steps.push('Generate new code');
    }

    if (analysis.suggestedTools.includes('test')) {
      steps.push('Verify with tests');
    }

    return steps.map((s, i) => `${i + 1}. ${s}`).join('\n') || '- Direct implementation';
  }

  /**
   * Create a custom template
   */
  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Clear prompt cache
   */
  clearCache(): void {
    this.cachedPrompts.clear();
  }
}
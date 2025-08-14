/**
 * Agent Creator Tool
 * Creates custom agents based on user descriptions
 */

import { z } from 'zod';
import { BaseToolAdapter } from './base-adapter';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

// Schema for agent configuration
const AgentConfigSchema = z.object({
  identifier: z.string().regex(/^[a-z0-9-]+$/, 
    'Identifier must use only lowercase letters, numbers, and hyphens'),
  whenToUse: z.string().min(10),
  systemPrompt: z.string().min(50)
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export class AgentCreatorAdapter extends BaseToolAdapter<
  { description: string; existingAgents?: string[] },
  { success: boolean; config: AgentConfig; path?: string }
> {
  name = 'create-agent';
  description = 'Creates a custom agent based on user description';
  parameters = {
    description: {
      type: 'string' as const,
      description: 'Natural language description of what the agent should do',
      required: true
    },
    existingAgents: {
      type: 'array' as const,
      description: 'List of existing agent identifiers to avoid duplicates',
      required: false
    }
  };

  private agent?: any;

  setAgent(agent: any): void {
    this.agent = agent;
  }

  async execute(params: { description: string; existingAgents?: string[] }) {
    const { description, existingAgents = [] } = params;

    // Build the prompt for agent creation
    const systemPrompt = this.buildAgentCreationPrompt();
    const userPrompt = this.buildUserPrompt(description, existingAgents);

    // Use AI to generate agent configuration
    const aiProvider = this.getAIProvider();
    const response = await aiProvider.chat(systemPrompt, userPrompt);

    try {
      // Parse JSON response
      const config = AgentConfigSchema.parse(JSON.parse(response));

      // Validate identifier is unique
      if (existingAgents.includes(config.identifier)) {
        throw new Error(`Agent identifier '${config.identifier}' already exists`);
      }

      // Save agent configuration
      const agentPath = await this.saveAgentConfig(config);

      return {
        success: true,
        config,
        path: agentPath
      };
    } catch (error) {
      this.logger.error('Failed to create agent:', error);
      throw new Error(`Failed to create agent: ${(error as Error).message}`);
    }
  }

  private buildAgentCreationPrompt(): string {
    return `You are an expert at designing AI agents. Given a user's description, you will create a comprehensive agent configuration.

**Important Context**: Consider any project-specific instructions from JUPITER.md files and other context that may include coding standards, project structure, and custom requirements.

When creating an agent, you will:

1. **Extract Core Intent**: Identify the fundamental purpose, key responsibilities, and success criteria. Look for both explicit requirements and implicit needs.

2. **Design Expert Persona**: Create a compelling expert identity that embodies deep domain knowledge. The persona should inspire confidence and guide decision-making.

3. **Architect Comprehensive Instructions**: Develop a system prompt that:
   - Establishes clear behavioral boundaries and operational parameters
   - Provides specific methodologies and best practices for task execution
   - Anticipates edge cases and provides guidance
   - Incorporates specific requirements mentioned by the user
   - Defines output format expectations when relevant
   - Aligns with project-specific patterns

4. **Optimize for Performance**: Include:
   - Decision-making frameworks appropriate to the domain
   - Quality control mechanisms and self-verification steps
   - Efficient workflow patterns
   - Clear escalation or fallback strategies

5. **Create Identifier**: Design a concise, descriptive identifier that:
   - Uses lowercase letters, numbers, and hyphens only
   - Is typically 2-4 words joined by hyphens
   - Clearly indicates the agent's primary function
   - Is memorable and easy to type
   - Avoids generic terms like "helper" or "assistant"

Your output must be a valid JSON object with exactly these fields:
{
  "identifier": "unique-agent-name",
  "whenToUse": "Use this agent when... [clear triggering conditions and use cases with examples]",
  "systemPrompt": "You are... [complete operational instructions in second person]"
}

Key principles:
- Be specific rather than generic
- Include concrete examples when they clarify behavior
- Balance comprehensiveness with clarity
- Ensure the agent has enough context to handle variations
- Make the agent proactive in seeking clarification
- Build in quality assurance and self-correction

Remember: Create autonomous experts capable of handling designated tasks with minimal guidance.`;
  }

  private buildUserPrompt(description: string, existingAgents: string[]): string {
    let prompt = `Create an agent configuration based on this request: "${description}".`;
    
    if (existingAgents.length > 0) {
      prompt += `\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existingAgents.join(', ')}`;
    }

    prompt += '\n\nReturn ONLY the JSON object, no other text.';
    
    return prompt;
  }

  private async saveAgentConfig(config: AgentConfig): Promise<string> {
    const agentsDir = join(process.cwd(), '.jupiter', 'agents');
    
    // Ensure directory exists
    if (!existsSync(agentsDir)) {
      await mkdir(agentsDir, { recursive: true });
    }

    const filePath = join(agentsDir, `${config.identifier}.json`);
    
    // Save configuration
    await writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
    
    this.logger.info(`Agent configuration saved to: ${filePath}`);
    
    return filePath;
  }

  private getAIProvider(): any {
    // Get the agent's AI provider if available
    if (this.agent && 'aiProvider' in this.agent) {
      const agentWithProvider = this.agent as any;
      if (agentWithProvider.aiProvider) {
        return agentWithProvider.aiProvider;
      }
    }
    
    // Fallback to creating a new provider
    throw new Error('AI provider not available - agent must have initialized AI provider');
  }
}

// Example agent configurations that can be created
export const EXAMPLE_AGENTS = {
  'code-reviewer': {
    identifier: 'code-reviewer',
    whenToUse: `Use this agent when you need to review code for quality, bugs, or improvements. 
Examples:
- After writing a new function or class
- Before committing changes
- When refactoring existing code
- To get feedback on code structure`,
    systemPrompt: `You are an expert code reviewer with deep knowledge of software engineering best practices. 
You analyze code for:
- Correctness and potential bugs
- Performance issues
- Security vulnerabilities
- Code style and readability
- Design patterns and architecture
- Test coverage

Provide actionable feedback with specific line references and improvement suggestions.`
  },

  'test-generator': {
    identifier: 'test-generator',
    whenToUse: `Use this agent when you need to create tests for code.
Examples:
- After implementing new functionality
- To increase test coverage
- When fixing bugs (to prevent regression)
- For testing edge cases`,
    systemPrompt: `You are an expert at writing comprehensive test suites.
You create tests that:
- Cover happy paths and edge cases
- Test error conditions
- Ensure proper integration
- Follow testing best practices for the framework
- Include meaningful assertions
- Have clear, descriptive names`
  },

  'api-docs-writer': {
    identifier: 'api-docs-writer',
    whenToUse: `Use this agent when you need to document APIs or interfaces.
Examples:
- After creating new endpoints
- When updating API contracts
- For generating OpenAPI/Swagger specs
- To document SDK methods`,
    systemPrompt: `You are an expert technical writer specializing in API documentation.
You create documentation that includes:
- Clear endpoint descriptions
- Request/response examples
- Authentication requirements
- Error codes and handling
- Rate limits and constraints
- Usage examples in multiple languages`
  }
};
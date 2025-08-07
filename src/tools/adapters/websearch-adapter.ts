/**
 * WebSearch Tool Adapter - Searches the web for information
 */

import { BaseToolAdapter } from '../base-adapter';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export class WebSearchAdapter extends BaseToolAdapter {
  name = 'webSearch';
  description = 'Searches the web and returns relevant results';
  parameters = {
    query: {
      type: 'string' as const,
      description: 'The search query to use',
      required: true,
      minLength: 2
    },
    allowed_domains: {
      type: 'array' as const,
      description: 'Only include search results from these domains',
      required: false
    },
    blocked_domains: {
      type: 'array' as const,
      description: 'Never include search results from these domains',
      required: false
    }
  };

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['query']);
    this.validateTypes(params, {
      query: 'string',
      allowed_domains: 'object',
      blocked_domains: 'object'
    });

    const { query, allowed_domains = [], blocked_domains = [] } = params;

    // Validate query length
    if (query.length < 2) {
      this.error('Query must be at least 2 characters long', 'UNKNOWN_ERROR');
    }

    try {
      // In a real implementation, this would use a search API
      // For now, simulate search results
      const results = await this.simulateSearch(query);
      
      // Filter results based on domain restrictions
      let filteredResults = results;
      
      if (allowed_domains.length > 0) {
        filteredResults = filteredResults.filter(result =>
          allowed_domains.some((domain: string) => result.url.includes(domain))
        );
      }
      
      if (blocked_domains.length > 0) {
        filteredResults = filteredResults.filter(result =>
          !blocked_domains.some((domain: string) => result.url.includes(domain))
        );
      }

      return this.success({
        query,
        results: filteredResults,
        count: filteredResults.length,
        message: `Found ${filteredResults.length} results for "${query}"`
      });
    } catch (error: any) {
      this.error(`Web search failed: ${error.message}`, 'NETWORK_ERROR');
    }
  }

  private async simulateSearch(query: string): Promise<SearchResult[]> {
    // Simulate search results based on query
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];

    // Programming-related results
    if (queryLower.includes('javascript') || queryLower.includes('typescript')) {
      results.push({
        title: 'TypeScript Documentation',
        url: 'https://www.typescriptlang.org/docs/',
        snippet: 'TypeScript is a strongly typed programming language that builds on JavaScript...',
        source: 'typescriptlang.org'
      });
      results.push({
        title: 'MDN Web Docs - JavaScript',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        snippet: 'JavaScript is a lightweight, interpreted programming language with first-class functions...',
        source: 'developer.mozilla.org'
      });
    }

    // React-related results
    if (queryLower.includes('react')) {
      results.push({
        title: 'React – A JavaScript library for building user interfaces',
        url: 'https://react.dev/',
        snippet: 'React lets you build user interfaces out of individual pieces called components...',
        source: 'react.dev'
      });
      results.push({
        title: 'Getting Started with React',
        url: 'https://react.dev/learn',
        snippet: 'Learn how to create React components, use props and state, handle events...',
        source: 'react.dev'
      });
    }

    // Python-related results
    if (queryLower.includes('python')) {
      results.push({
        title: 'Python.org',
        url: 'https://www.python.org/',
        snippet: 'Python is a programming language that lets you work quickly and integrate systems...',
        source: 'python.org'
      });
      results.push({
        title: 'Python Tutorial',
        url: 'https://docs.python.org/3/tutorial/',
        snippet: 'This tutorial introduces the reader informally to the basic concepts of Python...',
        source: 'docs.python.org'
      });
    }

    // API-related results
    if (queryLower.includes('api') || queryLower.includes('rest')) {
      results.push({
        title: 'RESTful API Design Best Practices',
        url: 'https://restfulapi.net/',
        snippet: 'Learn REST API design principles, constraints, and best practices...',
        source: 'restfulapi.net'
      });
    }

    // Git-related results
    if (queryLower.includes('git')) {
      results.push({
        title: 'Git Documentation',
        url: 'https://git-scm.com/doc',
        snippet: 'Git is a free and open source distributed version control system...',
        source: 'git-scm.com'
      });
    }

    // Default results if no specific matches
    if (results.length === 0) {
      results.push({
        title: `Search results for "${query}"`,
        url: 'https://stackoverflow.com/search?q=' + encodeURIComponent(query),
        snippet: 'Stack Overflow is the largest online community for programmers...',
        source: 'stackoverflow.com'
      });
      results.push({
        title: `GitHub search: ${query}`,
        url: 'https://github.com/search?q=' + encodeURIComponent(query),
        snippet: 'Search GitHub for repositories, code, commits, issues, and more...',
        source: 'github.com'
      });
    }

    return results;
  }

  validate(params: any): boolean {
    if (!params.query || params.query.length < 2) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export default new WebSearchAdapter();
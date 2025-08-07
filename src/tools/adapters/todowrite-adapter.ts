/**
 * TodoWrite Tool Adapter - Manages task tracking
 */

import { BaseToolAdapter } from '../base-adapter';
import { v4 as uuidv4 } from 'uuid';

interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  id: string;
}

export class TodoWriteAdapter extends BaseToolAdapter {
  name = 'todoWrite';
  description = 'Create and manage a structured task list';
  parameters = {
    todos: {
      type: 'array' as const,
      description: 'The updated todo list',
      required: true,
      items: {
        content: { type: 'string' as const, required: true, minLength: 1 },
        status: { 
          type: 'string' as const, 
          required: true,
          enum: ['pending', 'in_progress', 'completed']
        },
        priority: {
          type: 'string' as const,
          required: true,
          enum: ['high', 'medium', 'low']
        },
        id: { type: 'string' as const, required: true }
      }
    }
  };

  private todos: Map<string, Todo> = new Map();

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['todos']);
    
    const { todos } = params;

    // Validate todos array
    if (!Array.isArray(todos)) {
      this.error('todos must be an array', 'UNKNOWN_ERROR');
    }

    // Validate each todo
    for (let i = 0; i < todos.length; i++) {
      const todo = todos[i];
      
      if (!todo.content || !todo.status || !todo.priority || !todo.id) {
        this.error(`Todo at index ${i} is missing required fields`, 'VALIDATION_ERROR');
      }

      if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
        this.error(`Invalid status for todo ${i}: ${todo.status}`, 'VALIDATION_ERROR');
      }

      if (!['high', 'medium', 'low'].includes(todo.priority)) {
        this.error(`Invalid priority for todo ${i}: ${todo.priority}`, 'VALIDATION_ERROR');
      }
    }

    try {
      // Update todos
      this.todos.clear();
      for (const todo of todos) {
        this.todos.set(todo.id, todo);
      }

      // Generate summary
      const summary = this.generateSummary();

      return this.success({
        message: 'Todos have been modified successfully',
        summary,
        todos: Array.from(this.todos.values())
      });
    } catch (error: any) {
      this.error(`Failed to update todos: ${error.message}`, 'VALIDATION_ERROR');
    }
  }

  private generateSummary(): any {
    const todos = Array.from(this.todos.values());
    
    const summary = {
      total: todos.length,
      byStatus: {
        pending: todos.filter(t => t.status === 'pending').length,
        in_progress: todos.filter(t => t.status === 'in_progress').length,
        completed: todos.filter(t => t.status === 'completed').length
      },
      byPriority: {
        high: todos.filter(t => t.priority === 'high').length,
        medium: todos.filter(t => t.priority === 'medium').length,
        low: todos.filter(t => t.priority === 'low').length
      },
      completionRate: todos.length > 0 
        ? (todos.filter(t => t.status === 'completed').length / todos.length * 100).toFixed(1) + '%'
        : '0%'
    };

    return summary;
  }

  validate(params: any): boolean {
    return params.todos && Array.isArray(params.todos);
  }

  // Additional methods for todo management
  getTodos(): Todo[] {
    return Array.from(this.todos.values());
  }

  getTodoById(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  addTodo(content: string, priority: 'high' | 'medium' | 'low' = 'medium'): Todo {
    const todo: Todo = {
      id: uuidv4(),
      content,
      status: 'pending',
      priority
    };
    
    this.todos.set(todo.id, todo);
    return todo;
  }

  updateTodoStatus(id: string, status: Todo['status']): boolean {
    const todo = this.todos.get(id);
    if (!todo) return false;
    
    todo.status = status;
    return true;
  }
}

// Export singleton instance
export default new TodoWriteAdapter();
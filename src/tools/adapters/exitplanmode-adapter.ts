/**
 * ExitPlanMode Tool Adapter - Exits planning mode
 */

import { BaseToolAdapter } from '../base-adapter';

export class ExitPlanModeAdapter extends BaseToolAdapter {
  name = 'exitPlanMode';
  description = 'Exit plan mode and present the plan to the user';
  parameters = {
    plan: {
      type: 'string' as const,
      description: 'The plan to present to the user for approval',
      required: true
    }
  };

  async execute(params: any): Promise<any> {
    this.validateRequired(params, ['plan']);
    this.validateTypes(params, {
      plan: 'string'
    });

    const { plan } = params;

    try {
      // Format the plan
      const formattedPlan = this.formatPlan(plan);
      
      return this.success({
        message: 'Exiting plan mode',
        plan: formattedPlan,
        status: 'ready_to_execute',
        prompt: 'Please review the plan above. Would you like me to proceed with implementation?'
      });
    } catch (error: any) {
      this.error(`Failed to exit plan mode: ${error.message}`, 'UNKNOWN_ERROR');
    }
  }

  private formatPlan(plan: string): string {
    // Ensure the plan is properly formatted
    const lines = plan.split('\n').map(line => line.trim()).filter(line => line);
    
    // Add headers if not present
    if (!plan.includes('##') && !plan.includes('#')) {
      return `## Implementation Plan\n\n${lines.join('\n')}`;
    }
    
    return plan;
  }

  validate(params: any): boolean {
    if (!params.plan) return false;
    
    // Plan should not be empty
    if (params.plan.trim().length === 0) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export default new ExitPlanModeAdapter();
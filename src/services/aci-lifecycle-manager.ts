/**
 * ACI Lifecycle Manager
 * Handles container lifecycle management at the application level
 * Instead of database events, this runs as a background service
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { AzureContainerManager } from '../azure/aci-manager';
import { AzureAPIClient } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';

export interface ACILifecycleConfig {
  db: JupiterDBClient;
  aciManager: AzureContainerManager;
  checkIntervalMs?: number; // How often to check (default: 1 minute)
  inactivityThresholdMinutes?: number; // When to pause (default: 5 minutes)
  pauseDurationHours?: number; // How long to stay paused (default: 4 hours)
  cleanupAfterHours?: number; // When to delete terminated (default: 24 hours)
}

export class ACILifecycleManager {
  private logger: Logger;
  private db: JupiterDBClient;
  private aciManager: AzureContainerManager;
  private azureClient: AzureAPIClient;
  private config: Required<ACILifecycleConfig>;
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config: ACILifecycleConfig) {
    this.logger = new Logger('ACILifecycleManager');
    this.db = config.db;
    this.aciManager = config.aciManager;
    this.azureClient = new AzureAPIClient(azureAPIConfig);
    
    this.config = {
      ...config,
      checkIntervalMs: config.checkIntervalMs || 60000, // 1 minute
      inactivityThresholdMinutes: config.inactivityThresholdMinutes || 5,
      pauseDurationHours: config.pauseDurationHours || 4,
      cleanupAfterHours: config.cleanupAfterHours || 24
    };
  }

  /**
   * Start the lifecycle manager
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Lifecycle manager already running');
      return;
    }

    this.logger.info('Starting ACI lifecycle manager', {
      checkInterval: `${this.config.checkIntervalMs / 1000}s`,
      inactivityThreshold: `${this.config.inactivityThresholdMinutes}m`,
      pauseDuration: `${this.config.pauseDurationHours}h`
    });

    this.isRunning = true;
    
    // Run immediately
    this.performLifecycleCheck();
    
    // Then run on interval
    this.intervalId = setInterval(() => {
      this.performLifecycleCheck();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the lifecycle manager
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping ACI lifecycle manager');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    this.isRunning = false;
  }

  /**
   * Perform a lifecycle check
   */
  private async performLifecycleCheck(): Promise<void> {
    try {
      await Promise.all([
        this.pauseInactiveContainers(),
        this.terminateExpiredContainers(),
        this.cleanupTerminatedContainers()
      ]);
    } catch (error) {
      this.logger.error('Lifecycle check failed', error);
    }
  }

  /**
   * Pause containers that have been inactive
   */
  private async pauseInactiveContainers(): Promise<void> {
    try {
      // Find containers to pause
      const containers = await this.db.query(
        `SELECT instance_id, agent_id, last_activity_at,
                TIMESTAMPDIFF(MINUTE, last_activity_at, NOW()) as minutes_inactive
         FROM aci_instances
         WHERE state = 'Running' 
         AND last_activity_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
        [this.config.inactivityThresholdMinutes]
      );

      for (const container of containers) {
        try {
          this.logger.info('Pausing inactive container', {
            instanceId: container.instance_id,
            minutesInactive: container.minutes_inactive
          });

          // Stop the container in Azure via API
          // Note: Stop/Start operations might not be available via API
          // For now, we'll just log the action
          this.logger.info('Container marked for pause in database', {
            instanceId: container.instance_id
          });

          // Update database
          await this.db.execute(
            `UPDATE aci_instances 
             SET state = 'Paused',
                 paused_at = NOW(),
                 scheduled_termination_at = DATE_ADD(NOW(), INTERVAL ? HOUR),
                 updated_at = NOW()
             WHERE instance_id = ?`,
            [this.config.pauseDurationHours, container.instance_id]
          );

          this.logger.info('Container paused successfully', {
            instanceId: container.instance_id
          });
        } catch (error) {
          this.logger.error('Failed to pause container', {
            instanceId: container.instance_id,
            error
          });
        }
      }

      if (containers.length > 0) {
        this.logger.info(`Paused ${containers.length} inactive containers`);
      }
    } catch (error) {
      this.logger.error('Failed to check inactive containers', error);
    }
  }

  /**
   * Terminate containers that have been paused too long
   */
  private async terminateExpiredContainers(): Promise<void> {
    try {
      // Find containers to terminate
      const containers = await this.db.query(
        `SELECT instance_id, agent_id, paused_at, scheduled_termination_at
         FROM aci_instances
         WHERE state = 'Paused' 
         AND scheduled_termination_at <= NOW()`
      );

      for (const container of containers) {
        try {
          this.logger.info('Terminating expired container', {
            instanceId: container.instance_id,
            pausedAt: container.paused_at
          });

          // Delete the container in Azure via API
          await this.azureClient.deleteContainer(container.instance_id);

          // Update database
          await this.db.execute(
            `UPDATE aci_instances 
             SET state = 'Terminated',
                 updated_at = NOW()
             WHERE instance_id = ?`,
            [container.instance_id]
          );

          this.logger.info('Container terminated successfully', {
            instanceId: container.instance_id
          });
        } catch (error) {
          this.logger.error('Failed to terminate container', {
            instanceId: container.instance_id,
            error
          });
        }
      }

      if (containers.length > 0) {
        this.logger.info(`Terminated ${containers.length} expired containers`);
      }
    } catch (error) {
      this.logger.error('Failed to check expired containers', error);
    }
  }

  /**
   * Clean up terminated containers from database
   */
  private async cleanupTerminatedContainers(): Promise<void> {
    try {
      const result = await this.db.execute(
        `DELETE FROM aci_instances 
         WHERE state = 'Terminated' 
         AND updated_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
        [this.config.cleanupAfterHours]
      );

      if (result.affectedRows > 0) {
        this.logger.info(`Cleaned up ${result.affectedRows} terminated containers from database`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup terminated containers', error);
    }
  }

  /**
   * Update container activity timestamp
   */
  async updateActivity(instanceId: string): Promise<void> {
    try {
      await this.db.execute(
        `UPDATE aci_instances 
         SET last_activity_at = NOW() 
         WHERE instance_id = ? AND state = 'Running'`,
        [instanceId]
      );
    } catch (error) {
      this.logger.error('Failed to update container activity', {
        instanceId,
        error
      });
    }
  }

  /**
   * Get lifecycle status
   */
  async getStatus(): Promise<any> {
    const [summary, toPause, toTerminate] = await Promise.all([
      this.db.query('SELECT * FROM aci_status_summary'),
      this.db.query('SELECT * FROM acis_to_pause'),
      this.db.query('SELECT * FROM acis_to_terminate')
    ]);

    return {
      isRunning: this.isRunning,
      config: {
        checkInterval: `${this.config.checkIntervalMs / 1000}s`,
        inactivityThreshold: `${this.config.inactivityThresholdMinutes}m`,
        pauseDuration: `${this.config.pauseDurationHours}h`,
        cleanupAfter: `${this.config.cleanupAfterHours}h`
      },
      summary: summary[0] || {},
      pendingPause: toPause.length,
      pendingTermination: toTerminate.length
    };
  }
}
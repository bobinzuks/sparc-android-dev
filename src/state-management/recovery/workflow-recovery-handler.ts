import { v4 as uuidv4 } from 'uuid';
import {
  RecoveryHandler,
  ResumeOptions,
  CompensationAction,
  CompensationContext,
  ResumabilityInfo,
  RecoveryStrategy,
  RecoveryStrategyType
} from '../interfaces/recovery-handler.interface';
import { CheckpointManager } from '../interfaces/checkpoint-manager.interface';
import { StateStore } from '../interfaces/state-store.interface';
import { ExecutionHistoryTracker, ExecutionEventType } from '../interfaces/execution-history-tracker.interface';
import { ObservabilityService, LogLevel } from '../../observability/interfaces/observability-service.interface';

/**
 * Implementation of the RecoveryHandler interface
 * Provides methods for resuming workflows from checkpoints and handling failures
 */
export class WorkflowRecoveryHandler implements RecoveryHandler {
  /**
   * Prefix for compensation action keys in the state store
   */
  private readonly COMPENSATION_ACTION_KEY_PREFIX = 'compensation-action:';
  
  /**
   * Prefix for idempotency keys in the state store
   */
  private readonly IDEMPOTENCY_KEY_PREFIX = 'idempotency:';
  
  /**
   * Create a new WorkflowRecoveryHandler
   * @param checkpointManager Checkpoint manager for accessing checkpoints
   * @param stateStore State store for persisting recovery data
   * @param historyTracker Execution history tracker for recording recovery events
   * @param observability Optional observability service for monitoring
   */
  constructor(
    private checkpointManager: CheckpointManager,
    private stateStore: StateStore,
    private historyTracker: ExecutionHistoryTracker,
    private observability?: ObservabilityService
  ) {}
  
  /**
   * Restore workflow state from a checkpoint
   * @param checkpointId Unique identifier for the checkpoint
   * @returns Promise that resolves with the restored workflow state
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<any> {
    try {
      const startTime = Date.now();
      
      // Get the checkpoint
      const checkpoint = await this.checkpointManager.getCheckpoint(checkpointId);
      
      if (!checkpoint) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }
      
      // Log metrics if observability service is available
      if (this.observability) {
        const duration = Date.now() - startTime;
        this.observability.recordMetric('recovery.restore.duration', duration);
        this.observability.recordEvent('recovery.restore', {
          checkpointId,
          workflowId: checkpoint.workflowId,
          executionId: checkpoint.executionId,
          timestamp: new Date().toISOString()
        });
      }
      
      return checkpoint.state;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('recovery.restore.error', error as Error, {
          checkpointId
        });
      }
      throw new Error(`Failed to restore from checkpoint: ${(error as Error).message}`);
    }
  }
  
  /**
   * Resume a workflow execution from a checkpoint
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param checkpointId Unique identifier for the checkpoint to resume from
   * @param options Resume options
   * @returns Promise that resolves with the new execution ID
   */
  async resumeWorkflow(
    workflowId: string,
    executionId: string,
    checkpointId: string,
    options?: ResumeOptions
  ): Promise<string> {
    try {
      const startTime = Date.now();
      
      // Get the checkpoint
      const checkpoint = await this.checkpointManager.getCheckpoint(checkpointId);
      
      if (!checkpoint) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }
      
      // Generate a new execution ID
      const newExecutionId = uuidv4();
      
      // Record resume event in the original execution history
      await this.historyTracker.recordEvent(
        workflowId,
        executionId,
        {
          type: ExecutionEventType.WORKFLOW_RESUMED,
          timestamp: Date.now(),
          details: {
            newExecutionId,
            checkpointId,
            options
          }
        }
      );
      
      // Record start event in the new execution history
      await this.historyTracker.recordEvent(
        workflowId,
        newExecutionId,
        {
          type: ExecutionEventType.WORKFLOW_STARTED,
          timestamp: Date.now(),
          details: {
            resumedFrom: {
              executionId,
              checkpointId
            },
            options
          }
        }
      );
      
      // Create a new checkpoint for the new execution
      const newCheckpointId = await this.checkpointManager.createCheckpoint(
        workflowId,
        newExecutionId,
        checkpoint.state,
        {
          ...checkpoint.metadata,
          timestamp: Date.now(),
          resumedFrom: {
            executionId,
            checkpointId
          }
        }
      );
      
      // Log metrics if observability service is available
      if (this.observability) {
        const duration = Date.now() - startTime;
        this.observability.recordMetric('recovery.resume.duration', duration);
        this.observability.recordEvent('recovery.resume', {
          workflowId,
          executionId,
          newExecutionId,
          checkpointId,
          newCheckpointId,
          timestamp: new Date().toISOString()
        });
      }
      
      return newExecutionId;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('recovery.resume.error', error as Error, {
          workflowId,
          executionId,
          checkpointId
        });
      }
      throw new Error(`Failed to resume workflow: ${(error as Error).message}`);
    }
  }
  
  /**
   * Resume a workflow execution from the latest checkpoint
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param options Resume options
   * @returns Promise that resolves with the new execution ID
   */
  async resumeFromLatestCheckpoint(
    workflowId: string,
    executionId: string,
    options?: ResumeOptions
  ): Promise<string> {
    try {
      // Get the latest checkpoint
      const checkpoint = await this.checkpointManager.getLatestCheckpoint(
        workflowId,
        executionId
      );
      
      if (!checkpoint) {
        throw new Error(`No checkpoint found for workflow ${workflowId}, execution ${executionId}`);
      }
      
      // Resume from the latest checkpoint
      return await this.resumeWorkflow(
        workflowId,
        executionId,
        checkpoint.id,
        options
      );
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('recovery.resume_latest.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to resume from latest checkpoint: ${(error as Error).message}`);
    }
  }
  
  /**
   * Execute compensation actions for a failed workflow step
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param stepId Unique identifier for the failed step
   * @param error Error that caused the failure
   * @returns Promise that resolves when compensation is complete
   */
  async compensateForFailure(
    workflowId: string,
    executionId: string,
    stepId: string,
    error: Error
  ): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Get the compensation action
      const compensationAction = await this.getCompensationAction(workflowId, stepId);
      
      if (!compensationAction) {
        // No compensation action registered, log warning and return
        if (this.observability) {
          this.observability.log(LogLevel.WARN, `No compensation action registered for step ${stepId}`, {
            workflowId,
            executionId,
            stepId
          });
        }
        return;
      }
      
      // Get the latest checkpoint to get the state before failure
      const checkpoint = await this.checkpointManager.getLatestCheckpoint(
        workflowId,
        executionId
      );
      
      if (!checkpoint) {
        throw new Error(`No checkpoint found for workflow ${workflowId}, execution ${executionId}`);
      }
      
      // Record compensation start event
      await this.historyTracker.recordEvent(
        workflowId,
        executionId,
        {
          type: ExecutionEventType.COMPENSATION_STARTED,
          timestamp: Date.now(),
          step: stepId,
          details: {
            error: {
              message: error.message,
              stack: error.stack
            }
          }
        }
      );
      
      // Create compensation context
      const context: CompensationContext = {
        workflowId,
        executionId,
        stepId,
        error,
        previousState: checkpoint.state,
        currentState: checkpoint.state, // Current state is the same as previous state since the step failed
        stepInputs: {} // This would be populated with actual step inputs in a real implementation
      };
      
      try {
        // Execute the compensation action
        await compensationAction(context);
        
        // Record compensation complete event
        await this.historyTracker.recordEvent(
          workflowId,
          executionId,
          {
            type: ExecutionEventType.COMPENSATION_COMPLETED,
            timestamp: Date.now(),
            step: stepId
          }
        );
      } catch (compensationError) {
        // Record compensation failed event
        await this.historyTracker.recordEvent(
          workflowId,
          executionId,
          {
            type: ExecutionEventType.COMPENSATION_FAILED,
            timestamp: Date.now(),
            step: stepId,
            error: {
              message: (compensationError as Error).message,
              stack: (compensationError as Error).stack
            }
          }
        );
        
        // Re-throw the error
        throw compensationError;
      }
      
      // Log metrics if observability service is available
      if (this.observability) {
        const duration = Date.now() - startTime;
        this.observability.recordMetric('recovery.compensate.duration', duration);
        this.observability.recordEvent('recovery.compensate', {
          workflowId,
          executionId,
          stepId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('recovery.compensate.error', error as Error, {
          workflowId,
          executionId,
          stepId
        });
      }
      throw new Error(`Failed to compensate for failure: ${(error as Error).message}`);
    }
  }
  
  /**
   * Register a compensation action for a workflow step
   * @param workflowId Unique identifier for the workflow
   * @param stepId Unique identifier for the step
   * @param compensationAction Function to execute for compensation
   * @returns Promise that resolves when the compensation action is registered
   */
  async registerCompensationAction(
    workflowId: string,
    stepId: string,
    compensationAction: CompensationAction
  ): Promise<void> {
    try {
      // Serialize the compensation action
      // Note: In a real implementation, you would need a more robust way to serialize functions
      // This is a simplified approach for demonstration purposes
      const serializedAction = compensationAction.toString();
      
      // Save the compensation action
      await this.stateStore.saveState(
        this.getCompensationActionKey(workflowId, stepId),
        {
          workflowId,
          stepId,
          action: serializedAction
        }
      );
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('recovery.register_compensation', {
          workflowId,
          stepId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('recovery.register_compensation.error', error as Error, {
          workflowId,
          stepId
        });
      }
      throw new Error(`Failed to register compensation action: ${(error as Error).message}`);
    }
  }
  
  /**
   * Check if a workflow execution can be resumed
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with resumability information
   */
  async checkResumability(
    workflowId: string,
    executionId: string
  ): Promise<ResumabilityInfo> {
    try {
      // Get all checkpoints for the workflow execution
      const checkpoints = await this.checkpointManager.listCheckpoints(
        workflowId,
        executionId
      );
      
      if (checkpoints.length === 0) {
        return {
          canResume: false,
          reason: 'No checkpoints found',
          availableCheckpoints: [],
          completedSteps: []
        };
      }
      
      // Get the execution history
      const events = await this.historyTracker.getExecutionHistory(
        workflowId,
        executionId
      );
      
      // Find completed steps
      const completedSteps: string[] = [];
      events.forEach(event => {
        if (event.type === ExecutionEventType.STEP_COMPLETED && event.step) {
          completedSteps.push(event.step);
        }
      });
      
      // Find failed step and error
      const failedEvent = events.find(event => event.type === ExecutionEventType.STEP_FAILED);
      const failedStep = failedEvent?.step;
      const error = failedEvent?.error;
      
      // Check if the workflow was cancelled
      const cancelledEvent = events.find(event => event.type === ExecutionEventType.WORKFLOW_CANCELLED);
      
      // Check if the workflow was completed
      const completedEvent = events.find(event => event.type === ExecutionEventType.WORKFLOW_COMPLETED);
      
      // Determine if the workflow can be resumed
      let canResume = true;
      let reason: string | undefined;
      
      if (completedEvent) {
        canResume = false;
        reason = 'Workflow already completed';
      } else if (cancelledEvent) {
        canResume = false;
        reason = 'Workflow was cancelled';
      }
      
      // Get the latest checkpoint
      const latestCheckpoint = checkpoints[checkpoints.length - 1];
      
      // Create resumability info
      const resumabilityInfo: ResumabilityInfo = {
        canResume,
        reason,
        availableCheckpoints: checkpoints.map(checkpoint => checkpoint.id),
        latestCheckpointId: latestCheckpoint.id,
        latestCheckpointTimestamp: latestCheckpoint.metadata.timestamp,
        completedSteps,
        failedStep,
        error: error ? {
          message: error.message,
          code: error.code
        } : undefined
      };
      
      return resumabilityInfo;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('recovery.check_resumability.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to check resumability: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get the recovery strategy for a workflow failure
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param error Error that caused the failure
   * @returns Promise that resolves with the recovery strategy
   */
  async getRecoveryStrategy(
    workflowId: string,
    executionId: string,
    error: Error
  ): Promise<RecoveryStrategy> {
    try {
      // Get resumability information
      const resumabilityInfo = await this.checkResumability(workflowId, executionId);
      
      // Get the execution history
      const events = await this.historyTracker.getExecutionHistory(
        workflowId,
        executionId
      );
      
      // Count retry attempts
      const retryAttempts = events.filter(
        event => event.type === ExecutionEventType.WORKFLOW_RESUMED
      ).length;
      
      // Determine the recovery strategy based on the error and execution state
      let strategy: RecoveryStrategy;
      
      // Check if the error is retryable
      const isRetryableError = this.isRetryableError(error);
      
      if (!resumabilityInfo.canResume) {
        // Workflow cannot be resumed
        strategy = {
          type: RecoveryStrategyType.COMPENSATE_AND_TERMINATE,
          reason: resumabilityInfo.reason,
          compensateSteps: resumabilityInfo.completedSteps
        };
      } else if (isRetryableError && retryAttempts < 3) {
        // Retryable error and not too many retry attempts
        strategy = {
          type: RecoveryStrategyType.RETRY,
          retryAttempts: retryAttempts + 1,
          retryDelayMs: Math.pow(2, retryAttempts) * 1000, // Exponential backoff
          reason: 'Retryable error'
        };
      } else if (resumabilityInfo.latestCheckpointId) {
        // Resume from the latest checkpoint
        strategy = {
          type: RecoveryStrategyType.RESUME_FROM_CHECKPOINT,
          checkpointId: resumabilityInfo.latestCheckpointId,
          reason: 'Non-retryable error or too many retry attempts'
        };
      } else {
        // No checkpoint available, manual intervention required
        strategy = {
          type: RecoveryStrategyType.MANUAL_INTERVENTION,
          reason: 'No checkpoint available for resumption'
        };
      }
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('recovery.strategy', {
          workflowId,
          executionId,
          strategyType: strategy.type,
          timestamp: new Date().toISOString()
        });
      }
      
      return strategy;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('recovery.strategy.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to get recovery strategy: ${(error as Error).message}`);
    }
  }
  
  /**
   * Ensure idempotency for a workflow step
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param stepId Unique identifier for the step
   * @param idempotencyKey Key to ensure idempotency
   * @returns Promise that resolves with true if the step should be executed, false if it was already executed
   */
  async ensureIdempotency(
    workflowId: string,
    executionId: string,
    stepId: string,
    idempotencyKey: string
  ): Promise<boolean> {
    try {
      const key = this.getIdempotencyKey(workflowId, executionId, stepId, idempotencyKey);
      
      // Check if the step was already executed
      const exists = await this.stateStore.hasState(key);
      
      if (exists) {
        // Step was already executed
        return false;
      }
      
      // Mark the step as executed
      await this.stateStore.saveState(key, {
        workflowId,
        executionId,
        stepId,
        idempotencyKey,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('recovery.idempotency.error', error as Error, {
          workflowId,
          executionId,
          stepId,
          idempotencyKey
        });
      }
      throw new Error(`Failed to ensure idempotency: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get the key for a compensation action in the state store
   * @param workflowId Unique identifier for the workflow
   * @param stepId Unique identifier for the step
   * @returns Key for the compensation action
   */
  private getCompensationActionKey(workflowId: string, stepId: string): string {
    return `${this.COMPENSATION_ACTION_KEY_PREFIX}${workflowId}:${stepId}`;
  }
  
  /**
   * Get the key for an idempotency record in the state store
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param stepId Unique identifier for the step
   * @param idempotencyKey Key to ensure idempotency
   * @returns Key for the idempotency record
   */
  private getIdempotencyKey(
    workflowId: string,
    executionId: string,
    stepId: string,
    idempotencyKey: string
  ): string {
    return `${this.IDEMPOTENCY_KEY_PREFIX}${workflowId}:${executionId}:${stepId}:${idempotencyKey}`;
  }
  
  /**
   * Get a compensation action for a workflow step
   * @param workflowId Unique identifier for the workflow
   * @param stepId Unique identifier for the step
   * @returns Promise that resolves with the compensation action or null if not found
   */
  private async getCompensationAction(
    workflowId: string,
    stepId: string
  ): Promise<CompensationAction | null> {
    const key = this.getCompensationActionKey(workflowId, stepId);
    
    const serializedAction = await this.stateStore.getState<{
      workflowId: string;
      stepId: string;
      action: string;
    }>(key);
    
    if (!serializedAction) {
      return null;
    }
    
    // Note: In a real implementation, you would need a more robust way to deserialize functions
    // This is a simplified approach for demonstration purposes
    try {
      // eslint-disable-next-line no-new-func
      return new Function(`return ${serializedAction.action}`)() as CompensationAction;
    } catch (error) {
      if (this.observability) {
        this.observability.recordError('recovery.deserialize_action.error', error as Error, {
          workflowId,
          stepId
        });
      }
      return null;
    }
  }
  
  /**
   * Check if an error is retryable
   * @param error Error to check
   * @returns True if the error is retryable, false otherwise
   */
  private isRetryableError(error: Error): boolean {
    // This is a simplified implementation
    // In a real system, you would have more sophisticated logic to determine if an error is retryable
    
    // Check for known non-retryable error types
    const nonRetryableErrorTypes = [
      'ValidationError',
      'AuthorizationError',
      'ResourceNotFoundError',
      'BusinessLogicError'
    ];
    
    if (nonRetryableErrorTypes.includes(error.name)) {
      return false;
    }
    
    // Check for known retryable error types
    const retryableErrorTypes = [
      'NetworkError',
      'TimeoutError',
      'ServiceUnavailableError',
      'ConcurrencyError'
    ];
    
    if (retryableErrorTypes.includes(error.name)) {
      return true;
    }
    
    // Check for custom error properties
    const errorAny = error as any;
    if (errorAny.retryable === false) {
      return false;
    }
    
    if (errorAny.retryable === true) {
      return true;
    }
    
    // Default to non-retryable for safety
    return false;
  }
}

/**
 * Create a new instance of WorkflowRecoveryHandler
 * @param checkpointManager Checkpoint manager for accessing checkpoints
 * @param stateStore State store for persisting recovery data
 * @param historyTracker Execution history tracker for recording recovery events
 * @param observability Optional observability service for monitoring
 * @returns A new WorkflowRecoveryHandler instance
 */
export function createWorkflowRecoveryHandler(
  checkpointManager: CheckpointManager,
  stateStore: StateStore,
  historyTracker: ExecutionHistoryTracker,
  observability?: ObservabilityService
): RecoveryHandler {
  return new WorkflowRecoveryHandler(
    checkpointManager,
    stateStore,
    historyTracker,
    observability
  );
}
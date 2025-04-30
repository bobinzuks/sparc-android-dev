/**
 * Interface for the Recovery Handler component of the State Management Layer
 * Provides methods for resuming workflows from checkpoints and handling failures
 */
export interface RecoveryHandler {
  /**
   * Restore workflow state from a checkpoint
   * @param checkpointId Unique identifier for the checkpoint
   * @returns Promise that resolves with the restored workflow state
   */
  restoreFromCheckpoint(checkpointId: string): Promise<any>;
  
  /**
   * Resume a workflow execution from a checkpoint
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param checkpointId Unique identifier for the checkpoint to resume from
   * @param options Resume options
   * @returns Promise that resolves with the new execution ID
   */
  resumeWorkflow(
    workflowId: string,
    executionId: string,
    checkpointId: string,
    options?: ResumeOptions
  ): Promise<string>;
  
  /**
   * Resume a workflow execution from the latest checkpoint
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param options Resume options
   * @returns Promise that resolves with the new execution ID
   */
  resumeFromLatestCheckpoint(
    workflowId: string,
    executionId: string,
    options?: ResumeOptions
  ): Promise<string>;
  
  /**
   * Execute compensation actions for a failed workflow step
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param stepId Unique identifier for the failed step
   * @param error Error that caused the failure
   * @returns Promise that resolves when compensation is complete
   */
  compensateForFailure(
    workflowId: string,
    executionId: string,
    stepId: string,
    error: Error
  ): Promise<void>;
  
  /**
   * Register a compensation action for a workflow step
   * @param workflowId Unique identifier for the workflow
   * @param stepId Unique identifier for the step
   * @param compensationAction Function to execute for compensation
   * @returns Promise that resolves when the compensation action is registered
   */
  registerCompensationAction(
    workflowId: string,
    stepId: string,
    compensationAction: CompensationAction
  ): Promise<void>;
  
  /**
   * Check if a workflow execution can be resumed
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with resumability information
   */
  checkResumability(
    workflowId: string,
    executionId: string
  ): Promise<ResumabilityInfo>;
  
  /**
   * Get the recovery strategy for a workflow failure
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param error Error that caused the failure
   * @returns Promise that resolves with the recovery strategy
   */
  getRecoveryStrategy(
    workflowId: string,
    executionId: string,
    error: Error
  ): Promise<RecoveryStrategy>;
  
  /**
   * Ensure idempotency for a workflow step
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param stepId Unique identifier for the step
   * @param idempotencyKey Key to ensure idempotency
   * @returns Promise that resolves with true if the step should be executed, false if it was already executed
   */
  ensureIdempotency(
    workflowId: string,
    executionId: string,
    stepId: string,
    idempotencyKey: string
  ): Promise<boolean>;
}

/**
 * Options for resuming a workflow
 */
export interface ResumeOptions {
  /**
   * Whether to skip already completed steps
   */
  skipCompletedSteps?: boolean;
  
  /**
   * Whether to retry failed steps
   */
  retryFailedSteps?: boolean;
  
  /**
   * Maximum number of retry attempts for failed steps
   */
  maxRetryAttempts?: number;
  
  /**
   * Delay between retry attempts in milliseconds
   */
  retryDelayMs?: number;
  
  /**
   * Input parameters to override when resuming
   */
  inputOverrides?: Record<string, any>;
  
  /**
   * Steps to force execution for, even if they were already completed
   */
  forceExecuteSteps?: string[];
  
  /**
   * Steps to skip execution for
   */
  skipSteps?: string[];
}

/**
 * Compensation action function type
 */
export type CompensationAction = (
  context: CompensationContext
) => Promise<void>;

/**
 * Context for compensation actions
 */
export interface CompensationContext {
  /**
   * Unique identifier for the workflow
   */
  workflowId: string;
  
  /**
   * Unique identifier for the execution
   */
  executionId: string;
  
  /**
   * Unique identifier for the step
   */
  stepId: string;
  
  /**
   * Error that caused the failure
   */
  error: Error;
  
  /**
   * State before the step execution
   */
  previousState: any;
  
  /**
   * Partial state after the step execution (may be incomplete)
   */
  currentState: any;
  
  /**
   * Step input parameters
   */
  stepInputs: Record<string, any>;
}

/**
 * Information about workflow resumability
 */
export interface ResumabilityInfo {
  /**
   * Whether the workflow can be resumed
   */
  canResume: boolean;
  
  /**
   * Reason why the workflow cannot be resumed (if applicable)
   */
  reason?: string;
  
  /**
   * Available checkpoint IDs for resuming
   */
  availableCheckpoints: string[];
  
  /**
   * ID of the latest checkpoint
   */
  latestCheckpointId?: string;
  
  /**
   * Timestamp of the latest checkpoint
   */
  latestCheckpointTimestamp?: number;
  
  /**
   * Steps that were completed before the failure
   */
  completedSteps: string[];
  
  /**
   * Step that failed (if applicable)
   */
  failedStep?: string;
  
  /**
   * Error that caused the failure (if applicable)
   */
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * Recovery strategy types
 */
export enum RecoveryStrategyType {
  RETRY = 'RETRY',
  RESUME_FROM_CHECKPOINT = 'RESUME_FROM_CHECKPOINT',
  COMPENSATE_AND_TERMINATE = 'COMPENSATE_AND_TERMINATE',
  SKIP_AND_CONTINUE = 'SKIP_AND_CONTINUE',
  MANUAL_INTERVENTION = 'MANUAL_INTERVENTION'
}

/**
 * Recovery strategy for workflow failures
 */
export interface RecoveryStrategy {
  /**
   * Type of recovery strategy
   */
  type: RecoveryStrategyType;
  
  /**
   * Checkpoint ID to resume from (if applicable)
   */
  checkpointId?: string;
  
  /**
   * Number of retry attempts (if applicable)
   */
  retryAttempts?: number;
  
  /**
   * Delay between retry attempts in milliseconds (if applicable)
   */
  retryDelayMs?: number;
  
  /**
   * Steps to compensate (if applicable)
   */
  compensateSteps?: string[];
  
  /**
   * Steps to skip (if applicable)
   */
  skipSteps?: string[];
  
  /**
   * Reason for the strategy
   */
  reason?: string;
  
  /**
   * Custom recovery parameters
   */
  parameters?: Record<string, any>;
}
/**
 * Interface for the Execution History Tracker component of the State Management Layer
 * Provides methods for recording, querying, and managing workflow execution history
 */
export interface ExecutionHistoryTracker {
  /**
   * Record an execution event
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param event Execution event to record
   * @returns Promise that resolves with the event ID
   */
  recordEvent(
    workflowId: string,
    executionId: string,
    event: ExecutionEvent
  ): Promise<string>;
  
  /**
   * Get an execution event by ID
   * @param eventId Unique identifier for the event
   * @returns Promise that resolves with the event or null if not found
   */
  getEvent(eventId: string): Promise<ExecutionHistoryEvent | null>;
  
  /**
   * Get all events for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param options Query options for filtering and pagination
   * @returns Promise that resolves with an array of events
   */
  getExecutionHistory(
    workflowId: string,
    executionId: string,
    options?: ExecutionHistoryQueryOptions
  ): Promise<ExecutionHistoryEvent[]>;
  
  /**
   * Search for execution events matching criteria
   * @param criteria Search criteria
   * @param options Query options for filtering and pagination
   * @returns Promise that resolves with an array of matching events
   */
  searchEvents(
    criteria: ExecutionHistorySearchCriteria,
    options?: ExecutionHistoryQueryOptions
  ): Promise<ExecutionHistoryEvent[]>;
  
  /**
   * Purge execution history for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with the number of purged events
   */
  purgeExecutionHistory(
    workflowId: string,
    executionId: string
  ): Promise<number>;
  
  /**
   * Archive execution history for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param archiveLocation Location to archive the history to
   * @returns Promise that resolves with the archive ID
   */
  archiveExecutionHistory(
    workflowId: string,
    executionId: string,
    archiveLocation: string
  ): Promise<string>;
  
  /**
   * Restore execution history from an archive
   * @param archiveId Unique identifier for the archive
   * @param archiveLocation Location to restore the history from
   * @returns Promise that resolves with the number of restored events
   */
  restoreExecutionHistory(
    archiveId: string,
    archiveLocation: string
  ): Promise<number>;
  
  /**
   * Get execution statistics for a workflow
   * @param workflowId Unique identifier for the workflow
   * @returns Promise that resolves with execution statistics
   */
  getWorkflowStatistics(
    workflowId: string
  ): Promise<WorkflowExecutionStatistics>;
}

/**
 * Execution event types
 */
export enum ExecutionEventType {
  WORKFLOW_STARTED = 'WORKFLOW_STARTED',
  WORKFLOW_COMPLETED = 'WORKFLOW_COMPLETED',
  WORKFLOW_FAILED = 'WORKFLOW_FAILED',
  STEP_STARTED = 'STEP_STARTED',
  STEP_COMPLETED = 'STEP_COMPLETED',
  STEP_FAILED = 'STEP_FAILED',
  CHECKPOINT_CREATED = 'CHECKPOINT_CREATED',
  WORKFLOW_RESUMED = 'WORKFLOW_RESUMED',
  WORKFLOW_SUSPENDED = 'WORKFLOW_SUSPENDED',
  WORKFLOW_CANCELLED = 'WORKFLOW_CANCELLED',
  COMPENSATION_STARTED = 'COMPENSATION_STARTED',
  COMPENSATION_COMPLETED = 'COMPENSATION_COMPLETED',
  COMPENSATION_FAILED = 'COMPENSATION_FAILED',
  CUSTOM = 'CUSTOM'
}

/**
 * Execution event base interface
 */
export interface ExecutionEvent {
  /**
   * Type of the event
   */
  type: ExecutionEventType;
  
  /**
   * Timestamp when the event occurred
   */
  timestamp: number;
  
  /**
   * Step or stage in the workflow (if applicable)
   */
  step?: string;
  
  /**
   * Details of the event
   */
  details?: Record<string, any>;
  
  /**
   * Error information (if applicable)
   */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}

/**
 * Execution history event interface (includes ID and metadata)
 */
export interface ExecutionHistoryEvent extends ExecutionEvent {
  /**
   * Unique identifier for the event
   */
  id: string;
  
  /**
   * Unique identifier for the workflow
   */
  workflowId: string;
  
  /**
   * Unique identifier for the execution
   */
  executionId: string;
  
  /**
   * Sequence number of the event in the execution history
   */
  sequenceNumber: number;
}

/**
 * Query options for execution history
 */
export interface ExecutionHistoryQueryOptions {
  /**
   * Maximum number of events to return
   */
  limit?: number;
  
  /**
   * Number of events to skip
   */
  offset?: number;
  
  /**
   * Sort order for events
   */
  sortOrder?: 'asc' | 'desc';
  
  /**
   * Field to sort by
   */
  sortBy?: 'timestamp' | 'sequenceNumber';
  
  /**
   * Start timestamp for filtering events
   */
  startTime?: number;
  
  /**
   * End timestamp for filtering events
   */
  endTime?: number;
}

/**
 * Search criteria for execution history
 */
export interface ExecutionHistorySearchCriteria {
  /**
   * Workflow ID pattern to match
   */
  workflowIdPattern?: string;
  
  /**
   * Execution ID pattern to match
   */
  executionIdPattern?: string;
  
  /**
   * Event types to include
   */
  eventTypes?: ExecutionEventType[];
  
  /**
   * Step pattern to match
   */
  stepPattern?: string;
  
  /**
   * Whether to include events with errors
   */
  hasError?: boolean;
  
  /**
   * Custom filter function
   */
  customFilter?: (event: ExecutionHistoryEvent) => boolean;
}

/**
 * Workflow execution statistics
 */
export interface WorkflowExecutionStatistics {
  /**
   * Total number of executions
   */
  totalExecutions: number;
  
  /**
   * Number of successful executions
   */
  successfulExecutions: number;
  
  /**
   * Number of failed executions
   */
  failedExecutions: number;
  
  /**
   * Number of cancelled executions
   */
  cancelledExecutions: number;
  
  /**
   * Average execution duration in milliseconds
   */
  averageDuration: number;
  
  /**
   * Maximum execution duration in milliseconds
   */
  maxDuration: number;
  
  /**
   * Minimum execution duration in milliseconds
   */
  minDuration: number;
  
  /**
   * Average number of steps per execution
   */
  averageSteps: number;
  
  /**
   * Most common error types
   */
  commonErrors: Array<{
    code: string;
    count: number;
    percentage: number;
  }>;
  
  /**
   * Execution count by time period
   */
  executionsByTimePeriod: Record<string, number>;
}
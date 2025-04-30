/**
 * Interface for the Checkpoint Manager component of the State Management Layer
 * Provides methods for creating, retrieving, and managing execution checkpoints
 */
export interface CheckpointManager {
  /**
   * Create a checkpoint for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param state Current state of the workflow execution
   * @param metadata Additional metadata for the checkpoint
   * @returns Promise that resolves with the checkpoint ID
   */
  createCheckpoint(
    workflowId: string,
    executionId: string,
    state: any,
    metadata?: CheckpointMetadata
  ): Promise<string>;
  
  /**
   * Get a checkpoint by ID
   * @param checkpointId Unique identifier for the checkpoint
   * @returns Promise that resolves with the checkpoint or null if not found
   */
  getCheckpoint(checkpointId: string): Promise<Checkpoint | null>;
  
  /**
   * Get the latest checkpoint for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with the latest checkpoint or null if none exists
   */
  getLatestCheckpoint(
    workflowId: string,
    executionId: string
  ): Promise<Checkpoint | null>;
  
  /**
   * List all checkpoints for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with an array of checkpoints
   */
  listCheckpoints(
    workflowId: string,
    executionId: string
  ): Promise<Checkpoint[]>;
  
  /**
   * Delete a checkpoint by ID
   * @param checkpointId Unique identifier for the checkpoint
   * @returns Promise that resolves when the checkpoint is deleted
   */
  deleteCheckpoint(checkpointId: string): Promise<void>;
  
  /**
   * Calculate the difference between two checkpoints
   * @param checkpointId1 ID of the first checkpoint
   * @param checkpointId2 ID of the second checkpoint
   * @returns Promise that resolves with the difference between the checkpoints
   */
  diffCheckpoints(
    checkpointId1: string,
    checkpointId2: string
  ): Promise<CheckpointDiff>;
  
  /**
   * Update checkpoint metadata
   * @param checkpointId Unique identifier for the checkpoint
   * @param metadata New metadata to merge with existing metadata
   * @returns Promise that resolves when the metadata is updated
   */
  updateMetadata(
    checkpointId: string,
    metadata: Partial<CheckpointMetadata>
  ): Promise<void>;
  
  /**
   * Purge old checkpoints for a workflow execution, keeping only the specified number of recent ones
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param keepCount Number of recent checkpoints to keep
   * @returns Promise that resolves with the number of purged checkpoints
   */
  purgeCheckpoints(
    workflowId: string,
    executionId: string,
    keepCount: number
  ): Promise<number>;
}

/**
 * Checkpoint metadata
 */
export interface CheckpointMetadata {
  /**
   * Timestamp when the checkpoint was created
   */
  timestamp: number;
  
  /**
   * Version of the checkpoint
   */
  version: string;
  
  /**
   * Step or stage in the workflow
   */
  step?: string;
  
  /**
   * User who created the checkpoint
   */
  user?: string;
  
  /**
   * Reason for creating the checkpoint
   */
  reason?: string;
  
  /**
   * Tags for categorizing the checkpoint
   */
  tags?: string[];
  
  /**
   * Custom properties
   */
  [key: string]: any;
}

/**
 * Checkpoint object
 */
export interface Checkpoint {
  /**
   * Unique identifier for the checkpoint
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
   * State of the workflow execution at the time of the checkpoint
   */
  state: any;
  
  /**
   * Metadata for the checkpoint
   */
  metadata: CheckpointMetadata;
}

/**
 * Checkpoint difference object
 */
export interface CheckpointDiff {
  /**
   * ID of the first checkpoint
   */
  fromCheckpointId: string;
  
  /**
   * ID of the second checkpoint
   */
  toCheckpointId: string;
  
  /**
   * Added properties (present in the second checkpoint but not in the first)
   */
  added: Record<string, any>;
  
  /**
   * Removed properties (present in the first checkpoint but not in the second)
   */
  removed: Record<string, any>;
  
  /**
   * Modified properties (present in both checkpoints but with different values)
   */
  modified: Record<string, { from: any; to: any }>;
  
  /**
   * Unchanged properties (present in both checkpoints with the same values)
   */
  unchanged: string[];
}
import { v4 as uuidv4 } from 'uuid';
import { 
  CheckpointManager, 
  Checkpoint, 
  CheckpointMetadata, 
  CheckpointDiff 
} from '../interfaces/checkpoint-manager.interface';
import { StateStore } from '../interfaces/state-store.interface';
import { SerializationService } from '../interfaces/serialization-service.interface';
import { ObservabilityService } from '../../observability/interfaces/observability-service.interface';

/**
 * Implementation of the CheckpointManager interface
 * Provides methods for creating, retrieving, and managing execution checkpoints
 */
export class CheckpointManagerImpl implements CheckpointManager {
  /**
   * Prefix for checkpoint keys in the state store
   */
  private readonly CHECKPOINT_KEY_PREFIX = 'checkpoint:';
  
  /**
   * Prefix for checkpoint index keys in the state store
   */
  private readonly CHECKPOINT_INDEX_KEY_PREFIX = 'checkpoint-index:';
  
  /**
   * Create a new CheckpointManagerImpl
   * @param stateStore State store for persisting checkpoints
   * @param serializer Service for serializing and deserializing checkpoint data
   * @param observability Optional observability service for monitoring
   */
  constructor(
    private stateStore: StateStore,
    private serializer: SerializationService,
    private observability?: ObservabilityService
  ) {}
  
  /**
   * Create a checkpoint for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param state Current state of the workflow execution
   * @param metadata Additional metadata for the checkpoint
   * @returns Promise that resolves with the checkpoint ID
   */
  async createCheckpoint(
    workflowId: string,
    executionId: string,
    state: any,
    metadata?: CheckpointMetadata
  ): Promise<string> {
    try {
      const startTime = Date.now();
      
      // Generate a unique ID for the checkpoint
      const checkpointId = uuidv4();
      
      // Create default metadata if not provided
      const defaultMetadata: CheckpointMetadata = {
        timestamp: Date.now(),
        version: '1.0.0'
      };
      
      // Merge with provided metadata
      const finalMetadata = { ...defaultMetadata, ...metadata };
      
      // Create the checkpoint object
      const checkpoint: Checkpoint = {
        id: checkpointId,
        workflowId,
        executionId,
        state,
        metadata: finalMetadata
      };
      
      // Save the checkpoint
      await this.stateStore.saveState(
        this.getCheckpointKey(checkpointId),
        checkpoint
      );
      
      // Update the checkpoint index
      await this.updateCheckpointIndex(workflowId, executionId, checkpointId);
      
      // Log metrics if observability service is available
      if (this.observability) {
        const duration = Date.now() - startTime;
        this.observability.recordMetric('checkpoint.create.duration', duration);
        this.observability.recordEvent('checkpoint.create', {
          checkpointId,
          workflowId,
          executionId,
          timestamp: new Date().toISOString()
        });
      }
      
      return checkpointId;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('checkpoint.create.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to create checkpoint: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get a checkpoint by ID
   * @param checkpointId Unique identifier for the checkpoint
   * @returns Promise that resolves with the checkpoint or null if not found
   */
  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    try {
      return await this.stateStore.getState<Checkpoint>(
        this.getCheckpointKey(checkpointId)
      );
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('checkpoint.get.error', error as Error, {
          checkpointId
        });
      }
      throw new Error(`Failed to get checkpoint: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get the latest checkpoint for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with the latest checkpoint or null if none exists
   */
  async getLatestCheckpoint(
    workflowId: string,
    executionId: string
  ): Promise<Checkpoint | null> {
    try {
      // Get the checkpoint index
      const index = await this.getCheckpointIndex(workflowId, executionId);
      
      if (!index || index.checkpointIds.length === 0) {
        return null;
      }
      
      // Get the latest checkpoint ID
      const latestCheckpointId = index.checkpointIds[index.checkpointIds.length - 1];
      
      // Get the checkpoint
      return await this.getCheckpoint(latestCheckpointId);
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('checkpoint.get_latest.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to get latest checkpoint: ${(error as Error).message}`);
    }
  }
  
  /**
   * List all checkpoints for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with an array of checkpoints
   */
  async listCheckpoints(
    workflowId: string,
    executionId: string
  ): Promise<Checkpoint[]> {
    try {
      // Get the checkpoint index
      const index = await this.getCheckpointIndex(workflowId, executionId);
      
      if (!index || index.checkpointIds.length === 0) {
        return [];
      }
      
      // Get all checkpoints
      const checkpoints: Checkpoint[] = [];
      
      for (const checkpointId of index.checkpointIds) {
        const checkpoint = await this.getCheckpoint(checkpointId);
        if (checkpoint) {
          checkpoints.push(checkpoint);
        }
      }
      
      return checkpoints;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('checkpoint.list.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to list checkpoints: ${(error as Error).message}`);
    }
  }
  
  /**
   * Delete a checkpoint by ID
   * @param checkpointId Unique identifier for the checkpoint
   * @returns Promise that resolves when the checkpoint is deleted
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    try {
      // Get the checkpoint to find its workflow and execution IDs
      const checkpoint = await this.getCheckpoint(checkpointId);
      
      if (!checkpoint) {
        return;
      }
      
      // Delete the checkpoint
      await this.stateStore.deleteState(this.getCheckpointKey(checkpointId));
      
      // Update the checkpoint index
      await this.removeFromCheckpointIndex(
        checkpoint.workflowId,
        checkpoint.executionId,
        checkpointId
      );
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('checkpoint.delete', {
          checkpointId,
          workflowId: checkpoint.workflowId,
          executionId: checkpoint.executionId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('checkpoint.delete.error', error as Error, {
          checkpointId
        });
      }
      throw new Error(`Failed to delete checkpoint: ${(error as Error).message}`);
    }
  }
  
  /**
   * Calculate the difference between two checkpoints
   * @param checkpointId1 ID of the first checkpoint
   * @param checkpointId2 ID of the second checkpoint
   * @returns Promise that resolves with the difference between the checkpoints
   */
  async diffCheckpoints(
    checkpointId1: string,
    checkpointId2: string
  ): Promise<CheckpointDiff> {
    try {
      // Get both checkpoints
      const checkpoint1 = await this.getCheckpoint(checkpointId1);
      const checkpoint2 = await this.getCheckpoint(checkpointId2);
      
      if (!checkpoint1) {
        throw new Error(`Checkpoint not found: ${checkpointId1}`);
      }
      
      if (!checkpoint2) {
        throw new Error(`Checkpoint not found: ${checkpointId2}`);
      }
      
      // Initialize diff object
      const diff: CheckpointDiff = {
        fromCheckpointId: checkpointId1,
        toCheckpointId: checkpointId2,
        added: {},
        removed: {},
        modified: {},
        unchanged: []
      };
      
      // Flatten the state objects for easier comparison
      const flatState1 = this.flattenObject(checkpoint1.state);
      const flatState2 = this.flattenObject(checkpoint2.state);
      
      // Find added, removed, modified, and unchanged properties
      const allKeys = new Set([
        ...Object.keys(flatState1),
        ...Object.keys(flatState2)
      ]);
      
      for (const key of allKeys) {
        if (!(key in flatState1)) {
          // Added in checkpoint2
          diff.added[key] = flatState2[key];
        } else if (!(key in flatState2)) {
          // Removed in checkpoint2
          diff.removed[key] = flatState1[key];
        } else if (!this.serializer.isEqual(flatState1[key], flatState2[key])) {
          // Modified
          diff.modified[key] = {
            from: flatState1[key],
            to: flatState2[key]
          };
        } else {
          // Unchanged
          diff.unchanged.push(key);
        }
      }
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('checkpoint.diff', {
          fromCheckpointId: checkpointId1,
          toCheckpointId: checkpointId2,
          addedCount: Object.keys(diff.added).length,
          removedCount: Object.keys(diff.removed).length,
          modifiedCount: Object.keys(diff.modified).length,
          unchangedCount: diff.unchanged.length,
          timestamp: new Date().toISOString()
        });
      }
      
      return diff;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('checkpoint.diff.error', error as Error, {
          checkpointId1,
          checkpointId2
        });
      }
      throw new Error(`Failed to diff checkpoints: ${(error as Error).message}`);
    }
  }
  
  /**
   * Update checkpoint metadata
   * @param checkpointId Unique identifier for the checkpoint
   * @param metadata New metadata to merge with existing metadata
   * @returns Promise that resolves when the metadata is updated
   */
  async updateMetadata(
    checkpointId: string,
    metadata: Partial<CheckpointMetadata>
  ): Promise<void> {
    try {
      // Get the checkpoint
      const checkpoint = await this.getCheckpoint(checkpointId);
      
      if (!checkpoint) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }
      
      // Merge with existing metadata
      checkpoint.metadata = { ...checkpoint.metadata, ...metadata };
      
      // Save the updated checkpoint
      await this.stateStore.saveState(
        this.getCheckpointKey(checkpointId),
        checkpoint
      );
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('checkpoint.update_metadata', {
          checkpointId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('checkpoint.update_metadata.error', error as Error, {
          checkpointId
        });
      }
      throw new Error(`Failed to update checkpoint metadata: ${(error as Error).message}`);
    }
  }
  
  /**
   * Purge old checkpoints for a workflow execution, keeping only the specified number of recent ones
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param keepCount Number of recent checkpoints to keep
   * @returns Promise that resolves with the number of purged checkpoints
   */
  async purgeCheckpoints(
    workflowId: string,
    executionId: string,
    keepCount: number
  ): Promise<number> {
    try {
      // Get the checkpoint index
      const index = await this.getCheckpointIndex(workflowId, executionId);
      
      if (!index || index.checkpointIds.length <= keepCount) {
        return 0;
      }
      
      // Calculate how many checkpoints to purge
      const purgeCount = index.checkpointIds.length - keepCount;
      
      // Get the checkpoint IDs to purge (oldest first)
      const checkpointIdsToPurge = index.checkpointIds.slice(0, purgeCount);
      
      // Delete each checkpoint
      for (const checkpointId of checkpointIdsToPurge) {
        await this.stateStore.deleteState(this.getCheckpointKey(checkpointId));
      }
      
      // Update the checkpoint index
      index.checkpointIds = index.checkpointIds.slice(purgeCount);
      await this.stateStore.saveState(
        this.getCheckpointIndexKey(workflowId, executionId),
        index
      );
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('checkpoint.purge', {
          workflowId,
          executionId,
          purgeCount,
          keepCount,
          timestamp: new Date().toISOString()
        });
      }
      
      return purgeCount;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('checkpoint.purge.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to purge checkpoints: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get the key for a checkpoint in the state store
   * @param checkpointId Unique identifier for the checkpoint
   * @returns Key for the checkpoint
   */
  private getCheckpointKey(checkpointId: string): string {
    return `${this.CHECKPOINT_KEY_PREFIX}${checkpointId}`;
  }
  
  /**
   * Get the key for a checkpoint index in the state store
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Key for the checkpoint index
   */
  private getCheckpointIndexKey(workflowId: string, executionId: string): string {
    return `${this.CHECKPOINT_INDEX_KEY_PREFIX}${workflowId}:${executionId}`;
  }
  
  /**
   * Get the checkpoint index for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with the checkpoint index or null if not found
   */
  private async getCheckpointIndex(
    workflowId: string,
    executionId: string
  ): Promise<CheckpointIndex | null> {
    const key = this.getCheckpointIndexKey(workflowId, executionId);
    return await this.stateStore.getState<CheckpointIndex>(key);
  }
  
  /**
   * Update the checkpoint index for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param checkpointId Unique identifier for the checkpoint to add
   * @returns Promise that resolves when the index is updated
   */
  private async updateCheckpointIndex(
    workflowId: string,
    executionId: string,
    checkpointId: string
  ): Promise<void> {
    const key = this.getCheckpointIndexKey(workflowId, executionId);
    
    // Get the existing index or create a new one
    const existingIndex = await this.stateStore.getState<CheckpointIndex>(key);
    const index: CheckpointIndex = existingIndex || {
      workflowId,
      executionId,
      checkpointIds: []
    };
    
    // Add the checkpoint ID to the index
    index.checkpointIds.push(checkpointId);
    
    // Save the updated index
    await this.stateStore.saveState(key, index);
  }
  
  /**
   * Remove a checkpoint from the checkpoint index
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param checkpointId Unique identifier for the checkpoint to remove
   * @returns Promise that resolves when the index is updated
   */
  private async removeFromCheckpointIndex(
    workflowId: string,
    executionId: string,
    checkpointId: string
  ): Promise<void> {
    const key = this.getCheckpointIndexKey(workflowId, executionId);
    
    // Get the existing index
    const index = await this.stateStore.getState<CheckpointIndex>(key);
    
    if (!index) {
      return;
    }
    
    // Remove the checkpoint ID from the index
    index.checkpointIds = index.checkpointIds.filter(id => id !== checkpointId);
    
    // Save the updated index
    await this.stateStore.saveState(key, index);
  }
  
  /**
   * Flatten an object into a single-level object with dot-notation keys
   * @param obj Object to flatten
   * @param prefix Prefix for keys
   * @returns Flattened object
   */
  private flattenObject(obj: any, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively flatten nested objects
          Object.assign(result, this.flattenObject(value, newKey));
        } else {
          // Add leaf values
          result[newKey] = value;
        }
      }
    }
    
    return result;
  }
}

/**
 * Checkpoint index for tracking checkpoints for a workflow execution
 */
interface CheckpointIndex {
  /**
   * Unique identifier for the workflow
   */
  workflowId: string;
  
  /**
   * Unique identifier for the execution
   */
  executionId: string;
  
  /**
   * Array of checkpoint IDs, ordered by creation time (oldest first)
   */
  checkpointIds: string[];
}

/**
 * Create a new instance of CheckpointManagerImpl
 * @param stateStore State store for persisting checkpoints
 * @param serializer Service for serializing and deserializing checkpoint data
 * @param observability Optional observability service for monitoring
 * @returns A new CheckpointManagerImpl instance
 */
export function createCheckpointManager(
  stateStore: StateStore,
  serializer: SerializationService,
  observability?: ObservabilityService
): CheckpointManager {
  return new CheckpointManagerImpl(stateStore, serializer, observability);
}
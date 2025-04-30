/**
 * State Management Layer
 * 
 * This layer provides persistent state storage, checkpoint management,
 * caching mechanisms, execution history tracking, and workflow resumability support.
 */

// Export interfaces
export * from './interfaces/state-store.interface';
export * from './interfaces/state-repository.interface';
export * from './interfaces/serialization-service.interface';
export * from './interfaces/cache-manager.interface';
export * from './interfaces/checkpoint-manager.interface';
export * from './interfaces/execution-history-tracker.interface';
export * from './interfaces/recovery-handler.interface';

// Export implementations
export * from './store/state-store';
export * from './repository/filesystem-state-repository';
export * from './repository/in-memory-state-repository';
export * from './serialization/json-serialization-service';
export * from './cache/cache-manager';
export * from './checkpoint/checkpoint-manager';
export * from './history/execution-history-tracker';
export * from './recovery/workflow-recovery-handler';

// Import dependencies
import { createStateStore } from './store/state-store';
import { createFilesystemStateRepository } from './repository/filesystem-state-repository';
import { createInMemoryStateRepository } from './repository/in-memory-state-repository';
import { createJsonSerializationService } from './serialization/json-serialization-service';
import { createCacheManager } from './cache/cache-manager';
import { createCheckpointManager } from './checkpoint/checkpoint-manager';
import { createExecutionHistoryTracker } from './history/execution-history-tracker';
import { createWorkflowRecoveryHandler } from './recovery/workflow-recovery-handler';
import { ObservabilityService } from '../observability/interfaces/observability-service.interface';

/**
 * Options for creating the state management layer
 */
export interface StateManagementOptions {
  /**
   * Base directory for filesystem state repository
   */
  baseDir?: string;
  
  /**
   * Whether to use in-memory repository instead of filesystem
   */
  useInMemory?: boolean;
  
  /**
   * Cache options
   */
  cacheOptions?: {
    /**
     * Maximum number of items in the cache
     */
    maxSize?: number;
    
    /**
     * Default time-to-live in milliseconds
     */
    defaultTtlMs?: number;
    
    /**
     * Interval for cleaning up expired items in milliseconds
     */
    cleanupIntervalMs?: number;
  };
  
  /**
   * Observability service for monitoring
   */
  observability?: ObservabilityService;
}

/**
 * State management layer components
 */
export interface StateManagement {
  /**
   * State store for persisting state data
   */
  stateStore: ReturnType<typeof createStateStore>;
  
  /**
   * State repository for low-level state storage
   */
  stateRepository: ReturnType<typeof createFilesystemStateRepository> | ReturnType<typeof createInMemoryStateRepository>;
  
  /**
   * Serialization service for serializing and deserializing state data
   */
  serializationService: ReturnType<typeof createJsonSerializationService>;
  
  /**
   * Cache manager for caching state data
   */
  cacheManager: ReturnType<typeof createCacheManager>;
  
  /**
   * Checkpoint manager for creating and managing checkpoints
   */
  checkpointManager: ReturnType<typeof createCheckpointManager>;
  
  /**
   * Execution history tracker for recording and querying workflow execution history
   */
  executionHistoryTracker: ReturnType<typeof createExecutionHistoryTracker>;
  
  /**
   * Recovery handler for resuming workflows from checkpoints and handling failures
   */
  recoveryHandler: ReturnType<typeof createWorkflowRecoveryHandler>;
}

/**
 * Create the state management layer
 * @param options Options for creating the state management layer
 * @returns State management layer components
 */
export function createStateManagement(options: StateManagementOptions = {}): StateManagement {
  // Create serialization service
  const serializationService = createJsonSerializationService();
  
  // Create state repository
  const stateRepository = options.useInMemory
    ? createInMemoryStateRepository()
    : createFilesystemStateRepository(options.baseDir || './data/state');
  
  // Create cache manager
  const cacheManager = createCacheManager(options.cacheOptions, options.observability);
  
  // Create state store
  const stateStore = createStateStore(
    stateRepository,
    serializationService,
    cacheManager,
    options.observability
  );
  
  // Create checkpoint manager
  const checkpointManager = createCheckpointManager(
    stateStore,
    serializationService,
    options.observability
  );
  
  // Create execution history tracker
  const executionHistoryTracker = createExecutionHistoryTracker(
    stateStore,
    options.observability
  );
  
  // Create recovery handler
  const recoveryHandler = createWorkflowRecoveryHandler(
    checkpointManager,
    stateStore,
    executionHistoryTracker,
    options.observability
  );
  
  return {
    stateStore,
    stateRepository,
    serializationService,
    cacheManager,
    checkpointManager,
    executionHistoryTracker,
    recoveryHandler
  };
}
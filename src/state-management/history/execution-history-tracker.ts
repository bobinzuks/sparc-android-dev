import { v4 as uuidv4 } from 'uuid';
import {
  ExecutionHistoryTracker,
  ExecutionEvent,
  ExecutionHistoryEvent,
  ExecutionHistoryQueryOptions,
  ExecutionHistorySearchCriteria,
  WorkflowExecutionStatistics
} from '../interfaces/execution-history-tracker.interface';
import { StateStore } from '../interfaces/state-store.interface';
import { ObservabilityService } from '../../observability/interfaces/observability-service.interface';

/**
 * Implementation of the ExecutionHistoryTracker interface
 * Provides methods for recording, querying, and managing workflow execution history
 */
export class ExecutionHistoryTrackerImpl implements ExecutionHistoryTracker {
  /**
   * Prefix for event keys in the state store
   */
  private readonly EVENT_KEY_PREFIX = 'execution-event:';
  
  /**
   * Prefix for execution history keys in the state store
   */
  private readonly EXECUTION_HISTORY_KEY_PREFIX = 'execution-history:';
  
  /**
   * Create a new ExecutionHistoryTrackerImpl
   * @param stateStore State store for persisting execution history
   * @param observability Optional observability service for monitoring
   */
  constructor(
    private stateStore: StateStore,
    private observability?: ObservabilityService
  ) {}
  
  /**
   * Record an execution event
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param event Execution event to record
   * @returns Promise that resolves with the event ID
   */
  async recordEvent(
    workflowId: string,
    executionId: string,
    event: ExecutionEvent
  ): Promise<string> {
    try {
      const startTime = Date.now();
      
      // Generate a unique ID for the event
      const eventId = uuidv4();
      
      // Get the current sequence number
      const history = await this.getOrCreateExecutionHistory(workflowId, executionId);
      const sequenceNumber = history.nextSequenceNumber++;
      
      // Create the execution history event
      const historyEvent: ExecutionHistoryEvent = {
        ...event,
        id: eventId,
        workflowId,
        executionId,
        sequenceNumber
      };
      
      // Save the event
      await this.stateStore.saveState(
        this.getEventKey(eventId),
        historyEvent
      );
      
      // Update the execution history
      history.eventIds.push(eventId);
      await this.stateStore.saveState(
        this.getExecutionHistoryKey(workflowId, executionId),
        history
      );
      
      // Log metrics if observability service is available
      if (this.observability) {
        const duration = Date.now() - startTime;
        this.observability.recordMetric('execution_history.record.duration', duration);
        this.observability.recordEvent('execution_history.record', {
          eventId,
          workflowId,
          executionId,
          eventType: event.type,
          timestamp: new Date().toISOString()
        });
      }
      
      return eventId;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('execution_history.record.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to record execution event: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get an execution event by ID
   * @param eventId Unique identifier for the event
   * @returns Promise that resolves with the event or null if not found
   */
  async getEvent(eventId: string): Promise<ExecutionHistoryEvent | null> {
    try {
      return await this.stateStore.getState<ExecutionHistoryEvent>(
        this.getEventKey(eventId)
      );
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('execution_history.get_event.error', error as Error, {
          eventId
        });
      }
      throw new Error(`Failed to get execution event: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get all events for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param options Query options for filtering and pagination
   * @returns Promise that resolves with an array of events
   */
  async getExecutionHistory(
    workflowId: string,
    executionId: string,
    options?: ExecutionHistoryQueryOptions
  ): Promise<ExecutionHistoryEvent[]> {
    try {
      // Get the execution history
      const history = await this.getOrCreateExecutionHistory(workflowId, executionId);
      
      if (history.eventIds.length === 0) {
        return [];
      }
      
      // Get all events
      const events: ExecutionHistoryEvent[] = [];
      
      for (const eventId of history.eventIds) {
        const event = await this.getEvent(eventId);
        if (event) {
          events.push(event);
        }
      }
      
      // Apply filtering based on options
      let filteredEvents = events;
      
      if (options) {
        if (options.startTime !== undefined) {
          filteredEvents = filteredEvents.filter(event => event.timestamp >= options.startTime!);
        }
        
        if (options.endTime !== undefined) {
          filteredEvents = filteredEvents.filter(event => event.timestamp <= options.endTime!);
        }
        
        // Sort events
        const sortBy = options.sortBy || 'sequenceNumber';
        const sortOrder = options.sortOrder || 'asc';
        
        filteredEvents.sort((a, b) => {
          const aValue = a[sortBy];
          const bValue = b[sortBy];
          
          if (sortOrder === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          } else {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
          }
        });
        
        // Apply pagination
        if (options.offset !== undefined) {
          filteredEvents = filteredEvents.slice(options.offset);
        }
        
        if (options.limit !== undefined) {
          filteredEvents = filteredEvents.slice(0, options.limit);
        }
      }
      
      return filteredEvents;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('execution_history.get_history.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to get execution history: ${(error as Error).message}`);
    }
  }
  
  /**
   * Search for execution events matching criteria
   * @param criteria Search criteria
   * @param options Query options for filtering and pagination
   * @returns Promise that resolves with an array of matching events
   */
  async searchEvents(
    criteria: ExecutionHistorySearchCriteria,
    options?: ExecutionHistoryQueryOptions
  ): Promise<ExecutionHistoryEvent[]> {
    try {
      // Get all workflow execution histories matching the criteria
      const workflowPattern = criteria.workflowIdPattern || '*';
      const executionPattern = criteria.executionIdPattern || '*';
      
      const historyKeys = await this.stateStore.listStateKeys(
        `${this.EXECUTION_HISTORY_KEY_PREFIX}${workflowPattern}:${executionPattern}`
      );
      
      if (historyKeys.length === 0) {
        return [];
      }
      
      // Get all events from all matching histories
      const allEvents: ExecutionHistoryEvent[] = [];
      
      for (const historyKey of historyKeys) {
        // Extract workflowId and executionId from the key
        const keyParts = historyKey.substring(this.EXECUTION_HISTORY_KEY_PREFIX.length).split(':');
        const workflowId = keyParts[0];
        const executionId = keyParts[1];
        
        // Get events for this execution
        const events = await this.getExecutionHistory(workflowId, executionId);
        allEvents.push(...events);
      }
      
      // Apply filtering based on criteria
      let filteredEvents = allEvents;
      
      if (criteria.eventTypes && criteria.eventTypes.length > 0) {
        filteredEvents = filteredEvents.filter(event => 
          criteria.eventTypes!.includes(event.type)
        );
      }
      
      if (criteria.stepPattern) {
        const stepRegex = new RegExp(criteria.stepPattern.replace(/\*/g, '.*'));
        filteredEvents = filteredEvents.filter(event => 
          event.step && stepRegex.test(event.step)
        );
      }
      
      if (criteria.hasError !== undefined) {
        filteredEvents = filteredEvents.filter(event => 
          (event.error !== undefined) === criteria.hasError
        );
      }
      
      if (criteria.customFilter) {
        filteredEvents = filteredEvents.filter(criteria.customFilter);
      }
      
      // Apply query options
      if (options) {
        if (options.startTime !== undefined) {
          filteredEvents = filteredEvents.filter(event => event.timestamp >= options.startTime!);
        }
        
        if (options.endTime !== undefined) {
          filteredEvents = filteredEvents.filter(event => event.timestamp <= options.endTime!);
        }
        
        // Sort events
        const sortBy = options.sortBy || 'timestamp';
        const sortOrder = options.sortOrder || 'desc';
        
        filteredEvents.sort((a, b) => {
          const aValue = a[sortBy];
          const bValue = b[sortBy];
          
          if (sortOrder === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          } else {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
          }
        });
        
        // Apply pagination
        if (options.offset !== undefined) {
          filteredEvents = filteredEvents.slice(options.offset);
        }
        
        if (options.limit !== undefined) {
          filteredEvents = filteredEvents.slice(0, options.limit);
        }
      }
      
      return filteredEvents;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('execution_history.search.error', error as Error, {
          criteria
        });
      }
      throw new Error(`Failed to search execution events: ${(error as Error).message}`);
    }
  }
  
  /**
   * Purge execution history for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with the number of purged events
   */
  async purgeExecutionHistory(
    workflowId: string,
    executionId: string
  ): Promise<number> {
    try {
      // Get the execution history
      const history = await this.getOrCreateExecutionHistory(workflowId, executionId);
      
      if (history.eventIds.length === 0) {
        return 0;
      }
      
      // Delete all events
      for (const eventId of history.eventIds) {
        await this.stateStore.deleteState(this.getEventKey(eventId));
      }
      
      // Delete the execution history
      await this.stateStore.deleteState(
        this.getExecutionHistoryKey(workflowId, executionId)
      );
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('execution_history.purge', {
          workflowId,
          executionId,
          eventCount: history.eventIds.length,
          timestamp: new Date().toISOString()
        });
      }
      
      return history.eventIds.length;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('execution_history.purge.error', error as Error, {
          workflowId,
          executionId
        });
      }
      throw new Error(`Failed to purge execution history: ${(error as Error).message}`);
    }
  }
  
  /**
   * Archive execution history for a workflow execution
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @param archiveLocation Location to archive the history to
   * @returns Promise that resolves with the archive ID
   */
  async archiveExecutionHistory(
    workflowId: string,
    executionId: string,
    archiveLocation: string
  ): Promise<string> {
    try {
      // Get the execution history
      const events = await this.getExecutionHistory(workflowId, executionId);
      
      if (events.length === 0) {
        throw new Error(`No execution history found for workflow ${workflowId}, execution ${executionId}`);
      }
      
      // Create the archive
      const archiveId = uuidv4();
      const archive: ExecutionHistoryArchive = {
        id: archiveId,
        workflowId,
        executionId,
        events,
        createdAt: Date.now(),
        location: archiveLocation
      };
      
      // Save the archive
      await this.stateStore.saveState(
        `archive:${archiveId}`,
        archive
      );
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('execution_history.archive', {
          archiveId,
          workflowId,
          executionId,
          eventCount: events.length,
          location: archiveLocation,
          timestamp: new Date().toISOString()
        });
      }
      
      return archiveId;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('execution_history.archive.error', error as Error, {
          workflowId,
          executionId,
          archiveLocation
        });
      }
      throw new Error(`Failed to archive execution history: ${(error as Error).message}`);
    }
  }
  
  /**
   * Restore execution history from an archive
   * @param archiveId Unique identifier for the archive
   * @param archiveLocation Location to restore the history from
   * @returns Promise that resolves with the number of restored events
   */
  async restoreExecutionHistory(
    archiveId: string,
    archiveLocation: string
  ): Promise<number> {
    try {
      // Get the archive
      const archive = await this.stateStore.getState<ExecutionHistoryArchive>(
        `archive:${archiveId}`
      );
      
      if (!archive) {
        throw new Error(`Archive not found: ${archiveId}`);
      }
      
      if (archive.location !== archiveLocation) {
        throw new Error(`Archive location mismatch: expected ${archive.location}, got ${archiveLocation}`);
      }
      
      // Purge existing history if any
      await this.purgeExecutionHistory(archive.workflowId, archive.executionId);
      
      // Create a new execution history
      const history: ExecutionHistory = {
        workflowId: archive.workflowId,
        executionId: archive.executionId,
        eventIds: [],
        nextSequenceNumber: 0
      };
      
      // Restore all events
      for (const event of archive.events) {
        const eventId = uuidv4();
        const restoredEvent: ExecutionHistoryEvent = {
          ...event,
          id: eventId
        };
        
        // Save the event
        await this.stateStore.saveState(
          this.getEventKey(eventId),
          restoredEvent
        );
        
        // Update the execution history
        history.eventIds.push(eventId);
        history.nextSequenceNumber = Math.max(history.nextSequenceNumber, restoredEvent.sequenceNumber + 1);
      }
      
      // Save the execution history
      await this.stateStore.saveState(
        this.getExecutionHistoryKey(archive.workflowId, archive.executionId),
        history
      );
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('execution_history.restore', {
          archiveId,
          workflowId: archive.workflowId,
          executionId: archive.executionId,
          eventCount: archive.events.length,
          location: archiveLocation,
          timestamp: new Date().toISOString()
        });
      }
      
      return archive.events.length;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('execution_history.restore.error', error as Error, {
          archiveId,
          archiveLocation
        });
      }
      throw new Error(`Failed to restore execution history: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get execution statistics for a workflow
   * @param workflowId Unique identifier for the workflow
   * @returns Promise that resolves with execution statistics
   */
  async getWorkflowStatistics(
    workflowId: string
  ): Promise<WorkflowExecutionStatistics> {
    try {
      // Get all execution histories for the workflow
      const historyKeys = await this.stateStore.listStateKeys(
        `${this.EXECUTION_HISTORY_KEY_PREFIX}${workflowId}:*`
      );
      
      if (historyKeys.length === 0) {
        return {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          cancelledExecutions: 0,
          averageDuration: 0,
          maxDuration: 0,
          minDuration: 0,
          averageSteps: 0,
          commonErrors: [],
          executionsByTimePeriod: {}
        };
      }
      
      // Initialize statistics
      let totalExecutions = 0;
      let successfulExecutions = 0;
      let failedExecutions = 0;
      let cancelledExecutions = 0;
      let totalDuration = 0;
      let maxDuration = 0;
      let minDuration = Number.MAX_SAFE_INTEGER;
      let totalSteps = 0;
      const errorCounts: Record<string, number> = {};
      const executionsByDay: Record<string, number> = {};
      
      // Process each execution
      for (const historyKey of historyKeys) {
        // Extract executionId from the key
        const keyParts = historyKey.substring(this.EXECUTION_HISTORY_KEY_PREFIX.length).split(':');
        const executionId = keyParts[1];
        
        // Get events for this execution
        const events = await this.getExecutionHistory(workflowId, executionId);
        
        if (events.length === 0) {
          continue;
        }
        
        totalExecutions++;
        
        // Count steps (unique step names)
        const uniqueSteps = new Set<string>();
        events.forEach(event => {
          if (event.step) {
            uniqueSteps.add(event.step);
          }
        });
        
        totalSteps += uniqueSteps.size;
        
        // Find start and end events
        const startEvent = events.find(e => e.type === 'WORKFLOW_STARTED');
        const completedEvent = events.find(e => e.type === 'WORKFLOW_COMPLETED');
        const failedEvent = events.find(e => e.type === 'WORKFLOW_FAILED');
        const cancelledEvent = events.find(e => e.type === 'WORKFLOW_CANCELLED');
        
        // Determine execution status
        if (completedEvent) {
          successfulExecutions++;
        } else if (failedEvent) {
          failedExecutions++;
          
          // Count error types
          if (failedEvent.error && failedEvent.error.code) {
            const errorCode = failedEvent.error.code;
            errorCounts[errorCode] = (errorCounts[errorCode] || 0) + 1;
          }
        } else if (cancelledEvent) {
          cancelledExecutions++;
        }
        
        // Calculate duration
        if (startEvent && (completedEvent || failedEvent || cancelledEvent)) {
          const endEvent = completedEvent || failedEvent || cancelledEvent;
          // Since we've checked that at least one of these events exists, endEvent is guaranteed to be defined
          const duration = endEvent!.timestamp - startEvent.timestamp;
          
          totalDuration += duration;
          maxDuration = Math.max(maxDuration, duration);
          minDuration = Math.min(minDuration, duration);
        }
        
        // Group by day
        if (startEvent) {
          const day = new Date(startEvent.timestamp).toISOString().split('T')[0];
          executionsByDay[day] = (executionsByDay[day] || 0) + 1;
        }
      }
      
      // Calculate averages
      const averageDuration = totalExecutions > 0 ? totalDuration / totalExecutions : 0;
      const averageSteps = totalExecutions > 0 ? totalSteps / totalExecutions : 0;
      
      // Calculate common errors
      const totalErrors = Object.values(errorCounts).reduce((sum, count) => sum + count, 0);
      const commonErrors = Object.entries(errorCounts)
        .map(([code, count]) => ({
          code,
          count,
          percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      // Create the statistics object
      const statistics: WorkflowExecutionStatistics = {
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        cancelledExecutions,
        averageDuration,
        maxDuration,
        minDuration: minDuration === Number.MAX_SAFE_INTEGER ? 0 : minDuration,
        averageSteps,
        commonErrors,
        executionsByTimePeriod: executionsByDay
      };
      
      return statistics;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('execution_history.statistics.error', error as Error, {
          workflowId
        });
      }
      throw new Error(`Failed to get workflow statistics: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get the key for an event in the state store
   * @param eventId Unique identifier for the event
   * @returns Key for the event
   */
  private getEventKey(eventId: string): string {
    return `${this.EVENT_KEY_PREFIX}${eventId}`;
  }
  
  /**
   * Get the key for an execution history in the state store
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Key for the execution history
   */
  private getExecutionHistoryKey(workflowId: string, executionId: string): string {
    return `${this.EXECUTION_HISTORY_KEY_PREFIX}${workflowId}:${executionId}`;
  }
  
  /**
   * Get or create an execution history
   * @param workflowId Unique identifier for the workflow
   * @param executionId Unique identifier for the execution
   * @returns Promise that resolves with the execution history
   */
  private async getOrCreateExecutionHistory(
    workflowId: string,
    executionId: string
  ): Promise<ExecutionHistory> {
    const key = this.getExecutionHistoryKey(workflowId, executionId);
    
    // Get the existing history or create a new one
    const existingHistory = await this.stateStore.getState<ExecutionHistory>(key);
    
    if (existingHistory) {
      return existingHistory;
    }
    
    const newHistory: ExecutionHistory = {
      workflowId,
      executionId,
      eventIds: [],
      nextSequenceNumber: 0
    };
    
    await this.stateStore.saveState(key, newHistory);
    
    return newHistory;
  }
}

/**
 * Execution history for a workflow execution
 */
interface ExecutionHistory {
  /**
   * Unique identifier for the workflow
   */
  workflowId: string;
  
  /**
   * Unique identifier for the execution
   */
  executionId: string;
  
  /**
   * Array of event IDs, ordered by creation time (oldest first)
   */
  eventIds: string[];
  
  /**
   * Next sequence number to assign
   */
  nextSequenceNumber: number;
}

/**
 * Execution history archive
 */
interface ExecutionHistoryArchive {
  /**
   * Unique identifier for the archive
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
   * Array of events
   */
  events: ExecutionHistoryEvent[];
  
  /**
   * Timestamp when the archive was created
   */
  createdAt: number;
  
  /**
   * Location of the archive
   */
  location: string;
}

/**
 * Create a new instance of ExecutionHistoryTrackerImpl
 * @param stateStore State store for persisting execution history
 * @param observability Optional observability service for monitoring
 * @returns A new ExecutionHistoryTrackerImpl instance
 */
export function createExecutionHistoryTracker(
  stateStore: StateStore,
  observability?: ObservabilityService
): ExecutionHistoryTracker {
  return new ExecutionHistoryTrackerImpl(stateStore, observability);
}
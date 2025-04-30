import { StateStore } from '../interfaces/state-store.interface';
import { StateRepository } from '../interfaces/state-repository.interface';
import { SerializationService } from '../interfaces/serialization-service.interface';
import { CacheManager } from '../interfaces/cache-manager.interface';
import { ObservabilityService } from '../../observability/interfaces/observability-service.interface';

/**
 * Implementation of the StateStore interface
 * Provides methods for storing, retrieving, and managing state data
 */
export class StateStoreImpl implements StateStore {
  /**
   * Create a new StateStoreImpl
   * @param repository Repository for storing state data
   * @param serializer Service for serializing and deserializing state data
   * @param cacheManager Optional cache manager for caching state data
   * @param observability Optional observability service for monitoring
   */
  constructor(
    private repository: StateRepository,
    private serializer: SerializationService,
    private cacheManager?: CacheManager,
    private observability?: ObservabilityService
  ) {}
  
  /**
   * Save state data for a specific key
   * @param key Unique identifier for the state
   * @param data State data to save
   * @returns Promise that resolves when the state is saved
   */
  async saveState<T>(key: string, data: T): Promise<void> {
    try {
      const startTime = Date.now();
      const serialized = this.serializer.serialize(data);
      await this.repository.save(key, serialized);
      
      // Update cache if available
      if (this.cacheManager) {
        await this.cacheManager.set(key, data);
      }
      
      // Log metrics if observability service is available
      if (this.observability) {
        const duration = Date.now() - startTime;
        this.observability.recordMetric('state_store.save.duration', duration);
        this.observability.recordMetric('state_store.save.size', serialized.length);
        this.observability.recordEvent('state_store.save', {
          key,
          size: serialized.length,
          duration,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('state_store.save.error', error as Error, { key });
      }
      throw new Error(`Failed to save state for key ${key}: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get state data for a specific key
   * @param key Unique identifier for the state
   * @returns Promise that resolves with the state data or null if not found
   */
  async getState<T>(key: string): Promise<T | null> {
    try {
      const startTime = Date.now();
      
      // Try to get from cache first if available
      if (this.cacheManager) {
        const cached = await this.cacheManager.get<T>(key);
        if (cached !== null) {
          // Log cache hit if observability service is available
          if (this.observability) {
            this.observability.recordMetric('state_store.cache.hit', 1);
            this.observability.recordEvent('state_store.cache.hit', {
              key,
              timestamp: new Date().toISOString()
            });
          }
          return cached;
        }
        
        // Log cache miss if observability service is available
        if (this.observability) {
          this.observability.recordMetric('state_store.cache.miss', 1);
        }
      }
      
      // Get from repository
      const serialized = await this.repository.load(key);
      if (serialized === null) {
        return null;
      }
      
      const data = this.serializer.deserialize<T>(serialized);
      
      // Update cache if available
      if (this.cacheManager) {
        await this.cacheManager.set(key, data);
      }
      
      // Log metrics if observability service is available
      if (this.observability) {
        const duration = Date.now() - startTime;
        this.observability.recordMetric('state_store.get.duration', duration);
        this.observability.recordMetric('state_store.get.size', serialized.length);
        this.observability.recordEvent('state_store.get', {
          key,
          size: serialized.length,
          duration,
          timestamp: new Date().toISOString()
        });
      }
      
      return data;
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('state_store.get.error', error as Error, { key });
      }
      throw new Error(`Failed to get state for key ${key}: ${(error as Error).message}`);
    }
  }
  
  /**
   * Check if state exists for a specific key
   * @param key Unique identifier for the state
   * @returns Promise that resolves with true if state exists, false otherwise
   */
  async hasState(key: string): Promise<boolean> {
    try {
      // Try to check cache first if available
      if (this.cacheManager) {
        const exists = await this.cacheManager.has(key);
        if (exists) {
          return true;
        }
      }
      
      // Check repository
      return await this.repository.exists(key);
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('state_store.has.error', error as Error, { key });
      }
      throw new Error(`Failed to check state existence for key ${key}: ${(error as Error).message}`);
    }
  }
  
  /**
   * Delete state data for a specific key
   * @param key Unique identifier for the state
   * @returns Promise that resolves when the state is deleted
   */
  async deleteState(key: string): Promise<void> {
    try {
      // Delete from repository
      await this.repository.delete(key);
      
      // Delete from cache if available
      if (this.cacheManager) {
        await this.cacheManager.delete(key);
      }
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('state_store.delete', {
          key,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('state_store.delete.error', error as Error, { key });
      }
      throw new Error(`Failed to delete state for key ${key}: ${(error as Error).message}`);
    }
  }
  
  /**
   * List all state keys matching a pattern
   * @param pattern Pattern to match state keys against (e.g., "workflow:*")
   * @returns Promise that resolves with an array of matching keys
   */
  async listStateKeys(pattern: string): Promise<string[]> {
    try {
      return await this.repository.listKeys(pattern);
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('state_store.list.error', error as Error, { pattern });
      }
      throw new Error(`Failed to list state keys for pattern ${pattern}: ${(error as Error).message}`);
    }
  }
  
  /**
   * Update a portion of state data for a specific key
   * @param key Unique identifier for the state
   * @param partialData Partial state data to update
   * @returns Promise that resolves when the state is updated
   */
  async updateState<T>(key: string, partialData: Partial<T>): Promise<void> {
    try {
      // Get current state
      const currentState = await this.getState<T>(key);
      if (currentState === null) {
        throw new Error(`State not found for key ${key}`);
      }
      
      // Merge with partial data
      const updatedState = { ...currentState, ...partialData };
      
      // Save updated state
      await this.saveState(key, updatedState);
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('state_store.update', {
          key,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('state_store.update.error', error as Error, { key });
      }
      throw new Error(`Failed to update state for key ${key}: ${(error as Error).message}`);
    }
  }
  
  /**
   * Clear all state data
   * @returns Promise that resolves when all state is cleared
   */
  async clearAllState(): Promise<void> {
    try {
      // Clear repository
      await this.repository.clear();
      
      // Clear cache if available
      if (this.cacheManager) {
        await this.cacheManager.clear();
      }
      
      // Log event if observability service is available
      if (this.observability) {
        this.observability.recordEvent('state_store.clear', {
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // Log error if observability service is available
      if (this.observability) {
        this.observability.recordError('state_store.clear.error', error as Error);
      }
      throw new Error(`Failed to clear all state: ${(error as Error).message}`);
    }
  }
}

/**
 * Create a new instance of StateStoreImpl
 * @param repository Repository for storing state data
 * @param serializer Service for serializing and deserializing state data
 * @param cacheManager Optional cache manager for caching state data
 * @param observability Optional observability service for monitoring
 * @returns A new StateStoreImpl instance
 */
export function createStateStore(
  repository: StateRepository,
  serializer: SerializationService,
  cacheManager?: CacheManager,
  observability?: ObservabilityService
): StateStore {
  return new StateStoreImpl(repository, serializer, cacheManager, observability);
}
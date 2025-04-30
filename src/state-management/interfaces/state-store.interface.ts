/**
 * Interface for the State Store component of the State Management Layer
 * Provides methods for storing, retrieving, and managing state data
 */
export interface StateStore {
  /**
   * Save state data for a specific key
   * @param key Unique identifier for the state
   * @param data State data to save
   * @returns Promise that resolves when the state is saved
   */
  saveState<T>(key: string, data: T): Promise<void>;
  
  /**
   * Get state data for a specific key
   * @param key Unique identifier for the state
   * @returns Promise that resolves with the state data or null if not found
   */
  getState<T>(key: string): Promise<T | null>;
  
  /**
   * Check if state exists for a specific key
   * @param key Unique identifier for the state
   * @returns Promise that resolves with true if state exists, false otherwise
   */
  hasState(key: string): Promise<boolean>;
  
  /**
   * Delete state data for a specific key
   * @param key Unique identifier for the state
   * @returns Promise that resolves when the state is deleted
   */
  deleteState(key: string): Promise<void>;
  
  /**
   * List all state keys matching a pattern
   * @param pattern Pattern to match state keys against (e.g., "workflow:*")
   * @returns Promise that resolves with an array of matching keys
   */
  listStateKeys(pattern: string): Promise<string[]>;
  
  /**
   * Update a portion of state data for a specific key
   * @param key Unique identifier for the state
   * @param partialData Partial state data to update
   * @returns Promise that resolves when the state is updated
   */
  updateState<T>(key: string, partialData: Partial<T>): Promise<void>;
  
  /**
   * Clear all state data
   * @returns Promise that resolves when all state is cleared
   */
  clearAllState(): Promise<void>;
}
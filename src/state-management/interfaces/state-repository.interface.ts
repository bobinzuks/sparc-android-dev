/**
 * Interface for the State Repository component of the State Management Layer
 * Provides low-level methods for storing and retrieving state data
 */
export interface StateRepository {
  /**
   * Save raw data for a specific key
   * @param key Unique identifier for the data
   * @param data Raw data to save (already serialized)
   * @returns Promise that resolves when the data is saved
   */
  save(key: string, data: string): Promise<void>;
  
  /**
   * Load raw data for a specific key
   * @param key Unique identifier for the data
   * @returns Promise that resolves with the raw data or null if not found
   */
  load(key: string): Promise<string | null>;
  
  /**
   * Check if data exists for a specific key
   * @param key Unique identifier for the data
   * @returns Promise that resolves with true if data exists, false otherwise
   */
  exists(key: string): Promise<boolean>;
  
  /**
   * Delete data for a specific key
   * @param key Unique identifier for the data
   * @returns Promise that resolves when the data is deleted
   */
  delete(key: string): Promise<void>;
  
  /**
   * List all keys matching a pattern
   * @param pattern Pattern to match keys against (e.g., "workflow:*")
   * @returns Promise that resolves with an array of matching keys
   */
  listKeys(pattern: string): Promise<string[]>;
  
  /**
   * Clear all data
   * @returns Promise that resolves when all data is cleared
   */
  clear(): Promise<void>;
}
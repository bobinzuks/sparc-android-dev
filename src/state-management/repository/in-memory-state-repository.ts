import { StateRepository } from '../interfaces/state-repository.interface';

/**
 * In-memory implementation of the StateRepository interface
 * Stores state data in memory, suitable for testing and development
 */
export class InMemoryStateRepository implements StateRepository {
  /**
   * Map to store key-value pairs in memory
   */
  private storage: Map<string, string> = new Map();
  
  /**
   * Save data for a specific key
   * @param key Unique identifier for the data
   * @param data Data to save
   * @returns Promise that resolves when the data is saved
   */
  async save(key: string, data: string): Promise<void> {
    this.storage.set(key, data);
  }
  
  /**
   * Load data for a specific key
   * @param key Unique identifier for the data
   * @returns Promise that resolves with the data or null if not found
   */
  async load(key: string): Promise<string | null> {
    return this.storage.has(key) ? this.storage.get(key)! : null;
  }
  
  /**
   * Check if data exists for a specific key
   * @param key Unique identifier for the data
   * @returns Promise that resolves with true if data exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }
  
  /**
   * Delete data for a specific key
   * @param key Unique identifier for the data
   * @returns Promise that resolves when the data is deleted
   */
  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }
  
  /**
   * List all keys matching a pattern
   * @param pattern Pattern to match keys against (e.g., "workflow:*")
   * @returns Promise that resolves with an array of matching keys
   */
  async listKeys(pattern: string): Promise<string[]> {
    const keys = Array.from(this.storage.keys());
    
    // Convert the pattern to a regex
    // Replace * with .* and escape other regex special characters
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\\\*/g, '.*'); // Replace \* with .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    
    return keys.filter(key => regex.test(key));
  }
  
  /**
   * Clear all data
   * @returns Promise that resolves when all data is cleared
   */
  async clear(): Promise<void> {
    this.storage.clear();
  }
  
  /**
   * Get the number of items in the repository
   * @returns The number of items
   */
  size(): number {
    return this.storage.size;
  }
  
  /**
   * Get all keys in the repository
   * @returns Array of all keys
   */
  getAllKeys(): string[] {
    return Array.from(this.storage.keys());
  }
  
  /**
   * Get all values in the repository
   * @returns Array of all values
   */
  getAllValues(): string[] {
    return Array.from(this.storage.values());
  }
  
  /**
   * Get all entries in the repository
   * @returns Array of [key, value] pairs
   */
  getAllEntries(): [string, string][] {
    return Array.from(this.storage.entries());
  }
}

/**
 * Create a new instance of InMemoryStateRepository
 * @returns A new InMemoryStateRepository instance
 */
export function createInMemoryStateRepository(): StateRepository {
  return new InMemoryStateRepository();
}
/**
 * Interface for the Cache Manager component of the State Management Layer
 * Provides methods for caching and retrieving data with TTL support
 */
export interface CacheManager {
  /**
   * Set a value in the cache with an optional TTL
   * @param key Unique identifier for the cached item
   * @param value Value to cache
   * @param ttlMs Time-to-live in milliseconds (optional)
   * @returns Promise that resolves when the value is cached
   */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  
  /**
   * Get a value from the cache
   * @param key Unique identifier for the cached item
   * @returns Promise that resolves with the cached value or null if not found or expired
   */
  get<T>(key: string): Promise<T | null>;
  
  /**
   * Check if a key exists in the cache and is not expired
   * @param key Unique identifier for the cached item
   * @returns Promise that resolves with true if the key exists and is not expired, false otherwise
   */
  has(key: string): Promise<boolean>;
  
  /**
   * Delete a value from the cache
   * @param key Unique identifier for the cached item
   * @returns Promise that resolves when the value is deleted
   */
  delete(key: string): Promise<void>;
  
  /**
   * Clear all values from the cache
   * @returns Promise that resolves when the cache is cleared
   */
  clear(): Promise<void>;
  
  /**
   * Get cache statistics
   * @returns Promise that resolves with cache statistics
   */
  getStats(): Promise<CacheStats>;
  
  /**
   * Invalidate cache entries matching a pattern
   * @param pattern Pattern to match cache keys against (e.g., "user:*")
   * @returns Promise that resolves with the number of invalidated entries
   */
  invalidate(pattern: string): Promise<number>;
  
  /**
   * Update the TTL for a cached item
   * @param key Unique identifier for the cached item
   * @param ttlMs New time-to-live in milliseconds
   * @returns Promise that resolves with true if the TTL was updated, false if the key doesn't exist
   */
  updateTtl(key: string, ttlMs: number): Promise<boolean>;
  
  /**
   * Get the remaining TTL for a cached item
   * @param key Unique identifier for the cached item
   * @returns Promise that resolves with the remaining TTL in milliseconds, or null if the key doesn't exist or has no TTL
   */
  getTtl(key: string): Promise<number | null>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /**
   * Total number of items in the cache
   */
  size: number;
  
  /**
   * Number of cache hits
   */
  hits: number;
  
  /**
   * Number of cache misses
   */
  misses: number;
  
  /**
   * Hit ratio (hits / (hits + misses))
   */
  hitRatio: number;
  
  /**
   * Average time-to-live in milliseconds
   */
  averageTtl: number;
  
  /**
   * Memory usage estimate in bytes
   */
  memoryUsage: number;
}
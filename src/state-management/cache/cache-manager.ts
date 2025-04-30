import { CacheManager, CacheStats } from '../interfaces/cache-manager.interface';
import { ObservabilityService } from '../../observability/interfaces/observability-service.interface';

/**
 * Cache entry with TTL support
 */
interface CacheEntry<T> {
  /**
   * Cached value
   */
  value: T;
  
  /**
   * Expiration timestamp (milliseconds since epoch)
   */
  expiresAt?: number;
  
  /**
   * Time-to-live in milliseconds
   */
  ttlMs?: number;
  
  /**
   * Timestamp when the entry was created
   */
  createdAt: number;
  
  /**
   * Timestamp when the entry was last accessed
   */
  lastAccessedAt: number;
  
  /**
   * Number of times the entry was accessed
   */
  accessCount: number;
}

/**
 * Multi-level cache implementation
 * Provides in-memory caching with TTL support and statistics tracking
 */
export class MultiLevelCacheManager implements CacheManager {
  /**
   * Primary cache storage (L1 cache)
   */
  private l1Cache: Map<string, CacheEntry<any>> = new Map();
  
  /**
   * Secondary cache storage (L2 cache)
   * This would typically be a more persistent cache like Redis or a file-based cache
   * For simplicity, we're using another in-memory cache here
   */
  private l2Cache: Map<string, CacheEntry<any>> = new Map();
  
  /**
   * Cache statistics
   */
  private stats: CacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    hitRatio: 0,
    averageTtl: 0,
    memoryUsage: 0
  };
  
  /**
   * Cache cleanup interval ID
   */
  private cleanupIntervalId?: NodeJS.Timeout;
  
  /**
   * Create a new MultiLevelCacheManager
   * @param options Cache options
   * @param observability Optional observability service for monitoring
   */
  constructor(
    private options: CacheOptions = {},
    private observability?: ObservabilityService
  ) {
    // Set default options
    this.options = {
      maxSize: 1000,
      defaultTtlMs: 60 * 60 * 1000, // 1 hour
      cleanupIntervalMs: 60 * 1000, // 1 minute
      ...options
    };
    
    // Start cleanup interval
    if (this.options.cleanupIntervalMs) {
      this.cleanupIntervalId = setInterval(() => {
        this.cleanup();
      }, this.options.cleanupIntervalMs);
    }
  }
  
  /**
   * Clean up expired cache entries
   */
  private cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    // Clean up L1 cache
    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.l1Cache.delete(key);
        expiredCount++;
      }
    }
    
    // Clean up L2 cache
    for (const [key, entry] of this.l2Cache.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.l2Cache.delete(key);
        expiredCount++;
      }
    }
    
    // Update stats
    this.updateStats();
    
    // Log cleanup if observability service is available
    if (this.observability) {
      this.observability.recordMetric('cache.cleanup.expired_count', expiredCount);
      this.observability.recordEvent('cache.cleanup', {
        expiredCount,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Update cache statistics
   */
  private updateStats(): void {
    const l1Size = this.l1Cache.size;
    const l2Size = this.l2Cache.size;
    const totalSize = l1Size + l2Size;
    
    // Calculate average TTL
    let totalTtl = 0;
    let ttlCount = 0;
    
    for (const entry of this.l1Cache.values()) {
      if (entry.ttlMs) {
        totalTtl += entry.ttlMs;
        ttlCount++;
      }
    }
    
    for (const entry of this.l2Cache.values()) {
      if (entry.ttlMs) {
        totalTtl += entry.ttlMs;
        ttlCount++;
      }
    }
    
    const averageTtl = ttlCount > 0 ? totalTtl / ttlCount : 0;
    
    // Estimate memory usage (very rough estimate)
    let memoryUsage = 0;
    for (const [key, entry] of this.l1Cache.entries()) {
      memoryUsage += key.length * 2; // Key size (2 bytes per character)
      memoryUsage += this.estimateObjectSize(entry.value); // Value size
      memoryUsage += 32; // Overhead for entry metadata
    }
    
    // Update stats
    this.stats = {
      size: totalSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRatio: this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0,
      averageTtl,
      memoryUsage
    };
    
    // Log stats if observability service is available
    if (this.observability) {
      this.observability.recordMetric('cache.size', totalSize);
      this.observability.recordMetric('cache.hit_ratio', this.stats.hitRatio);
      this.observability.recordMetric('cache.memory_usage', memoryUsage);
    }
  }
  
  /**
   * Estimate the size of an object in bytes (very rough estimate)
   * @param obj Object to estimate size for
   * @returns Estimated size in bytes
   */
  private estimateObjectSize(obj: any): number {
    if (obj === null || obj === undefined) {
      return 0;
    }
    
    if (typeof obj === 'boolean') {
      return 4;
    }
    
    if (typeof obj === 'number') {
      return 8;
    }
    
    if (typeof obj === 'string') {
      return obj.length * 2;
    }
    
    if (Array.isArray(obj)) {
      let size = 0;
      for (const item of obj) {
        size += this.estimateObjectSize(item);
      }
      return size;
    }
    
    if (typeof obj === 'object') {
      let size = 0;
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          size += key.length * 2; // Key size
          size += this.estimateObjectSize(obj[key]); // Value size
        }
      }
      return size;
    }
    
    return 8; // Default size for unknown types
  }
  
  /**
   * Set a value in the cache with an optional TTL
   * @param key Unique identifier for the cached item
   * @param value Value to cache
   * @param ttlMs Time-to-live in milliseconds (optional)
   * @returns Promise that resolves when the value is cached
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const now = Date.now();
    const effectiveTtlMs = ttlMs ?? this.options.defaultTtlMs;
    
    const entry: CacheEntry<T> = {
      value,
      expiresAt: effectiveTtlMs ? now + effectiveTtlMs : undefined,
      ttlMs: effectiveTtlMs,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0
    };
    
    // Set in L1 cache
    this.l1Cache.set(key, entry);
    
    // Set in L2 cache
    this.l2Cache.set(key, entry);
    
    // Enforce max size if specified
    if (this.options.maxSize && this.l1Cache.size > this.options.maxSize) {
      this.evictLeastRecentlyUsed();
    }
    
    // Update stats
    this.updateStats();
    
    // Log cache set if observability service is available
    if (this.observability) {
      this.observability.recordEvent('cache.set', {
        key,
        ttlMs: effectiveTtlMs,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Evict the least recently used cache entry from L1 cache
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestKey = key;
        oldestTime = entry.lastAccessedAt;
      }
    }
    
    if (oldestKey) {
      this.l1Cache.delete(oldestKey);
      
      // Log eviction if observability service is available
      if (this.observability) {
        this.observability.recordEvent('cache.evict', {
          key: oldestKey,
          reason: 'lru',
          timestamp: new Date().toISOString()
        });
      }
    }
  }
  
  /**
   * Get a value from the cache
   * @param key Unique identifier for the cached item
   * @returns Promise that resolves with the cached value or null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    const now = Date.now();
    
    // Try L1 cache first
    const l1Entry = this.l1Cache.get(key) as CacheEntry<T> | undefined;
    if (l1Entry) {
      // Check if expired
      if (l1Entry.expiresAt && l1Entry.expiresAt <= now) {
        this.l1Cache.delete(key);
        this.l2Cache.delete(key);
        this.stats.misses++;
        return null;
      }
      
      // Update access metadata
      l1Entry.lastAccessedAt = now;
      l1Entry.accessCount++;
      
      // Update stats
      this.stats.hits++;
      
      // Log cache hit if observability service is available
      if (this.observability) {
        this.observability.recordMetric('cache.hit', 1);
        this.observability.recordEvent('cache.hit', {
          key,
          level: 'l1',
          timestamp: new Date().toISOString()
        });
      }
      
      return l1Entry.value;
    }
    
    // Try L2 cache
    const l2Entry = this.l2Cache.get(key) as CacheEntry<T> | undefined;
    if (l2Entry) {
      // Check if expired
      if (l2Entry.expiresAt && l2Entry.expiresAt <= now) {
        this.l2Cache.delete(key);
        this.stats.misses++;
        return null;
      }
      
      // Update access metadata
      l2Entry.lastAccessedAt = now;
      l2Entry.accessCount++;
      
      // Promote to L1 cache
      this.l1Cache.set(key, l2Entry);
      
      // Update stats
      this.stats.hits++;
      
      // Log cache hit if observability service is available
      if (this.observability) {
        this.observability.recordMetric('cache.hit', 1);
        this.observability.recordEvent('cache.hit', {
          key,
          level: 'l2',
          timestamp: new Date().toISOString()
        });
      }
      
      return l2Entry.value;
    }
    
    // Not found in any cache
    this.stats.misses++;
    
    // Log cache miss if observability service is available
    if (this.observability) {
      this.observability.recordMetric('cache.miss', 1);
      this.observability.recordEvent('cache.miss', {
        key,
        timestamp: new Date().toISOString()
      });
    }
    
    return null;
  }
  
  /**
   * Check if a key exists in the cache and is not expired
   * @param key Unique identifier for the cached item
   * @returns Promise that resolves with true if the key exists and is not expired, false otherwise
   */
  async has(key: string): Promise<boolean> {
    const now = Date.now();
    
    // Check L1 cache
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && (!l1Entry.expiresAt || l1Entry.expiresAt > now)) {
      return true;
    }
    
    // Check L2 cache
    const l2Entry = this.l2Cache.get(key);
    if (l2Entry && (!l2Entry.expiresAt || l2Entry.expiresAt > now)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Delete a value from the cache
   * @param key Unique identifier for the cached item
   * @returns Promise that resolves when the value is deleted
   */
  async delete(key: string): Promise<void> {
    // Delete from both caches
    this.l1Cache.delete(key);
    this.l2Cache.delete(key);
    
    // Update stats
    this.updateStats();
    
    // Log cache delete if observability service is available
    if (this.observability) {
      this.observability.recordEvent('cache.delete', {
        key,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Clear all values from the cache
   * @returns Promise that resolves when the cache is cleared
   */
  async clear(): Promise<void> {
    // Clear both caches
    this.l1Cache.clear();
    this.l2Cache.clear();
    
    // Reset stats
    this.stats = {
      size: 0,
      hits: 0,
      misses: 0,
      hitRatio: 0,
      averageTtl: 0,
      memoryUsage: 0
    };
    
    // Log cache clear if observability service is available
    if (this.observability) {
      this.observability.recordEvent('cache.clear', {
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Get cache statistics
   * @returns Promise that resolves with cache statistics
   */
  async getStats(): Promise<CacheStats> {
    this.updateStats();
    return this.stats;
  }
  
  /**
   * Invalidate cache entries matching a pattern
   * @param pattern Pattern to match cache keys against (e.g., "user:*")
   * @returns Promise that resolves with the number of invalidated entries
   */
  async invalidate(pattern: string): Promise<number> {
    // Convert the pattern to a regex
    // Replace * with .* and escape other regex special characters
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\\\*/g, '.*'); // Replace \* with .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    
    let invalidatedCount = 0;
    
    // Invalidate in L1 cache
    for (const key of this.l1Cache.keys()) {
      if (regex.test(key)) {
        this.l1Cache.delete(key);
        invalidatedCount++;
      }
    }
    
    // Invalidate in L2 cache
    for (const key of this.l2Cache.keys()) {
      if (regex.test(key)) {
        this.l2Cache.delete(key);
        // Only count if not already counted from L1
        if (!this.l1Cache.has(key)) {
          invalidatedCount++;
        }
      }
    }
    
    // Update stats
    this.updateStats();
    
    // Log cache invalidation if observability service is available
    if (this.observability) {
      this.observability.recordMetric('cache.invalidate.count', invalidatedCount);
      this.observability.recordEvent('cache.invalidate', {
        pattern,
        invalidatedCount,
        timestamp: new Date().toISOString()
      });
    }
    
    return invalidatedCount;
  }
  
  /**
   * Update the TTL for a cached item
   * @param key Unique identifier for the cached item
   * @param ttlMs New time-to-live in milliseconds
   * @returns Promise that resolves with true if the TTL was updated, false if the key doesn't exist
   */
  async updateTtl(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    let updated = false;
    
    // Update in L1 cache
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry) {
      l1Entry.ttlMs = ttlMs;
      l1Entry.expiresAt = now + ttlMs;
      updated = true;
    }
    
    // Update in L2 cache
    const l2Entry = this.l2Cache.get(key);
    if (l2Entry) {
      l2Entry.ttlMs = ttlMs;
      l2Entry.expiresAt = now + ttlMs;
      updated = true;
    }
    
    // Update stats
    if (updated) {
      this.updateStats();
      
      // Log TTL update if observability service is available
      if (this.observability) {
        this.observability.recordEvent('cache.update_ttl', {
          key,
          ttlMs,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return updated;
  }
  
  /**
   * Get the remaining TTL for a cached item
   * @param key Unique identifier for the cached item
   * @returns Promise that resolves with the remaining TTL in milliseconds, or null if the key doesn't exist or has no TTL
   */
  async getTtl(key: string): Promise<number | null> {
    const now = Date.now();
    
    // Check L1 cache
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && l1Entry.expiresAt) {
      return Math.max(0, l1Entry.expiresAt - now);
    }
    
    // Check L2 cache
    const l2Entry = this.l2Cache.get(key);
    if (l2Entry && l2Entry.expiresAt) {
      return Math.max(0, l2Entry.expiresAt - now);
    }
    
    return null;
  }
  
  /**
   * Dispose of the cache manager
   * Clears the cleanup interval
   */
  dispose(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
    }
  }
}

/**
 * Cache options
 */
export interface CacheOptions {
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
}

/**
 * Create a new instance of MultiLevelCacheManager
 * @param options Cache options
 * @param observability Optional observability service for monitoring
 * @returns A new MultiLevelCacheManager instance
 */
export function createCacheManager(
  options?: CacheOptions,
  observability?: ObservabilityService
): CacheManager {
  return new MultiLevelCacheManager(options, observability);
}
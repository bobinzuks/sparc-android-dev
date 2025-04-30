import { StateRepository } from '../interfaces/state-repository.interface';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import crypto from 'crypto';

// Promisify fs functions
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

/**
 * Filesystem-based implementation of the StateRepository interface
 * Stores state data in files on the filesystem
 */
export class FilesystemStateRepository implements StateRepository {
  /**
   * Base directory for storing state files
   */
  private baseDir: string;
  
  /**
   * Create a new FilesystemStateRepository
   * @param baseDir Base directory for storing state files
   */
  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }
  
  /**
   * Initialize the repository by creating the base directory if it doesn't exist
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    try {
      await access(this.baseDir, fs.constants.F_OK);
    } catch (error) {
      // Directory doesn't exist, create it
      await mkdir(this.baseDir, { recursive: true });
    }
  }
  
  /**
   * Get the file path for a key
   * @param key Unique identifier for the data
   * @returns File path
   */
  private getFilePath(key: string): string {
    // Hash the key to create a safe filename
    const hashedKey = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.baseDir, `${hashedKey}.json`);
  }
  
  /**
   * Save data for a specific key
   * @param key Unique identifier for the data
   * @param data Data to save
   * @returns Promise that resolves when the data is saved
   */
  async save(key: string, data: string): Promise<void> {
    await this.initialize();
    const filePath = this.getFilePath(key);
    
    // Create a metadata object with the original key
    const metadata = {
      key,
      timestamp: Date.now(),
      data
    };
    
    await writeFile(filePath, JSON.stringify(metadata), 'utf8');
  }
  
  /**
   * Load data for a specific key
   * @param key Unique identifier for the data
   * @returns Promise that resolves with the data or null if not found
   */
  async load(key: string): Promise<string | null> {
    await this.initialize();
    const filePath = this.getFilePath(key);
    
    try {
      await access(filePath, fs.constants.F_OK);
      const content = await readFile(filePath, 'utf8');
      const metadata = JSON.parse(content);
      return metadata.data;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Check if data exists for a specific key
   * @param key Unique identifier for the data
   * @returns Promise that resolves with true if data exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    await this.initialize();
    const filePath = this.getFilePath(key);
    
    try {
      await access(filePath, fs.constants.F_OK);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Delete data for a specific key
   * @param key Unique identifier for the data
   * @returns Promise that resolves when the data is deleted
   */
  async delete(key: string): Promise<void> {
    await this.initialize();
    const filePath = this.getFilePath(key);
    
    try {
      await access(filePath, fs.constants.F_OK);
      await unlink(filePath);
    } catch (error) {
      // File doesn't exist, nothing to delete
    }
  }
  
  /**
   * List all keys matching a pattern
   * @param pattern Pattern to match keys against (e.g., "workflow:*")
   * @returns Promise that resolves with an array of matching keys
   */
  async listKeys(pattern: string): Promise<string[]> {
    await this.initialize();
    
    // Convert the pattern to a regex
    // Replace * with .* and escape other regex special characters
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\\\*/g, '.*'); // Replace \* with .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    
    try {
      const files = await readdir(this.baseDir);
      const keys: string[] = [];
      
      for (const file of files) {
        if (path.extname(file) === '.json') {
          try {
            const filePath = path.join(this.baseDir, file);
            const content = await readFile(filePath, 'utf8');
            const metadata = JSON.parse(content);
            
            if (regex.test(metadata.key)) {
              keys.push(metadata.key);
            }
          } catch (error) {
            // Skip files that can't be read or parsed
          }
        }
      }
      
      return keys;
    } catch (error) {
      return [];
    }
  }
  
  /**
   * Clear all data
   * @returns Promise that resolves when all data is cleared
   */
  async clear(): Promise<void> {
    await this.initialize();
    
    try {
      const files = await readdir(this.baseDir);
      
      for (const file of files) {
        if (path.extname(file) === '.json') {
          const filePath = path.join(this.baseDir, file);
          await unlink(filePath);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
  }
  
  /**
   * Get repository statistics
   * @returns Promise that resolves with repository statistics
   */
  async getStats(): Promise<RepositoryStats> {
    await this.initialize();
    
    try {
      const files = await readdir(this.baseDir);
      let totalSize = 0;
      let oldestTimestamp = Date.now();
      let newestTimestamp = 0;
      const jsonFiles = files.filter(file => path.extname(file) === '.json');
      
      for (const file of jsonFiles) {
        const filePath = path.join(this.baseDir, file);
        const fileStat = await stat(filePath);
        totalSize += fileStat.size;
        
        try {
          const content = await readFile(filePath, 'utf8');
          const metadata = JSON.parse(content);
          
          if (metadata.timestamp) {
            oldestTimestamp = Math.min(oldestTimestamp, metadata.timestamp);
            newestTimestamp = Math.max(newestTimestamp, metadata.timestamp);
          }
        } catch (error) {
          // Skip files that can't be read or parsed
        }
      }
      
      return {
        count: jsonFiles.length,
        totalSize,
        oldestTimestamp: oldestTimestamp !== Date.now() ? oldestTimestamp : undefined,
        newestTimestamp: newestTimestamp !== 0 ? newestTimestamp : undefined,
        baseDir: this.baseDir
      };
    } catch (error) {
      return {
        count: 0,
        totalSize: 0,
        baseDir: this.baseDir
      };
    }
  }
}

/**
 * Repository statistics
 */
interface RepositoryStats {
  /**
   * Number of items in the repository
   */
  count: number;
  
  /**
   * Total size of all items in bytes
   */
  totalSize: number;
  
  /**
   * Timestamp of the oldest item
   */
  oldestTimestamp?: number;
  
  /**
   * Timestamp of the newest item
   */
  newestTimestamp?: number;
  
  /**
   * Base directory of the repository
   */
  baseDir: string;
}

/**
 * Create a new instance of FilesystemStateRepository
 * @param baseDir Base directory for storing state files
 * @returns A new FilesystemStateRepository instance
 */
export function createFilesystemStateRepository(baseDir: string): StateRepository {
  return new FilesystemStateRepository(baseDir);
}
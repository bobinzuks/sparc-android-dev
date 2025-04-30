import { SerializationService } from '../interfaces/serialization-service.interface';
import crypto from 'crypto';

/**
 * JSON-based implementation of the SerializationService interface
 * Provides methods for serializing and deserializing state data using JSON
 */
export class JsonSerializationService implements SerializationService {
  /**
   * Serialize an object to a JSON string
   * @param data Object to serialize
   * @returns JSON string representation of the object
   */
  serialize<T>(data: T): string {
    try {
      return JSON.stringify(data, this.replacer);
    } catch (error) {
      throw new Error(`Failed to serialize data: ${(error as Error).message}`);
    }
  }
  
  /**
   * Deserialize a JSON string to an object
   * @param serialized JSON string representation of the object
   * @returns Deserialized object
   */
  deserialize<T>(serialized: string): T {
    try {
      return JSON.parse(serialized, this.reviver) as T;
    } catch (error) {
      throw new Error(`Failed to deserialize data: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get the content type of the serialized data
   * @returns Content type string
   */
  getContentType(): string {
    return 'application/json';
  }
  
  /**
   * Create a deep clone of an object using JSON serialization/deserialization
   * @param data Object to clone
   * @returns Deep clone of the object
   */
  clone<T>(data: T): T {
    return this.deserialize(this.serialize(data));
  }
  
  /**
   * Calculate a hash of the serialized data
   * @param data Object to hash
   * @returns SHA-256 hash string
   */
  hash<T>(data: T): string {
    const serialized = this.serialize(data);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }
  
  /**
   * Compare two objects for deep equality
   * @param a First object
   * @param b Second object
   * @returns True if objects are deeply equal, false otherwise
   */
  isEqual<T>(a: T, b: T): boolean {
    // Quick reference equality check
    if (a === b) {
      return true;
    }
    
    // Handle null/undefined cases
    if (a === null || a === undefined || b === null || b === undefined) {
      return false;
    }
    
    // Compare hashes for deep equality
    return this.hash(a) === this.hash(b);
  }
  
  /**
   * Custom replacer function for JSON.stringify to handle special types
   * @param key Property key
   * @param value Property value
   * @returns Transformed value for serialization
   */
  private replacer(key: string, value: any): any {
    // Handle Date objects
    if (value instanceof Date) {
      return {
        __type: 'Date',
        iso: value.toISOString()
      };
    }
    
    // Handle RegExp objects
    if (value instanceof RegExp) {
      return {
        __type: 'RegExp',
        source: value.source,
        flags: value.flags
      };
    }
    
    // Handle Map objects
    if (value instanceof Map) {
      return {
        __type: 'Map',
        entries: Array.from(value.entries())
      };
    }
    
    // Handle Set objects
    if (value instanceof Set) {
      return {
        __type: 'Set',
        values: Array.from(value.values())
      };
    }
    
    // Handle Error objects
    if (value instanceof Error) {
      const error: Record<string, any> = {
        __type: 'Error',
        name: value.name,
        message: value.message
      };
      
      if (value.stack) {
        error.stack = value.stack;
      }
      
      // Copy any custom properties
      Object.getOwnPropertyNames(value).forEach(prop => {
        if (!['name', 'message', 'stack'].includes(prop)) {
          error[prop] = (value as any)[prop];
        }
      });
      
      return error;
    }
    
    // Handle BigInt
    if (typeof value === 'bigint') {
      return {
        __type: 'BigInt',
        value: value.toString()
      };
    }
    
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      // This is a simplified approach; a more robust solution would track object references
      try {
        JSON.stringify(value);
      } catch (error) {
        if ((error as Error).message.includes('circular')) {
          return '[Circular Reference]';
        }
      }
    }
    
    return value;
  }
  
  /**
   * Custom reviver function for JSON.parse to handle special types
   * @param key Property key
   * @param value Property value
   * @returns Transformed value after deserialization
   */
  private reviver(key: string, value: any): any {
    // Skip non-objects or null
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    
    // Check for type marker
    if (!value.__type) {
      return value;
    }
    
    // Restore Date objects
    if (value.__type === 'Date') {
      return new Date(value.iso);
    }
    
    // Restore RegExp objects
    if (value.__type === 'RegExp') {
      return new RegExp(value.source, value.flags);
    }
    
    // Restore Map objects
    if (value.__type === 'Map') {
      return new Map(value.entries);
    }
    
    // Restore Set objects
    if (value.__type === 'Set') {
      return new Set(value.values);
    }
    
    // Restore Error objects
    if (value.__type === 'Error') {
      const error = new Error(value.message);
      error.name = value.name;
      
      if (value.stack) {
        error.stack = value.stack;
      }
      
      // Copy any custom properties
      Object.keys(value).forEach(prop => {
        if (!['__type', 'name', 'message', 'stack'].includes(prop)) {
          (error as any)[prop] = value[prop];
        }
      });
      
      return error;
    }
    
    // Restore BigInt
    if (value.__type === 'BigInt') {
      return BigInt(value.value);
    }
    
    return value;
  }
}

/**
 * Create a new instance of JsonSerializationService
 * @returns A new JsonSerializationService instance
 */
export function createJsonSerializationService(): SerializationService {
  return new JsonSerializationService();
}
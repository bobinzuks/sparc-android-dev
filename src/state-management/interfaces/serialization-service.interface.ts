/**
 * Interface for the Serialization Service component of the State Management Layer
 * Provides methods for serializing and deserializing state data
 */
export interface SerializationService {
  /**
   * Serialize an object to a string
   * @param data Object to serialize
   * @returns Serialized string representation of the object
   */
  serialize<T>(data: T): string;
  
  /**
   * Deserialize a string to an object
   * @param serialized Serialized string representation of the object
   * @returns Deserialized object
   */
  deserialize<T>(serialized: string): T;
  
  /**
   * Get the content type of the serialized data
   * @returns Content type string (e.g., "application/json")
   */
  getContentType(): string;
  
  /**
   * Create a deep clone of an object
   * @param data Object to clone
   * @returns Deep clone of the object
   */
  clone<T>(data: T): T;
  
  /**
   * Calculate a hash of the serialized data
   * @param data Object to hash
   * @returns Hash string
   */
  hash<T>(data: T): string;
  
  /**
   * Compare two objects for deep equality
   * @param a First object
   * @param b Second object
   * @returns True if objects are deeply equal, false otherwise
   */
  isEqual<T>(a: T, b: T): boolean;
}
/**
 * Type definition for UUID
 * This is used to ensure type safety when working with UUIDs
 */
declare type UUID = string;

/**
 * Declaration for the uuid module
 */
declare module 'uuid' {
  /**
   * Generate a v4 UUID
   * @returns A v4 UUID string
   */
  export function v4(): string;
  
  /**
   * Generate a v1 UUID
   * @returns A v1 UUID string
   */
  export function v1(): string;
  
  /**
   * Validate a UUID string
   * @param uuid UUID string to validate
   * @returns True if the UUID is valid, false otherwise
   */
  export function validate(uuid: string): boolean;
  
  /**
   * Parse a UUID string
   * @param uuid UUID string to parse
   * @returns Parsed UUID
   */
  export function parse(uuid: string): any;
  
  /**
   * Convert a UUID to a string
   * @param uuid UUID to convert
   * @returns UUID string
   */
  export function stringify(uuid: any): string;
}
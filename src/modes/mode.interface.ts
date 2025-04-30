/**
 * Interface for defining a mode in the SPARC Edge Orchestrator
 */
export interface Mode {
  /**
   * Unique identifier for the mode
   */
  slug: string;
  
  /**
   * Display name for the mode
   */
  name: string;
  
  /**
   * Description of the mode's purpose
   */
  description: string;
  
  /**
   * The AI model to use for this mode
   */
  model: string;
  
  /**
   * The role description for the AI in this mode
   */
  role: string;
  
  /**
   * Patterns of files that this mode is allowed to edit
   */
  allowedFilePatterns: string[];
  
  /**
   * List of capabilities this mode provides
   */
  capabilities: string[];
}
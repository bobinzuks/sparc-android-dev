/**
 * Modes for the SPARC Edge Orchestrator
 */

// Export the Mode interface
export * from './mode.interface';

// Export Android-specific edge function modes
export * from './android-edge-function-modes';

// Re-export all Android-specific edge function modes as a flat array
import { AndroidEdgeFunctionModes } from './android-edge-function-modes';

/**
 * All available modes for the SPARC Edge Orchestrator
 */
export const AllModes = [
  ...AndroidEdgeFunctionModes,
  // Add other mode groups here as they are implemented
];
/**
 * Git Integration
 * 
 * Git-based utilities for incremental analysis and change detection.
 */

export {
  GitChangeDetector,
  createChangeDetector,
  getStagedFiles,
  getBranchChanges,
  type ChangeDetectorOptions,
  type ChangedFile,
  type ChangeDetectionResult,
} from './change-detector.js';

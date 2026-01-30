/**
 * Storage Module
 * 
 * Provides object storage services for VibeCheck artifacts including
 * reality mode video recordings and screenshots.
 * 
 * @module storage
 */

export {
  VideoStorageService,
  createVideoStorageService,
  type StorageProvider,
  type StorageConfig,
  type UploadResult,
  type UploadOptions,
  type VideoUploadResult,
} from './video-storage.js';

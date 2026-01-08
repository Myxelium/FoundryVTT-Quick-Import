/**
 * Media Storage Service
 * 
 * Handles uploading background media files (images and videos) to Foundry VTT's
 * file storage system. Manages directory creation and file organization.
 * 
 * @module MediaStorageService
 */

/** Module identifier for console logging */
const MODULE_LOG_PREFIX = 'Quick Battlemap Importer';

/** Storage source for file operations (Foundry's data directory) */
const STORAGE_SOURCE = 'data';

/**
 * @typedef {Object} BackgroundMediaData
 * @property {string} data - Base64 data URL or blob URL for the media
 * @property {string} filename - Original filename of the media
 * @property {File} [file] - The original File object (if available)
 * @property {boolean} isVideo - Whether the media is a video file
 */

/**
 * @typedef {Object} UploadResult
 * @property {string} path - The path to the uploaded file in Foundry's storage
 */

/**
 * Service class responsible for uploading media files to Foundry's storage.
 * Handles directory creation and file upload with error handling.
 */
export class MediaStorageService {

    /**
     * Upload a background media file (image or video) to Foundry's storage.
     * Creates the target directory if it doesn't exist.
     * 
     * @param {BackgroundMediaData} mediaData - The media data to upload
     * @param {string} worldId - The current world's identifier for directory naming
     * @returns {Promise<UploadResult|null>} Upload result with file path, or null on failure
     * 
     * @example
     * const storage = new MediaStorageService();
     * const result = await storage.uploadBackgroundMedia(mediaData, game.world.id);
     * if (result?.path) {
     *   // Use result.path as the scene background
     * }
     */
    async uploadBackgroundMedia(mediaData, worldId) {
        try {
            // Get or create a File object from the media data
            const fileToUpload = await this.prepareFileForUpload(mediaData);

            // Build the target directory path
            const targetDirectory = this.buildTargetDirectory(worldId);
            
            // Ensure the directory exists
            await this.ensureDirectoryExists(STORAGE_SOURCE, targetDirectory);

            // Upload the file
            const uploadResult = await FilePicker.upload(
                STORAGE_SOURCE, 
                targetDirectory, 
                fileToUpload, 
                { overwrite: true }
            );

            return { path: uploadResult?.path };

        } catch (uploadError) {
            this.handleUploadError(uploadError);
            return null;
        }
    }

    /**
     * Prepare a File object for upload from media data.
     * If a File object already exists, uses it directly.
     * Otherwise, fetches the data URL and converts to a File.
     * 
     * @param {BackgroundMediaData} mediaData - The media data
     * @returns {Promise<File>} A File object ready for upload
     */
    async prepareFileForUpload(mediaData) {
        // If we already have a File object, use it directly
        if (mediaData.file) {
            return mediaData.file;
        }

        // Otherwise, fetch the data URL and create a File from it
        const response = await fetch(mediaData.data);
        const blobData = await response.blob();
        
        // Determine MIME type from blob or based on media type
        const mimeType = blobData.type || this.getDefaultMimeType(mediaData.isVideo);
        
        return new File([blobData], mediaData.filename, { type: mimeType });
    }

    /**
     * Get the default MIME type based on whether the media is video or image.
     * 
     * @param {boolean} isVideo - Whether the media is a video
     * @returns {string} The default MIME type
     */
    getDefaultMimeType(isVideo) {
        return isVideo ? 'video/webm' : 'image/png';
    }

    /**
     * Build the target directory path for storing battlemap media.
     * Uses the world ID to organize files by world.
     * 
     * @param {string} worldId - The world identifier
     * @returns {string} The target directory path
     */
    buildTargetDirectory(worldId) {
        return `worlds/${worldId}/quick-battlemap`;
    }

    /**
     * Ensure a directory exists in Foundry's file storage.
     * Creates the directory if it doesn't exist, handling race conditions.
     * 
     * @param {string} storageSource - The storage source (typically 'data')
     * @param {string} directoryPath - The path to the directory
     * @throws {Error} If directory creation fails for reasons other than already existing
     */
    async ensureDirectoryExists(storageSource, directoryPath) {
        try {
            // Try to browse the directory to see if it exists
            await FilePicker.browse(storageSource, directoryPath);
        } catch (_browseError) {
            // Directory doesn't exist, try to create it
            await this.createDirectorySafely(storageSource, directoryPath);
        }
    }

    /**
     * Safely create a directory, handling the case where it already exists.
     * Multiple simultaneous requests might try to create the same directory.
     * 
     * @param {string} storageSource - The storage source
     * @param {string} directoryPath - The path to create
     */
    async createDirectorySafely(storageSource, directoryPath) {
        try {
            await FilePicker.createDirectory(storageSource, directoryPath, {});
        } catch (createError) {
            // EEXIST means directory was created by another request - that's fine
            const errorMessage = String(createError || '');
            if (!errorMessage.includes('EEXIST')) {
                throw createError;
            }
        }
    }

    /**
     * Handle upload errors by logging and notifying the user.
     * 
     * @param {Error} uploadError - The error that occurred
     */
    handleUploadError(uploadError) {
        console.error(`${MODULE_LOG_PREFIX} | Upload failed:`, uploadError);
        
        const localizedMessage = game.i18n.localize('QUICKBATTLEMAP.UploadFailed');
        const errorDetail = uploadError?.message ?? String(uploadError);
        
        ui.notifications.error(`${localizedMessage}: ${errorDetail}`);
    }
}

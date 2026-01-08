/**
 * File Processor
 * 
 * Handles processing of dropped files (images, videos, and JSON configs).
 * Extracts file reading and type detection logic for cleaner separation of concerns.
 * 
 * @module FileProcessor
 */

/** Module identifier for console logging */
const MODULE_LOG_PREFIX = 'Quick Battlemap Importer';

/**
 * @typedef {Object} ProcessedImageData
 * @property {string} dataUrl - Base64 data URL of the image
 * @property {string} filename - Original filename
 * @property {File} file - The original File object
 * @property {boolean} isVideo - Always false for images
 */

/**
 * @typedef {Object} ProcessedVideoData
 * @property {string} blobUrl - Blob URL for the video
 * @property {string} filename - Original filename
 * @property {File} file - The original File object
 * @property {boolean} isVideo - Always true for videos
 */

/**
 * @typedef {Object} ProcessedJsonData
 * @property {Object} parsedContent - The parsed JSON object
 * @property {string} filename - Original filename
 */

/** Supported image file extensions */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

/** Supported video file extensions */
const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov', '.m4v', '.avi', '.mkv', '.ogv', '.ogg'];

/**
 * Service class for processing dropped files.
 * Handles reading files and determining their types.
 */
export class FileProcessor {

    /**
     * Process a dropped image file and return its data.
     * Reads the file as a base64 data URL.
     * 
     * @param {File} imageFile - The image file to process
     * @returns {Promise<ProcessedImageData>} Processed image data
     * 
     * @example
     * const processor = new FileProcessor();
     * const imageData = await processor.processImageFile(droppedFile);
     * // imageData.dataUrl contains the base64 image
     */
    processImageFile(imageFile) {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader();

            fileReader.onload = (loadEvent) => {
                resolve({
                    dataUrl: loadEvent.target.result,
                    filename: imageFile.name,
                    file: imageFile,
                    isVideo: false
                });
            };

            fileReader.onerror = (error) => {
                reject(new Error(`Failed to read image file: ${error.message}`));
            };

            fileReader.readAsDataURL(imageFile);
        });
    }

    /**
     * Process a dropped video file and return its data.
     * Creates a blob URL for the video.
     * 
     * @param {File} videoFile - The video file to process
     * @returns {ProcessedVideoData} Processed video data
     * 
     * @example
     * const processor = new FileProcessor();
     * const videoData = processor.processVideoFile(droppedFile);
     * // videoData.blobUrl can be used as video src
     */
    processVideoFile(videoFile) {
        const blobUrl = URL.createObjectURL(videoFile);
        
        return {
            blobUrl: blobUrl,
            filename: videoFile.name,
            file: videoFile,
            isVideo: true
        };
    }

    /**
     * Process a dropped JSON configuration file.
     * Reads and parses the JSON content.
     * 
     * @param {File} jsonFile - The JSON file to process
     * @returns {Promise<ProcessedJsonData>} Processed JSON data
     * @throws {Error} If the JSON is invalid
     * 
     * @example
     * const processor = new FileProcessor();
     * const config = await processor.processJsonFile(droppedFile);
     * // config.parsedContent contains the parsed object
     */
    processJsonFile(jsonFile) {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader();

            fileReader.onload = (loadEvent) => {
                try {
                    const parsedContent = JSON.parse(loadEvent.target.result);
                    resolve({
                        parsedContent: parsedContent,
                        filename: jsonFile.name
                    });
                } catch (parseError) {
                    reject(new Error(`Invalid JSON: ${parseError.message}`));
                }
            };

            fileReader.onerror = (error) => {
                reject(new Error(`Failed to read JSON file: ${error.message}`));
            };

            fileReader.readAsText(jsonFile);
        });
    }

    /**
     * Determine the type of a file based on MIME type and extension.
     * 
     * @param {File} file - The file to classify
     * @returns {'image' | 'video' | 'json' | 'unknown'} The file type category
     * 
     * @example
     * const fileType = processor.getFileType(droppedFile);
     * if (fileType === 'image') { ... }
     */
    getFileType(file) {
        const lowercaseFilename = file.name.toLowerCase();
        const mimeType = file.type.toLowerCase();

        // Check by MIME type first
        if (mimeType.startsWith('image/')) {
            return 'image';
        }

        if (mimeType.startsWith('video/')) {
            return 'video';
        }

        if (mimeType === 'application/json') {
            return 'json';
        }

        // Fall back to extension checking
        if (this.hasExtension(lowercaseFilename, IMAGE_EXTENSIONS)) {
            return 'image';
        }

        if (this.hasExtension(lowercaseFilename, VIDEO_EXTENSIONS)) {
            return 'video';
        }

        if (lowercaseFilename.endsWith('.json')) {
            return 'json';
        }

        return 'unknown';
    }

    /**
     * Check if a filename has one of the specified extensions.
     * 
     * @param {string} filename - The filename to check (lowercase)
     * @param {string[]} extensions - Array of extensions to match
     * @returns {boolean} True if filename ends with one of the extensions
     */
    hasExtension(filename, extensions) {
        return extensions.some(ext => filename.endsWith(ext));
    }

    /**
     * Revoke a blob URL to free memory.
     * Safe to call with non-blob URLs (will be ignored).
     * 
     * @param {string} url - The URL to potentially revoke
     */
    revokeBlobUrl(url) {
        try {
            if (url && typeof url === 'string' && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        } catch (_error) {
            // Ignore errors during cleanup
        }
    }

    /**
     * Get the dimensions of an image from a data URL.
     * 
     * @param {string} imageDataUrl - Base64 data URL of the image
     * @returns {Promise<{width: number, height: number}>} Image dimensions
     */
    async getImageDimensions(imageDataUrl) {
        return new Promise((resolve, reject) => {
            const imageElement = new Image();
            
            imageElement.onload = () => {
                resolve({
                    width: imageElement.width,
                    height: imageElement.height
                });
            };
            
            imageElement.onerror = () => {
                reject(new Error('Failed to load image for dimension measurement'));
            };
            
            imageElement.src = imageDataUrl;
        });
    }

    /**
     * Get the dimensions of a video from a URL.
     * 
     * @param {string} videoUrl - URL or blob URL of the video
     * @returns {Promise<{width: number|undefined, height: number|undefined}>} Video dimensions
     */
    async getVideoDimensions(videoUrl) {
        return new Promise((resolve) => {
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';

            const cleanup = () => {
                videoElement.onloadedmetadata = null;
                videoElement.onerror = null;
            };

            videoElement.onloadedmetadata = () => {
                cleanup();
                resolve({
                    width: videoElement.videoWidth || undefined,
                    height: videoElement.videoHeight || undefined
                });
            };

            videoElement.onerror = () => {
                cleanup();
                resolve({ width: undefined, height: undefined });
            };

            videoElement.src = videoUrl;
        });
    }

    /**
     * Get dimensions of media (either image or video).
     * 
     * @param {Object} mediaData - Media data object with data/blobUrl and isVideo flag
     * @returns {Promise<{width: number|undefined, height: number|undefined}>} Media dimensions
     */
    async getMediaDimensions(mediaData) {
        try {
            if (mediaData?.isVideo) {
                return await this.getVideoDimensions(mediaData.data || mediaData.blobUrl);
            }
            return await this.getImageDimensions(mediaData?.data || mediaData?.dataUrl);
        } catch (error) {
            console.warn(`${MODULE_LOG_PREFIX} | Could not read media dimensions:`, error);
            return { width: undefined, height: undefined };
        }
    }
}

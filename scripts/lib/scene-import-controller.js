/**
 * Scene Import Controller
 * 
 * Main orchestration class that coordinates the battlemap import workflow.
 * Handles file drops, manages state, and delegates to specialized services
 * for grid detection, data normalization, storage, and UI updates.
 * 
 * @module SceneImportController
 */

import { ImportPanelView } from './import-panel-view.js';
import { SceneDataNormalizer } from './scene-data-normalizer.js';
import { MediaStorageService } from './media-storage-service.js';
import { GridDetectionService } from './grid-detection-service.js';
import { FileProcessor } from './file-processor.js';
import { SceneBuilder } from './scene-builder.js';

/**
 * @typedef {Object} BackgroundMediaData
 * @property {string} data - Base64 data URL or blob URL for the media
 * @property {string} filename - Original filename of the media
 * @property {File} file - The original File object
 * @property {boolean} isVideo - Whether the media is a video file
 */

/**
 * @typedef {Object} FloorData
 * @property {string} id - Unique identifier for the floor
 * @property {BackgroundMediaData|null} mediaData - Background media for this floor
 * @property {File|null} mediaFile - Original media file
 * @property {Object|null} jsonData - Parsed JSON configuration
 * @property {File|null} jsonFile - Original JSON file
 */

/** Module identifier for console logging */
const MODULE_LOG_PREFIX = 'Quick Battlemap Importer';

/** LocalStorage key for persisting no-grid preference */
const NO_GRID_STORAGE_KEY = 'quick-battlemap:no-grid';

/**
 * Check if the Levels module by theripper93 is installed and active.
 * @returns {boolean} True if Levels module is active
 */
function isLevelsModuleActive() {
    return game.modules.get('levels')?.active ?? false;
}

/**
 * Controller class that manages the battlemap import process.
 * Coordinates between the UI panel, storage service, and data processing.
 */
export class SceneImportController {
    constructor() {
        /** @type {BackgroundMediaData|null} Currently loaded background media (legacy single-floor mode) */
        this.backgroundMediaData = null;

        /** @type {Object|null} Parsed scene configuration from JSON (legacy single-floor mode) */
        this.importedSceneStructure = null;

        /** @type {boolean} Enable verbose console logging for debugging */
        this.isDebugLoggingEnabled = true;

        /** @type {number} Counter for tracking concurrent async operations */
        this.pendingOperationCount = 0;

        /** @type {boolean} User preference to skip grid detection/application */
        this.isNoGridModeEnabled = false;

        /** @type {FloorData[]} Array of floor data for multi-floor scenes */
        this.floors = [];

        /** @type {File[]} Unmatched media files awaiting assignment */
        this.unmatchedMediaFiles = [];

        /** @type {File[]} Unmatched JSON files awaiting assignment */
        this.unmatchedJsonFiles = [];

        /** @type {number} Counter for generating unique floor IDs */
        this.floorIdCounter = 0;

        // Initialize services
        this.panelView = new ImportPanelView();
        this.dataNormalizer = new SceneDataNormalizer();
        this.storageService = new MediaStorageService();
        this.gridDetectionService = new GridDetectionService();
        this.fileProcessor = new FileProcessor();
        this.sceneBuilder = new SceneBuilder(this.isDebugLoggingEnabled);
    }

    /**
     * Initialize the controller by setting up event handlers and loading preferences.
     */
    initialize() {
        this.registerCanvasDropHandler();
        this.setupPanelEventCallbacks();
    }

    /**
     * Show the import panel to the user. Validates GM permissions before displaying.
     */
    showImportPanel() {
        if (!game.user?.isGM) {
            ui.notifications?.warn?.(game.i18n.localize('QUICKBATTLEMAP.GMOnly') ?? 'GM only');
            return;
        }
        this.panelView.ensureCreated();
        this.panelView.show();
    }

    /**
     * Hide the import panel from view.
     */
    hideImportPanel() {
        this.panelView.hide();
    }

    /**
     * Register a drop event handler on the Foundry canvas.
     */
    registerCanvasDropHandler() {
        canvas.stage?.on?.('drop', (event) => {
            this.processDroppedFiles(event.data.originalEvent);
        });
    }

    /**
     * Wire up all callback functions for the panel view.
     */
    setupPanelEventCallbacks() {
        this.isNoGridModeEnabled = this.loadNoGridPreference();
        this.panelView.setNoGridCheckboxState(this.isNoGridModeEnabled);

        this.panelView.onCreateSceneRequested = () => this.executeSceneCreation();
        this.panelView.onResetRequested = () => this.resetImportState();
        this.panelView.onCloseRequested = () => this.hideImportPanel();
        this.panelView.onFilesDropped = (event) => this.processDroppedFiles(event);
        this.panelView.onNoGridPreferenceChanged = (isEnabled) => this.handleNoGridPreferenceChange(isEnabled);
        this.panelView.onFloorOrderChanged = (action, floorId, targetId) => this.handleFloorOrderChange(action, floorId, targetId);
        this.panelView.onFloorRemoved = (floorId) => this.handleFloorRemoval(floorId);
        this.panelView.onFileMatchRequested = (fileName, fileType) => this.handleFileMatchRequest(fileName, fileType);
    }

    /**
     * Load the no-grid preference from browser localStorage.
     * @returns {boolean} True if no-grid mode was previously enabled
     */
    loadNoGridPreference() {
        try {
            return localStorage.getItem(NO_GRID_STORAGE_KEY) === 'true';
        } catch (_error) {
            return false;
        }
    }

    /**
     * Handle changes to the no-grid preference checkbox.
     * @param {boolean} isEnabled - Whether no-grid mode is now enabled
     */
    handleNoGridPreferenceChange(isEnabled) {
        this.isNoGridModeEnabled = !!isEnabled;
        try {
            localStorage.setItem(NO_GRID_STORAGE_KEY, String(this.isNoGridModeEnabled));
        } catch (_error) { /* localStorage may not be available */ }

        const wallStatusElement = document.querySelector('.wall-data-status .status-value');
        if (wallStatusElement && this.isNoGridModeEnabled && wallStatusElement.title === 'Auto-detected grid') {
            wallStatusElement.textContent = '❌';
            wallStatusElement.title = '';
        }
    }

    /**
     * Process files dropped onto the panel or canvas.
     * @param {DragEvent} dropEvent - The native drag-and-drop event
     */
    processDroppedFiles(dropEvent) {
        const droppedFiles = dropEvent.dataTransfer?.files;
        if (!droppedFiles || droppedFiles.length === 0) return;

        // Collect all files by type
        const mediaFiles = [];
        const jsonFiles = [];

        for (let i = 0; i < droppedFiles.length; i++) {
            const file = droppedFiles[i];
            const fileType = this.fileProcessor.getFileType(file);

            if (fileType === 'image' || fileType === 'video') {
                mediaFiles.push({ file, type: fileType });
            } else if (fileType === 'json') {
                jsonFiles.push(file);
            }
        }

        // If multiple files dropped AND Levels module is active, use multi-floor matching
        const canUseMultiFloor = isLevelsModuleActive();
        if (canUseMultiFloor && (mediaFiles.length > 1 || (mediaFiles.length >= 1 && jsonFiles.length >= 1))) {
            this.processMultipleFiles(mediaFiles, jsonFiles);
        } else {
            // Single file mode - legacy behavior
            for (const { file, type } of mediaFiles) {
                if (type === 'image') {
                    this.handleImageFile(file);
                } else if (type === 'video') {
                    this.handleVideoFile(file);
                }
            }
            for (const file of jsonFiles) {
                this.handleJsonConfigFile(file);
            }
        }
    }

    /**
     * Process multiple files and attempt to match them by name.
     * @param {Array<{file: File, type: string}>} mediaFiles - Array of media files
     * @param {File[]} jsonFiles - Array of JSON files
     */
    async processMultipleFiles(mediaFiles, jsonFiles) {
        // Extract base names for matching
        const getBaseName = (filename) => {
            const name = filename.toLowerCase();
            // Remove common suffixes and extensions
            return name
                .replace(/\.(png|jpg|jpeg|gif|webp|webm|mp4|json)$/i, '')
                .replace(/[-_]?(walls|grid|config|data|export)$/i, '')
                .trim();
        };

        const matchedFloors = [];
        const unmatchedMedia = [];
        const unmatchedJson = [...jsonFiles];

        // Try to match each media file with a JSON file
        for (const mediaItem of mediaFiles) {
            const mediaBaseName = getBaseName(mediaItem.file.name);
            let matchedJsonIndex = -1;

            // Find matching JSON file
            for (let i = 0; i < unmatchedJson.length; i++) {
                const jsonBaseName = getBaseName(unmatchedJson[i].name);
                if (mediaBaseName === jsonBaseName || 
                    mediaBaseName.includes(jsonBaseName) || 
                    jsonBaseName.includes(mediaBaseName)) {
                    matchedJsonIndex = i;
                    break;
                }
            }

            if (matchedJsonIndex >= 0) {
                // Found a match
                const jsonFile = unmatchedJson.splice(matchedJsonIndex, 1)[0];
                matchedFloors.push({
                    mediaItem,
                    jsonFile
                });
            } else {
                // No match found, create floor without JSON
                unmatchedMedia.push(mediaItem);
            }
        }

        // Create floors for matched pairs
        for (const { mediaItem, jsonFile } of matchedFloors) {
            await this.createFloorFromFiles(mediaItem.file, mediaItem.type, jsonFile);
        }

        // Create floors for unmatched media (without JSON)
        for (const mediaItem of unmatchedMedia) {
            await this.createFloorFromFiles(mediaItem.file, mediaItem.type, null);
        }

        // Store unmatched JSON files for manual assignment
        this.unmatchedJsonFiles = unmatchedJson;

        // Update UI
        this.refreshFloorListUI();
        this.updateCreateButtonState();
    }

    /**
     * Create a new floor from media and optional JSON files.
     * @param {File} mediaFile - The media file
     * @param {string} mediaType - 'image' or 'video'
     * @param {File|null} jsonFile - Optional JSON file
     * @returns {Promise<FloorData>} The created floor data
     */
    async createFloorFromFiles(mediaFile, mediaType, jsonFile) {
        const floorId = `floor-${++this.floorIdCounter}`;
        
        // Process media file
        let mediaData;
        if (mediaType === 'image') {
            const processedImage = await this.fileProcessor.processImageFile(mediaFile);
            mediaData = {
                data: processedImage.dataUrl,
                filename: processedImage.filename,
                file: processedImage.file,
                isVideo: false
            };
        } else {
            const processedVideo = this.fileProcessor.processVideoFile(mediaFile);
            mediaData = {
                data: processedVideo.blobUrl,
                filename: processedVideo.filename,
                file: processedVideo.file,
                isVideo: true
            };
        }

        // Process JSON file if provided
        let jsonData = null;
        if (jsonFile) {
            try {
                const processedJson = await this.fileProcessor.processJsonFile(jsonFile);
                jsonData = processedJson.parsedContent;
            } catch (error) {
                console.warn(`${MODULE_LOG_PREFIX} | Failed to parse JSON for floor:`, error);
            }
        }

        const floor = {
            id: floorId,
            mediaData,
            mediaFile,
            jsonData,
            jsonFile
        };

        this.floors.push(floor);

        // Run grid detection for image floors without JSON
        if (!jsonData && !mediaData.isVideo && !this.isNoGridModeEnabled) {
            this.runGridAutoDetectionForFloor(floor);
        }

        return floor;
    }

    /**
     * Run grid auto-detection for a specific floor.
     * @param {FloorData} floor - The floor to detect grid for
     */
    async runGridAutoDetectionForFloor(floor) {
        try {
            const result = await this.gridDetectionService.detectGridFromImage(floor.mediaFile);
            if (result && Number.isFinite(result.gridSize) && result.gridSize > 0) {
                floor.jsonData = {
                    grid: {
                        size: Math.round(result.gridSize),
                        type: 1, distance: 5, units: 'ft', alpha: 0.2, color: '#000000'
                    },
                    shiftX: Math.round(result.xOffset || 0),
                    shiftY: Math.round(result.yOffset || 0),
                    walls: [], lights: []
                };
                floor.autoDetectedGrid = true;
                this.refreshFloorListUI();
            }
        } catch (error) {
            if (this.isDebugLoggingEnabled) {
                console.warn(`${MODULE_LOG_PREFIX} | Auto grid detection failed for floor:`, error);
            }
        }
    }

    /**
     * Refresh the floor list UI.
     */
    refreshFloorListUI() {
        const floorDisplayData = this.floors.map(floor => ({
            id: floor.id,
            name: floor.mediaData?.filename || 'Unknown',
            mediaFile: floor.mediaFile,
            jsonFile: floor.jsonFile,
            hasAutoGrid: floor.autoDetectedGrid
        }));

        this.panelView.renderFloorList(floorDisplayData);
        this.panelView.showUnmatchedFiles(
            this.unmatchedMediaFiles.map(m => m.file || m),
            this.unmatchedJsonFiles
        );

        // Update status indicators for multi-floor mode
        const hasFloors = this.floors.length > 0;
        const allHaveJson = this.floors.every(f => f.jsonData);
        
        this.panelView.updateBackgroundMediaStatus(hasFloors, 
            hasFloors ? `${this.floors.length} floor(s)` : '');
        this.panelView.updateWallDataStatus(allHaveJson, 
            allHaveJson ? 'All floors have data' : 'Some floors missing data');
    }

    /**
     * Handle floor order change request.
     * @param {string} action - 'up', 'down', or 'reorder'
     * @param {string} floorId - ID of the floor to move
     * @param {string} [targetId] - Target floor ID for reorder
     */
    handleFloorOrderChange(action, floorId, targetId) {
        const currentIndex = this.floors.findIndex(f => f.id === floorId);
        if (currentIndex === -1) return;

        if (action === 'up' && currentIndex > 0) {
            [this.floors[currentIndex - 1], this.floors[currentIndex]] = 
                [this.floors[currentIndex], this.floors[currentIndex - 1]];
        } else if (action === 'down' && currentIndex < this.floors.length - 1) {
            [this.floors[currentIndex], this.floors[currentIndex + 1]] = 
                [this.floors[currentIndex + 1], this.floors[currentIndex]];
        } else if (action === 'reorder' && targetId) {
            const targetIndex = this.floors.findIndex(f => f.id === targetId);
            if (targetIndex !== -1 && targetIndex !== currentIndex) {
                const [movedFloor] = this.floors.splice(currentIndex, 1);
                this.floors.splice(targetIndex, 0, movedFloor);
            }
        }

        this.refreshFloorListUI();
    }

    /**
     * Handle floor removal request.
     * @param {string} floorId - ID of the floor to remove
     */
    handleFloorRemoval(floorId) {
        const index = this.floors.findIndex(f => f.id === floorId);
        if (index === -1) return;

        const floor = this.floors[index];
        
        // Revoke blob URL if video
        if (floor.mediaData?.isVideo) {
            this.fileProcessor.revokeBlobUrl(floor.mediaData.data);
        }

        this.floors.splice(index, 1);
        this.refreshFloorListUI();
        this.updateCreateButtonState();
    }

    /**
     * Handle file match request from UI.
     * @param {string} fileName - Name of the file to match
     * @param {string} fileType - 'media' or 'json'
     */
    async handleFileMatchRequest(fileName, fileType) {
        if (this.floors.length === 0 && fileType === 'json') {
            ui.notifications.warn(game.i18n.localize('QUICKBATTLEMAP.NoFloorsToMatch'));
            return;
        }

        const floorId = await this.panelView.promptFloorSelection(
            this.floors.map(f => ({
                id: f.id,
                mediaFile: f.mediaFile
            })),
            fileName,
            fileType
        );

        if (!floorId) return;

        if (fileType === 'json') {
            // Find and assign the JSON file
            const jsonIndex = this.unmatchedJsonFiles.findIndex(f => f.name === fileName);
            if (jsonIndex === -1) return;

            const jsonFile = this.unmatchedJsonFiles[jsonIndex];
            const floor = this.floors.find(f => f.id === floorId);

            if (floor) {
                try {
                    const processedJson = await this.fileProcessor.processJsonFile(jsonFile);
                    floor.jsonData = processedJson.parsedContent;
                    floor.jsonFile = jsonFile;
                    this.unmatchedJsonFiles.splice(jsonIndex, 1);
                    this.refreshFloorListUI();
                } catch (error) {
                    ui.notifications.error(game.i18n.localize('QUICKBATTLEMAP.InvalidJSON'));
                }
            }
        } else if (fileType === 'media') {
            // Find and assign/create from media file
            const mediaIndex = this.unmatchedMediaFiles.findIndex(m => (m.file || m).name === fileName);
            if (mediaIndex === -1) return;

            const mediaItem = this.unmatchedMediaFiles[mediaIndex];
            
            if (floorId === '__new__') {
                // Create a new floor
                const file = mediaItem.file || mediaItem;
                const type = this.fileProcessor.getFileType(file);
                await this.createFloorFromFiles(file, type === 'video' ? 'video' : 'image', null);
            }
            
            this.unmatchedMediaFiles.splice(mediaIndex, 1);
            this.refreshFloorListUI();
        }

        this.updateCreateButtonState();
    }

    /**
     * Process an image file for use as scene background.
     * @param {File} imageFile - The dropped image file
     */
    async handleImageFile(imageFile) {
        try {
            const processedImage = await this.fileProcessor.processImageFile(imageFile);
            this.backgroundMediaData = {
                data: processedImage.dataUrl,
                filename: processedImage.filename,
                file: processedImage.file,
                isVideo: false
            };
            
            this.panelView.updateBackgroundMediaStatus(true, imageFile.name);
            this.updateCreateButtonState();

            if (!this.isNoGridModeEnabled) {
                await this.runGridAutoDetection(imageFile);
            }
        } catch (error) {
            console.error(`${MODULE_LOG_PREFIX} | Image processing failed:`, error);
        }
    }

    /**
     * Run automatic grid detection on an image file.
     * @param {File} imageFile - The image file to analyze
     */
    async runGridAutoDetection(imageFile) {
        this.showProgressIndicator(game.i18n.localize('QUICKBATTLEMAP.ProgressAnalyzing'));
        try {
            await this.detectAndApplyGridFromImage(imageFile);
        } catch (error) {
            if (this.isDebugLoggingEnabled) {
                console.warn(`${MODULE_LOG_PREFIX} | Auto grid detection failed:`, error);
            }
        } finally {
            this.hideProgressIndicator();
        }
    }

    /**
     * Process a video file for use as scene background.
     * @param {File} videoFile - The dropped video file
     */
    handleVideoFile(videoFile) {
        const processedVideo = this.fileProcessor.processVideoFile(videoFile);
        this.backgroundMediaData = {
            data: processedVideo.blobUrl,
            filename: processedVideo.filename,
            file: processedVideo.file,
            isVideo: true
        };
        this.panelView.updateBackgroundMediaStatus(true, videoFile.name);
        this.updateCreateButtonState();
    }

    /**
     * Process a JSON configuration file.
     * @param {File} jsonFile - The dropped JSON file
     */
    async handleJsonConfigFile(jsonFile) {
        try {
            const processedJson = await this.fileProcessor.processJsonFile(jsonFile);
            this.importedSceneStructure = processedJson.parsedContent;
            this.panelView.updateWallDataStatus(true, jsonFile.name);
            this.updateCreateButtonState();
        } catch (error) {
            console.error(`${MODULE_LOG_PREFIX} | JSON parse error:`, error);
            ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.InvalidJSON"));
        }
    }

    /**
     * Update the enabled state of the "Create Scene" button.
     */
    updateCreateButtonState() {
        const createButton = document.querySelector('.create-scene-button');
        if (createButton) {
            // Enable if we have at least one floor OR legacy single background
            const hasContent = this.floors.length > 0 || this.backgroundMediaData;
            createButton.disabled = !hasContent;
        }
    }

    /**
     * Main scene creation workflow.
     */
    async executeSceneCreation() {
        // Check if we're in multi-floor mode
        if (this.floors.length > 0) {
            await this.executeMultiFloorSceneCreation();
            return;
        }

        // Legacy single-floor creation
        if (!this.backgroundMediaData) {
            ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.MissingFiles"));
            return;
        }

        await this.ensureGridDataExists();
        this.warnIfGridDataMissing();

        try {
            ui.notifications.info(game.i18n.localize("QUICKBATTLEMAP.CreatingScene"));

            const uploadResult = await this.uploadBackgroundMedia();
            if (!uploadResult?.path) {
                ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.UploadFailed"));
                return;
            }

            const mediaDimensions = await this.fileProcessor.getMediaDimensions(this.backgroundMediaData);
            const normalizedData = this.dataNormalizer.normalizeToFoundryFormat(this.importedSceneStructure);

            this.logNormalizedData(normalizedData);

            const sceneName = this.determineSceneName(normalizedData.name);
            const createdScene = await this.sceneBuilder.createScene({
                backgroundPath: uploadResult.path,
                sceneName: sceneName,
                width: normalizedData.width || mediaDimensions.width || 1920,
                height: normalizedData.height || mediaDimensions.height || 1080,
                padding: normalizedData.padding,
                backgroundColor: normalizedData.backgroundColor,
                globalLight: normalizedData.globalLight,
                darkness: normalizedData.darkness
            });

            await this.sceneBuilder.activateAndWaitForCanvas(createdScene);
            await this.sceneBuilder.applyGridSettings(createdScene, normalizedData.grid, this.isNoGridModeEnabled);
            await this.sceneBuilder.createWalls(createdScene, normalizedData.walls);
            await this.sceneBuilder.createLights(createdScene, normalizedData.lights);

            this.cleanupAfterCreation(sceneName);

        } catch (error) {
            console.error(`${MODULE_LOG_PREFIX} | Scene creation failed:`, error);
            ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.SceneCreationFailed"));
        }
    }

    /**
     * Execute multi-floor scene creation.
     * Creates a scene with multiple foreground tiles for each floor level using the Levels module.
     */
    async executeMultiFloorSceneCreation() {
        if (this.floors.length === 0) {
            ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.MissingFiles"));
            return;
        }

        if (!isLevelsModuleActive()) {
            ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.LevelsModuleRequired"));
            return;
        }

        try {
            ui.notifications.info(game.i18n.localize("QUICKBATTLEMAP.CreatingMultiFloorScene"));

            // Use the first floor as the base/background
            const baseFloor = this.floors[0];
            
            // Upload all floor media files
            this.showProgressIndicator(game.i18n.localize('QUICKBATTLEMAP.ProgressUploading'));
            
            const uploadedFloors = [];
            for (let i = 0; i < this.floors.length; i++) {
                const floor = this.floors[i];
                const uploadResult = await this.storageService.uploadBackgroundMedia(floor.mediaData, game.world.id);
                if (!uploadResult?.path) {
                    ui.notifications.error(`${game.i18n.localize("QUICKBATTLEMAP.UploadFailed")}: Floor ${i + 1}`);
                    this.hideProgressIndicator();
                    return;
                }
                uploadedFloors.push({
                    ...floor,
                    uploadedPath: uploadResult.path
                });
            }
            
            this.hideProgressIndicator();

            // Get dimensions from the base floor
            const baseDimensions = await this.fileProcessor.getMediaDimensions(baseFloor.mediaData);
            const baseNormalizedData = this.dataNormalizer.normalizeToFoundryFormat(baseFloor.jsonData);

            // Determine scene name from first floor
            const sceneName = this.determineSceneName(baseNormalizedData.name, baseFloor.mediaData?.filename);

            // Calculate floor elevations (each floor is 10 units apart by default)
            const floorHeight = baseNormalizedData.grid?.distance || 5;
            const floorElevations = uploadedFloors.map((_, i) => i * floorHeight * 2);

            // Build sceneLevels array for Levels module: [bottom, top, name]
            const sceneLevels = uploadedFloors.map((floor, i) => {
                const bottom = floorElevations[i];
                const top = (i < uploadedFloors.length - 1) ? floorElevations[i + 1] - 1 : bottom + floorHeight * 2 - 1;
                const name = `Floor ${i + 1}`;
                return [bottom, top, name];
            });

            // Create the scene with the base floor as background
            const createdScene = await this.sceneBuilder.createScene({
                backgroundPath: uploadedFloors[0].uploadedPath,
                sceneName: sceneName,
                width: baseNormalizedData.width || baseDimensions.width || 1920,
                height: baseNormalizedData.height || baseDimensions.height || 1080,
                padding: baseNormalizedData.padding,
                backgroundColor: baseNormalizedData.backgroundColor,
                globalLight: baseNormalizedData.globalLight,
                darkness: baseNormalizedData.darkness
            });

            await this.sceneBuilder.activateAndWaitForCanvas(createdScene);
            await this.sceneBuilder.applyGridSettings(createdScene, baseNormalizedData.grid, this.isNoGridModeEnabled);

            // Create walls and lights from base floor with elevation
            await this.sceneBuilder.createWallsWithElevation(createdScene, baseNormalizedData.walls, floorElevations[0], floorElevations[0] + floorHeight * 2 - 1);
            await this.sceneBuilder.createLightsWithElevation(createdScene, baseNormalizedData.lights, floorElevations[0], floorElevations[0] + floorHeight * 2 - 1);

            // Create floor tiles for additional floors (floors 2+) with proper Levels flags
            if (uploadedFloors.length > 1) {
                await this.sceneBuilder.createLevelsFloorTiles(
                    createdScene,
                    uploadedFloors.slice(1),
                    baseDimensions,
                    this.dataNormalizer,
                    floorElevations.slice(1),
                    floorHeight
                );
            }

            // Set Levels module scene flags for floor definitions
            await createdScene.update({
                'flags.levels.sceneLevels': sceneLevels,
                'flags.levels.backgroundElevation': floorElevations[0]
            });

            this.cleanupAfterMultiFloorCreation(sceneName);

        } catch (error) {
            console.error(`${MODULE_LOG_PREFIX} | Multi-floor scene creation failed:`, error);
            ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.SceneCreationFailed"));
        }
    }

    /**
     * Ensure grid data exists before scene creation.
     */
    async ensureGridDataExists() {
        const shouldDetect = !this.isNoGridModeEnabled && 
                            !this.importedSceneStructure && 
                            this.backgroundMediaData?.file && 
                            !this.backgroundMediaData?.isVideo;

        if (shouldDetect) {
            try {
                this.showProgressIndicator(game.i18n.localize('QUICKBATTLEMAP.ProgressAnalyzing'));
                await this.detectAndApplyGridFromImage(this.backgroundMediaData.file);
            } catch (_error) { /* handled below */ } 
            finally {
                this.hideProgressIndicator();
            }
        }
    }

    /**
     * Display a warning if grid data is missing.
     */
    warnIfGridDataMissing() {
        if (this.isNoGridModeEnabled || this.importedSceneStructure) return;

        const message = this.backgroundMediaData?.isVideo
            ? "No grid data provided for video. Drop a JSON export or enable the No Grid option."
            : "Grid data missing and auto-detection failed. Drop a JSON export or set grid manually.";
        ui.notifications.error(message);
    }

    /**
     * Upload the background media to Foundry's storage.
     * @returns {Promise<{path: string}|null>} Upload result
     */
    async uploadBackgroundMedia() {
        this.showProgressIndicator(game.i18n.localize('QUICKBATTLEMAP.ProgressUploading'));
        try {
            return await this.storageService.uploadBackgroundMedia(this.backgroundMediaData, game.world.id);
        } finally {
            this.hideProgressIndicator();
        }
    }

    /**
     * Log normalized scene data for debugging.
     * @param {Object} data - The normalized scene configuration
     */
    logNormalizedData(data) {
        if (!this.isDebugLoggingEnabled) return;
        console.log(`${MODULE_LOG_PREFIX} | Normalized grid:`, data.grid);
        console.log(`${MODULE_LOG_PREFIX} | First wall:`, data.walls?.[0]);
        console.log(`${MODULE_LOG_PREFIX} | First light:`, data.lights?.[0]);
    }

    /**
     * Determine the scene name from config or filename.
     * @param {string|undefined} configuredName - Name from JSON config
     * @param {string} [fallbackFilename] - Fallback filename if no config name
     * @returns {string} The scene name to use
     */
    determineSceneName(configuredName, fallbackFilename) {
        if (configuredName) return configuredName;
        const filename = fallbackFilename || this.backgroundMediaData?.filename;
        const nameFromFile = filename?.split('.').slice(0, -1).join('.');
        return nameFromFile || game.i18n.localize("QUICKBATTLEMAP.DefaultSceneName");
    }

    /**
     * Clean up state after successful scene creation.
     * @param {string} sceneName - Name of the created scene
     */
    cleanupAfterCreation(sceneName) {
        this.fileProcessor.revokeBlobUrl(this.backgroundMediaData?.data);
        this.backgroundMediaData = null;
        this.importedSceneStructure = null;

        this.panelView.updateBackgroundMediaStatus(false, '');
        this.panelView.updateWallDataStatus(false, '');

        const createButton = document.querySelector('.create-scene-button');
        if (createButton) createButton.disabled = true;

        ui.notifications.info(`${game.i18n.localize("QUICKBATTLEMAP.SceneCreated")}: ${sceneName}`);
    }

    /**
     * Clean up state after successful multi-floor scene creation.
     * @param {string} sceneName - Name of the created scene
     */
    cleanupAfterMultiFloorCreation(sceneName) {
        // Revoke all blob URLs
        for (const floor of this.floors) {
            if (floor.mediaData?.isVideo) {
                this.fileProcessor.revokeBlobUrl(floor.mediaData.data);
            }
        }

        // Reset all state
        this.floors = [];
        this.unmatchedMediaFiles = [];
        this.unmatchedJsonFiles = [];
        this.backgroundMediaData = null;
        this.importedSceneStructure = null;

        // Update UI
        this.panelView.clearFloorList();
        this.panelView.updateBackgroundMediaStatus(false, '');
        this.panelView.updateWallDataStatus(false, '');

        const createButton = document.querySelector('.create-scene-button');
        if (createButton) createButton.disabled = true;

        ui.notifications.info(`${game.i18n.localize("QUICKBATTLEMAP.SceneCreated")}: ${sceneName}`);
    }

    /**
     * Detect grid settings from an image file.
     * @param {File} imageFile - The image file to analyze
     */
    async detectAndApplyGridFromImage(imageFile) {
        if (this.importedSceneStructure) return;

        const result = await this.gridDetectionService.detectGridFromImage(imageFile);
        if (!result || !Number.isFinite(result.gridSize) || result.gridSize <= 0) return;

        this.importedSceneStructure = {
            grid: {
                size: Math.round(result.gridSize),
                type: 1, distance: 5, units: 'ft', alpha: 0.2, color: '#000000'
            },
            shiftX: Math.round(result.xOffset || 0),
            shiftY: Math.round(result.yOffset || 0),
            walls: [], lights: []
        };

        this.panelView.updateWallDataStatus(true, 'Auto-detected grid');
        this.updateCreateButtonState();
        
        if (this.isDebugLoggingEnabled) {
            console.log(`${MODULE_LOG_PREFIX} | Auto grid detection success:`, this.importedSceneStructure);
        }
    }

    /**
     * Show progress indicator with a status message.
     * @param {string} message - Message to display
     */
    showProgressIndicator(message) {
        this.pendingOperationCount = Math.max(0, this.pendingOperationCount) + 1;
        this.panelView.showBusyState(message);
    }

    /**
     * Hide progress indicator when operation completes.
     */
    hideProgressIndicator() {
        this.pendingOperationCount = Math.max(0, this.pendingOperationCount - 1);
        if (this.pendingOperationCount === 0) {
            this.panelView.clearBusyState();
        }
    }

    /**
     * Reset all import state to initial values.
     */
    resetImportState() {
        // Revoke legacy blob URL
        this.fileProcessor.revokeBlobUrl(this.backgroundMediaData?.data);
        
        // Revoke all floor blob URLs
        for (const floor of this.floors) {
            if (floor.mediaData?.isVideo) {
                this.fileProcessor.revokeBlobUrl(floor.mediaData.data);
            }
        }

        // Reset all state
        this.backgroundMediaData = null;
        this.importedSceneStructure = null;
        this.floors = [];
        this.unmatchedMediaFiles = [];
        this.unmatchedJsonFiles = [];
        this.pendingOperationCount = 0;
        this.isNoGridModeEnabled = this.loadNoGridPreference();
        
        // Reset UI
        this.panelView.resetAllStatuses(this.isNoGridModeEnabled);
        this.panelView.clearFloorList();
    }
}

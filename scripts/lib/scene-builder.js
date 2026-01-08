/**
 * Scene Builder
 * 
 * Handles the creation and configuration of Foundry VTT Scene documents.
 * Extracts scene-specific logic for cleaner separation from the import controller.
 * 
 * @module SceneBuilder
 */

/** Module identifier for console logging */
const MODULE_LOG_PREFIX = 'Quick Battlemap Importer';

/** Maximum time to wait for canvas to be ready (milliseconds) */
const CANVAS_READY_TIMEOUT_MS = 8000;

/** Interval between canvas ready checks (milliseconds) */
const CANVAS_READY_CHECK_INTERVAL_MS = 100;

/**
 * @typedef {Object} SceneCreationOptions
 * @property {string} backgroundPath - Path to the uploaded background media
 * @property {string} sceneName - Name for the new scene
 * @property {number} width - Scene width in pixels
 * @property {number} height - Scene height in pixels
 * @property {number} [padding=0] - Scene padding multiplier
 * @property {string} [backgroundColor='#000000'] - Background color
 * @property {boolean} [globalLight=false] - Enable global illumination
 * @property {number} [darkness=0] - Darkness level (0-1)
 */

/**
 * @typedef {Object} GridSettings
 * @property {number} size - Grid cell size in pixels
 * @property {number} type - Grid type (0=none, 1=square, etc.)
 * @property {number} distance - Distance per grid cell
 * @property {string} units - Distance units
 * @property {string} color - Grid line color
 * @property {number} alpha - Grid line opacity
 * @property {Object} offset - Grid offset
 * @property {number} offset.x - Horizontal offset
 * @property {number} offset.y - Vertical offset
 */

/**
 * Service class responsible for building and configuring Foundry scenes.
 * Handles scene creation, grid settings, walls, and lights.
 */
export class SceneBuilder {
    
    /**
     * Create a new scene builder instance.
     * 
     * @param {boolean} [enableDebugLogging=false] - Whether to log debug information
     */
    constructor(enableDebugLogging = false) {
        /** @type {boolean} Enable verbose console logging */
        this.isDebugLoggingEnabled = enableDebugLogging;
    }

    /**
     * Create a new Foundry Scene document with the specified options.
     * 
     * @param {SceneCreationOptions} options - Scene creation options
     * @returns {Promise<Scene>} The created Scene document
     * 
     * @example
     * const builder = new SceneBuilder();
     * const scene = await builder.createScene({
     *   backgroundPath: 'worlds/myworld/maps/dungeon.png',
     *   sceneName: 'Dungeon Level 1',
     *   width: 2048,
     *   height: 2048
     * });
     */
    async createScene(options) {
        const sceneDocumentData = {
            name: options.sceneName,
            img: options.backgroundPath,
            background: { src: options.backgroundPath },
            width: options.width,
            height: options.height,
            padding: options.padding ?? 0,
            backgroundColor: options.backgroundColor ?? '#000000',
            globalLight: options.globalLight ?? false,
            darkness: options.darkness ?? 0
        };

        const createdScene = await Scene.create(sceneDocumentData);
        
        if (this.isDebugLoggingEnabled) {
            console.log(`${MODULE_LOG_PREFIX} | Created scene:`, createdScene.name);
        }

        return createdScene;
    }

    /**
     * Activate a scene and wait for the canvas to be fully ready.
     * 
     * @param {Scene} scene - The scene to activate
     * @returns {Promise<void>} Resolves when canvas is ready
     */
    async activateAndWaitForCanvas(scene) {
        await scene.activate();
        await this.waitForCanvasReady(scene);
    }

    /**
     * Wait for the canvas to be fully ready after scene activation.
     * Times out after CANVAS_READY_TIMEOUT_MS to prevent infinite waiting.
     * 
     * @param {Scene} targetScene - The scene to wait for
     * @returns {Promise<void>} Resolves when canvas is ready or timeout reached
     */
    async waitForCanvasReady(targetScene) {
        const timeoutDeadline = Date.now() + CANVAS_READY_TIMEOUT_MS;

        while (Date.now() < timeoutDeadline) {
            const isCanvasReady = this.checkCanvasReadyState(targetScene);

            if (isCanvasReady) {
                return;
            }

            await this.delay(CANVAS_READY_CHECK_INTERVAL_MS);
        }

        if (this.isDebugLoggingEnabled) {
            console.warn(`${MODULE_LOG_PREFIX} | Canvas ready timeout reached`);
        }
    }

    /**
     * Check if the canvas is fully initialized for a scene.
     * 
     * @param {Scene} targetScene - The scene to check
     * @returns {boolean} True if canvas is ready
     */
    checkCanvasReadyState(targetScene) {
        return (
            canvas?.ready &&
            canvas?.scene?.id === targetScene.id &&
            canvas?.walls?.initialized !== false &&
            canvas?.lighting?.initialized !== false
        );
    }

    /**
     * Apply grid settings to a scene, handling different Foundry versions.
     * 
     * @param {Scene} scene - The scene to update
     * @param {GridSettings} gridSettings - Grid configuration to apply
     * @param {boolean} [useNoGridMode=false] - Override grid type to 0 (none)
     */
    async applyGridSettings(scene, gridSettings, useNoGridMode = false) {
        // Override grid type if no-grid mode is enabled
        const effectiveGridSettings = { ...gridSettings };
        if (useNoGridMode) {
            effectiveGridSettings.type = 0;
        }

        const sceneSnapshot = duplicate(scene.toObject());
        const usesObjectGridFormat = typeof sceneSnapshot.grid === 'object';

        if (this.isDebugLoggingEnabled) {
            console.log(`${MODULE_LOG_PREFIX} | Scene grid snapshot:`, sceneSnapshot.grid);
        }

        if (usesObjectGridFormat) {
            await this.applyObjectGridSettings(scene, sceneSnapshot, effectiveGridSettings);
        } else {
            await this.applyLegacyGridSettings(scene, effectiveGridSettings);
        }

        if (this.isDebugLoggingEnabled) {
            const updatedSnapshot = duplicate(scene.toObject());
            console.log(`${MODULE_LOG_PREFIX} | Grid after update:`, updatedSnapshot.grid);
        }
    }

    /**
     * Apply grid settings using modern object format (Foundry v10+).
     * Falls back to legacy format if update fails.
     * 
     * @param {Scene} scene - The scene to update
     * @param {Object} snapshot - Current scene data snapshot
     * @param {GridSettings} gridSettings - Grid settings to apply
     */
    async applyObjectGridSettings(scene, snapshot, gridSettings) {
        const gridUpdateData = {
            ...(snapshot.grid || {}),
            size: gridSettings.size,
            type: gridSettings.type,
            distance: gridSettings.distance,
            units: gridSettings.units,
            color: gridSettings.color,
            alpha: gridSettings.alpha,
            offset: {
                x: gridSettings.offset?.x ?? 0,
                y: gridSettings.offset?.y ?? 0
            }
        };

        try {
            await scene.update({ grid: gridUpdateData });
        } catch (updateError) {
            console.warn(`${MODULE_LOG_PREFIX} | Grid object update failed; using legacy format`, updateError);
            await this.applyLegacyGridSettings(scene, gridSettings);
        }
    }

    /**
     * Apply grid settings using legacy flat property format.
     * Used for older Foundry versions or as fallback.
     * 
     * @param {Scene} scene - The scene to update
     * @param {GridSettings} gridSettings - Grid settings to apply
     */
    async applyLegacyGridSettings(scene, gridSettings) {
        await scene.update({
            grid: gridSettings.size,
            gridType: gridSettings.type,
            gridDistance: gridSettings.distance,
            gridUnits: gridSettings.units,
            gridColor: gridSettings.color,
            gridAlpha: gridSettings.alpha,
            shiftX: gridSettings.offset?.x ?? 0,
            shiftY: gridSettings.offset?.y ?? 0
        });
    }

    /**
     * Create wall documents in a scene.
     * Filters invalid walls and retries once on failure.
     * 
     * @param {Scene} scene - The scene to add walls to
     * @param {Array} wallsData - Array of wall document data
     * @returns {Promise<void>}
     */
    async createWalls(scene, wallsData) {
        const validWalls = this.filterValidWalls(wallsData || []);
        
        if (!validWalls.length) {
            return;
        }

        if (this.isDebugLoggingEnabled) {
            console.log(`${MODULE_LOG_PREFIX} | Creating ${validWalls.length} walls`);
        }

        const wallCountBefore = scene.walls?.size ?? 0;

        try {
            await scene.createEmbeddedDocuments('Wall', validWalls);
        } catch (firstAttemptError) {
            console.warn(`${MODULE_LOG_PREFIX} | Wall creation failed, retrying...`, firstAttemptError);
            await this.retryWallCreation(scene, validWalls, wallCountBefore);
        }
    }

    /**
     * Filter wall data to remove invalid entries.
     * Walls must have valid coordinates and non-zero length.
     * 
     * @param {Array} wallsData - Raw wall data array
     * @returns {Array} Filtered array of valid walls
     */
    filterValidWalls(wallsData) {
        return wallsData.filter(wall => {
            // Must have coordinate array with at least 4 values
            if (!Array.isArray(wall.c) || wall.c.length < 4) {
                return false;
            }

            const [startX, startY, endX, endY] = wall.c.map(n => Number(n));
            const coordinates = [startX, startY, endX, endY];

            // All coordinates must be finite numbers
            if (coordinates.some(coord => !Number.isFinite(coord))) {
                return false;
            }

            // Wall must have non-zero length (not a point)
            if (startX === endX && startY === endY) {
                return false;
            }

            return true;
        });
    }

    /**
     * Retry wall creation after waiting for canvas stability.
     * 
     * @param {Scene} scene - The scene to add walls to
     * @param {Array} validWalls - Valid wall data array
     * @param {number} wallCountBefore - Wall count before first attempt
     */
    async retryWallCreation(scene, validWalls, wallCountBefore) {
        await this.waitForCanvasReady(scene);
        await this.delay(200);

        try {
            await scene.createEmbeddedDocuments('Wall', validWalls);
        } catch (retryError) {
            const wallCountAfter = scene.walls?.size ?? 0;

            if (wallCountAfter > wallCountBefore) {
                // Walls were actually created despite the error
                console.warn(`${MODULE_LOG_PREFIX} | Walls created despite error`);
            } else {
                console.error(`${MODULE_LOG_PREFIX} | Failed to create walls:`, validWalls.slice(0, 5));
                console.error(retryError);
                ui.notifications.warn('Some walls could not be created. See console.');
            }
        }
    }

    /**
     * Create ambient light documents in a scene.
     * 
     * @param {Scene} scene - The scene to add lights to
     * @param {Array} lightsData - Array of light document data
     * @returns {Promise<void>}
     */
    async createLights(scene, lightsData) {
        const lights = lightsData || [];
        
        if (!lights.length) {
            return;
        }

        if (this.isDebugLoggingEnabled) {
            console.log(`${MODULE_LOG_PREFIX} | Creating ${lights.length} lights`);
        }

        try {
            await scene.createEmbeddedDocuments('AmbientLight', lights);
        } catch (creationError) {
            console.error(`${MODULE_LOG_PREFIX} | Failed to create lights:`, lights.slice(0, 5));
            console.error(creationError);
            ui.notifications.warn('Some lights could not be created. See console.');
        }
    }

    /**
     * Create floor tiles for multi-floor scenes.
     * Each additional floor is created as an overhead tile that can be toggled.
     * 
     * @param {Scene} scene - The scene to add floor tiles to
     * @param {Array} additionalFloors - Array of floor data (excluding base floor)
     * @param {Object} baseDimensions - Dimensions of the base floor
     * @param {Object} dataNormalizer - Data normalizer instance for processing JSON
     * @returns {Promise<void>}
     */
    async createFloorTiles(scene, additionalFloors, baseDimensions, dataNormalizer) {
        if (!additionalFloors || additionalFloors.length === 0) {
            return;
        }

        if (this.isDebugLoggingEnabled) {
            console.log(`${MODULE_LOG_PREFIX} | Creating ${additionalFloors.length} floor tiles`);
        }

        const tileDocuments = [];
        const wallDocuments = [];
        const lightDocuments = [];

        for (let i = 0; i < additionalFloors.length; i++) {
            const floor = additionalFloors[i];
            const floorLevel = i + 2; // Floors start at 2 (1 is the base)

            // Create tile for this floor
            const tileData = {
                texture: {
                    src: floor.uploadedPath
                },
                x: 0,
                y: 0,
                width: baseDimensions.width || scene.width,
                height: baseDimensions.height || scene.height,
                overhead: true,
                roof: false,
                hidden: true, // Start hidden, user can toggle
                sort: 1000 + (i * 100), // Ensure proper z-ordering
                flags: {
                    'quick-battlemap-importer': {
                        floorLevel: floorLevel,
                        floorName: floor.mediaData?.filename || `Floor ${floorLevel}`
                    }
                }
            };

            tileDocuments.push(tileData);

            // Process walls and lights for this floor if JSON data exists
            if (floor.jsonData) {
                const normalizedData = dataNormalizer.normalizeToFoundryFormat(floor.jsonData);
                
                // Add walls with floor level flag
                if (normalizedData.walls && normalizedData.walls.length > 0) {
                    const floorWalls = normalizedData.walls.map(wall => ({
                        ...wall,
                        flags: {
                            ...wall.flags,
                            'quick-battlemap-importer': {
                                floorLevel: floorLevel
                            }
                        }
                    }));
                    wallDocuments.push(...this.filterValidWalls(floorWalls));
                }

                // Add lights with floor level flag
                if (normalizedData.lights && normalizedData.lights.length > 0) {
                    const floorLights = normalizedData.lights.map(light => ({
                        ...light,
                        hidden: true, // Start hidden like the tile
                        flags: {
                            ...light.flags,
                            'quick-battlemap-importer': {
                                floorLevel: floorLevel
                            }
                        }
                    }));
                    lightDocuments.push(...floorLights);
                }
            }
        }

        // Create all tiles
        try {
            await scene.createEmbeddedDocuments('Tile', tileDocuments);
            if (this.isDebugLoggingEnabled) {
                console.log(`${MODULE_LOG_PREFIX} | Created ${tileDocuments.length} floor tiles`);
            }
        } catch (error) {
            console.error(`${MODULE_LOG_PREFIX} | Failed to create floor tiles:`, error);
            ui.notifications.warn('Some floor tiles could not be created. See console.');
        }

        // Create walls for additional floors
        if (wallDocuments.length > 0) {
            try {
                await scene.createEmbeddedDocuments('Wall', wallDocuments);
                if (this.isDebugLoggingEnabled) {
                    console.log(`${MODULE_LOG_PREFIX} | Created ${wallDocuments.length} walls for additional floors`);
                }
            } catch (error) {
                console.error(`${MODULE_LOG_PREFIX} | Failed to create walls for floors:`, error);
            }
        }

        // Create lights for additional floors
        if (lightDocuments.length > 0) {
            try {
                await scene.createEmbeddedDocuments('AmbientLight', lightDocuments);
                if (this.isDebugLoggingEnabled) {
                    console.log(`${MODULE_LOG_PREFIX} | Created ${lightDocuments.length} lights for additional floors`);
                }
            } catch (error) {
                console.error(`${MODULE_LOG_PREFIX} | Failed to create lights for floors:`, error);
            }
        }
    }

    /**
     * Utility method to create a delay.
     * 
     * @param {number} milliseconds - Duration to wait
     * @returns {Promise<void>} Resolves after the delay
     */
    delay(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    /**
     * Create walls with elevation for Levels module compatibility.
     * 
     * @param {Scene} scene - The scene to add walls to
     * @param {Array} wallsData - Array of wall document data
     * @param {number} bottom - Bottom elevation for the walls
     * @param {number} top - Top elevation for the walls
     * @returns {Promise<void>}
     */
    async createWallsWithElevation(scene, wallsData, bottom, top) {
        const validWalls = this.filterValidWalls(wallsData || []);
        
        if (!validWalls.length) {
            return;
        }

        // Add wall-height flags for Levels/Wall Height Enhanced compatibility
        const wallsWithElevation = validWalls.map(wall => ({
            ...wall,
            flags: {
                ...wall.flags,
                'wall-height': {
                    bottom: bottom,
                    top: top
                }
            }
        }));

        if (this.isDebugLoggingEnabled) {
            console.log(`${MODULE_LOG_PREFIX} | Creating ${wallsWithElevation.length} walls with elevation ${bottom}-${top}`);
        }

        try {
            await scene.createEmbeddedDocuments('Wall', wallsWithElevation);
        } catch (error) {
            console.error(`${MODULE_LOG_PREFIX} | Failed to create walls with elevation:`, error);
        }
    }

    /**
     * Create lights with elevation for Levels module compatibility.
     * 
     * @param {Scene} scene - The scene to add lights to
     * @param {Array} lightsData - Array of light document data
     * @param {number} bottom - Bottom elevation for the lights
     * @param {number} top - Top elevation for the lights
     * @returns {Promise<void>}
     */
    async createLightsWithElevation(scene, lightsData, bottom, top) {
        const lights = lightsData || [];
        
        if (!lights.length) {
            return;
        }

        // Add elevation and Levels flags
        const lightsWithElevation = lights.map(light => ({
            ...light,
            elevation: bottom,
            flags: {
                ...light.flags,
                levels: {
                    rangeTop: top
                }
            }
        }));

        if (this.isDebugLoggingEnabled) {
            console.log(`${MODULE_LOG_PREFIX} | Creating ${lightsWithElevation.length} lights with elevation ${bottom}-${top}`);
        }

        try {
            await scene.createEmbeddedDocuments('AmbientLight', lightsWithElevation);
        } catch (error) {
            console.error(`${MODULE_LOG_PREFIX} | Failed to create lights with elevation:`, error);
        }
    }

    /**
     * Create floor tiles for multi-floor scenes using Levels module format.
     * Each additional floor is created as an overhead tile with proper elevation.
     * 
     * @param {Scene} scene - The scene to add floor tiles to
     * @param {Array} additionalFloors - Array of floor data (excluding base floor)
     * @param {Object} baseDimensions - Dimensions of the base floor
     * @param {Object} dataNormalizer - Data normalizer instance for processing JSON
     * @param {Array<number>} floorElevations - Array of elevation values for each floor
     * @param {number} floorHeight - Height of each floor in grid units
     * @returns {Promise<void>}
     */
    async createLevelsFloorTiles(scene, additionalFloors, baseDimensions, dataNormalizer, floorElevations, floorHeight) {
        if (!additionalFloors || additionalFloors.length === 0) {
            return;
        }

        if (this.isDebugLoggingEnabled) {
            console.log(`${MODULE_LOG_PREFIX} | Creating ${additionalFloors.length} Levels floor tiles`);
        }

        const tileDocuments = [];

        for (let i = 0; i < additionalFloors.length; i++) {
            const floor = additionalFloors[i];
            const floorLevel = i + 2; // Floors start at 2 (1 is the base)
            const elevation = floorElevations[i];
            const rangeTop = elevation + floorHeight * 2 - 1;

            // Create tile for this floor with Levels flags
            const tileData = {
                texture: {
                    src: floor.uploadedPath
                },
                x: 0,
                y: 0,
                width: baseDimensions.width || scene.width,
                height: baseDimensions.height || scene.height,
                overhead: true,
                roof: false,
                occlusion: { mode: 1 }, // Levels uses occlusion mode 1
                elevation: elevation,
                sort: 1000 + (i * 100),
                flags: {
                    levels: {
                        rangeTop: rangeTop
                    }
                }
            };

            tileDocuments.push(tileData);

            // Process walls and lights for this floor if JSON data exists
            if (floor.jsonData) {
                const normalizedData = dataNormalizer.normalizeToFoundryFormat(floor.jsonData);
                
                // Create walls with elevation
                if (normalizedData.walls && normalizedData.walls.length > 0) {
                    await this.createWallsWithElevation(scene, normalizedData.walls, elevation, rangeTop);
                }

                // Create lights with elevation
                if (normalizedData.lights && normalizedData.lights.length > 0) {
                    await this.createLightsWithElevation(scene, normalizedData.lights, elevation, rangeTop);
                }
            }
        }

        // Create all tiles
        try {
            await scene.createEmbeddedDocuments('Tile', tileDocuments);
            if (this.isDebugLoggingEnabled) {
                console.log(`${MODULE_LOG_PREFIX} | Created ${tileDocuments.length} Levels floor tiles`);
            }
        } catch (error) {
            console.error(`${MODULE_LOG_PREFIX} | Failed to create Levels floor tiles:`, error);
            ui.notifications.warn('Some floor tiles could not be created. See console.');
        }
    }
}

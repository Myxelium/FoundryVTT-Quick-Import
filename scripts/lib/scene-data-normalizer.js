/**
 * Scene Data Normalizer
 * 
 * Transforms imported scene configuration data (from JSON exports like Dungeon Alchemist)
 * into Foundry VTT's expected document format. Handles various input formats and
 * provides sensible defaults for missing values.
 * 
 * @module SceneDataNormalizer
 */

/**
 * @typedef {Object} NormalizedGridSettings
 * @property {number} size - Grid cell size in pixels
 * @property {number} type - Grid type (0=none, 1=square, 2=hex-row, 3=hex-col)
 * @property {number} distance - Real-world distance per grid cell
 * @property {string} units - Unit of measurement (ft, m, etc.)
 * @property {number} alpha - Grid line opacity (0-1)
 * @property {string} color - Grid line color (hex)
 * @property {Object} offset - Grid offset for alignment
 * @property {number} offset.x - Horizontal offset in pixels
 * @property {number} offset.y - Vertical offset in pixels
 */

/**
 * @typedef {Object} NormalizedWallData
 * @property {number[]} c - Wall coordinates [x1, y1, x2, y2]
 * @property {number} door - Door type (0=none, 1=door, 2=secret)
 * @property {number} ds - Door state (0=closed, 1=open, 2=locked)
 * @property {number} dir - Wall direction for one-way walls
 * @property {number} move - Movement restriction type
 * @property {number} sound - Sound restriction type
 * @property {number} sight - Vision restriction type
 * @property {number} light - Light restriction type
 * @property {Object} flags - Custom module flags
 */

/**
 * @typedef {Object} NormalizedLightData
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 * @property {number} rotation - Light rotation angle
 * @property {boolean} hidden - Whether light is hidden from players
 * @property {boolean} walls - Whether light is blocked by walls
 * @property {boolean} vision - Whether light provides vision
 * @property {Object} config - Light configuration object
 */

/**
 * @typedef {Object} NormalizedSceneData
 * @property {string} [name] - Scene name
 * @property {number} [width] - Scene width in pixels
 * @property {number} [height] - Scene height in pixels
 * @property {NormalizedGridSettings} grid - Grid configuration
 * @property {number} padding - Scene padding multiplier
 * @property {string} backgroundColor - Background color (hex)
 * @property {boolean} globalLight - Whether global illumination is enabled
 * @property {number} darkness - Darkness level (0-1)
 * @property {NormalizedWallData[]} walls - Wall documents
 * @property {NormalizedLightData[]} lights - Ambient light documents
 * @property {Array} tokens - Token documents
 * @property {Array} notes - Note documents
 * @property {Array} drawings - Drawing documents
 */

/** Default values for grid configuration */
const GRID_DEFAULTS = {
    SIZE: 100,
    TYPE: 1,           // Square grid
    DISTANCE: 5,
    UNITS: 'ft',
    ALPHA: 0.2,
    COLOR: '#000000'
};

/** Default scene settings */
const SCENE_DEFAULTS = {
    PADDING: 0,
    BACKGROUND_COLOR: '#000000',
    DARKNESS: 0
};

/**
 * Service class that normalizes imported scene data to Foundry's expected format.
 * Handles various JSON export formats and provides sensible defaults.
 */
export class SceneDataNormalizer {

    /**
     * Transform imported scene configuration into Foundry's internal document format.
     * Handles multiple input formats and normalizes all values.
     * 
     * @param {Object|null|undefined} inputData - Raw imported scene data (may be null/undefined)
     * @returns {NormalizedSceneData} Normalized scene configuration ready for Foundry
     * 
     * @example
     * const normalizer = new SceneDataNormalizer();
     * const normalized = normalizer.normalizeToFoundryFormat(importedJson);
     * // normalized.grid, normalized.walls, etc. are ready for Scene.create()
     */
    normalizeToFoundryFormat(inputData) {
        const sourceData = inputData || {};

        const normalizedData = {
            name: sourceData.name,
            width: this.parseNumberOrUndefined(sourceData.width),
            height: this.parseNumberOrUndefined(sourceData.height),
            grid: this.normalizeGridSettings(sourceData),
            padding: this.parseNumberWithDefault(sourceData.padding, SCENE_DEFAULTS.PADDING),
            backgroundColor: sourceData.backgroundColor ?? sourceData.gridColor ?? SCENE_DEFAULTS.BACKGROUND_COLOR,
            globalLight: !!sourceData.globalLight,
            darkness: this.parseNumberWithDefault(sourceData.darkness, SCENE_DEFAULTS.DARKNESS),
            walls: this.normalizeWallsData(sourceData.walls || []),
            lights: this.normalizeLightsData(sourceData.lights || [], sourceData),
            tokens: sourceData.tokens ?? [],
            notes: sourceData.notes ?? [],
            drawings: sourceData.drawings ?? []
        };

        return normalizedData;
    }

    /**
     * Normalize grid settings from various input formats.
     * Supports both flat properties and nested grid object.
     * 
     * @param {Object} sourceData - Source data containing grid information
     * @returns {NormalizedGridSettings} Normalized grid configuration
     */
    normalizeGridSettings(sourceData) {
        // Extract grid values from either flat properties or nested grid object
        const gridSize = this.extractGridValue(sourceData, 'size', 'grid', GRID_DEFAULTS.SIZE);
        const gridType = this.extractGridValue(sourceData, 'gridType', 'type', GRID_DEFAULTS.TYPE);
        const gridDistance = sourceData.gridDistance ?? sourceData.grid?.distance ?? GRID_DEFAULTS.DISTANCE;
        const gridUnits = sourceData.gridUnits ?? sourceData.grid?.units ?? GRID_DEFAULTS.UNITS;
        const gridAlpha = this.parseNumberWithDefault(
            sourceData.gridAlpha ?? sourceData.grid?.alpha, 
            GRID_DEFAULTS.ALPHA
        );
        const gridColor = sourceData.gridColor ?? sourceData.grid?.color ?? GRID_DEFAULTS.COLOR;
        const offsetX = this.parseNumberWithDefault(sourceData.shiftX ?? sourceData.grid?.shiftX, 0);
        const offsetY = this.parseNumberWithDefault(sourceData.shiftY ?? sourceData.grid?.shiftY, 0);

        return {
            size: gridSize,
            type: gridType,
            distance: gridDistance,
            units: gridUnits,
            alpha: gridAlpha,
            color: gridColor,
            offset: {
                x: offsetX,
                y: offsetY
            }
        };
    }

    /**
     * Extract a grid value from source data, handling both number and object formats.
     * 
     * @param {Object} sourceData - Source data object
     * @param {string} flatKey - Key for flat property (e.g., 'gridType')
     * @param {string} nestedKey - Key within grid object (e.g., 'type')
     * @param {number} defaultValue - Default value if not found
     * @returns {number} The extracted grid value
     */
    extractGridValue(sourceData, flatKey, nestedKey, defaultValue) {
        // Handle the special case where grid can be a number (size) or an object
        if (nestedKey === 'grid' || flatKey === 'size') {
            const rawGridValue = typeof sourceData.grid === 'number' 
                ? sourceData.grid 
                : sourceData.grid?.size;
            return this.parseNumberWithDefault(rawGridValue, defaultValue);
        }

        const flatValue = sourceData[flatKey];
        const nestedValue = sourceData.grid?.[nestedKey];
        
        return this.parseNumberWithDefault(
            flatValue !== undefined ? flatValue : nestedValue, 
            defaultValue
        );
    }

    /**
     * Normalize an array of wall data to Foundry's Wall document format.
     * 
     * @param {Array} wallsArray - Array of raw wall data objects
     * @returns {NormalizedWallData[]} Array of normalized wall documents
     */
    normalizeWallsData(wallsArray) {
        return wallsArray.map(wall => this.normalizeWall(wall));
    }

    /**
     * Normalize a single wall object to Foundry's expected format.
     * 
     * @param {Object} wall - Raw wall data
     * @returns {NormalizedWallData} Normalized wall document
     */
    normalizeWall(wall) {
        const restrictionTypes = this.getWallRestrictionTypes();

        return {
            c: this.normalizeWallCoordinates(wall.c),
            door: this.ensureFiniteNumber(wall.door, 0),
            ds: this.ensureFiniteNumber(wall.ds, 0),
            dir: this.ensureFiniteNumber(wall.dir, 0),
            move: this.parseRestrictionValue(wall.move, restrictionTypes.NONE, restrictionTypes),
            sound: this.parseRestrictionValue(wall.sound, restrictionTypes.NONE, restrictionTypes),
            sight: this.parseRestrictionValue(wall.sense ?? wall.sight, restrictionTypes.NONE, restrictionTypes),
            light: this.parseRestrictionValue(wall.light, restrictionTypes.NONE, restrictionTypes),
            flags: wall.flags ?? {}
        };
    }

    /**
     * Normalize wall coordinates to ensure they are numbers.
     * 
     * @param {Array} coordinates - Raw coordinate array
     * @returns {number[]} Array of numeric coordinates [x1, y1, x2, y2]
     */
    normalizeWallCoordinates(coordinates) {
        if (!Array.isArray(coordinates)) {
            return coordinates;
        }
        return coordinates.slice(0, 4).map(coord => Number(coord));
    }

    /**
     * Get wall restriction type constants from Foundry or use defaults.
     * 
     * @returns {{NONE: number, LIMITED: number, NORMAL: number}} Restriction type values
     */
    getWallRestrictionTypes() {
        return globalThis?.CONST?.WALL_RESTRICTION_TYPES || {
            NONE: 0,
            LIMITED: 10,
            NORMAL: 20
        };
    }

    /**
     * Parse a wall restriction value from various input formats.
     * Handles numbers, strings, and boolean values.
     * 
     * @param {*} value - The value to parse
     * @param {number} defaultValue - Default if parsing fails
     * @param {Object} restrictionTypes - Available restriction type constants
     * @returns {number} The restriction type value
     */
    parseRestrictionValue(value, defaultValue, restrictionTypes) {
        const validValues = new Set(Object.values(restrictionTypes));

        // Already a valid restriction number
        if (typeof value === 'number' && validValues.has(value)) {
            return value;
        }

        // Falsy values map to NONE
        if (value === 0 || value === '0' || value === false || value == null) {
            return restrictionTypes.NONE;
        }

        // Truthy numeric values map to NORMAL
        if (value === 1 || value === '1' || value === true) {
            return restrictionTypes.NORMAL;
        }

        // Parse string values
        if (typeof value === 'string') {
            const lowercaseValue = value.toLowerCase();
            
            if (lowercaseValue.startsWith('none')) {
                return restrictionTypes.NONE;
            }
            if (lowercaseValue.startsWith('limit')) {
                return restrictionTypes.LIMITED;
            }
            if (lowercaseValue.startsWith('norm')) {
                return restrictionTypes.NORMAL;
            }
        }

        return defaultValue;
    }

    /**
     * Normalize an array of light data to Foundry's AmbientLight document format.
     * 
     * @param {Array} lightsArray - Array of raw light data objects
     * @param {Object} sourceData - Source scene data for context (grid settings, etc.)
     * @returns {NormalizedLightData[]} Array of normalized light documents
     */
    normalizeLightsData(lightsArray, sourceData = {}) {
        // Calculate the conversion factor from source units to grid units
        // Dungeon Alchemist exports light radii in map units (e.g., feet)
        // Foundry expects radii in grid units (number of grid squares)
        const gridDistance = sourceData.gridDistance ?? sourceData.grid?.distance ?? GRID_DEFAULTS.DISTANCE;
        
        return lightsArray.map(light => this.normalizeLight(light, gridDistance));
    }

    /**
     * Normalize a single light object to Foundry's expected format.
     * 
     * @param {Object} light - Raw light data
     * @param {number} gridDistance - Distance per grid cell for unit conversion
     * @returns {NormalizedLightData} Normalized light document
     */
    normalizeLight(light, gridDistance = GRID_DEFAULTS.DISTANCE) {
        // Convert light radii from map units (feet) to grid units
        // e.g., 33.75 feet / 5 feet per grid = 6.75 grid units
        const brightRadius = this.convertToGridUnits(light.bright, gridDistance);
        const dimRadius = this.convertToGridUnits(light.dim, gridDistance);

        return {
            x: Number(light.x),
            y: Number(light.y),
            rotation: 0,
            hidden: false,
            walls: true,
            vision: false,
            config: {
                alpha: Number(light.tintAlpha ?? 0.5),
                color: light.tintColor ?? null,
                bright: brightRadius,
                dim: dimRadius,
                angle: 360
            }
        };
    }

    /**
     * Convert a distance value from map units to grid units.
     * 
     * @param {number|undefined} value - The value in map units (e.g., feet)
     * @param {number} gridDistance - Distance per grid cell
     * @returns {number} The value in grid units
     */
    convertToGridUnits(value, gridDistance) {
        const numValue = Number(value);
        if (!Number.isFinite(numValue) || numValue <= 0) {
            return 0;
        }
        // Avoid division by zero
        if (!Number.isFinite(gridDistance) || gridDistance <= 0) {
            return numValue;
        }
        return numValue / gridDistance;
    }

    /**
     * Parse a value as a number, returning undefined if invalid.
     * 
     * @param {*} value - Value to parse
     * @returns {number|undefined} Parsed number or undefined
     */
    parseNumberOrUndefined(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    /**
     * Parse a value as a number, returning a default if invalid.
     * 
     * @param {*} value - Value to parse
     * @param {number} defaultValue - Default value if parsing fails
     * @returns {number} Parsed number or default
     */
    parseNumberWithDefault(value, defaultValue) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : defaultValue;
    }

    /**
     * Ensure a value is a finite number, returning default if not.
     * 
     * @param {*} value - Value to check
     * @param {number} defaultValue - Default value
     * @returns {number} The value if finite, otherwise default
     */
    ensureFiniteNumber(value, defaultValue) {
        const numValue = Number(value);
        return Number.isFinite(numValue) ? numValue : defaultValue;
    }
}

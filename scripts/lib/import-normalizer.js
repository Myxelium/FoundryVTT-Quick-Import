export class QuickBattlemapImportNormalizer {
    convertImportedDataToInternalShape(input) {
        const source = input || {};

        const toNumberOrDefault = (value, defaultValue) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : defaultValue;
        };

        const result = {};
        result.name = source.name;
        result.width = toNumberOrDefault(source.width, undefined);
        result.height = toNumberOrDefault(source.height, undefined);

        const gridSize = toNumberOrDefault(typeof source.grid === 'number' ? source.grid : source.grid?.size, 100);
        const gridType = toNumberOrDefault(typeof source.gridType === 'number' ? source.gridType : source.grid?.type, 1);
        const gridDistance = toNumberOrDefault(source.gridDistance ?? source.grid?.distance, 5);
        const gridUnits = source.gridUnits ?? source.grid?.units ?? 'ft';
        const gridAlpha = toNumberOrDefault(source.gridAlpha ?? source.grid?.alpha, 0.2);
        const gridColor = source.gridColor ?? source.grid?.color ?? '#000000';
        const gridShiftX = toNumberOrDefault(source.shiftX ?? source.grid?.shiftX, 0);
        const gridShiftY = toNumberOrDefault(source.shiftY ?? source.grid?.shiftY, 0);

        result.grid = {
            size: gridSize,
            type: gridType,
            distance: gridDistance,
            units: gridUnits,
            alpha: gridAlpha,
            color: gridColor,
            offset: {
                x: gridShiftX,
                y: gridShiftY
            }
        };

        result.padding = toNumberOrDefault(source.padding, 0);
        result.backgroundColor = source.backgroundColor ?? source.gridColor ?? '#000000';
        result.globalLight = !!source.globalLight;
        result.darkness = toNumberOrDefault(source.darkness, 0);

        const restrictionTypes = (globalThis?.CONST?.WALL_RESTRICTION_TYPES) || {
            NONE: 0,
            LIMITED: 10,
            NORMAL: 20
        };
        const validRestrictions = new Set(Object.values(restrictionTypes));

        const toSafeNumber = (value, defaultValue) => (Number.isFinite(value) ? value : defaultValue);
        const toRestrictionValue = (value, defaultValue = restrictionTypes.NONE) => {
            if (typeof value === 'number' && validRestrictions.has(value)) 
                return value;

            if (value === 0 || value === '0' || value === false || value == null) 
                return restrictionTypes.NONE;
            
            if (value === 1 || value === '1' || value === true) 
                return restrictionTypes.NORMAL;

            if (typeof value === 'string') {
                const lower = value.toLowerCase();
                
                if (lower.startsWith('none')) 
                    return restrictionTypes.NONE;

                if (lower.startsWith('limit')) 
                    return restrictionTypes.LIMITED;

                if (lower.startsWith('norm')) 
                    return restrictionTypes.NORMAL;
            }
            return defaultValue;
        };

        result.walls = (source.walls ?? [])
            .map(wall => ({
                c: Array.isArray(wall.c) ? wall.c.slice(0, 4)
                    .map(n => Number(n)) : wall.c,
                door: toSafeNumber(Number(wall.door), 0),
                ds: toSafeNumber(Number(wall.ds), 0),
                dir: toSafeNumber(Number(wall.dir), 0),
                move: toRestrictionValue(wall.move, restrictionTypes.NONE),
                sound: toRestrictionValue(wall.sound, restrictionTypes.NONE),
                sight: toRestrictionValue(wall.sense ?? wall.sight, restrictionTypes.NONE),
                light: toRestrictionValue(wall.light, restrictionTypes.NONE),
                flags: wall.flags ?? {}
            }));

        result.lights = (source.lights ?? [])
            .map(light => ({
                x: Number(light.x),
                y: Number(light.y),
                rotation: 0,
                hidden: false,
                walls: true,
                vision: false,
                config: {
                    alpha: Number(light.tintAlpha ?? 0),
                    color: light.tintColor ?? null,
                    bright: Number(light.bright ?? 0),
                    dim: Number(light.dim ?? 0),
                    angle: 360
                }
            }));

        result.tokens = source.tokens ?? [];
        result.notes = source.notes ?? [];
        result.drawings = source.drawings ?? [];

        return result;
    }
}
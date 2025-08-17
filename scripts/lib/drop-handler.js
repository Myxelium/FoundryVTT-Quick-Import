import {
    QuickBattlemapPanelView
} from './panel-view.js';
import {
    QuickBattlemapImportNormalizer
} from './import-normalizer.js';
import {
    QuickBattlemapStorageService
} from './storage-service.js';

export class QuickBattlemapDropHandler {
    constructor() {
        this.backgroundMedia = null;
        this.importedStructure = null;
        this.enableDebugLogging = true;
        this.busyOperationCount = 0;
        this.noGridSelected = false;

        this.panelView = new QuickBattlemapPanelView();
        this.normalizer = new QuickBattlemapImportNormalizer();
        this.storage = new QuickBattlemapStorageService();
    }

    registerDropHandler() {
        this.registerCanvasDropHandler();
        this.wirePanelCallbacks();
    }

    showPanel() {
        if (!game.user?.isGM) return ui.notifications?.warn?.(game.i18n.localize('QUICKBATTLEMAP.GMOnly') ?? 'GM only');
        this.panelView.ensure();
        this.panelView.show();
    }

    hidePanel() {
        this.panelView.hide();
    }

    togglePanel() {
        if (this.panelView.isVisible) this.hidePanel();
        else this.showPanel();
    }

    registerCanvasDropHandler() {
        canvas.stage?.on?.('drop', event => {
            this.handleDropEvent(event.data.originalEvent);
        });
    }

    wirePanelCallbacks() {
        const saved = (() => {
            try {
                return localStorage.getItem('quick-battlemap:no-grid');
            } catch (_) {
                return null;
            }
        })();

        this.noGridSelected = saved === 'true';

        this.panelView.setNoGridChosen(this.noGridSelected);
        this.panelView.onCreateScene = () => this.createScene();
        this.panelView.onReset = () => this.resetUserInterface();
        this.panelView.onClose = () => this.hidePanel();
        this.panelView.onDrop = event => this.handleDropEvent(event);
        this.panelView.onNoGridChange = value => {
            this.noGridSelected = !!value;

            try {
                localStorage.setItem('quick-battlemap:no-grid', String(this.noGridSelected));
            } 
            catch (_) {}
            
            const statusElement = document.querySelector('.wall-data-status .status-value');

            if (statusElement && this.noGridSelected && statusElement.title === 'Auto-detected grid') {
                statusElement.textContent = '❌';
                statusElement.title = '';
            }
        };
    }

    handleDropEvent(event) {
        const files = event.dataTransfer?.files;
        
        if (!files) 
          return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lower = file.name.toLowerCase();
            if (file.type.match('image.*')) 
              this.processImageFile(file);

            else if (file.type.match('video.*') || lower.endsWith('.webm') || lower.endsWith('.mp4')) 
              this.processVideoFile(file);

            else if (lower.endsWith('.json')) 
              this.processJsonFile(file);
        }
    }

    processImageFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            this.backgroundMedia = {
                data: event.target.result,
                filename: file.name,
                file,
                isVideo: false
            };
            
            this.panelView.updateBackgroundStatus(true, file.name);
            this.checkReadyToCreate();

            if (!this.noGridSelected) {
                this.startBusy(game.i18n.localize('QUICKBATTLEMAP.ProgressAnalyzing'));
                this.autoDetectGridIfNeeded(file)
                    .catch(error => {
                        if (this.enableDebugLogging) 
                          console.warn('Quick Battlemap Importer | Auto grid detection failed:', error);
                    })
                    .finally(() => this.endBusy());
            }
        };

        reader.readAsDataURL(file);
    }

    processVideoFile(file) {
        const objectURL = URL.createObjectURL(file);
        
        this.backgroundMedia = {
            data: objectURL,
            filename: file.name,
            file,
            isVideo: true
        };

        this.panelView.updateBackgroundStatus(true, file.name);
        this.checkReadyToCreate();
    }

    processJsonFile(file) {
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                this.importedStructure = JSON.parse(event.target.result);
                this.panelView.updateWallDataStatus(true, file.name);
                this.checkReadyToCreate();
            } catch (err) {
                console.error(err);
                ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.InvalidJSON"));
            }
        };
        reader.readAsText(file);
    }

    checkReadyToCreate() {
        const button = document.querySelector('.create-scene-button');
        if (button) button.disabled = !this.backgroundMedia;
    }

    async createScene() {
        if (!this.backgroundMedia) {
            ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.MissingFiles"));
            return;
        }

        if (!this.noGridSelected && !this.importedStructure && this.backgroundMedia?.file && !this.backgroundMedia?.isVideo) {
            try {
                this.startBusy(game.i18n.localize('QUICKBATTLEMAP.ProgressAnalyzing'));
                await this.autoDetectGridIfNeeded(this.backgroundMedia.file);
            } 
            catch (_) {} 
            finally {
                this.endBusy();
            }
        }

        if (!this.noGridSelected && !this.importedStructure) {
            const msg = this.backgroundMedia?.isVideo ?
                "No grid data provided for video. Drop a JSON export or enable the No Grid option." :
                "Grid data missing and auto-detection failed. Drop a JSON export or set grid manually.";
            ui.notifications.error(msg);
        }

        try {
            ui.notifications.info(game.i18n.localize("QUICKBATTLEMAP.CreatingScene"));

            this.startBusy(game.i18n.localize('QUICKBATTLEMAP.ProgressUploading'));
            const upload = await this.storage.uploadBackgroundMedia(this.backgroundMedia, game.world.id);
            this.endBusy();
            if (!upload?.path) {
                ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.UploadFailed"));
                return;
            }

            const {
                width: mediaWidth,
                height: mediaHeight
            } = await this.getMediaDimensions(this.backgroundMedia);

            const normalized = this.normalizeImportedData(this.importedStructure);

            if (this.enableDebugLogging) {
                console.log("Quick Battlemap Importer | Normalized grid:", normalized.grid);
                console.log("Quick Battlemap Importer | Normalized first wall:", normalized.walls?.[0]);
                console.log("Quick Battlemap Importer | Normalized first light:", normalized.lights?.[0]);
            }

            const sceneName =
                normalized.name ||
                this.backgroundMedia.filename.split('.')
                .slice(0, -1)
                .join('.') ||
                game.i18n.localize("QUICKBATTLEMAP.DefaultSceneName");

            const finalWidth = normalized.width || mediaWidth || 1920;
            const finalHeight = normalized.height || mediaHeight || 1080;

            const sceneData = {
                name: sceneName,
                img: upload.path,
                background: {
                    src: upload.path
                },
                width: finalWidth,
                height: finalHeight,
                padding: normalized.padding ?? 0,
                backgroundColor: normalized.backgroundColor ?? "#000000",
                globalLight: normalized.globalLight ?? false,
                darkness: normalized.darkness ?? 0
            };

            const scene = await Scene.create(sceneData);

            await scene.activate();
            await this.waitForCanvasReady(scene);
            await this.applyGridSettings(scene, normalized);

            const walls = (normalized.walls ?? [])
                .filter(wall => {
                    if (!Array.isArray(wall.c) || wall.c.length < 4) return false;
                    const [x1, y1, x2, y2] = wall.c;
                    const nums = [x1, y1, x2, y2].map(n => Number(n));
                    if (nums.some(n => !Number.isFinite(n))) return false;
                    if (nums[0] === nums[2] && nums[1] === nums[3]) return false;
                    return true;
                });

            if (walls.length) {
                const beforeCount = scene.walls?.size ?? 0;
                try {
                    await scene.createEmbeddedDocuments("Wall", walls);
                } catch (e) {
                    console.warn("Quick Battlemap Importer | Wall creation raised an error, retrying once...", e);
                    await this.waitForCanvasReady(scene);
                    await new Promise(r => setTimeout(r, 200));
                    try {
                        await scene.createEmbeddedDocuments("Wall", walls);
                    } catch (e2) {
                        const afterCount = scene.walls?.size ?? 0;
                        if (afterCount > beforeCount) {
                            console.warn("Quick Battlemap Importer | Walls appear created despite an error. Suppressing warning.");
                        } else {
                            console.error("Quick Battlemap Importer | Failed to create walls. First few:", walls.slice(0, 5));
                            console.error(e2);
                            ui.notifications.warn("Some walls could not be created. See console.");
                        }
                    }
                }
            }

            const lights = normalized.lights ?? [];

            if (lights.length) {
                try {
                    await scene.createEmbeddedDocuments("AmbientLight", lights);
                } catch (e) {
                    console.error("Quick Battlemap Importer | Failed to create lights. First few:", lights.slice(0, 5));
                    console.error(e);
                    ui.notifications.warn("Some lights could not be created. See console.");
                }
            }

            try {
                if (this.backgroundMedia?.isVideo && this.backgroundMedia?.data?.startsWith?.('blob:')) {
                    URL.revokeObjectURL(this.backgroundMedia.data);
                }
            } 
            catch (_) {}

            this.backgroundMedia = null;
            this.importedStructure = null;

            const createButton = document.querySelector('.create-scene-button');

            this.panelView.updateBackgroundStatus(false, '');
            this.panelView.updateWallDataStatus(false, '');

            if (createButton) 
              createButton.disabled = true;

            ui.notifications.info(`${game.i18n.localize("QUICKBATTLEMAP.SceneCreated")}: ${sceneName}`);
        } catch (error) {
            console.error(error);
            ui.notifications.error(game.i18n.localize("QUICKBATTLEMAP.SceneCreationFailed"));
        }
    }

    async waitForCanvasReady(targetScene) {
        const deadline = Date.now() + 8000;

        while (Date.now() < deadline) {
            const good =
                canvas?.ready &&
                canvas?.scene?.id === targetScene.id &&
                canvas?.walls && canvas?.walls?.initialized !== false &&
                canvas?.lighting && canvas?.lighting?.initialized !== false;

            if (good) 
              return;

            await new Promise(r => setTimeout(r, 100));
        }
    }

    async applyGridSettings(scene, normalized) {
        if (this.noGridSelected) {
            normalized.grid.type = 0;
        }

        const snapshot = duplicate(scene.toObject());
        const isObjectGrid = snapshot && typeof snapshot.grid === "object";

        if (this.enableDebugLogging) {
            console.log("Quick Battlemap Importer | Scene grid snapshot:", snapshot.grid);
        }

        if (isObjectGrid) {
            const newGrid = {
                ...(snapshot.grid || {}),
                size: normalized.grid.size,
                type: normalized.grid.type,
                distance: normalized.grid.distance,
                units: normalized.grid.units,
                color: normalized.grid.color,
                alpha: normalized.grid.alpha,
                offset: {
                    x: normalized.grid.offset?.x ?? 0,
                    y: normalized.grid.offset?.y ?? 0
                }
            };

            try {
                await scene.update({
                    grid: newGrid
                });
            } catch (e) {
                console.warn("Quick Battlemap Importer | grid object update failed; applying legacy/fallback keys", e);
                await scene.update({
                    grid: normalized.grid.size,
                    gridType: normalized.grid.type,
                    gridDistance: normalized.grid.distance,
                    gridUnits: normalized.grid.units,
                    gridColor: normalized.grid.color,
                    gridAlpha: normalized.grid.alpha,
                    shiftX: normalized.grid.offset?.x ?? 0,
                    shiftY: normalized.grid.offset?.y ?? 0
                });
            }
        } else {
            await scene.update({
                grid: normalized.grid.size,
                gridType: normalized.grid.type,
                gridDistance: normalized.grid.distance,
                gridUnits: normalized.grid.units,
                gridColor: normalized.grid.color,
                gridAlpha: normalized.grid.alpha,
                shiftX: normalized.grid.offset?.x ?? 0,
                shiftY: normalized.grid.offset?.y ?? 0
            });
        }

        if (this.enableDebugLogging) {
            const after = duplicate(scene.toObject());
            console.log("Quick Battlemap Importer | Grid after update:", after.grid, after.shiftX, after.shiftY);
        }
    }

    normalizeImportedData(src) {
        return this.normalizer.convertImportedDataToInternalShape(src);
    }

    async autoDetectGridIfNeeded(file) {
        try {
            if (this.importedStructure) 
              return;

            if (!file) 
              return;

            const name = (file.name || '')
                .toLowerCase();

            const type = file.type || '';
            const isVideo = type.startsWith('video/') || /\.(webm|mp4|mov|m4v|avi|mkv|ogv|ogg)$/i.test(name);

            if (isVideo) 
              return;

            if (!type.startsWith('image/')) 
              return;

            const result = await this.detectGridFromImage(file);

            if (!result || !Number.isFinite(result.gridSize) || result.gridSize <= 0) 
              return;

            this.importedStructure = {
                grid: {
                    size: Math.round(result.gridSize),
                    type: 1,
                    distance: 5,
                    units: 'ft',
                    alpha: 0.2,
                    color: '#000000'
                },
                shiftX: Math.round(result.xOffset || 0),
                shiftY: Math.round(result.yOffset || 0),
                walls: [],
                lights: []
            };

            this.panelView.updateWallDataStatus(true, 'Auto-detected grid');
            this.checkReadyToCreate();
            
            if (this.enableDebugLogging) 
              console.log('Quick Battlemap Importer | Auto grid detection success:', this.importedStructure);

        } catch (e) {
            if (this.enableDebugLogging) 
              console.warn('Quick Battlemap Importer | Auto grid detection error:', e);
        }
    }

    async detectGridFromImage(file, manualPoints = null) {
        const image = await this.loadImageFromFile(file);

        const maximumDimension = 1600;
        const scale = Math.min(1, maximumDimension / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const workCanvas = document.createElement('canvas');
        
        workCanvas.width = width;
        workCanvas.height = height;
        
        const renderingContext = workCanvas.getContext('2d', {
            willReadFrequently: true
        });
        
        renderingContext.drawImage(image, 0, 0, width, height);

        const pixelData = renderingContext
            .getImageData(0, 0, width, height)
            .data;

        const grayscale = new Float32Array(width * height);
        for (let index = 0, pixelIndex = 0; index < pixelData.length; index += 4, pixelIndex++) {
            const red = pixelData[index],
                green = pixelData[index + 1],
                blue = pixelData[index + 2];
            grayscale[pixelIndex] = 0.299 * red + 0.587 * green + 0.114 * blue;
        }

        const magnitude = this.sobelMagnitude(grayscale, width, height);

        const projectionX = new Float32Array(width);
        const projectionY = new Float32Array(height);

        for (let y = 0; y < height; y++) {
            let rowSum = 0;
            for (let x = 0; x < width; x++) {
                const value = magnitude[y * width + x];
                projectionX[x] += value;
                rowSum += value;
            }
            projectionY[y] = rowSum;
        }

        const highPassX = this.highPass1D(projectionX, Math.max(5, Math.floor(width / 50)));
        const highPassY = this.highPass1D(projectionY, Math.max(5, Math.floor(height / 50)));

        const normalize = (signal) => {
            let maxValue = -Infinity,
                minValue = Infinity;
            for (let i = 0; i < signal.length; i++) {
                const v = signal[i];
                if (v > maxValue) maxValue = v;
                if (v < minValue) minValue = v;
            }
            const range = (maxValue - minValue) || 1;
            const output = new Float32Array(signal.length);
            for (let i = 0; i < signal.length; i++) output[i] = (signal[i] - minValue) / range;
            return output;
        };

        const normalizedX = normalize(highPassX);
        const normalizedY = normalize(highPassY);

        const minimumLagX = Math.max(8, Math.floor(width / 200));
        const minimumLagY = Math.max(8, Math.floor(height / 200));
        const maximumLagX = Math.min(Math.floor(width / 2), 1024);
        const maximumLagY = Math.min(Math.floor(height / 2), 1024);

        const autocorrelationX = this.autocorr1D(normalizedX, minimumLagX, maximumLagX);
        const autocorrelationY = this.autocorr1D(normalizedY, minimumLagY, maximumLagY);
        const periodCandidateX = this.pickPeriodFromAutocorr(autocorrelationX);
        const periodCandidateY = this.pickPeriodFromAutocorr(autocorrelationY);

        let period = null;
        if (periodCandidateX && periodCandidateY) {
            if (Math.abs(periodCandidateX.value - periodCandidateY.value) <= 2) period = (periodCandidateX.value + periodCandidateY.value) / 2;
            else period = (periodCandidateX.score >= periodCandidateY.score) ? periodCandidateX.value : periodCandidateY.value;
        } 
        else if (periodCandidateX) 
          period = periodCandidateX.value;

        else if (periodCandidateY) 
          period = periodCandidateY.value;

        if (period && Number.isFinite(period) && period >= 6) {
            const offsetX = this.estimateOffsetFromProjection(normalizedX, Math.round(period));
            const offsetY = this.estimateOffsetFromProjection(normalizedY, Math.round(period));
            const inverseScale = 1 / scale;

            return {
                gridSize: period * inverseScale,
                xOffset: offsetX * inverseScale,
                yOffset: offsetY * inverseScale
            };
        }

        if (manualPoints && manualPoints.length >= 2) {
            const xCoordinates = manualPoints.map(p => p.x);
            const yCoordinates = manualPoints.map(p => p.y);
            
            const minX = Math.min(...xCoordinates), maxX = Math.max(...xCoordinates);
            const minY = Math.min(...yCoordinates), maxY = Math.max(...yCoordinates);

            const widthSpan = maxX - minX, heightSpan = maxY - minY;

            const averageSpacingX = widthSpan / (manualPoints.length - 1);
            const averageSpacingY = heightSpan / (manualPoints.length - 1);
            
            const tileSize = Math.round((averageSpacingX + averageSpacingY) / 2);

            return {
                gridSize: tileSize,
                xOffset: minX % tileSize,
                yOffset: minY % tileSize
            };
        }

        throw new Error('Grid detection failed; insufficient periodic signal.');
    }

    sobelMagnitude(grayscale, width, height) {
        const output = new Float32Array(width * height);

        const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

        const clamp = (value, minimum, maximum) => (value < minimum ? minimum : value > maximum ? maximum : value);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let gradientX = 0,
                    gradientY = 0;
                let kernelIndex = 0;

                for (let j = -1; j <= 1; j++) {
                    const sampleY = clamp(y + j, 0, height - 1);
                    
                    for (let i = -1; i <= 1; i++) {
                        const sampleX = clamp(x + i, 0, width - 1);
                        const value = grayscale[sampleY * width + sampleX];
                        gradientX += value * kernelX[kernelIndex];
                        gradientY += value * kernelY[kernelIndex];
                        kernelIndex++;
                    }
                }
                output[y * width + x] = Math.hypot(gradientX, gradientY);
            }
        }

        return output;
    }

    highPass1D(signal, windowSize) {
        const length = signal.length;
        const window = Math.max(3, windowSize | 0);
        const halfWindow = (window / 2) | 0;
        const output = new Float32Array(length);
        let accumulator = 0;

        for (let i = 0; i < Math.min(length, window); i++) 
          accumulator += signal[i];

        for (let i = 0; i < length; i++) {
            const leftIndex = i - halfWindow - 1;
            const rightIndex = i + halfWindow;
            if (rightIndex < length && i + halfWindow < length) accumulator += signal[rightIndex];
            if (leftIndex >= 0) accumulator -= signal[leftIndex];
            const spanLeft = Math.max(0, i - halfWindow);
            const spanRight = Math.min(length - 1, i + halfWindow);
            const span = (spanRight - spanLeft + 1) || 1;
            const average = accumulator / span;
            output[i] = signal[i] - average;
        }

        for (let i = 0; i < length; i++)
            if (output[i] < 0) output[i] *= 0.2;

        return output;
    }

    autocorr1D(signal, minimumLag, maximumLag) {
        const length = signal.length;
        const mean = signal.reduce((a, b) => a + b, 0) / length;

        let denominator = 0;

        for (let i = 0; i < length; i++) {
            const deviation = signal[i] - mean;
            denominator += deviation * deviation;
        }

        denominator = denominator || 1;
        const output = [];

        for (let lag = minimumLag; lag <= maximumLag; lag++) {
            let numerator = 0;

            for (let i = 0; i + lag < length; i++) {
                numerator += (signal[i] - mean) * (signal[i + lag] - mean);
            }

            output.push({
                lag,
                val: numerator / denominator
            });
        }

        return output;
    }

    pickPeriodFromAutocorr(autocorrelation) {
        if (!autocorrelation || !autocorrelation.length) 
          return null;
        
        const peaks = [];
        
        for (let i = 1; i < autocorrelation.length - 1; i++) {
            if (autocorrelation[i].val > autocorrelation[i - 1].val && autocorrelation[i].val >= autocorrelation[i + 1].val) {
                peaks.push(autocorrelation[i]);
            }
        }

        peaks.sort((a, b) => b.val - a.val);
        
        if (!peaks.length) 
          return null;

        const topPeaks = peaks
            .slice(0, 5)
            .sort((a, b) => a.lag - b.lag);

        const best = topPeaks[0];

        return {
            value: best.lag,
            score: best.val
        };
    }

    estimateOffsetFromProjection(signal, period) {
        if (!period || period < 2) 
          return 0;

        const length = signal.length;

        let bestShift = 0, bestScore = -Infinity;

        const normalize = (array) => {
            let max = -Infinity;
            for (let v of array)
                if (v > max) max = v;
            const inv = max ? 1 / max : 1;
            return array.map(v => v * inv);
        };

        const normalized = normalize(signal);

        for (let shift = 0; shift < period; shift++) {
            let sum = 0, count = 0;

            for (let i = shift; i < length; i += period) {
                sum += normalized[i];
                count++;
            }

            const score = count ? sum / count : -Infinity;

            if (score > bestScore) {
                bestScore = score;
                bestShift = shift;
            }
        }

        return bestShift;
    }

    loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const url = URL.createObjectURL(file);

            image.onload = () => {
                URL.revokeObjectURL(url);
                resolve(image);
            };

            image.onerror = (error) => {
                URL.revokeObjectURL(url);
                reject(error);
            };

            image.src = url;
        });
    }

    async getMediaDimensions(background) {
        try {
            if (background?.isVideo) {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.src = background.data;

                await new Promise((resolve) => {
                    const cleanup = () => {
                        video.onloadedmetadata = null;
                        video.onerror = null;
                    };
                    video.onloadedmetadata = () => {
                        cleanup();
                        resolve();
                    };
                    video.onerror = () => {
                        cleanup();
                        resolve();
                    };
                });

                return {
                    width: video.videoWidth || undefined,
                    height: video.videoHeight || undefined
                };
            }

            const image = new Image();
            image.src = background?.data;

            await new Promise(resolve => (image.onload = resolve));

            return { width: image.width, height: image.height };
        } catch (error) {
            console.warn('Quick Battlemap Importer | Could not read media size.', error);
            return { width: undefined, height: undefined };
        }
    }

    startBusy(message) {
        this.busyOperationCount = Math.max(0, (this.busyOperationCount || 0)) + 1;
        this.panelView.setBusy(message);
    }

    endBusy() {
        this.busyOperationCount = Math.max(0, (this.busyOperationCount || 1) - 1);

        if (this.busyOperationCount === 0) 
          this.panelView.clearBusy();
    }

    resetUserInterface() {
        try {
            if (this.backgroundMedia?.isVideo && this.backgroundMedia?.data?.startsWith?.('blob:'))
              URL.revokeObjectURL(this.backgroundMedia.data);
        } 
        catch (_) {}

        this.backgroundMedia = null;
        this.importedStructure = null;
        this.busyOperationCount = 0;

        try {
            const saved = localStorage.getItem('quick-battlemap:no-grid');
            this.noGridSelected = saved === 'true';
        } catch (_) {
            this.noGridSelected = false;
        }

        this.panelView.resetStatuses(this.noGridSelected);
    }
}
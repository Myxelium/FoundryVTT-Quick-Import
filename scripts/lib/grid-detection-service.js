/**
 * Grid Detection Service
 * 
 * Provides automatic grid detection for battlemap images using signal processing.
 * Analyzes edge patterns in images to detect periodic grid lines and calculate
 * grid size and offset values.
 * 
 * The algorithm works by:
 * 1. Scaling the image for processing efficiency
 * 2. Converting to grayscale and detecting edges using Sobel operators
 * 3. Projecting edges onto X and Y axes
 * 4. Applying high-pass filter to emphasize periodic patterns
 * 5. Using autocorrelation to find the dominant period (grid size)
 * 6. Estimating offset to align grid with detected lines
 * 
 * @module GridDetectionService
 */

import {
    computeAutocorrelation,
    applyHighPassFilter,
    normalizeSignal,
    findBestPeriodFromAutocorrelation,
    combinePeriodCandidates,
    estimateGridOffset,
    clampValue
} from './signal-processing-utils.js';

/** Maximum dimension for image processing (larger images are scaled down) */
const MAX_PROCESSING_DIMENSION = 1600;

/** Minimum valid grid period to filter out noise */
const MIN_VALID_PERIOD = 6;

/**
 * @typedef {Object} GridDetectionResult
 * @property {number} gridSize - Detected grid cell size in pixels (in original image coordinates)
 * @property {number} xOffset - Horizontal offset for grid alignment
 * @property {number} yOffset - Vertical offset for grid alignment
 */

/**
 * Service class for detecting grid patterns in battlemap images.
 * Uses signal processing techniques to find periodic grid lines.
 */
export class GridDetectionService {

    /**
     * Detect grid settings from an image file.
     * Analyzes the image for periodic patterns that indicate grid lines.
     * 
     * @param {File} imageFile - The image file to analyze
     * @param {Array<{x: number, y: number}>} [manualPoints] - Optional manual grid points for fallback
     * @returns {Promise<GridDetectionResult>} Detected grid settings
     * @throws {Error} If grid detection fails
     * 
     * @example
     * const detector = new GridDetectionService();
     * try {
     *   const result = await detector.detectGridFromImage(imageFile);
     *   console.log(`Grid size: ${result.gridSize}px`);
     * } catch (error) {
     *   console.log('Could not detect grid automatically');
     * }
     */
    async detectGridFromImage(imageFile, manualPoints = null) {
        const imageElement = await this.loadImageFromFile(imageFile);
        const { scaledCanvas, scaleFactor } = this.createScaledCanvas(imageElement);
        
        const grayscaleData = this.extractGrayscaleData(scaledCanvas);
        const edgeMagnitude = this.computeSobelMagnitude(grayscaleData, scaledCanvas.width, scaledCanvas.height);
        const { projectionX, projectionY } = this.computeEdgeProjections(edgeMagnitude, scaledCanvas.width, scaledCanvas.height);

        const filteredX = this.processProjection(projectionX, scaledCanvas.width);
        const filteredY = this.processProjection(projectionY, scaledCanvas.height);

        const detectedPeriod = this.detectPeriodFromProjections(filteredX, filteredY, scaledCanvas.width, scaledCanvas.height);

        if (detectedPeriod && Number.isFinite(detectedPeriod) && detectedPeriod >= MIN_VALID_PERIOD) {
            return this.buildDetectionResult(detectedPeriod, filteredX, filteredY, scaleFactor);
        }

        if (manualPoints && manualPoints.length >= 2) {
            return this.detectFromManualPoints(manualPoints);
        }

        throw new Error('Grid detection failed; insufficient periodic signal.');
    }

    /**
     * Load an image from a File object into an HTMLImageElement.
     * 
     * @param {File} file - The image file to load
     * @returns {Promise<HTMLImageElement>} The loaded image element
     */
    loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const imageElement = new Image();
            const objectUrl = URL.createObjectURL(file);

            imageElement.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(imageElement);
            };

            imageElement.onerror = (error) => {
                URL.revokeObjectURL(objectUrl);
                reject(error);
            };

            imageElement.src = objectUrl;
        });
    }

    /**
     * Create a scaled canvas for processing. Large images are scaled down for performance.
     * 
     * @param {HTMLImageElement} image - The source image
     * @returns {{scaledCanvas: HTMLCanvasElement, scaleFactor: number}} Canvas and scale info
     */
    createScaledCanvas(image) {
        const scaleFactor = Math.min(1, MAX_PROCESSING_DIMENSION / Math.max(image.width, image.height));
        const scaledWidth = Math.max(1, Math.round(image.width * scaleFactor));
        const scaledHeight = Math.max(1, Math.round(image.height * scaleFactor));

        const canvas = document.createElement('canvas');
        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
        
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, scaledWidth, scaledHeight);

        return { scaledCanvas: canvas, scaleFactor };
    }

    /**
     * Extract grayscale pixel data from a canvas using luminance formula.
     * 
     * @param {HTMLCanvasElement} canvas - The source canvas
     * @returns {Float32Array} Grayscale values (0-255)
     */
    extractGrayscaleData(canvas) {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const rgbaPixels = imageData.data;
        const pixelCount = canvas.width * canvas.height;
        const grayscale = new Float32Array(pixelCount);

        for (let pixelIndex = 0, rgbaIndex = 0; pixelIndex < pixelCount; pixelIndex++, rgbaIndex += 4) {
            const red = rgbaPixels[rgbaIndex];
            const green = rgbaPixels[rgbaIndex + 1];
            const blue = rgbaPixels[rgbaIndex + 2];
            grayscale[pixelIndex] = 0.299 * red + 0.587 * green + 0.114 * blue;
        }

        return grayscale;
    }

    /**
     * Compute edge magnitude using Sobel operators for gradient detection.
     * 
     * @param {Float32Array} grayscale - Grayscale pixel data
     * @param {number} width - Image width
     * @param {number} height - Image height
     * @returns {Float32Array} Edge magnitude for each pixel
     */
    computeSobelMagnitude(grayscale, width, height) {
        const output = new Float32Array(width * height);
        const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let gradientX = 0, gradientY = 0, kernelIndex = 0;

                for (let kernelY = -1; kernelY <= 1; kernelY++) {
                    const sampleY = clampValue(y + kernelY, 0, height - 1);
                    for (let kernelX = -1; kernelX <= 1; kernelX++) {
                        const sampleX = clampValue(x + kernelX, 0, width - 1);
                        const pixelValue = grayscale[sampleY * width + sampleX];
                        gradientX += pixelValue * sobelX[kernelIndex];
                        gradientY += pixelValue * sobelY[kernelIndex];
                        kernelIndex++;
                    }
                }

                output[y * width + x] = Math.hypot(gradientX, gradientY);
            }
        }

        return output;
    }

    /**
     * Compute edge projections onto X and Y axes by accumulating edge intensity.
     * 
     * @param {Float32Array} edgeMagnitude - Edge magnitude data
     * @param {number} width - Image width
     * @param {number} height - Image height
     * @returns {{projectionX: Float32Array, projectionY: Float32Array}} Axis projections
     */
    computeEdgeProjections(edgeMagnitude, width, height) {
        const projectionX = new Float32Array(width);
        const projectionY = new Float32Array(height);

        for (let y = 0; y < height; y++) {
            let rowSum = 0;
            for (let x = 0; x < width; x++) {
                const edgeValue = edgeMagnitude[y * width + x];
                projectionX[x] += edgeValue;
                rowSum += edgeValue;
            }
            projectionY[y] = rowSum;
        }

        return { projectionX, projectionY };
    }

    /**
     * Process a projection signal with high-pass filtering and normalization.
     * 
     * @param {Float32Array} projection - Raw projection data
     * @param {number} dimension - Image dimension (width or height)
     * @returns {Float32Array} Processed and normalized signal
     */
    processProjection(projection, dimension) {
        const windowSize = Math.max(5, Math.floor(dimension / 50));
        const highPassed = applyHighPassFilter(projection, windowSize);
        return normalizeSignal(highPassed);
    }

    /**
     * Detect the dominant period from X and Y projections using autocorrelation.
     * 
     * @param {Float32Array} signalX - Normalized X projection
     * @param {Float32Array} signalY - Normalized Y projection
     * @param {number} width - Image width
     * @param {number} height - Image height
     * @returns {number|null} Detected period or null
     */
    detectPeriodFromProjections(signalX, signalY, width, height) {
        const minLagX = Math.max(8, Math.floor(width / 200));
        const minLagY = Math.max(8, Math.floor(height / 200));
        const maxLagX = Math.min(Math.floor(width / 2), 1024);
        const maxLagY = Math.min(Math.floor(height / 2), 1024);

        const autocorrX = computeAutocorrelation(signalX, minLagX, maxLagX);
        const autocorrY = computeAutocorrelation(signalY, minLagY, maxLagY);

        const periodX = findBestPeriodFromAutocorrelation(autocorrX);
        const periodY = findBestPeriodFromAutocorrelation(autocorrY);

        return combinePeriodCandidates(periodX, periodY);
    }

    /**
     * Build the final detection result, scaling back to original image coordinates.
     * 
     * @param {number} period - Detected period in scaled coordinates
     * @param {Float32Array} signalX - X projection for offset calculation
     * @param {Float32Array} signalY - Y projection for offset calculation
     * @param {number} scaleFactor - Scale factor used during processing
     * @returns {GridDetectionResult} Final grid detection result
     */
    buildDetectionResult(period, signalX, signalY, scaleFactor) {
        const offsetX = estimateGridOffset(signalX, Math.round(period));
        const offsetY = estimateGridOffset(signalY, Math.round(period));
        const inverseScale = 1 / scaleFactor;

        return {
            gridSize: period * inverseScale,
            xOffset: offsetX * inverseScale,
            yOffset: offsetY * inverseScale
        };
    }

    /**
     * Detect grid from manually placed points (fallback when auto-detection fails).
     * 
     * @param {Array<{x: number, y: number}>} points - Array of grid intersection points
     * @returns {GridDetectionResult} Grid detection result
     */
    detectFromManualPoints(points) {
        const xCoords = points.map(p => p.x);
        const yCoords = points.map(p => p.y);
        
        const minX = Math.min(...xCoords), maxX = Math.max(...xCoords);
        const minY = Math.min(...yCoords), maxY = Math.max(...yCoords);

        const avgSpacingX = (maxX - minX) / (points.length - 1);
        const avgSpacingY = (maxY - minY) / (points.length - 1);
        const gridSize = Math.round((avgSpacingX + avgSpacingY) / 2);

        return {
            gridSize: gridSize,
            xOffset: minX % gridSize,
            yOffset: minY % gridSize
        };
    }
}

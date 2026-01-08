/**
 * Signal Processing Utilities
 * 
 * Low-level signal processing functions for grid detection.
 * Provides autocorrelation, filtering, and normalization algorithms
 * used by the GridDetectionService.
 * 
 * @module SignalProcessingUtils
 */

/**
 * @typedef {Object} AutocorrelationEntry
 * @property {number} lag - The lag value (distance between compared samples)
 * @property {number} val - The autocorrelation coefficient at this lag
 */

/**
 * @typedef {Object} PeriodCandidate
 * @property {number} value - The detected period (lag) value
 * @property {number} score - Confidence score for this period
 */

/**
 * Compute normalized autocorrelation of a signal.
 * Autocorrelation measures how similar a signal is to a delayed version of itself.
 * Peaks in autocorrelation indicate periodic patterns.
 * 
 * @param {Float32Array} signal - Input signal
 * @param {number} minLag - Minimum lag to consider (avoids self-correlation peak)
 * @param {number} maxLag - Maximum lag to consider
 * @returns {AutocorrelationEntry[]} Array of autocorrelation values for each lag
 * 
 * @example
 * const signal = new Float32Array([1, 0, 1, 0, 1, 0]); // Periodic signal
 * const autocorr = computeAutocorrelation(signal, 1, 3);
 * // autocorr[1].val would be high (period of 2)
 */
export function computeAutocorrelation(signal, minLag, maxLag) {
    const signalLength = signal.length;
    
    // Calculate mean of signal
    let sum = 0;
    for (let i = 0; i < signalLength; i++) {
        sum += signal[i];
    }
    const mean = sum / signalLength;

    // Calculate denominator (variance-like term for normalization)
    let denominator = 0;
    for (let i = 0; i < signalLength; i++) {
        const deviation = signal[i] - mean;
        denominator += deviation * deviation;
    }
    denominator = denominator || 1; // Prevent division by zero

    // Calculate autocorrelation for each lag value
    const result = [];
    for (let lag = minLag; lag <= maxLag; lag++) {
        let numerator = 0;
        
        for (let i = 0; i + lag < signalLength; i++) {
            numerator += (signal[i] - mean) * (signal[i + lag] - mean);
        }

        result.push({
            lag: lag,
            val: numerator / denominator
        });
    }

    return result;
}

/**
 * Apply a high-pass filter by subtracting a moving average.
 * This removes low-frequency trends and emphasizes periodic patterns (like grid lines).
 * 
 * @param {Float32Array} signal - Input signal
 * @param {number} windowSize - Size of the averaging window
 * @returns {Float32Array} High-pass filtered signal
 * 
 * @example
 * const signal = new Float32Array([10, 11, 10, 11, 10]); // Signal with DC offset
 * const filtered = applyHighPassFilter(signal, 3);
 * // filtered values will oscillate around 0
 */
export function applyHighPassFilter(signal, windowSize) {
    const length = signal.length;
    const effectiveWindow = Math.max(3, windowSize | 0);
    const halfWindow = (effectiveWindow / 2) | 0;
    const output = new Float32Array(length);
    
    let runningSum = 0;

    // Initialize running sum with first window
    const initialWindowSize = Math.min(length, effectiveWindow);
    for (let i = 0; i < initialWindowSize; i++) {
        runningSum += signal[i];
    }

    // Compute high-passed values using sliding window
    for (let i = 0; i < length; i++) {
        const leftBoundary = i - halfWindow - 1;
        const rightBoundary = i + halfWindow;
        
        // Update running sum with sliding window
        if (rightBoundary < length && i + halfWindow < length) {
            runningSum += signal[rightBoundary];
        }
        if (leftBoundary >= 0) {
            runningSum -= signal[leftBoundary];
        }

        // Calculate local average
        const spanStart = Math.max(0, i - halfWindow);
        const spanEnd = Math.min(length - 1, i + halfWindow);
        const spanSize = (spanEnd - spanStart + 1) || 1;
        const localAverage = runningSum / spanSize;
        
        // High-pass = original value minus local average
        output[i] = signal[i] - localAverage;
    }

    // Suppress negative values (edge responses are positive peaks)
    for (let i = 0; i < length; i++) {
        if (output[i] < 0) {
            output[i] *= 0.2;
        }
    }

    return output;
}

/**
 * Normalize a signal to the range [0, 1].
 * 
 * @param {Float32Array} signal - Input signal
 * @returns {Float32Array} Normalized signal with values between 0 and 1
 * 
 * @example
 * const signal = new Float32Array([10, 20, 30]);
 * const normalized = normalizeSignal(signal);
 * // normalized = [0, 0.5, 1]
 */
export function normalizeSignal(signal) {
    let maxValue = -Infinity;
    let minValue = Infinity;

    // Find min and max values
    for (let i = 0; i < signal.length; i++) {
        if (signal[i] > maxValue) maxValue = signal[i];
        if (signal[i] < minValue) minValue = signal[i];
    }

    const range = (maxValue - minValue) || 1; // Prevent division by zero
    const normalized = new Float32Array(signal.length);

    // Apply min-max normalization
    for (let i = 0; i < signal.length; i++) {
        normalized[i] = (signal[i] - minValue) / range;
    }

    return normalized;
}

/**
 * Find the best period from autocorrelation data.
 * Looks for the first significant peak in the autocorrelation.
 * 
 * @param {AutocorrelationEntry[]} autocorrelation - Autocorrelation data
 * @returns {PeriodCandidate|null} Best period candidate or null if none found
 */
export function findBestPeriodFromAutocorrelation(autocorrelation) {
    if (!autocorrelation || !autocorrelation.length) {
        return null;
    }

    // Find all local peaks (values higher than both neighbors)
    const peaks = [];
    for (let i = 1; i < autocorrelation.length - 1; i++) {
        const isPeak = autocorrelation[i].val > autocorrelation[i - 1].val &&
                      autocorrelation[i].val >= autocorrelation[i + 1].val;
        
        if (isPeak) {
            peaks.push(autocorrelation[i]);
        }
    }

    if (!peaks.length) {
        return null;
    }

    // Sort by value (strongest peaks first)
    peaks.sort((a, b) => b.val - a.val);
    
    // Take top peaks and sort by lag (prefer smaller periods = fundamental frequency)
    const topPeaks = peaks.slice(0, 5).sort((a, b) => a.lag - b.lag);
    const bestPeak = topPeaks[0];

    return {
        value: bestPeak.lag,
        score: bestPeak.val
    };
}

/**
 * Combine period candidates from X and Y axis analysis.
 * Uses the more confident estimate, or averages if both agree.
 * 
 * @param {PeriodCandidate|null} periodX - X-axis period candidate
 * @param {PeriodCandidate|null} periodY - Y-axis period candidate
 * @returns {number|null} Combined period estimate or null
 */
export function combinePeriodCandidates(periodX, periodY) {
    if (periodX && periodY) {
        // If both axes agree (within 2 pixels), average them for better accuracy
        if (Math.abs(periodX.value - periodY.value) <= 2) {
            return (periodX.value + periodY.value) / 2;
        }
        // Otherwise, use the one with higher confidence score
        return periodX.score >= periodY.score ? periodX.value : periodY.value;
    }

    // Use whichever axis gave a result
    if (periodX) return periodX.value;
    if (periodY) return periodY.value;
    
    return null;
}

/**
 * Estimate the optimal grid offset from a projection signal.
 * Finds the shift value that best aligns with periodic peaks.
 * 
 * @param {Float32Array} signal - Normalized projection signal
 * @param {number} period - Detected grid period
 * @returns {number} Optimal offset value (0 to period-1)
 */
export function estimateGridOffset(signal, period) {
    if (!period || period < 2) {
        return 0;
    }

    const length = signal.length;
    let bestOffset = 0;
    let bestScore = -Infinity;

    // Normalize signal for fair scoring
    let maxValue = -Infinity;
    for (const value of signal) {
        if (value > maxValue) maxValue = value;
    }
    const normalizer = maxValue ? 1 / maxValue : 1;

    // Try each possible offset and find the one with highest sum at periodic intervals
    for (let offset = 0; offset < period; offset++) {
        let sum = 0;
        let count = 0;

        // Sum signal values at periodic intervals starting from this offset
        for (let i = offset; i < length; i += period) {
            sum += signal[i] * normalizer;
            count++;
        }

        const score = count ? sum / count : -Infinity;

        if (score > bestScore) {
            bestScore = score;
            bestOffset = offset;
        }
    }

    return bestOffset;
}

/**
 * Clamp a numeric value to a specified range.
 * 
 * @param {number} value - The value to clamp
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} The clamped value
 */
export function clampValue(value, min, max) {
    return value < min ? min : value > max ? max : value;
}

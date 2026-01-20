
/**
 * Gaze Data Management
 * Stores and processes raw gaze data into structured format with Gaussian smoothing and velocity calculation.
 */
export class GazeDataManager {
    constructor() {
        this.data = []; // { t, x, y, gx, gy, vx, vy, gvx, gvy, type ... }
        this.buffer = []; // for smoothing window
        // 5-tap kernel approx for Gaussian
        this.KERNEL = [0.05, 0.25, 0.4, 0.25, 0.05];
        this.firstTimestamp = null;
        this.context = {}; // Initialize context
    }

    /**
     * Process a single gaze frame from SeeSo SDK
     * @param {Object} gazeInfo - GazeInfo object from SeeSo SDK
     */
    processGaze(gazeInfo) {
        if (!gazeInfo) return;

        // Initialize start time
        if (this.firstTimestamp === null) {
            this.firstTimestamp = gazeInfo.timestamp;
        }

        // Relative timestamp in ms (integer)
        const t = Math.floor(gazeInfo.timestamp - this.firstTimestamp);
        const x = gazeInfo.x;
        const y = gazeInfo.y;

        // Ensure valid numbers
        if (typeof x !== 'number' || typeof y !== 'number') return;

        // 1. Gaussian Smoothing (x, y -> gx, gy)
        this.buffer.push({ x, y });
        if (this.buffer.length > 5) this.buffer.shift();

        let gx = x, gy = y;
        if (this.buffer.length === 5) {
            let sumX = 0, sumY = 0, sumK = 0;
            for (let i = 0; i < 5; i++) {
                sumX += this.buffer[i].x * this.KERNEL[i];
                sumY += this.buffer[i].y * this.KERNEL[i];
                sumK += this.KERNEL[i];
            }
            gx = sumX / sumK;
            gy = sumY / sumK;
        }

        // 2. Velocity Calculation (vx, vy & gvx, gvy)
        let vx = 0, vy = 0, gvx = 0, gvy = 0;
        const last = this.data[this.data.length - 1];
        if (last) {
            const dt = t - last.t;
            if (dt > 0) {
                vx = (x - last.x) / dt;
                vy = (y - last.y) / dt;
                gvx = (gx - last.gx) / dt;
                gvy = (gy - last.gy) / dt;
            }
        }

        // 3. Eye Movement Classification
        // 0: Fixation, 2: Saccade, Others: Unknown
        let type = 'Unknown';
        if (gazeInfo.eyemovementState === 0) type = 'Fixation';
        else if (gazeInfo.eyemovementState === 2) type = 'Saccade';

        // --- Fallback: Velocity-based Identification (IVT) ---
        // If SDK returns Unknown or doesn't support state, use velocity threshold.
        // Threshold: e.g., 0.5 px/ms (approx 30 deg/sec depending on geometry, but pixels are easier here)
        // Adjust threshold as needed.
        if (type === 'Unknown') {
            const v = Math.sqrt(vx * vx + vy * vy);
            // Simple threshold: if velocity is very low, it's a fixation.
            // Note: v is in pixels / ms. 
            // 0.5 px/ms = 500 px/sec. 
            if (v < 0.5) type = 'Fixation';
            else type = 'Saccade';
        }

        // 4. Extremes (Simple placeholder logic)
        // Ideally needs a window to check if current point is peak/valley compared to neighbors
        let isPeakX = false;
        let isValleyX = false;
        if (this.data.length >= 2) {
            const prev = this.data[this.data.length - 1];
            const prev2 = this.data[this.data.length - 2];
            // Simple check: if direction changed? 
            // Or strictly local maxima/minima? 
            // Current point isn't peak until we see the "next" point go down.
            // So we actually detect peaks for the *previous* point here, or delay processing.
            // For now, leaving as placeholder or naive check against immediate history.
        }

        const entry = {
            t,
            x, y,
            gx, gy,
            vx, vy,
            gvx, gvy,
            type,
            isPeakX,
            isValleyX,
            // Original raw fixation from SDK if present
            sdkFixationX: gazeInfo.fixationX,
            sdkFixationY: gazeInfo.fixationY,
            // Context data (LineIndex, CharIndex)
            ...(this.context || {})
        };

        this.data.push(entry);

        // Debug Log (Every ~1 sec aka 60 frames)
        if (this.data.length % 60 === 0) console.log("[GazeData] Count:", this.data.length, "Latest:", entry);
    }

    setContext(ctx) {
        this.context = { ...this.context, ...ctx };
    }

    getFixations() {
        return this.data.filter(d => d.type === 'Fixation');
    }

    getAllData() {
        return this.data;
    }

    reset() {
        this.data = [];
        this.buffer = [];
        this.firstTimestamp = null;
        this.context = {};
    }

    exportCSV() {
        if (!this.data || this.data.length === 0) {
            alert("No gaze data to export.");
            return;
        }

        // CSV Header
        let csv = "RelativeTimestamp_ms,RawX,RawY,SmoothX,SmoothY,VelX,VelY,Type,LineIndex,CharIndex,AlgoLineIndex,Extrema\n";

        // Rows
        this.data.forEach(d => {
            const row = [
                d.t,
                d.x, d.y,
                d.gx !== undefined ? d.gx.toFixed(2) : "",
                d.gy !== undefined ? d.gy.toFixed(2) : "",
                d.vx !== undefined ? d.vx.toFixed(4) : "",
                d.vy !== undefined ? d.vy.toFixed(4) : "",
                d.type,
                (d.lineIndex !== undefined && d.lineIndex !== null) ? d.lineIndex : "",
                (d.charIndex !== undefined && d.charIndex !== null) ? d.charIndex : "",
                (d.detectedLineIndex !== undefined) ? d.detectedLineIndex : "",
                (d.extrema !== undefined) ? d.extrema : ""
            ];
            csv += row.join(",") + "\n";
        });

        // Detect Device Type for Filename
        const ua = navigator.userAgent.toLowerCase();
        let deviceType = "desktop";
        if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
            deviceType = "smartphone";
        } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
            deviceType = "tablet";
        }

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute("download", `${deviceType}_gaze_session_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- Line Detection Algorithm V3 (Interpolation + Velocity Check) ---
    detectLinesMobile() {
        if (this.data.length < 10) return 0;

        // ---------------------------------------------------------
        // Step 1. Data Interpolation (Fill Gaps)
        // ---------------------------------------------------------
        // Linear interpolation for missing/NaN x, y values
        for (let i = 0; i < this.data.length; i++) {
            const curr = this.data[i];
            // Treat 0,0 or NaN as missing. SeeSo SDK might return 0 or NaN.
            const isMissing = isNaN(curr.x) || isNaN(curr.y) || (curr.x === 0 && curr.y === 0);

            if (isMissing) {
                // Find prev valid
                let prevIdx = i - 1;
                while (prevIdx >= 0) {
                    const p = this.data[prevIdx];
                    if (!isNaN(p.x) && !isNaN(p.y) && (p.x !== 0 || p.y !== 0)) break;
                    prevIdx--;
                }

                // Find next valid
                let nextIdx = i + 1;
                while (nextIdx < this.data.length) {
                    const n = this.data[nextIdx];
                    if (!isNaN(n.x) && !isNaN(n.y) && (n.x !== 0 || n.y !== 0)) break;
                    nextIdx++;
                }

                if (prevIdx >= 0 && nextIdx < this.data.length) {
                    const p = this.data[prevIdx];
                    const n = this.data[nextIdx];
                    const ratio = (curr.t - p.t) / (n.t - p.t);
                    curr.x = p.x + (n.x - p.x) * ratio;
                    curr.y = p.y + (n.y - p.y) * ratio;
                } else if (prevIdx >= 0) {
                    curr.x = this.data[prevIdx].x;
                    curr.y = this.data[prevIdx].y;
                } else if (nextIdx < this.data.length) {
                    curr.x = this.data[nextIdx].x;
                    curr.y = this.data[nextIdx].y;
                }
            }
        }

        // ---------------------------------------------------------
        // Step 2. Gaussian Smoothing & Velocity Calculation
        // ---------------------------------------------------------
        const sigma = 3;
        const radius = Math.ceil(3 * sigma);
        const kernelSize = 2 * radius + 1;
        const kernel = new Float32Array(kernelSize);
        let sumK = 0;
        for (let i = 0; i < kernelSize; i++) {
            const x = i - radius;
            const val = Math.exp(-(x * x) / (2 * sigma * sigma));
            kernel[i] = val;
            sumK += val;
        }
        for (let i = 0; i < kernelSize; i++) kernel[i] /= sumK;

        const x1 = new Float32Array(this.data.length);
        const vx = new Float32Array(this.data.length);

        // Apply Smoothing to X
        for (let i = 0; i < this.data.length; i++) {
            let sumX = 0, wSum = 0;
            for (let k = 0; k < kernelSize; k++) {
                const idx = i + (k - radius);
                if (idx >= 0 && idx < this.data.length) {
                    sumX += this.data[idx].x * kernel[k];
                    wSum += kernel[k];
                }
            }
            x1[i] = sumX / wSum;

            // Calculate Vx (after smoothing)
            if (i > 0 && (this.data[i].t - this.data[i - 1].t) > 0) {
                // px/ms
                vx[i] = (x1[i] - x1[i - 1]) / (this.data[i].t - this.data[i - 1].t);
            }
        }

        // Time Window Logic (Start Text - End Text + 2s)
        let tStart = -1, tEnd = -1;
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i].lineIndex !== undefined && this.data[i].lineIndex !== null) {
                if (tStart === -1) tStart = this.data[i].t;
                tEnd = this.data[i].t;
            }
        }
        if (tEnd !== -1) tEnd += 2000;

        // ---------------------------------------------------------
        // Step 3. Find Extremes (Wide Window)
        // ---------------------------------------------------------
        const posMaxima = []; // X Maxima (Line End Candidates)
        const velMinima = []; // Vx Minima (Max Left-Speed Candidates)

        // Window expanded x3 -> 30 samples (~500ms at 60hz)
        const winPos = 30;
        const winVel = 5; // Velocity peak is sharp

        for (let i = winPos; i < x1.length - winPos; i++) {
            // Check Time Window
            const t = this.data[i].t;
            if (tStart !== -1 && (t < tStart || t > tEnd)) continue;

            // A. Position Maxima
            let isMax = true;
            for (let j = 1; j <= winPos; j++) {
                if (x1[i] <= x1[i - j] || x1[i] <= x1[i + j]) isMax = false;
            }
            if (isMax) posMaxima.push({ index: i, value: x1[i], t: t });
        }

        // B. Velocity Minima (Negative Peak = Fast Left Move)
        for (let i = winVel; i < vx.length - winVel; i++) {
            const t = this.data[i].t;
            if (tStart !== -1 && (t < tStart || t > tEnd)) continue;

            let isVelMin = true;
            for (let j = 1; j <= winVel; j++) {
                if (vx[i] >= vx[i - j] || vx[i] >= vx[i + j]) isVelMin = false;
            }
            // Must be significantly negative (e.g. < -0.1 px/ms)
            // Typical saccade speed > 0.1~0.5 px/ms depending on distance.
            if (isVelMin && vx[i] < -0.1) {
                velMinima.push({ index: i, value: vx[i], t: t });
            }
        }

        // Mark Extrema for Debug/CSV
        for (let i = 0; i < this.data.length; i++) delete this.data[i].extrema;
        posMaxima.forEach(m => this.data[m.index].extrema = "PosMax");
        velMinima.forEach(m => this.data[m.index].extrema = "VelMin");

        // ---------------------------------------------------------
        // Step 4. Validate Lines using Velocity
        // ---------------------------------------------------------
        const validLines = [];
        let lineCounter = 1;

        // Strategy: Maxima -> Look for close Velocity Minima -> Confirm Return Sweep
        for (let i = 0; i < posMaxima.length; i++) {
            const pMax = posMaxima[i];

            // 1. Find nearest Velocity Minima shortly AFTER this Maxima
            // Return sweep usually happens 0~400ms after fixation on line end.
            const searchWindowMs = 400;
            const matchingVel = velMinima.find(v =>
                v.t > pMax.t && v.t < pMax.t + searchWindowMs
            );

            if (matchingVel) {
                // Return Sweep Detected!
                // Start of line: Find local minima preceding this max
                // (Looking backwards from pMax until data goes up or hits previous line limit)
                let prevMinIdx = 0;
                let minVal = 9999;

                // Define lower bound for search
                const lastLineEnd = (validLines.length > 0) ? validLines[validLines.length - 1].endIdx : 0;
                const searchLimit = Math.max(0, pMax.index - 200); // Don't search back too far (e.g. 200 samples ~ 3-6 sec)
                const finalLimit = Math.max(lastLineEnd + 1, searchLimit);

                // Simple Min-Finding (absolute min in the interval [lastLineEnd ... pMax])
                for (let k = pMax.index; k >= finalLimit; k--) {
                    if (x1[k] < minVal) {
                        minVal = x1[k];
                        prevMinIdx = k;
                    }
                }

                if (prevMinIdx > lastLineEnd) {
                    validLines.push({
                        startIdx: prevMinIdx,
                        endIdx: pMax.index,
                        lineNum: lineCounter++
                    });
                }
            }
        }

        // Cap lines
        let maxActualLines = 999;
        if (this.data.length > 0) {
            for (let k = this.data.length - 1; k >= 0; k--) {
                if (this.data[k].lineIndex !== undefined && this.data[k].lineIndex !== null) {
                    maxActualLines = this.data[k].lineIndex + 1;
                    break;
                }
            }
        }
        if (validLines.length > maxActualLines) validLines.length = maxActualLines;

        // Mark Data
        for (let i = 0; i < this.data.length; i++) delete this.data[i].detectedLineIndex;
        validLines.forEach(line => {
            for (let k = line.startIdx; k <= line.endIdx; k++) {
                // Check if text existed
                if (this.data[k].lineIndex !== undefined && this.data[k].lineIndex !== null) {
                    this.data[k].detectedLineIndex = line.lineNum;
                }
            }
        });

        const count = validLines.length;
        console.log(`[GazeDataManager] V3 Line Detection: Found ${count} lines.`, validLines);
        return count;
    }
}

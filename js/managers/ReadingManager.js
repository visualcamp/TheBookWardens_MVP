import { TextRenderer } from '../TextRendererV2.js';

export class ReadingManager {
    constructor(game) {
        this.game = game;
        this.renderer = null;

        // Content
        this.paragraphs = [];
        this.currentParaIndex = 0;

        // Config
        this.wpmParams = { interval: 50 }; // Default, updated by game

        // State
        this.chunkIndex = 0;
        this.isPaused = false;
        this.timer = null;

        // Stats
        this.startTime = null;
        this.wordCount = 0;
        this.lineStats = new Map();

        // Initialize Renderer
        const container = document.getElementById('story-text');
        if (container) {
            this.renderer = new TextRenderer(container);
            console.log("[ReadingManager] TextRenderer Initialized");
        } else {
            console.error("[ReadingManager] Critical: 'story-text' container not found!");
        }
    }

    init(paragraphs) {
        this.paragraphs = paragraphs || [];
        this.reset();
    }

    reset() {
        this.currentParaIndex = 0;
        this.chunkIndex = 0;
        this.lineStats.clear();
        this.wordCount = 0;
        this.startTime = null;
        if (this.renderer) this.renderer.clear();
    }

    // --- Core Logic: Play Paragraph ---

    startParagraph(index) {
        if (!this.paragraphs || index >= this.paragraphs.length) {
            console.log("[ReadingManager] All paragraphs done. Triggering Final Boss.");
            this.game.triggerFinalBossBattle();
            return;
        }

        // [SAFETY] Scroll Reset
        window.scrollTo(0, 0);
        const screenRead = document.getElementById('screen-read');
        if (screenRead) screenRead.scrollTop = 0;

        // [CRITICAL] Reset Pang Triggers
        const gdm = window.gazeDataManager;
        if (gdm && typeof gdm.resetTriggers === 'function') {
            gdm.resetTriggers();
        }

        this.currentParaIndex = index;
        const paraData = this.paragraphs[index];
        console.log(`[ReadingManager] Starting Para ${index}:`, paraData.text.substring(0, 20) + "...");

        // 1. Prepare Content
        const currentWPM = this.game.wpm || 150;

        // Pass wpmParams if available
        if (this.game.wpmParams) this.wpmParams = this.game.wpmParams;

        this.renderer.prepareDynamic({ paragraphs: [paraData] }, currentWPM);

        this.chunkIndex = 0;
        this.lineStats.clear();

        // [FIX] Cursor Reference
        if (this.game.sceneManager && this.renderer.cursor) {
            this.game.sceneManager.setCursorReference(this.renderer.cursor);
        }

        // 2. Lock Layout & Start
        requestAnimationFrame(() => {
            this.renderer.lockLayout();

            // Resume flow
            this.isPaused = false;

            // [CRITICAL] Re-enable Tracking
            if (this.game.state) this.game.state.isTracking = true;
            console.log("[ReadingManager] Tracking Re-enabled.");

            // 3. Start Reading Flow
            if (this.renderer.cursor) this.renderer.cursor.style.opacity = "0";

            setTimeout(() => {
                if (this.renderer) {
                    this.renderer.showPage(0).then(() => {
                        this.renderer.resetToStart();
                        if (this.renderer.cursor) this.renderer.cursor.style.opacity = "1";

                        setTimeout(() => {
                            this.startTime = Date.now();
                            this.tick();
                        }, 1000);
                    });
                }
            }, 600);
        });
    }

    // --- The Heartbeat: Tick ---

    tick() {
        if (this.isPaused) return;

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        // Wait for chunks
        if (!this.renderer || !this.renderer.chunks || this.renderer.chunks.length === 0) {
            // console.warn("[ReadingManager] Chunks not ready...");
            this.timer = setTimeout(() => this.tick(), 500);
            return;
        }

        // Reveal Next Chunk
        if (this.chunkIndex < this.renderer.chunks.length) {

            // Schedule fade out of previous (continuous flow)
            // Note: renderer.scheduleFadeOut logic assumes we manage this.
            // Using logic from game.js
            this.renderer.scheduleFadeOut(this.chunkIndex, 3000);

            const chunkLen = this.renderer.chunks[this.chunkIndex].length;
            const wpm = this.game.wpm || 200;
            const msPerWord = 60000 / wpm;

            // Reveal Animation
            const revealPromise = this.renderer.revealChunk(this.chunkIndex, this.wpmParams.interval || 50);

            // Calculate Duration Buffer
            let buffer = 1.2;
            if (wpm <= 100) buffer = 1.15;
            else if (wpm >= 300) buffer = 1.05;

            const targetDuration = (msPerWord * chunkLen) * buffer;
            const timeoutPromise = new Promise(resolve => setTimeout(resolve, targetDuration + 1000));
            const startTime = Date.now();

            Promise.race([revealPromise, timeoutPromise]).then(() => {
                const elapsed = Date.now() - startTime;
                let remainingWait = Math.max(0, targetDuration - elapsed);

                // Line Break Compensation
                let hadLineBreak = false;
                if (this.renderer && this.renderer.lines) {
                    const currentChunkIndices = this.renderer.chunks[this.chunkIndex];
                    if (currentChunkIndices) {
                        hadLineBreak = currentChunkIndices.some(wordIdx => {
                            return wordIdx > 0 && this.renderer.lines.some(line => line.startIndex === wordIdx);
                        });
                    }
                }

                this.chunkIndex++;

                let finalDelay = remainingWait;
                if (hadLineBreak) {
                    finalDelay = Math.max(0, remainingWait - 450);
                }

                this.timer = setTimeout(() => {
                    this.timer = null;
                    this.tick();
                }, finalDelay);
            });

        } else {
            // End of Paragraph (Chunks done)
            console.log("[ReadingManager] Paragraph Complete.");
            this.onParagraphComplete();
        }
    }

    onParagraphComplete() {
        // Decide what to do next based on Game Logic
        // In game.js, this checked for boss trigger or next paragraph.

        // 1. Check for Mid-Boss (every 3 paragraphs, example logic from game.js)
        /*
           Logic from game.js:
           if ((this.currentParaIndex + 1) % 3 === 0 && this.currentParaIndex < this.paragraphs.length - 1) {
               this.confrontVillain();
           } else {
               // Next Paragraph
               this.currentParaIndex++;
               this.playNextParagraph();
           }
        */

        // We delegate this decision to Game to keep Manager pure?
        // Or implement the protocol here.
        // Let's call back to Game.

        if (typeof this.game.onParagraphFinished === 'function') {
            this.game.onParagraphFinished(this.currentParaIndex);
        } else {
            console.warn("[ReadingManager] game.onParagraphFinished callback missing!");
            // Fallback: Just next paragraph
            this.startParagraph(this.currentParaIndex + 1);
        }
    }

    // --- Core Interaction: Gaze Input (Ported from game.js) ---

    // Called by Game.onGaze -> this.readingManager.onGaze(x, y)
    onGaze(x, y) {
        if (!this.renderer || !this.renderer.isLayoutLocked) return;

        // 1. Hit Test (Visual Feedback)
        const hit = this.renderer.hitTest(x, y);

        // 2. Define Context (Line Index)
        const contentLineIndex = (this.renderer.currentVisibleLineIndex !== undefined)
            ? this.renderer.currentVisibleLineIndex
            : 0;

        let contentTargetY = null;
        if (this.renderer.lines && this.renderer.lines[contentLineIndex]) {
            contentTargetY = this.renderer.lines[contentLineIndex].visualY;
        }

        // 3. Sync to Data Manager
        if (window.gazeDataManager) {
            const ctx = {
                lineIndex: contentLineIndex,
                targetY: contentTargetY,
                paraIndex: this.currentParaIndex,
                wordIndex: null
            };
            window.gazeDataManager.setContext(ctx);
        }

        // 4. Visual Interactions & Stats
        if (hit && hit.type === 'word') {
            const word = hit.word;
            if (word.element && !word.element.classList.contains("read") && word.element.classList.contains("revealed")) {
                word.element.classList.add("read");
                word.element.style.color = "#fff";
                word.element.style.textShadow = "0 0 8px var(--primary-accent)";
            }
            if (hit.line) this.trackLineProgress(hit.line, word.index);
        }
    }

    trackLineProgress(line, wordIndex) {
        const lineId = line.startIndex;
        if (!this.lineStats.has(lineId)) {
            this.lineStats.set(lineId, new Set());
        }

        const hitWords = this.lineStats.get(lineId);
        hitWords.add(wordIndex);

        const totalWordsInLine = line.wordIndices.length;
        const hitCount = hitWords.size;
        const ratio = hitCount / totalWordsInLine;

        if (window.gazeDataManager) {
            window.gazeDataManager.setLineMetadata(line.index, {
                coverage: ratio * 100
            });
        }
    }
}

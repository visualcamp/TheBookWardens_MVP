import { midBossQuizzes } from '../data/QuizData.js';

export class BattleManager {
    constructor(game) {
        this.game = game;
        this.quizzes = midBossQuizzes;
    }

    init() {
        console.log("[BattleManager] Initialized.");
    }

    // --- Pre-Battle: Gaze Replay ---
    triggerGazeReplay() {
        return new Promise((resolve) => {
            console.log("[BattleManager] Preparing Gaze Replay...");
            const rm = this.game.readingManager;

            // 1. Upload Data (Sync)
            if (window.gazeDataManager && this.game.sessionId) {
                window.gazeDataManager.uploadToCloud(this.game.sessionId);
            }

            // 2. Check Dependencies
            if (!window.gazeDataManager || !rm.startTime) {
                console.warn("[BattleManager] No GazeDataManager or StartTime. Skipping Replay.");
                resolve();
                return;
            }

            const gdm = window.gazeDataManager;
            if (!gdm.firstTimestamp) {
                resolve();
                return;
            }

            // 3. Filter Data
            const relativeStartTime = rm.startTime - gdm.firstTimestamp;
            const relativeEndTime = Date.now() - gdm.firstTimestamp;
            const rawData = gdm.data;
            const sessionData = rawData.filter(d => d.t >= relativeStartTime && d.t <= relativeEndTime);

            if (sessionData.length === 0) {
                resolve();
                return;
            }

            // 4. Play Replay via Renderer
            if (rm.renderer && rm.renderer.cursor) {
                rm.renderer.cursor.style.opacity = "0"; // Hide cursor
            }

            if (rm.renderer && typeof rm.renderer.playGazeReplay === 'function') {
                // Reset active state for clean replay
                rm.renderer.words.forEach(w => {
                    if (w.element) w.element.classList.remove('active-rune');
                });

                rm.renderer.playGazeReplay(sessionData, () => {
                    console.log("[BattleManager] Replay Done.");
                    if (rm.renderer.cursor) rm.renderer.cursor.style.opacity = "1";
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    // --- Mid-Boss (Quiz) System ---
    triggerMidBossBattle() {
        const paraIndex = this.game.readingManager.currentParaIndex;
        console.log(`[BattleManager] Triggering Villain for Para ${paraIndex}`);

        // Stop auto-upload if running
        if (this.game.typewriter && this.game.typewriter.uploadMonitor) {
            clearInterval(this.game.typewriter.uploadMonitor);
        }

        this.loadBossQuiz(paraIndex);
        this.game.confrontVillain();
    }

    loadBossQuiz(index) {
        const villainScreen = document.getElementById("screen-boss");
        if (villainScreen) villainScreen.style.pointerEvents = "auto";

        if (!this.quizzes || !this.quizzes[index]) return;

        const quiz = this.quizzes[index];
        const questionEl = document.getElementById("boss-question");
        const optionsEl = document.getElementById("boss-options");

        if (questionEl) questionEl.textContent = `"${quiz.q}"`;
        if (optionsEl) {
            optionsEl.innerHTML = "";
            quiz.o.forEach((optText, i) => {
                const btn = document.createElement("button");
                btn.className = "quiz-btn";
                btn.textContent = optText;
                // Bind click to checkBossAnswer
                btn.onclick = () => this.checkBossAnswer(i);
                optionsEl.appendChild(btn);
            });
        }
    }

    checkBossAnswer(optionIndex) {
        const paraIndex = this.game.readingManager.currentParaIndex;
        const quiz = this.quizzes[paraIndex];

        // 1. Validate Answer
        const isCorrect = (optionIndex === quiz.a);
        const allBtns = document.querySelectorAll("#boss-options button");
        allBtns.forEach(b => b.disabled = true);

        if (isCorrect) {
            // SUCCESS
            const btn = allBtns[optionIndex];
            if (btn && typeof this.game.spawnFlyingResource === 'function') {
                const rect = btn.getBoundingClientRect();
                this.game.spawnFlyingResource(rect.left + rect.width / 2, rect.top + rect.height / 2, 10, 'gem');
            } else {
                this.game.addGems(10);
            }

            // Hide Boss UI after delay
            const villainScreen = document.getElementById("screen-boss");
            if (villainScreen) villainScreen.style.pointerEvents = "none";

            this.handleBattleSuccess(paraIndex);

        } else {
            // FAILURE
            this.game.addGems(-10);

            // Re-enable other buttons so user can try again
            allBtns.forEach((b, idx) => {
                if (idx !== optionIndex) {
                    b.disabled = false;
                }
            });

            const dialogBox = document.querySelector(".boss-dialog-box");
            // Check global Game object for helper function
            if (typeof window.Game !== 'undefined' && typeof window.Game.spawnFloatingText === 'function') {
                window.Game.spawnFloatingText(dialogBox, "-10 Gems", "error");
            } else {
                console.log("Wrong Answer! -10 Gems");
            }

            const btn = allBtns[optionIndex];
            if (btn) {
                btn.style.background = "#c62828";
                btn.innerText += " (Wrong)";
                btn.disabled = true; // Keep the wrong one disabled
            }
        }
    }

    handleBattleSuccess(currentParaIndex) {
        const totalParagraphs = this.game.readingManager.paragraphs.length;

        // Check if this was the Last Paragraph
        if (currentParaIndex >= totalParagraphs - 1) {
            // --- FINAL BOSS SEQUENCE ---
            console.log("[BattleManager] All paragraphs done. Triggering Final Boss...");
            setTimeout(() => {
                // 1. Hide Mid Boss
                const vs = document.getElementById("screen-boss");
                if (vs) {
                    vs.style.display = "none";
                    vs.classList.remove("active");
                    vs.style.pointerEvents = "auto";
                }

                // 2. Trigger Final Boss Screen
                const aliceScreen = document.getElementById("screen-alice-battle");
                if (aliceScreen) {
                    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
                    aliceScreen.classList.add('active');
                    aliceScreen.style.display = "flex";
                }

                // 3. Init Final Battle
                setTimeout(() => {
                    if (window.AliceBattleRef) {
                        const currentStats = {
                            ink: this.game.state.ink,
                            rune: this.game.state.rune,
                            gem: this.game.state.gems
                        };
                        window.AliceBattleRef.init(currentStats);
                    } else {
                        console.error("[BattleManager] AliceBattleRef NOT FOUND!");
                    }
                }, 100);
            }, 1000);

        } else {
            // --- NEXT PARAGRAPH ---
            // Force hide villain modal
            const villainModal = document.getElementById("villain-modal");
            if (villainModal) villainModal.style.display = "none";

            console.log(`[BattleManager] Advancing to Paragraph ${currentParaIndex + 1}...`);

            // 1.5s Delay for transition
            setTimeout(() => {
                this.game.switchScreen("screen-read");

                // Start Next Paragraph
                setTimeout(() => {
                    this.game.readingManager.startParagraph(currentParaIndex + 1);
                }, 500);
            }, 1500);
        }
    }
}

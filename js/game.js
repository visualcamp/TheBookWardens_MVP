import { storyParagraphs } from './data/StoryContent.js?v=FINAL_FIX_NOW';
import { storyChapter1 } from './data/StoryContent_Dynamic.js?v=FINAL_FIX_NOW';
import { vocabList, midBossQuizzes, finalBossQuiz } from './data/QuizData.js?v=FINAL_FIX_NOW';
import { ScoreManager } from './managers/ScoreManager.js?v=FINAL_FIX_NOW';
import { SceneManager } from './managers/SceneManager.js?v=FINAL_FIX_NOW';
import { bus } from './core/EventBus.js?v=FINAL_FIX_NOW';
import { TextRenderer } from './TextRendererV2.js?v=FINAL_FIX_NOW';
import { WardenManager } from './managers/WardenManager.js?v=FINAL_FIX_NOW';
import { IntroManager } from './managers/IntroManager.js?v=FINAL_FIX_NOW';
import { VocabManager } from './managers/VocabManager.js?v=FINAL_FIX_NOW';
import { UIManager } from './core/UIManager.js?v=FINAL_FIX_NOW';
import { GameLogic } from './core/GameLogic.js?v=FINAL_FIX_NOW';
import { DOMManager } from './core/DOMManager.js?v=FINAL_FIX_NOW';
import { ReadingManager } from './managers/ReadingManager.js?v=FINAL_FIX_NOW';
import { BattleManager } from './managers/BattleManager.js?v=FINAL_FIX_NOW';
const Game = {
    // Initialized in init()
    scoreManager: null,
    sceneManager: null,

    state: {
        // Renamed/Removed: gem/ink/rune to ScoreManager
        currentWordIndex: 0,
        vocabIndex: 0, // Track Word Forge progress
        readProgress: 0, // 0..100
        isTracking: false,
        rift: {
            currentWord: null,
            dwellTime: 0,
            requiredDwell: 1000,
            totalRifts: 0,
            fixedRifts: 0
        }
    },

    // Bridge Methods (Proxies to ScoreManager)
    addInk(amount) { if (this.scoreManager) this.scoreManager.addInk(amount); },
    addRunes(amount) { if (this.scoreManager) this.scoreManager.addRunes(amount); },
    addGems(amount) { if (this.scoreManager) this.scoreManager.addGems(amount); },

    updateUI() {
        if (this.scoreManager) this.scoreManager.updateUI();
    },

    // --- Rift Intro Sequence (Delegated to IntroManager) ---

    // Callback from ReadingManager
    onParagraphFinished(index) {
        console.log(`[Game] Paragraph ${index} finished. Triggering Event...`);

        // Trigger Mid-Boss Battle (via BattleManager)
        setTimeout(() => {
            if (this.battleManager) {
                this.battleManager.triggerGazeReplay().then(() => {
                    this.battleManager.triggerMidBossBattle();
                });
            } else {
                // Fallback if BattleManager missing
                console.warn("BattleManager missing. Skipping battle.");
                this.readingManager.startParagraph(index + 1);
            }
        }, 1000);
    },



    init() {
        console.log("Game Init");

        // 1. Core Managers (Must be first)
        this.scoreManager        // Initialize Managers
        this.introManager = new IntroManager(this);
        this.vocabManager = new VocabManager(this);
        // this.sceneManager = new SceneManager(this); // SceneLogic delegated to DOMManager?
        this.scoreManager = new ScoreManager(this);
        this.wardenManager = new WardenManager(this);

        // [REFACTOR] New Reading Manager
        this.readingManager = new ReadingManager(this);

        // [REFACTOR] New Battle Manager
        this.battleManager = new BattleManager(this);
        this.battleManager.init();

        // --- Intro Manager Init ---
        this.introManager.init();

        // --- Load Vocab ---
        this.vocabManager.init(vocabList);

        // --- NEW: Dynamic Paragraphs Loading handled by ReadingManager later ---
        // For now, load default story
        // this.typewriter.paragraphs = storyChapter1.paragraphs; // Old logic

        // Initialize Reading Content
        this.readingManager.init(storyChapter1.paragraphs);

        // --- Score Manager Init ---
        this.scoreManager.init();

        // UI Bindings
        this.bindEvents();
        // 4. Session ID for Firebase
        this.sessionId = Math.random().toString(36).substring(2, 6).toUpperCase();
        console.log("Session ID:", this.sessionId);

        // Display Session ID permanently
        // Display Session ID permanently (REMOVED for Production)
        /*
        const sessionBadge = document.createElement("div");
        sessionBadge.innerText = `ID: ${this.sessionId}`;
        sessionBadge.style.cssText = "position:fixed; bottom:10px; left:10px; background:rgba(0,0,0,0.5); color:lime; padding:5px 10px; font-family:monospace; font-weight:bold; z-index:9999; border:1px solid lime; border-radius:4px; pointer-events:none;";
        document.body.appendChild(sessionBadge);
        */

        // DEBUG: Manual Export Button (Removed per user request)

    },

    bindEvents() {
        // [Intro Events delegated to IntroManager]

        // Debug Keys
        document.addEventListener("keydown", (e) => {
            if (e.key === "`") { // Tilde key for instant debug
                const chk = document.getElementById("chk-debug-mode");
                if (chk) {
                    chk.checked = !chk.checked;
                    // Trigger change event manually
                    chk.dispatchEvent(new Event('change'));
                }
            }
        });

        // [FIX] Splash Screen Logic -> Delegated via JS, not inline HTML
        const splash = document.getElementById('screen-splash');
        if (splash) {
            splash.onclick = () => {
                this.dismissSplash();
            };
        }
    },

    // --- NEW: SDK Loading Feedback (Delegated) ---
    updateSDKProgress(progress, status) {
        // Init state if missing
        if (!this.state.sdkLoading) this.state.sdkLoading = { progress: 0, status: 'Idle', isReady: false };

        this.state.sdkLoading.progress = progress;
        this.state.sdkLoading.status = status;
        this.state.sdkLoading.isReady = (progress >= 100);

        this.uiManager.updateLoadingProgress(progress, status);
    },

    onLoadingComplete() {
        if (this.pendingWPMAction) {
            this.pendingWPMAction();
            this.pendingWPMAction = null;
        }
    },

    showToast(msg, duration = 3000) {
        this.uiManager.showToast(msg, duration);
    },

    onCalibrationFinish() {
        console.log("Calibration done. Entering Reading Rift...");
        setTimeout(() => {
            this.switchScreen("screen-read");

            // Start Reading Session
            if (this.readingManager) {
                // Reset State
                this.state.ink = 0;
                Game.updateUI();

                // Start Paragraph 0
                this.readingManager.startParagraph(0);
            }
        }, 1000);
    },

    // --- Browser Detection Moved to IntroManager ---

    switchScreen(screenId) {
        // [FIX] Ensure clean state transition
        document.querySelectorAll('.screen').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });

        const target = document.getElementById(screenId);
        if (target) {
            target.style.display = 'flex'; // Force flex
            // Use timeout to allow display change to register before adding class (for transitions)
            requestAnimationFrame(() => {
                target.classList.add('active');
            });
        }

        // [FIX] HUD Visibility Control
        const topHud = document.querySelector(".hud-container");
        if (topHud) {
            // Hide HUD on Score and Share screens
            if (screenId === "screen-new-score" || screenId === "screen-home" || screenId === "screen-new-share") {
                topHud.style.opacity = "0";
                topHud.style.pointerEvents = "none";
            } else {
                topHud.style.opacity = "1";
                topHud.style.pointerEvents = "auto";
            }
        }
    },

    updateUI() {
        if (this.scoreManager) {
            this.scoreManager.updateUI();
        }
    },

    // Bridge for WPM updates
    updateWPM(targetWPM) {
        if (this.scoreManager) {
            this.scoreManager.updateWPM(targetWPM);
        }
    },

    // --- 1. Word Forge ---
    // --- 1. Word Forge ---
    // --- 1. Word Forge (Delegated to VocabManager) ---

    loadVocab(index) {
        this.vocabManager.loadVocab(index);
    },

    checkVocab(optionIndex, event) {
        this.vocabManager.checkVocab(optionIndex, event);
    },

    // --- [NEW] Flying Resource Effect (Passage 123 Style) ---
    spawnFlyingResource(startX, startY, amount, type = 'gem') {
        const targetId = type === 'ink' ? 'ink-count' : 'gem-count';
        let targetEl = document.getElementById(targetId);

        // Safety Fallback if HUD element missing
        if (!targetEl) {
            // Create dummy target at top-right
            targetEl = {
                getBoundingClientRect: () => ({ left: window.innerWidth - 60, top: 40, width: 0, height: 0 }),
                parentElement: null
            };
        }

        const targetRect = (targetEl.parentElement || targetEl).getBoundingClientRect();
        const targetX = targetRect.left + targetRect.width / 2;
        const targetY = targetRect.top + targetRect.height / 2;

        // Create Element
        const p = document.createElement('div');
        p.className = 'flying-resource';
        p.innerText = type === 'ink' ? `+${amount}` : `+${amount}`;
        p.style.position = 'fixed';
        p.style.left = startX + 'px';
        p.style.top = startY + 'px';
        p.style.color = type === 'ink' ? '#00ffff' : '#ffd700';
        p.style.fontWeight = 'bold';
        p.style.fontSize = '1.5rem';
        p.style.pointerEvents = 'none';
        p.style.zIndex = '1000001';
        p.style.textShadow = `0 0 10px ${p.style.color}`;
        p.style.transition = 'opacity 0.2s';

        // Icon
        const icon = document.createElement('span');
        icon.innerText = type === 'ink' ? ' ✒️' : ' 💎';
        p.appendChild(icon);

        document.body.appendChild(p);

        // Fail-safe removal (Force remove after 1.2s)
        setTimeout(() => {
            if (p && p.parentNode) p.remove();
        }, 1200);

        // Animation Loop
        let startTime = null;
        const duration = 1000;
        const cpX = startX + (Math.random() * 100 - 50);
        const cpY = Math.min(startY, targetY) - 150;

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = (timestamp - startTime) / duration;

            if (progress < 1) {
                const t = progress;
                const ease = 1 - Math.pow(1 - t, 3);

                const curX = Math.pow(1 - ease, 2) * startX + 2 * (1 - ease) * ease * cpX + Math.pow(ease, 2) * targetX;
                const curY = Math.pow(1 - ease, 2) * startY + 2 * (1 - ease) * ease * cpY + Math.pow(ease, 2) * targetY;

                p.style.left = curX + 'px';
                p.style.top = curY + 'px';
                p.style.opacity = 1 - Math.pow(ease, 4);

                window.requestAnimationFrame(animate);
            } else {
                if (p.parentNode) p.remove();
                if (type === 'gem') Game.addGems(amount);
                if (type === 'ink') Game.addInk(amount);
            }
        };
        window.requestAnimationFrame(animate);
    },

    // --- 1.2 WPM Selection (Delegated) ---
    calculateWPMAttributes(wpm) {
        return this.gameLogic.calculateWPMAttributes(wpm);
    },

    selectWPM(wpm, btnElement) {
        this.gameLogic.selectWPM(wpm, btnElement);
    },

    // --- 1.5 Owl (Delegated) ---
    startOwlScene() {
        this.gameLogic.startOwlScene();
    },

    startReadingFromOwl() {
        this.gameLogic.startReadingFromOwl();
    },

    // --- 2. Reading Rift ---
    // startReadingSession_OLD removed.

    confrontVillain() {
        this.gameLogic.confrontVillain();
    },

    // Called by app.js (SeeSo overlay)
    onGaze(x, y) {
        // Owl Interaction
        if (this.state.isOwlTracker) {
            const pupils = document.querySelectorAll('.pupil');
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            const maxMove = 20;

            let dx = (x - cx) / (window.innerWidth / 2) * maxMove;
            let dy = (y - cy) / (window.innerHeight / 2) * maxMove;
            dx = Math.max(-maxMove, Math.min(maxMove, dx));
            dy = Math.max(-maxMove, Math.min(maxMove, dy));

            pupils.forEach(p => {
                p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            });
            return;
        }

        // Delegate to ReadingManager
        if (this.readingManager) {
            this.readingManager.onGaze(x, y);
        }
    },

    onCalibrationFinish() {
        console.log("Calibration finished. Starting Owl Scene.");
        this.startOwlScene();
    },

    // --- 3. Boss Battle ---
    checkBossAnswer(optionIndex) {
        if (this.typewriter && typeof this.typewriter.checkBossAnswer === 'function') {
            this.typewriter.checkBossAnswer(optionIndex);
        } else {
            console.error("Typewriter checkBossAnswer method not found.");
        }
    },


    // --- 4. Splash Screen Logic (Proxy to IntroManager) ---
    dismissSplash() {
        // 1. Check In-App Browser (Critical for Eye Tracking)
        if (this.introManager && typeof this.introManager.isInAppBrowser === 'function') {
            if (this.introManager.isInAppBrowser()) {
                this.introManager.openSystemBrowser();
                return;
            }
        }

        // 2. Go to Lobby (Home) to initialize SDK properly via user interaction
        this.switchScreen("screen-home");
    },

    // --- NEW: Enriched Game Flow (Debug / Implementation) ---
    // --- NEW: Alice Battlefield Integration ---
    debugFinalVillain() {
        console.log("Starting Alice Battlefield...");

        // Switch to new screen
        this.switchScreen('screen-alice-battle');

        // Initialize if available
        if (this.AliceBattle) {
            this.AliceBattle.init();
        } else if (window.AliceBattleRef) {
            this.AliceBattle = window.AliceBattleRef;
            this.AliceBattle.init();
        } else {
            console.error("AliceBattle module NOT loaded! Check console.");
        }
    },
    goToNewScore(scoreData) {
        console.log("Showing Score Screen with Data:", scoreData);

        // 1. Extract Data (Prioritize passed data, fallback to state)
        const finalInk = (scoreData && scoreData.ink !== undefined) ? scoreData.ink : this.state.ink;
        const finalRune = (scoreData && scoreData.rune !== undefined) ? scoreData.rune : this.state.rune;
        const finalGem = (scoreData && scoreData.gem !== undefined) ? scoreData.gem : this.state.gems;
        let finalWPM = (scoreData && scoreData.wpm !== undefined) ? scoreData.wpm : (this.state.wpmDisplay || 180);

        // Sanity Check for WPM
        if (finalWPM < 50) finalWPM = 150 + Math.floor(Math.random() * 100);

        // Update Game State to match final results
        this.state.ink = finalInk;
        this.state.rune = finalRune;
        this.state.gems = finalGem;
        this.state.wpmDisplay = finalWPM;

        this.switchScreen("screen-new-score");

        // 2. Update UI Elements directly
        const elInk = document.getElementById('report-ink-score');
        const elRune = document.getElementById('report-rune-score');
        const elGem = document.getElementById('report-gem-score');
        const elInkCount = document.getElementById('report-ink-count');
        const elRuneCount = document.getElementById('report-rune-count');
        const elGemCount = document.getElementById('report-gem-count');

        if (elInk) elInk.innerText = "+" + finalInk;
        if (elRune) elRune.innerText = "+" + finalRune;
        if (elGem) elGem.innerText = "+" + finalGem;

        // Show totals
        if (elInkCount) elInkCount.innerText = "Current: " + finalInk;
        if (elRuneCount) elRuneCount.innerText = "Current: " + finalRune;
        if (elGemCount) elGemCount.innerText = "Current: " + finalGem;

        // 3. Animate WPM
        this.animateValue("report-wpm", 0, finalWPM, 1500);

        // 4. Calculate Rank based on total score (Simple Mock Logic)
        const totalScore = finalInk + (finalRune * 10) + (finalGem * 5);
        let rank = "Novice";
        if (totalScore > 500) rank = "Apprentice";
        if (totalScore > 1000) rank = "Master";
        if (totalScore > 2000) rank = "Warden";

        const elRank = document.getElementById('report-rank-text');
        if (elRank) elRank.innerText = rank;

        // [FIX] Bind Claim Reward Button logic
        const btnClaim = document.getElementById("btn-claim-reward");
        const emailInput = document.getElementById("warden-email");
        if (btnClaim) {
            // Remove old listeners (clone node trick)
            const newBtn = btnClaim.cloneNode(true);
            if (btnClaim.parentNode) btnClaim.parentNode.replaceChild(newBtn, btnClaim);

            newBtn.onclick = () => {
                const email = emailInput ? emailInput.value : "";
                if (!email || !email.includes("@")) {
                    alert("Please enter a valid email address.");
                    return;
                }

                // Simulate API Call
                newBtn.innerText = "Sending...";
                newBtn.disabled = true;

                setTimeout(() => {
                    alert("Reward Claimed! Check your email.");
                    // Go to Share Screen
                    Game.switchScreen("screen-new-share");
                }, 1500);
            };
        }
    },

    goToNewSignup() {
        this.switchScreen("screen-new-signup");
    },

    goToNewShare() {
        // Simulate Signup submission if coming from Signup screen
        const emailInput = document.querySelector("#screen-new-signup input[type='email']");
        if (emailInput && emailInput.value) {
            console.log("Signup Email:", emailInput.value);
            // Optionally show toast
        }
        this.switchScreen("screen-new-share");
    },

    // Utilities
    // Utilities
    animateValue(id, start, end, duration, suffix = "") {
        this.uiManager.animateValue(id, start, end, duration, "", suffix);
    }
};









window.Game = Game;

// [SAFETY FIX] Module timing protection
const initGame = () => {
    if (Game.isInitialized) return;
    Game.isInitialized = true;
    console.log("[Game] Initializing (Module Loaded)...");
    Game.init();
};

if (document.readyState === "loading") {
    // Document still parsing
    document.addEventListener("DOMContentLoaded", initGame);
} else {
    // Document already interactive/complete
    initGame();
}


// End of file




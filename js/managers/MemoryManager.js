/**
 * MemoryManager.js
 * 
 * Centralized resource management to prevent memory leaks on iOS/Mobile.
 * Enforces a strict "Dispose-Immediately" protocol for heavy assets.
 */

export class MemoryManager {
    constructor() {
        this.registry = new Set(); // Managers that need cleanup
        this.globalListeners = new Map(); // { event: [handler, ...] }
        this.activeTimers = new Set(); // IDs of active timeouts/intervals
    }

    /**
     * Registers a manager/component for cleanup.
     * The component MUST implement a `dispose()` method.
     */
    register(component) {
        if (component && typeof component.dispose === 'function') {
            this.registry.add(component);
            // console.log(`[Memory] Registered component: ${component.constructor.name}`);
        } else {
            console.warn("[Memory] Component missing dispose() method:", component);
        }
    }

    unregister(component) {
        this.registry.delete(component);
    }

    /**
     * Tracks a timer ID to ensure it can be cleared on purge.
     * @returns {number} The timer ID
     */
    trackTimer(id) {
        this.activeTimers.add(id);
        return id;
    }

    clearTimer(id) {
        clearTimeout(id);
        clearInterval(id);
        this.activeTimers.delete(id);
    }

    /**
     * Adds a global event listener that will be automatically removed on purge.
     */
    addEventListener(target, event, handler) {
        target.addEventListener(event, handler);

        if (!this.globalListeners.has(event)) {
            this.globalListeners.set(event, []);
        }
        this.globalListeners.get(event).push({ target, handler });
    }

    /**
     * CRITICAL: Cleaning Routine
     * Calls dispose() on all registered components and clears global listeners/timers.
     */
    purgeAll() {
        console.log("[Memory] Purging All Resources...");
        const start = performance.now();

        // 1. Dispose Components
        this.registry.forEach(comp => {
            try {
                comp.dispose();
            } catch (e) {
                console.error(`[Memory] Error disposing ${comp.constructor.name}:`, e);
            }
        });
        // We do NOT clear the registry itself, as managers persist across stages.
        // They should just reset their internal state.

        // 2. Clear Tracked Timers
        this.activeTimers.forEach(id => {
            clearTimeout(id);
            clearInterval(id);
        });
        this.activeTimers.clear();

        // 3. Force Garbage Collection Hints (Nullifying disconnected DOM)
        // This is heuristic.
        const leftovers = document.querySelectorAll('.flying-resource, .fading-overlay');
        leftovers.forEach(el => el.remove());

        const duration = performance.now() - start;
        console.log(`[Memory] Purge complete in ${duration.toFixed(2)}ms. Active Managers: ${this.registry.size}`);
    }
}

// Global Singleton
export const memoryManager = new MemoryManager();
window.memoryManager = memoryManager;

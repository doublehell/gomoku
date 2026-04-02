class TimerManager {
    constructor() {
        this.timers = [];
    }

    /**
     * Add a recurring interval timer
     * @param {Function} callback - Function to call
     * @param {number} intervalMs - Interval in milliseconds
     * @param {string} name - Name for logging
     * @returns {NodeJS.Timeout} - The timer ID
     */
    addInterval(callback, intervalMs, name) {
        const timer = setInterval(callback, intervalMs);
        this.timers.push({ timer, name, type: 'interval' });
        return timer;
    }

    /**
     * Add a one-time timeout
     * @param {Function} callback - Function to call
     * @param {number} delayMs - Delay in milliseconds
     * @param {string} name - Name for logging
     * @returns {NodeJS.Timeout} - The timer ID
     */
    addTimeout(callback, delayMs, name) {
        const timer = setTimeout(() => {
            callback();
            this.removeTimer(timer);
        }, delayMs);
        this.timers.push({ timer, name, type: 'timeout' });
        return timer;
    }

    /**
     * Remove a specific timer
     * @param {NodeJS.Timeout} timerId - Timer ID to remove
     */
    removeTimer(timerId) {
        const index = this.timers.findIndex(t => t.timer === timerId);
        if (index !== -1) {
            clearInterval(timerId);
            clearTimeout(timerId);
            this.timers.splice(index, 1);
        }
    }

    /**
     * Stop all timers (for shutdown)
     */
    stopAll() {
        this.timers.forEach(({ timer, name }) => {
            clearInterval(timer);
            clearTimeout(timer);
        });
        this.timers = [];
    }

    /**
     * Get timer count for debugging
     */
    getCount() {
        return this.timers.length;
    }
}

module.exports = TimerManager;
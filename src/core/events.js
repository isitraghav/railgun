/**
 * EventManager - Handles event subscriptions and emissions for real-time data synchronization
 *
 * Features:
 * - Pattern-based subscriptions (exact paths, wildcards, regex)
 * - Access control integration with data spaces
 * - Local and remote event emission
 */

export class EventManager {
    constructor(railgunInstance) {
        this.db = railgunInstance;
        this.subscriptions = new Map();
        this.subscriptionIdCounter = 0;
    }

    /**
     * Subscribe to path changes
     * @param {string|RegExp} pattern - Path pattern (exact, wildcard *, or RegExp)
     * @param {Function} callback - Called with { path } when matching path changes
     * @param {Object} options - { publicKey: string } for access control
     * @returns {number} subscriptionId - Use to unsubscribe
     */
    subscribe(pattern, callback, options = {}) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        const subscriptionId = ++this.subscriptionIdCounter;

        this.subscriptions.set(subscriptionId, {
            pattern,
            callback,
            options,
            publicKey: options.publicKey || null
        });

        return subscriptionId;
    }

    /**
     * Unsubscribe from events
     * @param {number} subscriptionId
     * @returns {boolean} true if subscription was removed
     */
    unsubscribe(subscriptionId) {
        return this.subscriptions.delete(subscriptionId);
    }

    /**
     * Emit an event for a path change
     * @param {string} path - The path that changed
     * @param {Object} metadata - Additional info (space, author, timestamp, remote)
     */
    async emit(path, metadata = {}) {
        const { space = 'all', author = null, timestamp = Date.now(), remote = false } = metadata;

        for (const [, subscription] of this.subscriptions) {
            if (!this._matchPattern(path, subscription.pattern)) {
                continue;
            }

            const hasAccess = await this._checkAccess(path, space, author, subscription.publicKey);
            if (!hasAccess) {
                continue;
            }

            try {
                subscription.callback({
                    path,
                    space,
                    author,
                    timestamp,
                    remote,
                    ...metadata
                });
            } catch (error) {
                console.error(`Error in subscription callback for ${path}:`, error);
            }
        }
    }

    /**
     * Match a path against a subscription pattern
     * @param {string} path - The actual path
     * @param {string|RegExp} pattern - Subscription pattern
     * @returns {boolean}
     */
    _matchPattern(path, pattern) {
        if (pattern instanceof RegExp) {
            return pattern.test(path);
        }

        if (!pattern.includes('*')) {
            return path === pattern;
        }

        const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');

        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(path);
    }

    /**
     * Check if a subscriber has access to events for a path
     * @param {string} path - Full storage path
     * @param {string} space - Data space (all, frozen, user)
     * @param {string} author - Public key of writer
     * @param {string} subscriberPublicKey - Public key of subscriber (null for unauthenticated)
     * @returns {boolean}
     */
    async _checkAccess(path, space, author, subscriberPublicKey) {
        if (space === 'all' || space === 'frozen') {
            return true;
        }

        if (space === 'user') {
            if (!subscriberPublicKey) {
                return false;
            }

            const pathParts = path.split('/');
            if (pathParts[0] === 'user' && pathParts[1]) {
                const ownerPublicKey = pathParts[1];
                return ownerPublicKey === subscriberPublicKey;
            }

            return false;
        }

        return false;
    }

    /**
     * Get all active subscriptions (useful for network propagation)
     * @returns {Array} Array of { id, pattern, publicKey }
     */
    getSubscriptions() {
        const subs = [];
        for (const [id, sub] of this.subscriptions) {
            subs.push({
                id,
                pattern: sub.pattern instanceof RegExp ? sub.pattern.source : sub.pattern,
                isRegex: sub.pattern instanceof RegExp,
                publicKey: sub.publicKey
            });
        }
        return subs;
    }

    /**
     * Clear all subscriptions
     */
    clear() {
        this.subscriptions.clear();
    }
}

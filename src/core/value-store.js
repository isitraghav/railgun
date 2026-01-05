import * as msgpack from './msgpack.js';
import { hash } from './crypto.js';

/**
 * ValueStore - Separate storage for data values using MessagePack
 *
 * This keeps trie nodes compact by storing actual values separately.
 * Values are content-addressed and deduplicated automatically.
 */
export class ValueStore {
    constructor(storage) {
        this.storage = storage;
        this.valuePrefix = 'v:';
        this.cache = new Map();
        this.maxCacheSize = 500;
    }

    /**
     * Store a value and return its reference key
     * @param {any} value - Value to store
     * @returns {Promise<string>} - Reference key for the value
     */
    async put(value) {
        if (value === null || value === undefined) {
            return null;
        }

        const encoded = msgpack.encode(value);

        const valueHash = hash(encoded);
        const key = this.valuePrefix + valueHash;

        const existing = await this.storage.get(key);
        if (!existing) {
            await this.storage.put(key, encoded);
        }

        this.addToCache(key, value);

        return key;
    }

    /**
     * Retrieve a value by its reference key
     * @param {string} key - Reference key
     * @returns {Promise<any>} - Decoded value
     */
    async get(key) {
        if (!key || key === null) {
            return null;
        }

        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const encoded = await this.storage.get(key);
        if (!encoded) {
            return null;
        }

        const value = msgpack.decode(encoded);

        this.addToCache(key, value);

        return value;
    }

    /**
     * Add value to cache with LRU eviction
     * @private
     */
    addToCache(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        this.cache.set(key, value);

        if (this.cache.size > this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     * @returns {{size: number, maxSize: number}}
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize
        };
    }
}

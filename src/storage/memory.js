/**
 * Optimized MemoryStorage with better performance
 */
export class MemoryStorage {
    constructor() {
        this.store = new Map();
    }

    async put(hash, data) {
        this.store.set(hash, data);
    }

    async get(hash) {
        return this.store.get(hash) || null;
    }

    async close() {}

    clear() {
        this.store.clear();
    }

    size() {
        return this.store.size;
    }
}

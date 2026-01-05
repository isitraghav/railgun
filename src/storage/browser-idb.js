import { openDB } from 'idb';
import { LRUCache } from '../core/utils.js';

export class BrowserIDBStorage {
    constructor(dbName = 'railgun', storeName = 'nodes', options = {}) {
        this.dbName = dbName;
        this.storeName = storeName;
        this.dbPromise = openDB(dbName, 2, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            }
        });

        this.writeQueue = new Map();
        this.flushTimer = null;
        this.flushInterval = options.flushInterval || 10;
        this.cache = new LRUCache(options.cacheSize || 2000);
        this.isFlushing = false;
    }

    async put(hash, data) {
        this.writeQueue.set(hash, data);

        this.cache.set(hash, data);

        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
        }
    }

    async flush() {
        if (this.closed) return;
        if (this.isFlushing || this.writeQueue.size === 0) {
            this.flushTimer = null;
            return;
        }

        this.isFlushing = true;
        this.flushTimer = null;

        try {
            const entries = Array.from(this.writeQueue.entries());
            this.writeQueue.clear();

            const db = await this.dbPromise;
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);

            const promises = entries.map(([hash, data]) => store.put(data, hash));

            await Promise.all([...promises, tx.done]);
        } finally {
            this.isFlushing = false;
        }
    }

    async get(hash) {
        const cached = this.cache.get(hash);
        if (cached !== undefined) {
            return cached;
        }

        if (this.writeQueue.has(hash)) {
            return this.writeQueue.get(hash);
        }

        const db = await this.dbPromise;
        const value = await db.get(this.storeName, hash);

        if (value !== undefined) {
            this.cache.set(hash, value);
        }

        return value;
    }

    async forcePut(hash, data) {
        this.cache.set(hash, data);

        const db = await this.dbPromise;
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        await store.put(data, hash);
        await tx.done;
    }

    async putBatch(entries) {
        const db = await this.dbPromise;
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);

        const promises = entries.map(([hash, data]) => {
            this.cache.set(hash, data);
            return store.put(data, hash);
        });

        await Promise.all([...promises, tx.done]);
    }

    async getBatch(hashes) {
        const results = new Map();
        const toFetch = [];

        for (const hash of hashes) {
            const cached = this.cache.get(hash);
            if (cached !== undefined) {
                results.set(hash, cached);
            } else if (this.writeQueue.has(hash)) {
                results.set(hash, this.writeQueue.get(hash));
            } else {
                toFetch.push(hash);
            }
        }

        if (toFetch.length > 0) {
            const db = await this.dbPromise;
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);

            const promises = toFetch.map(async (hash) => {
                const value = await store.get(hash);
                if (value !== undefined) {
                    this.cache.set(hash, value);
                    results.set(hash, value);
                }
            });

            await Promise.all([...promises, tx.done]);
        }

        return results;
    }

    async close() {
        this.closed = true;

        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        try {
            await this.flush();
        } catch (e) {
            console.warn('Error flushing on close:', e);
        }

        const db = await this.dbPromise;
        db.close();
        this.cache.clear();
    }
}

import fs from 'fs/promises';
import path from 'path';

/**
 * Optimized NodeFSStorage with write batching and caching
 */
export class NodeFSStorage {
    constructor(baseDir = '.railgun') {
        this.baseDir = baseDir;
        this.initPromise = this.init();

        this.cache = new Map();
        this.writeQueue = new Map();
        this.flushTimer = null;
        this.flushInterval = 50;
        this.maxCacheSize = 10000;
    }

    async init() {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
        } catch (_err) {
            // Ignore if directory already exists or other errors
        }
    }

    async put(hash, data) {
        await this.initPromise;

        this.cache.set(hash, data);

        if (this.cache.size > this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.writeQueue.set(hash, data);

        this.scheduleFlush();
    }

    scheduleFlush() {
        if (this.flushTimer) return;

        this.flushTimer = setTimeout(async () => {
            await this.flush();
            this.flushTimer = null;
        }, this.flushInterval);
    }

    async flush() {
        if (this.writeQueue.size === 0) return;

        const writes = Array.from(this.writeQueue.entries()).map(([hash, data]) => {
            const filePath = path.join(this.baseDir, hash);
            return fs.writeFile(filePath, data, 'utf8').catch((err) => {
                console.error(`Failed to write ${hash}:`, err);
            });
        });

        this.writeQueue.clear();
        await Promise.all(writes);
    }

    async get(hash) {
        await this.initPromise;

        if (this.cache.has(hash)) {
            return this.cache.get(hash);
        }

        const filePath = path.join(this.baseDir, hash);
        try {
            const data = await fs.readFile(filePath, 'utf8');

            this.cache.set(hash, data);
            if (this.cache.size > this.maxCacheSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }

            return data;
        } catch {
            return null;
        }
    }

    async close() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
    }
}

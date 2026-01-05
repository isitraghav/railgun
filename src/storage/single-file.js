import fs from 'node:fs/promises';
import path from 'node:path';
import { toBase64, fromBase64 } from '../core/utils.js';

/**
 * Single-File Storage with Memory-First Architecture
 *
 * Strategy:
 * - Keep all data in memory (up to 100MB)
 * - Single file with append-only log
 * - Periodic snapshots for compaction
 * - Write to disk on idle or memory threshold
 *
 * File Format:
 * - Header: Magic bytes + version
 * - Entries: [timestamp, operation, key, data]
 * - Snapshots: Full memory dump at intervals
 */

export class SingleFileStorage {
    constructor(filePath = '.railgun/database.rdb', options = {}) {
        this.filePath = filePath;
        this.memoryStore = new Map();
        this.writeLog = [];
        this.maxMemoryMB = options.maxMemoryMB || 100;
        this.idleFlushDelay = options.idleFlushDelay || 5000;
        this.snapshotInterval = options.snapshotInterval || 60000;

        this.lastWriteTime = Date.now();
        this.memoryUsageBytes = 0;
        this.idleTimer = null;
        this.snapshotTimer = null;
        this.initPromise = this.init();
    }

    async init() {
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });

        await this.load();

        this.scheduleIdleFlush();

        this.scheduleSnapshot();
    }

    _serializeValue(value) {
        if (value instanceof Uint8Array) {
            return { $type: 'bin', data: toBase64(value) };
        }
        return value;
    }

    _deserializeValue(value) {
        if (value && typeof value === 'object' && value.$type === 'bin') {
            return fromBase64(value.data);
        }
        return value;
    }

    async load() {
        try {
            const data = await fs.readFile(this.filePath, 'utf8');
            const lines = data.split('\n').filter((line) => line.trim());

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);

                    if (entry.type === 'snapshot') {
                        const loadedMap = new Map();
                        for (const [key, val] of entry.data) {
                            loadedMap.set(key, this._deserializeValue(val));
                        }
                        this.memoryStore = loadedMap;
                        this.memoryUsageBytes = this.calculateMemoryUsage();
                    } else if (entry.type === 'put') {
                        const val = this._deserializeValue(entry.value);
                        this.memoryStore.set(entry.key, val);
                    } else if (entry.type === 'delete') {
                        this.memoryStore.delete(entry.key);
                    }
                } catch (e) {
                    console.error('Failed to parse log entry:', e);
                }
            }

            console.log(`Loaded ${this.memoryStore.size} entries from disk`);
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.error('Failed to load database:', e);
            }
        }
    }

    async put(hash, data) {
        await this.initPromise;

        this.memoryStore.set(hash, data);

        this.writeLog.push({
            type: 'put',
            timestamp: Date.now(),
            key: hash,
            value: data
        });

        this.memoryUsageBytes += this.estimateSize(hash) + this.estimateSize(data);
        this.lastWriteTime = Date.now();

        if (this.memoryUsageBytes > this.maxMemoryMB * 1024 * 1024) {
            console.log(
                `Memory threshold reached (${this.memoryUsageBytes / 1024 / 1024} MB), flushing...`
            );
            await this.flush();
        }

        this.scheduleIdleFlush();
    }

    async get(hash) {
        await this.initPromise;
        return this.memoryStore.get(hash) || null;
    }

    scheduleIdleFlush() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        this.idleTimer = setTimeout(async () => {
            const idleTime = Date.now() - this.lastWriteTime;
            if (idleTime >= this.idleFlushDelay && this.writeLog.length > 0) {
                console.log(
                    `Idle for ${idleTime}ms, flushing ${this.writeLog.length} pending writes...`
                );
                await this.flush();
            }
        }, this.idleFlushDelay);
    }

    scheduleSnapshot() {
        this.snapshotTimer = setInterval(async () => {
            if (this.writeLog.length > 100) {
                console.log('Creating snapshot...');
                await this.snapshot();
            }
        }, this.snapshotInterval);
    }

    async flush() {
        if (this.writeLog.length === 0) return;

        const entries =
            this.writeLog
                .map((entry) => {
                    const serializedEntry = {
                        ...entry,
                        value: this._serializeValue(entry.value)
                    };
                    return JSON.stringify(serializedEntry);
                })
                .join('\n') + '\n';

        try {
            await fs.appendFile(this.filePath, entries, 'utf8');
            console.log(`Flushed ${this.writeLog.length} entries to disk`);
            this.writeLog = [];
        } catch (e) {
            console.error('Failed to flush:', e);
        }
    }

    async snapshot() {
        const serializedData = Array.from(this.memoryStore.entries()).map(([key, val]) => {
            return [key, this._serializeValue(val)];
        });

        const snapshot = {
            type: 'snapshot',
            timestamp: Date.now(),
            count: this.memoryStore.size,
            data: serializedData
        };

        const tempPath = this.filePath + '.tmp';
        await fs.writeFile(tempPath, JSON.stringify(snapshot) + '\n', 'utf8');

        await fs.rename(tempPath, this.filePath);

        this.writeLog = [];

        console.log(`Created snapshot with ${this.memoryStore.size} entries`);
    }

    calculateMemoryUsage() {
        let total = 0;
        for (const [key, value] of this.memoryStore) {
            total += this.estimateSize(key) + this.estimateSize(value);
        }
        return total;
    }

    estimateSize(str) {
        if (str instanceof Uint8Array) return str.length;

        return typeof str === 'string' ? str.length * 2 : 0;
    }

    async close() {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        if (this.snapshotTimer) clearInterval(this.snapshotTimer);

        await this.flush();

        console.log('Database closed');
    }

    size() {
        return this.memoryStore.size;
    }

    getMemoryUsageMB() {
        return (this.memoryUsageBytes / 1024 / 1024).toFixed(2);
    }

    clear() {
        this.memoryStore.clear();
        this.writeLog = [];
        this.memoryUsageBytes = 0;
    }
}

import stringify from 'fast-json-stable-stringify';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Deterministically serializes an object to JSON.
 * @param {any} value
 * @returns {string}
 */
export function canonicalize(value) {
    return stringify(value);
}

/**
 * Normalizes a key for trie pathing (NFKC + lowercase).
 * @param {string} key
 * @returns {string}
 */
export function normalizeKey(key) {
    return key.normalize('NFKC').toLowerCase();
}

const hexTable = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function toHex(uint8arr) {
    let output = '';
    for (let i = 0; i < uint8arr.length; i++) {
        output += hexTable[uint8arr[i]];
    }
    return output;
}

export function fromHex(hexStr) {
    if (hexStr.length % 2 !== 0) throw new Error('Invalid hex string');
    const len = hexStr.length / 2;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        u8[i] = parseInt(hexStr.substr(i * 2, 2), 16);
    }
    return u8;
}

/**
 * Convert Uint8Array to base64 (URL-safe, no padding)
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64(bytes) {
    if (typeof Buffer === 'undefined') {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    return Buffer.from(bytes)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Convert base64 to Uint8Array (URL-safe, no padding)
 * @param {string} base64Str
 * @returns {Uint8Array}
 */
export function fromBase64(base64Str) {
    let standard = base64Str.replace(/-/g, '+').replace(/_/g, '/');

    while (standard.length % 4) {
        standard += '=';
    }

    if (typeof Buffer === 'undefined') {
        const binary = atob(standard);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    return new Uint8Array(Buffer.from(standard, 'base64'));
}

/**
 * Encode bytes to Base32 (RFC 4648)
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase32(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;

        while (bits >= 5) {
            output += alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
}

/**
 * Compute deterministic suffix from public key (numeric only)
 * @param {string} pubKeyHex - Hex-encoded public key
 * @param {number} length - Suffix length (default 4)
 * @returns {string} - Numeric suffix (e.g., "4921")
 */
export function computeSuffix(pubKeyHex, length = 4) {
    const input = fromHex(pubKeyHex);
    const hashBytes = sha256(input);

    const num = (hashBytes[0] << 24) | (hashBytes[1] << 16) | (hashBytes[2] << 8) | hashBytes[3];

    const suffix = Math.abs(num % Math.pow(10, length))
        .toString()
        .padStart(length, '0');
    return suffix;
}

/**
 * Find a keypair that produces the target suffix via brute-force
 * Uses parallel async key generation for speed
 * @param {Function} generateKeyPair - Async function that returns {publicKey, privateKey}
 * @param {string} targetSuffix - 1-4 digit numeric suffix (e.g., "4921")
 * @param {object} options - { maxAttempts, onProgress, batchSize }
 * @returns {Promise<{publicKey, privateKey, attempts}>}
 */
export async function findKeyWithSuffix(generateKeyPair, targetSuffix, options = {}) {
    const { maxAttempts = 10_000_000, onProgress = null, batchSize = 200 } = options;

    const normalized = targetSuffix.trim();
    if (!/^[0-9]{1,4}$/.test(normalized)) {
        throw new Error(
            `Invalid suffix format: "${targetSuffix}". Must be 1-4 numeric digits (0-9).`
        );
    }

    let attempts = 0;
    const startTime = Date.now();
    const targetLen = normalized.length;

    while (attempts < maxAttempts) {
        const batchPromises = [];
        for (let i = 0; i < batchSize; i++) {
            batchPromises.push(generateKeyPair());
        }

        const keyPairs = await Promise.all(batchPromises);

        for (const keyPair of keyPairs) {
            attempts++;

            const suffix = computeSuffix(keyPair.publicKey, 4);

            if (suffix.startsWith(normalized)) {
                const elapsed = Date.now() - startTime;
                if (onProgress) {
                    onProgress({ found: true, attempts, elapsed, suffix });
                }
                return { ...keyPair, attempts };
            }
        }

        if (onProgress && attempts % 10000 === 0) {
            const elapsed = Date.now() - startTime;
            const rate = Math.round(attempts / (elapsed / 1000));
            onProgress({
                found: false,
                attempts,
                elapsed,
                rate,
                estimatedRemaining: Math.round((10 ** targetLen / 2 - attempts) / rate)
            });
        }
    }

    throw new Error(
        `Could not find keypair with suffix "${normalized}" after ${attempts} attempts`
    );
}

/**
 * Simple LRU Cache
 */
export class LRUCache {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;

        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        this.cache.set(key, value);

        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    clear() {
        this.cache.clear();
    }

    delete(key) {
        this.cache.delete(key);
    }
}

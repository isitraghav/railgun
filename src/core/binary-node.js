import { sha256 } from '@noble/hashes/sha2.js';
import { toBase64, fromBase64 } from './utils.js';

/**
 * Binary-optimized trie node with packed serialization
 *
 * Binary Format:
 * [1 byte flags][optional ext. count][optional value data][N * (1 byte char + 32 byte hash)]
 *
 * Flags byte (8 bits):
 * - Bit 0: Has value (0/1)
 * - Bits 1-7: Number of children (0-127)
 *   - If count < 127: stored directly in bits 1-7
 *   - If count == 127: bits 1-7 set to 1, followed by 2-byte count
 */
export class BinaryNode {
    constructor(value = null, children = {}) {
        this.value = value;
        this.children = children;
    }

    /**
     * Serialize node to compact binary format
     * @returns {Uint8Array}
     */
    serialize() {
        const childKeys = Object.keys(this.children).sort();
        const numChildren = childKeys.length;
        const hasValue = this.value !== null;

        let size = 1;
        let valueBytes = null;

        const isExtendedCount = numChildren >= 127;
        if (isExtendedCount) {
            size += 2;
        }

        if (hasValue) {
            valueBytes = new TextEncoder().encode(this.value);
            size += 2 + valueBytes.length;
        }
        size += numChildren * 33;

        const buffer = new Uint8Array(size);

        let flags = 0;
        if (hasValue) flags |= 0x01;

        if (isExtendedCount) {
            flags |= 127 << 1;
        } else {
            flags |= numChildren << 1;
        }

        buffer[0] = flags;
        let offset = 1;

        if (isExtendedCount) {
            buffer[offset++] = (numChildren >> 8) & 0xff;
            buffer[offset++] = numChildren & 0xff;
        }

        if (hasValue && valueBytes) {
            const len = valueBytes.length;
            buffer[offset++] = (len >> 8) & 0xff;
            buffer[offset++] = len & 0xff;
            buffer.set(valueBytes, offset);
            offset += valueBytes.length;
        }

        for (const char of childKeys) {
            buffer[offset++] = char.charCodeAt(0);
            const hashB64 = this.children[char];
            const hashBytes = fromBase64(hashB64);
            buffer.set(hashBytes, offset);
            offset += 32;
        }

        return buffer;
    }

    /**
     * Deserialize binary data to node
     * @param {Uint8Array} buffer
     * @returns {BinaryNode}
     */
    static deserialize(buffer) {
        if (buffer.length < 1) {
            throw new Error('Invalid binary node: too short');
        }

        const flags = buffer[0];
        const hasValue = (flags & 0x01) !== 0;
        let numChildren = (flags >> 1) & 0x7f;

        let offset = 1;

        if (numChildren === 127) {
            if (offset + 2 > buffer.length) {
                throw new Error('Invalid binary node: truncated extended count');
            }
            numChildren = (buffer[offset] << 8) | buffer[offset + 1];
            offset += 2;
        }

        let value = null;

        if (hasValue) {
            if (offset + 2 > buffer.length) {
                throw new Error('Invalid binary node: truncated value length');
            }
            const len = (buffer[offset] << 8) | buffer[offset + 1];
            offset += 2;

            if (offset + len > buffer.length) {
                throw new Error('Invalid binary node: truncated value');
            }

            const valueBytes = buffer.slice(offset, offset + len);
            value = new TextDecoder().decode(valueBytes);
            offset += len;
        }

        const children = {};
        for (let i = 0; i < numChildren; i++) {
            if (offset >= buffer.length) {
                throw new Error('Invalid binary node: truncated children');
            }

            const char = String.fromCharCode(buffer[offset++]);

            if (offset + 32 > buffer.length) {
                throw new Error('Invalid binary node: truncated hash');
            }

            const hashBytes = buffer.slice(offset, offset + 32);
            const hashB64 = toBase64(hashBytes);
            children[char] = hashB64;
            offset += 32;
        }

        return new BinaryNode(value, children);
    }

    /**
     * Get content-addressed hash of this node
     * @returns {string} - Base64 hash
     */
    getHash() {
        const serialized = this.serialize();
        const hashBytes = sha256(serialized);
        return toBase64(hashBytes);
    }

    /**
     * Check if node has a value
     * @returns {boolean}
     */
    hasValue() {
        return this.value !== null || this._hasValue;
    }

    /**
     * Get size of serialized node in bytes
     * @returns {number}
     */
    getSize() {
        const numChildren = Object.keys(this.children).length;
        let size = 1;

        if (numChildren >= 127) {
            size += 2;
        }

        if (this.value !== null) {
            const valueBytes = new TextEncoder().encode(this.value);
            size += 2 + valueBytes.length;
        }

        size += numChildren * 33;
        return size;
    }
}

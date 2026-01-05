import { Node } from './node.js';
import { normalizeKey } from './utils.js';

class TrieNodeCache {
    constructor(maxSize = 500) {
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
}

export class Trie {
    constructor(storage, rootHash = null) {
        this.storage = storage;
        this.rootHash = rootHash;
        this.nodeCache = new TrieNodeCache(1000);
        this.rootCache = null;
    }

    async getRoot() {
        if (this.rootCache && this.rootCache.hash === this.rootHash) {
            return this.rootCache.node;
        }

        if (!this.rootHash) {
            const node = new Node();
            this.rootCache = { hash: null, node };
            return node;
        }

        const json = await this.storage.get(this.rootHash);
        if (!json) {
            const node = new Node();
            this.rootCache = { hash: null, node };
            return node;
        }

        const node = Node.deserialize(json);
        this.rootCache = { hash: this.rootHash, node };
        return node;
    }

    async get(key) {
        const path = normalizeKey(key);
        let currentNode = await this.getRoot();

        for (const char of path) {
            const childHash = currentNode.children[char];
            if (!childHash) return null;

            const cached = this.nodeCache.get(childHash);
            if (cached) {
                currentNode = cached;
                continue;
            }

            const childJson = await this.storage.get(childHash);
            if (!childJson) return null;

            currentNode = Node.deserialize(childJson);
            this.nodeCache.set(childHash, currentNode);
        }

        return currentNode.value;
    }

    async put(key, value) {
        const path = normalizeKey(key);
        const stack = [];
        let currentNode = await this.getRoot();
        stack.push(currentNode);

        for (const char of path) {
            const childHash = currentNode.children[char];
            let childNode;

            if (childHash) {
                const cached = this.nodeCache.get(childHash);
                if (cached) {
                    childNode = cached;
                } else {
                    const childJson = await this.storage.get(childHash);
                    childNode = childJson ? Node.deserialize(childJson) : new Node();
                    if (childJson) {
                        this.nodeCache.set(childHash, childNode);
                    }
                }
            } else {
                childNode = new Node();
            }

            currentNode = childNode;
            stack.push(currentNode);
        }

        currentNode.value = value;

        const nodesToSave = [];

        const leaf = stack[stack.length - 1];
        let childHash = leaf.getHash();
        nodesToSave.push([childHash, leaf.serialize()]);
        this.nodeCache.set(childHash, leaf);

        for (let i = path.length - 1; i >= 0; i--) {
            const parent = stack[i];
            const char = path[i];

            parent.children[char] = childHash;

            childHash = parent.getHash();
            nodesToSave.push([childHash, parent.serialize()]);
            this.nodeCache.set(childHash, parent);
        }

        if (typeof this.storage.putBatch === 'function') {
            await this.storage.putBatch(nodesToSave);
        } else {
            for (const [hash, data] of nodesToSave) {
                await this.storage.put(hash, data);
            }
        }

        this.rootHash = childHash;

        this.rootCache = { hash: childHash, node: stack[0] };

        return this.rootHash;
    }
}

import { BinaryNode } from './binary-node.js';
import { normalizeKey, LRUCache } from './utils.js';
import { ValueStore } from './value-store.js';

export class BinaryTrie {
    constructor(storage, rootHash = null) {
        this.storage = storage;
        this.rootHash = rootHash;
        this.nodeCache = new LRUCache(1000);
        this.rootCache = null;
        this.valueStore = new ValueStore(storage);
    }

    async getRoot() {
        if (this.rootCache && this.rootCache.hash === this.rootHash) {
            return this.rootCache.node;
        }

        if (!this.rootHash) {
            const node = new BinaryNode();
            this.rootCache = { hash: null, node };
            return node;
        }

        const buffer = await this.storage.get(this.rootHash);
        if (!buffer) {
            const node = new BinaryNode();
            this.rootCache = { hash: null, node };
            return node;
        }

        const node = BinaryNode.deserialize(buffer);
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

            const childBuffer = await this.storage.get(childHash);
            if (!childBuffer) return null;

            currentNode = BinaryNode.deserialize(childBuffer);
            this.nodeCache.set(childHash, currentNode);
        }

        if (currentNode.hasValue()) {
            return await this.valueStore.get(currentNode.value);
        }

        return null;
    }

    async put(key, value) {
        const path = normalizeKey(key);
        const stack = [];
        let oldRoot = await this.getRoot();

        let currentNode = new BinaryNode(oldRoot.value, { ...oldRoot.children });
        stack.push(currentNode);

        for (const char of path) {
            const childHash = currentNode.children[char];
            let childNode;

            if (childHash) {
                const cached = this.nodeCache.get(childHash);
                if (cached) {
                    childNode = cached;
                } else {
                    const childBuffer = await this.storage.get(childHash);
                    childNode = childBuffer
                        ? BinaryNode.deserialize(childBuffer)
                        : new BinaryNode();
                    if (childBuffer) {
                        this.nodeCache.set(childHash, childNode);
                    }
                }

                childNode = new BinaryNode(childNode.value, { ...childNode.children });
            } else {
                childNode = new BinaryNode();
            }

            currentNode = childNode;
            stack.push(currentNode);
        }

        const valueKey = await this.valueStore.put(value);
        currentNode.value = valueKey;
        currentNode._hasValue = true;

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

    /**
     * Compare two trie roots and find all changed values
     * @param {string} oldRootHash
     * @param {string} newRootHash
     * @returns {Promise<Array<{key: string, value: any}>>}
     */
    async diff(oldRootHash, newRootHash) {
        const changes = [];
        await this._diffRecursive(oldRootHash, newRootHash, [], changes);
        return changes;
    }

    async _diffRecursive(oldHash, newHash, pathStack, changes) {
        if (oldHash === newHash) return;

        const load = async (hash) => {
            if (!hash) return new BinaryNode();

            if (this.nodeCache.get(hash)) return this.nodeCache.get(hash);

            const buffer = await this.storage.get(hash);
            if (!buffer) return new BinaryNode();
            const node = BinaryNode.deserialize(buffer);
            this.nodeCache.set(hash, node);
            return node;
        };

        const oldNode = await load(oldHash);
        const newNode = await load(newHash);

        if (newNode.hasValue()) {
            if (!oldNode.hasValue() || oldNode.value !== newNode.value) {
                const val = await this.valueStore.get(newNode.value);
                const key = pathStack.join('');
                changes.push({ key, value: val });
            }
        }

        const allKeys = new Set([
            ...Object.keys(oldNode.children),
            ...Object.keys(newNode.children)
        ]);
        for (const char of allKeys) {
            const oHash = oldNode.children[char];
            const nHash = newNode.children[char];
            pathStack.push(char);
            await this._diffRecursive(oHash, nHash, pathStack, changes);
            pathStack.pop();
        }
    }

    /**
     * Get storage statistics
     */
    getStats() {
        return {
            nodeCache: {
                size: this.nodeCache.cache.size,
                maxSize: this.nodeCache.maxSize
            },
            valueStore: this.valueStore.getCacheStats()
        };
    }
}

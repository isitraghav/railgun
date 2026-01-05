import { BinaryNode } from './binary-node.js';

export class TrieSync {
    constructor(trie, peer) {
        this.trie = trie;
        this.peer = peer;
        this.pendingRequests = new Map();
    }

    /**
     * Start syncing with the remote peer given their root hash.
     * @param {string} remoteRootHash
     */
    async sync(remoteRootHash) {
        if (!remoteRootHash) return;
        if (this.trie.rootHash === remoteRootHash) {
            console.log('Tries are already in sync.');
            return;
        }

        console.log(`Starting sync. Local: ${this.trie.rootHash}, Remote: ${remoteRootHash}`);

        try {
            await this._syncNode(remoteRootHash);
            console.log(`Sync complete. New Root: ${remoteRootHash}`);
            return remoteRootHash;
        } catch (e) {
            console.error('Sync failed:', e);
            throw e;
        }
    }

    async _syncNode(hash) {
        const existingInfo = await this.trie.storage.get(hash);
        if (existingInfo) return;

        const nodeData = await this._requestNode(hash);
        if (!nodeData) return;

        const node = BinaryNode.deserialize(nodeData);
        await this.trie.storage.put(hash, nodeData);

        const promises = [];
        for (const key in node.children) {
            const childHash = node.children[key];
            if (childHash) {
                promises.push(this._syncNode(childHash));
            }
        }

        if (node.hasValue()) {
            promises.push(this._syncValue(node.value));
        }

        await Promise.all(promises);
    }

    async _syncValue(valueKey) {
        const exists = await this.trie.valueStore.get(valueKey);
        if (exists) return;

        const valueData = await this._requestValue(valueKey);
        if (valueData) {
            await this.trie.storage.put(valueKey, valueData);
        }
    }

    _requestNode(hash) {
        return new Promise((resolve) => {
            this.pendingRequests.set(hash, { resolve });

            this.peer.send({
                type: 'request_node',
                hash: hash
            });

            setTimeout(() => {
                if (this.pendingRequests.has(hash)) {
                    this.pendingRequests.delete(hash);
                    console.warn(`Timeout requesting node ${hash}`);
                    resolve(null);
                }
            }, 5000);
        });
    }

    _requestValue(hash) {
        return new Promise((resolve) => {
            this.pendingRequests.set(hash, { resolve });

            this.peer.send({
                type: 'request_value',
                hash: hash
            });

            setTimeout(() => {
                if (this.pendingRequests.has(hash)) {
                    this.pendingRequests.delete(hash);
                    console.warn(`Timeout requesting value ${hash}`);
                    resolve(null);
                }
            }, 5000);
        });
    }

    handleNodeResponse(hash, data) {
        const req = this.pendingRequests.get(hash);
        if (req) {
            this.pendingRequests.delete(hash);
            req.resolve(data);
        }
    }

    handleValueResponse(hash, data) {
        const req = this.pendingRequests.get(hash);
        if (req) {
            this.pendingRequests.delete(hash);
            req.resolve(data);
        }
    }
}

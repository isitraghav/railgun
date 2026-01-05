import SimplePeer from 'simple-peer';
import { TrieSync } from '../core/sync.js';

export class PeerConnection {
    constructor(initiator, signaling, targetPeerId, db) {
        this.db = db;
        this.signaling = signaling;
        this.targetPeerId = targetPeerId;
        this.connected = false;
        this.remoteSubscriptions = [];

        this.sync = new TrieSync(db.trie, this);

        this.peer = new SimplePeer({
            initiator: initiator,
            wrtc: db.wrtc,
            trickle: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        this.peer.on('signal', (data) => {
            console.log(`Generating signal for ${targetPeerId} (initiator: ${initiator})`);
            this.signaling.sendSignal(targetPeerId, data);
        });

        this.peer.on('connect', () => {
            console.log(`Connected to peer ${targetPeerId}`);
            this.connected = true;
            this.sendHandshake();
        });

        this.peer.on('data', (data) => this.handleData(data));
        this.peer.on('close', () => {
            console.log(`Connection closed with ${targetPeerId}`);
            this.connected = false;
        });
        this.peer.on('error', (err) => {
            console.error(`Peer error with ${targetPeerId}:`, err);
        });
    }

    signal(data) {
        this.peer.signal(data);
    }

    send(msg) {
        if (this.peer.connected) {
            this.peer.send(JSON.stringify(msg));
        }
    }

    sendHandshake() {
        const handshake = {
            type: 'handshake',
            rootHash: this.db.trie.rootHash
        };

        if (this.db && this.db.identity) {
            handshake.publicKey = this.db.identity.publicKey;
        }
        this.send(handshake);
        this.sendSubscriptions();
    }

    sendSubscriptions() {
        if (this.db && this.db.events) {
            const subs = this.db.events.getSubscriptions();
            for (const sub of subs) {
                this.send({
                    type: 'subscribe',
                    pattern: sub.pattern,
                    isRegex: sub.isRegex,
                    subscriptionId: sub.id
                });
            }
        }
    }

    async handleData(data) {
        try {
            const msg = JSON.parse(data.toString());

            switch (msg.type) {
                case 'handshake':
                    this.remotePublicKey = msg.publicKey;
                    this.remoteRootHash = msg.rootHash;
                    console.log(`Peer identified as ${msg.publicKey}`);

                    if (msg.rootHash && msg.rootHash !== this.db.trie.rootHash) {
                        console.log(
                            `Root hash mismatch. Local: ${this.db.trie.rootHash}, Remote: ${msg.rootHash}`
                        );

                        this.sync
                            .sync(msg.rootHash)
                            .then(async (newRoot) => {
                                if (newRoot) {
                                    console.log('Pull sync successful, saving new head...');
                                    await this.db.applyRemoteRoot(newRoot);

                                    this.send({
                                        type: 'sync_complete',
                                        rootHash: this.db.trie.rootHash
                                    });
                                }
                            })
                            .catch((e) => console.error('Pull sync failed:', e));

                        this.send({
                            type: 'request_sync',
                            rootHash: this.db.trie.rootHash
                        });
                    }
                    break;

                case 'request_sync':
                    if (msg.rootHash && msg.rootHash !== this.db.trie.rootHash) {
                        console.log(
                            `Peer requesting sync of their data. Remote root: ${msg.rootHash}`
                        );
                        this.sync
                            .sync(msg.rootHash)
                            .then(async (newRoot) => {
                                if (newRoot) {
                                    console.log('Reverse sync successful, saving new head...');
                                    await this.db.applyRemoteRoot(newRoot);
                                }
                            })
                            .catch((e) => console.error('Reverse sync failed:', e));
                    }
                    break;

                case 'sync_complete':
                    if (msg.rootHash && msg.rootHash !== this.db.trie.rootHash) {
                        console.log(
                            `Peer sync complete. Pulling their merged data: ${msg.rootHash}`
                        );
                        this.sync
                            .sync(msg.rootHash)
                            .then(async (newRoot) => {
                                if (newRoot) {
                                    await this.db.applyRemoteRoot(newRoot);
                                }
                            })
                            .catch((e) => console.error('Final sync failed:', e));
                    }
                    break;

                case 'push_envelope':
                    if (msg.envelope) {
                        const success = await this.db.merge(msg.envelope);
                        if (success) {
                            console.log(`Merged pushed data: ${msg.envelope.payload?.key}`);
                        }
                    }
                    break;

                case 'request_node':
                    {
                        const buffer = await this.db.storage.get(msg.hash);
                        if (buffer) {
                            this.send({
                                type: 'response_node',
                                hash: msg.hash,
                                data: buffer
                            });
                        }
                    }
                    break;

                case 'response_node':
                    if (msg.data) {
                        let buffer = msg.data;

                        if (msg.data.type === 'Buffer' && Array.isArray(msg.data.data)) {
                            buffer = new Uint8Array(msg.data.data);
                        } else if (Array.isArray(msg.data)) {
                            buffer = new Uint8Array(msg.data);
                        } else if (
                            typeof msg.data === 'object' &&
                            Object.keys(msg.data).every((k) => !isNaN(k))
                        ) {
                            const len = Object.keys(msg.data).length;
                            const arr = new Uint8Array(len);
                            for (let i = 0; i < len; i++) arr[i] = msg.data[i];
                            buffer = arr;
                        }

                        this.sync.handleNodeResponse(msg.hash, buffer);
                    }
                    break;

                case 'request_value':
                    {
                        const val = await this.db.storage.get(msg.hash);
                        if (val) {
                            this.send({
                                type: 'response_value',
                                hash: msg.hash,
                                data: val
                            });
                        }
                    }
                    break;

                case 'response_value':
                    if (msg.data) {
                        let buffer = msg.data;

                        if (msg.data.type === 'Buffer' && Array.isArray(msg.data.data)) {
                            buffer = new Uint8Array(msg.data.data);
                        } else if (Array.isArray(msg.data)) {
                            buffer = new Uint8Array(msg.data);
                        } else if (
                            typeof msg.data === 'object' &&
                            Object.keys(msg.data).every((k) => !isNaN(k))
                        ) {
                            const len = Object.keys(msg.data).length;
                            const arr = new Uint8Array(len);
                            for (let i = 0; i < len; i++) arr[i] = msg.data[i];
                            buffer = arr;
                        }

                        this.sync.handleValueResponse(msg.hash, buffer);
                    }
                    break;

                case 'request': {
                    const envelope = await this.db.getEntry(msg.key);
                    if (envelope) {
                        this.send({
                            type: 'response',
                            key: msg.key,
                            envelope: envelope
                        });
                    }
                    break;
                }

                case 'response':
                    if (msg.envelope) {
                        const success = await this.db.merge(msg.envelope);
                        if (success) {
                            console.log(`Synced key: ${msg.key}`);
                        }
                    }
                    break;

                case 'subscribe':
                    this.remoteSubscriptions.push({
                        pattern: msg.pattern,
                        isRegex: msg.isRegex || false,
                        subscriptionId: msg.subscriptionId
                    });
                    console.log(`Peer ${this.targetPeerId} subscribed to: ${msg.pattern}`);
                    break;

                case 'unsubscribe':
                    this.remoteSubscriptions = this.remoteSubscriptions.filter(
                        (sub) => sub.subscriptionId !== msg.subscriptionId
                    );
                    console.log(`Peer ${this.targetPeerId} unsubscribed: ${msg.subscriptionId}`);
                    break;

                case 'event':
                    if (this.db.events) {
                        await this.db.events.emit(msg.path, {
                            ...msg.metadata,
                            remote: true
                        });
                    }
                    break;
            }
        } catch (e) {
            console.error('Error handling data:', e);
        }
    }

    request(key) {
        this.send({ type: 'request', key });
    }

    isSubscribedTo(path) {
        for (const sub of this.remoteSubscriptions) {
            if (this._matchPattern(path, sub.pattern, sub.isRegex)) {
                return true;
            }
        }
        return false;
    }

    sendEvent(path, metadata) {
        this.send({
            type: 'event',
            path,
            metadata
        });
    }

    _matchPattern(path, pattern, isRegex) {
        if (isRegex) {
            return new RegExp(pattern).test(path);
        }
        if (!pattern.includes('*')) {
            return path === pattern;
        }
        const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        return new RegExp(`^${regexPattern}$`).test(path);
    }
}

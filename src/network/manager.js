import { SignalingClient } from './signaling.js';
import { PeerConnection } from './peer.js';

export class NetworkManager {
    constructor(db, signalingUrls, room = 'railgun-default') {
        this.db = db;
        this.peers = new Map();
        this.room = room;

        const urls = Array.isArray(signalingUrls) ? signalingUrls : [signalingUrls];
        this.signalingUrls = urls;

        this.clients = urls.map((url) => {
            const client = new SignalingClient(
                url,
                (from, signal) => this.handleSignal(client, from, signal),
                (peerId) => this.handlePeerJoin(client, peerId),
                (from, payload) => this.handleRelay(from, payload)
            );
            return client;
        });
    }

    start() {
        this.clients.forEach((client) => client.join(this.room));
    }

    handleSignal(client, from, signal) {
        if (!this.peers.has(from)) {
            console.log('Accepting connection from:', from, 'via', client.socket.id);
            this.createPeer(client, from, false);
        }
        this.peers.get(from).signal(signal);
    }

    handlePeerJoin(client, peerId) {
        if (client.socket && peerId === client.socket.id) return;
        if (this.peers.has(peerId)) return;

        console.log('Initiating connection to:', peerId, 'via', client.socket.id);
        this.createPeer(client, peerId, true);
    }

    /**
     * Handle data relayed through the signaling server (WebSocket fallback)
     * This is used when WebRTC peer connections fail (e.g., mobile-to-desktop)
     */
    async handleRelay(from, payload) {
        console.log(`Received relay from ${from}:`, payload.type);

        // Process the relayed message the same way we'd process WebRTC data
        try {
            const msg = payload;

            switch (msg.type) {
                case 'push_envelope':
                    if (msg.envelope) {
                        const success = await this.db.merge(msg.envelope);
                        if (success) {
                            console.log(`[relay] Merged pushed data: ${msg.envelope.payload?.key}`);
                        }
                    }
                    break;

                case 'handshake':
                    // Handle handshake from relay - trigger sync if roots differ
                    if (msg.rootHash && msg.rootHash !== this.db.trie.rootHash) {
                        console.log(`[relay] Root hash mismatch with ${from}, requesting sync`);
                        // Request their data through relay
                        this._sendRelayTo(from, {
                            type: 'request_sync',
                            rootHash: this.db.trie.rootHash
                        });
                    }
                    break;

                case 'request_sync':
                    // They want our data - send our root hash back
                    console.log(`[relay] Peer ${from} requesting sync`);
                    this._sendRelayTo(from, {
                        type: 'handshake',
                        rootHash: this.db.trie.rootHash,
                        publicKey: this.db.identity?.publicKey
                    });
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
            console.error('[relay] Error handling relay message:', e);
        }
    }

    createPeer(client, peerId, initiator) {
        const peer = new PeerConnection(initiator, client, peerId, this.db);
        this.peers.set(peerId, peer);

        peer.peer.on('close', () => {
            this.peers.delete(peerId);
        });
    }

    /**
     * Send data to a specific peer via relay (fallback)
     */
    _sendRelayTo(peerId, payload) {
        if (this.clients.length > 0) {
            this.clients[0].sendRelay(peerId, payload);
        }
    }

    /**
     * Request specific data from peers.
     * Use this to "sync data that they will only access".
     * @param {string} key
     */
    request(key) {
        this.peers.forEach((peer) => peer.request(key));
    }

    /**
     * Broadcast a new subscription to all peers
     * @param {string|RegExp} pattern - Subscription pattern
     * @param {number} subscriptionId - Local subscription ID
     */
    broadcastSubscription(pattern, subscriptionId) {
        const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
        const isRegex = pattern instanceof RegExp;

        this.peers.forEach((peer) => {
            peer.send({
                type: 'subscribe',
                pattern: patternStr,
                isRegex,
                subscriptionId
            });
        });
    }

    /**
     * Broadcast subscription removal to all peers
     * @param {number} subscriptionId
     */
    broadcastUnsubscription(subscriptionId) {
        this.peers.forEach((peer) => {
            peer.send({
                type: 'unsubscribe',
                subscriptionId
            });
        });
    }

    /**
     * Propagate an event to peers who subscribed to matching patterns
     * @param {string} path - The path that changed
     * @param {Object} metadata - Event metadata
     */
    propagateEvent(path, metadata) {
        this.peers.forEach((peer) => {
            if (peer.isSubscribedTo(path)) {
                peer.sendEvent(path, metadata);
            }
        });
    }

    /**
     * Broadcast identity update to all peers
     */
    announceIdentity() {
        this.peers.forEach((peer) => {
            peer.sendHandshake();
        });

        // Also announce via relay for peers that don't have WebRTC
        this._broadcastRelay({
            type: 'handshake',
            rootHash: this.db.trie.rootHash,
            publicKey: this.db.identity?.publicKey
        });
    }

    /**
     * Push an envelope to all connected peers for immediate sync
     * Uses WebRTC if connected, falls back to WebSocket relay
     * @param {Object} envelope - The signed envelope to push
     */
    broadcastEnvelope(envelope) {
        const message = {
            type: 'push_envelope',
            envelope
        };

        let sentViaWebRTC = false;

        // Try WebRTC first for connected peers
        this.peers.forEach((peer) => {
            if (peer.connected) {
                peer.send(message);
                sentViaWebRTC = true;
            }
        });

        // Always broadcast via relay to ensure delivery to peers without WebRTC
        this._broadcastRelay(message);

        if (!sentViaWebRTC) {
            console.log('[relay] No WebRTC connections, using relay only');
        }
    }

    /**
     * Broadcast data via WebSocket relay to all peers in room
     */
    _broadcastRelay(payload) {
        if (this.clients.length > 0) {
            this.clients[0].broadcast(payload);
        }
    }

    /**
     * Trigger a full sync with all connected peers
     * Useful when coming back online after offline changes
     */
    triggerFullSync() {
        const rootHash = this.db.trie.rootHash;
        console.log(`Triggering full sync with root: ${rootHash}`);

        // WebRTC peers
        this.peers.forEach((peer) => {
            peer.send({
                type: 'request_sync',
                rootHash
            });
        });

        // Relay fallback
        this._broadcastRelay({
            type: 'request_sync',
            rootHash
        });
    }
}

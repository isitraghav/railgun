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
                (peerId) => this.handlePeerJoin(client, peerId)
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

    createPeer(client, peerId, initiator) {
        const peer = new PeerConnection(initiator, client, peerId, this.db);
        this.peers.set(peerId, peer);

        peer.peer.on('close', () => {
            this.peers.delete(peerId);
        });
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
    }

    /**
     * Push an envelope to all connected peers for immediate sync
     * @param {Object} envelope - The signed envelope to push
     */
    broadcastEnvelope(envelope) {
        this.peers.forEach((peer) => {
            peer.send({
                type: 'push_envelope',
                envelope
            });
        });
    }

    /**
     * Trigger a full sync with all connected peers
     * Useful when coming back online after offline changes
     */
    triggerFullSync() {
        const rootHash = this.db.trie.rootHash;
        console.log(`Triggering full sync with root: ${rootHash}`);
        this.peers.forEach((peer) => {
            peer.send({
                type: 'request_sync',
                rootHash
            });
        });
    }
}

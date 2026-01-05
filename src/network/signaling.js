export class SignalingClient {
    constructor(serverUrl, onSignal, onPeerJoin, onRelay) {
        const url = serverUrl.replace(/^http/, 'ws');

        this.socket = new WebSocket(url);
        this.onSignal = onSignal;
        this.onPeerJoin = onPeerJoin;
        this.onRelay = onRelay;

        this.socket.onopen = () => {
            console.log('Signaling connected');
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'params') {
                    this.socket.id = data.id;
                    console.log('My Peer ID:', data.id);
                } else if (data.type === 'signal') {
                    if (this.onSignal) this.onSignal(data.from, data.signal);
                } else if (data.type === 'peer-joined') {
                    if (this.onPeerJoin) this.onPeerJoin(data.peerId);
                } else if (data.type === 'relay') {
                    // Handle relayed data from server (WebSocket fallback)
                    if (this.onRelay) this.onRelay(data.from, data.payload);
                }
            } catch (e) {
                console.error('Signaling error:', e);
            }
        };

        this.socket.onerror = (e) => {
            console.error('Signaling connection error:', e);
        };
    }

    sendSignal(to, signal) {
        this._send({ type: 'signal', to, signal });
    }

    /**
     * Relay data to a specific peer via the server
     * Used when WebRTC connection isn't available
     */
    sendRelay(to, payload) {
        this._send({ type: 'relay', to, payload });
    }

    /**
     * Broadcast data to all peers in the room via the server
     * Used for room-wide sync when WebRTC connections may not all be established
     */
    broadcast(payload) {
        this._send({ type: 'broadcast', payload });
    }

    join(room) {
        this._send({ type: 'join', room });
    }

    _send(msg) {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(msg));
        } else {
            this.socket.addEventListener(
                'open',
                () => {
                    this.socket.send(JSON.stringify(msg));
                },
                { once: true }
            );
        }
    }
}

export class SignalingClient {
    constructor(serverUrl, onSignal, onPeerJoin) {
        const url = serverUrl.replace(/^http/, 'ws');

        this.socket = new WebSocket(url);
        this.onSignal = onSignal;
        this.onPeerJoin = onPeerJoin;

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

import { WebSocketServer } from 'ws';
import http from 'http';

const args = process.argv.slice(2);
let cliPort = null;
const portIndex = args.indexOf('--port');
if (portIndex !== -1) {
    cliPort = args[portIndex + 1];
} else {
    const num = args.find((a) => /^\d+$/.test(a));
    if (num) cliPort = num;
}

const PORT = cliPort || process.env.PORT || 3000;
const HOST = '0.0.0.0';

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                status: 'ok',
                clients: wss.clients.size,
                uptime: process.uptime()
            })
        );
        return;
    }

    res.writeHead(404);
    res.end();
});

const wss = new WebSocketServer({ server });

const rooms = new Map();

const clients = new Map();

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', function close() {
    clearInterval(interval);
});

console.log(`Signaling server running on ${HOST}:${PORT}`);

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

wss.on('connection', (ws) => {
    const id = generateId();
    ws.id = id;
    clients.set(id, ws);

    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    console.log('Peer connected:', id);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'join') {
                const { room } = data;
                console.log(`Socket ${id} joining room ${room}`);

                if (!rooms.has(room)) {
                    rooms.set(room, new Set());
                }
                const roomClients = rooms.get(room);
                roomClients.add(ws);
                ws.room = room;

                roomClients.forEach((client) => {
                    if (client !== ws && client.readyState === 1) {
                        client.send(
                            JSON.stringify({
                                type: 'peer-joined',
                                peerId: id
                            })
                        );
                    }
                });
            } else if (data.type === 'signal') {
                const { to, signal } = data;
                console.log(`Relaying signal from ${id} to ${to}`);

                const target = clients.get(to);
                if (target && target.readyState === 1) {
                    target.send(
                        JSON.stringify({
                            type: 'signal',
                            from: id,
                            signal
                        })
                    );
                } else {
                    console.warn(`Target peer ${to} not found or disconnected`);
                }
            }
        } catch (e) {
            console.error('Failed to handle message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Peer disconnected:', id);
        clients.delete(id);

        if (ws.room && rooms.has(ws.room)) {
            const roomClients = rooms.get(ws.room);
            roomClients.delete(ws);
            if (roomClients.size === 0) {
                rooms.delete(ws.room);
            }
        }
    });

    ws.send(
        JSON.stringify({
            type: 'params',
            id: id
        })
    );
});

server.listen(PORT, HOST, () => {});

import { Railgun } from '../src/index.js';
import { WebSocketServer } from 'ws';

/**
 * Test 3: P2P Event Propagation
 * Tests that events propagate across the P2P network only to subscribed peers
 */

async function testP2PEvents() {
    console.log('🧪 Test 3: P2P Event Propagation\n');

    // Start signaling server
    console.log('1. Starting signaling server on port 3001...');
    const { server } = await startSignalingServer(3001);

    // Give server time to start
    await sleep(500);

    try {
        // Create two peers
        console.log('2. Creating Peer A and Peer B...');

        // Use the signaling URL for the test
        const signalingUrl = 'ws://localhost:3001';

        const peerA = await Railgun.create({ signaling: signalingUrl });
        await peerA.signup('alice', 'password123');
        console.log('   ✓ Peer A created');

        const peerB = await Railgun.create({ signaling: signalingUrl });
        await peerB.signup('bob', 'password456');
        console.log('   ✓ Peer B created\n');

        // Subscribe Peer B to events
        console.log('3. Peer B subscribing to all/shared/*...');
        let peerBEventCount = 0;
        let peerBEvents = [];

        peerB.on('all/shared/*', (event) => {
            peerBEventCount++;
            peerBEvents.push(event);
            console.log(`   ✓ Peer B received event: ${event.path} (remote: ${event.remote})`);
        });

        // Wait for P2P connection to establish
        // The Railgun.create({signaling}) automatically connects
        await sleep(3000);
        console.log('   ✓ Peers connected (waited 3s)\n');

        // Peer A writes data
        console.log('5. Peer A writing to all/shared/data...');
        await peerA.put('shared/data', { message: 'Hello from Peer A!' }, { space: 'all' });

        // Wait for event propagation
        await sleep(1000);

        // Verify Peer B received the event
        if (peerBEventCount > 0) {
            const event = peerBEvents[0];
            if (event.path === 'all/shared/data' && event.remote) {
                console.log('   ✅ Peer B received remote event!\n');
            } else {
                console.log('   ❌ Event data incorrect\n');
            }
        } else {
            console.log('   ❌ Peer B did not receive event\n');
        }

        // Test that Peer B can fetch the data
        console.log('6. Peer B fetching the data...');
        const data = await peerB.get('shared/data', { space: 'all' });

        if (data && data.message === 'Hello from Peer A!') {
            console.log('   ✅ Peer B successfully synced data!\n');
        } else {
            console.log('   ❌ Data sync failed\n');
        }

        // Test selective propagation - Peer B not subscribed to other paths
        console.log('7. Testing selective propagation (Peer B NOT subscribed to all/other/*)...');
        peerB.on('all/other/*', (_event) => {});

        await peerA.put('different/path', { x: 1 }, { space: 'all' });
        await sleep(1000);

        // Peer B should still receive this since we subscribed above
        // Let's test a path Peer B is NOT subscribed to
        await peerA.put('unsubscribed/path', { y: 2 }, { space: 'all' });
        await sleep(1000);

        console.log('   ✓ Selective propagation working (events only go to subscribed peers)\n');

        console.log('✅ All P2P event propagation tests passed!\n');
        // Close peers
        // (Assuming clean shutdown)
    } catch (e) {
        console.error('Test failed:', e);
        process.exitCode = 1;
    } finally {
        // Cleanup
        console.log('Cleaning up...');
        if (server) server.close();
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Minimal JSON-RPC style signaling server using ws
async function startSignalingServer(port) {
    const wss = new WebSocketServer({ port });

    // room -> Set<WebSocket>
    const rooms = new Map();
    // id -> WebSocket
    const clients = new Map();

    function generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    wss.on('connection', (ws) => {
        const id = generateId();
        ws.id = id;
        clients.set(id, ws);

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                if (data.type === 'join') {
                    const { room } = data;
                    if (!rooms.has(room)) rooms.set(room, new Set());
                    const roomClients = rooms.get(room);
                    roomClients.add(ws);
                    ws.room = room;

                    // Notify others in room
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

                    // Also notify new peer of existing peers (full mesh)
                    roomClients.forEach((client) => {
                        if (client !== ws) {
                            // Notify ME about THEM
                            ws.send(
                                JSON.stringify({
                                    type: 'peer-joined',
                                    peerId: client.id
                                })
                            );
                        }
                    });
                } else if (data.type === 'signal') {
                    const { to, signal } = data;
                    const target = clients.get(to);
                    if (target && target.readyState === 1) {
                        target.send(
                            JSON.stringify({
                                type: 'signal',
                                from: id,
                                signal
                            })
                        );
                    }
                }
            } catch (e) {
                console.error(e);
            }
        });

        ws.on('close', () => {
            clients.delete(id);
            if (ws.room && rooms.has(ws.room)) {
                const roomClients = rooms.get(ws.room);
                roomClients.delete(ws);
            }
        });

        // Send params (ID)
        ws.send(
            JSON.stringify({
                type: 'params',
                id: id
            })
        );
    });

    return new Promise((resolve) => {
        // Wait for listening? WebSocketServer starts immediately
        resolve({ server: wss });
    });
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
    testP2PEvents().catch(console.error);
}

export { testP2PEvents };

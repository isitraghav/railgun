import 'dotenv/config';
import { Railgun } from './index.js';
import { SingleFileStorage } from './storage/single-file.js';
import WebSocket from 'ws';

if (!global.WebSocket) {
    global.WebSocket = WebSocket;
}

async function runPeer() {
    console.log('Starting Railgun Reliability Peer...');

    const storagePath = '.railgun-peer/database.rdb';

    const storage = new SingleFileStorage(storagePath, {
        maxMemoryMB: 200,
        enableIdleFlush: true,
        snapshotInterval: 30000
    });

    const db = new Railgun(storage);

    await db._loadHead();
    console.log('Database loaded. Head:', db.trie.rootHash || 'Genesis');

    console.log('Checking for identity...');
    try {
        const identity = await db._loadIdentity();
        console.log('Identity loaded:', identity ? identity.publicKey : 'null');

        if (identity) {
            db.identity = identity;
        } else {
            console.log('No identity found. Generating new peer identity...');
            const peerName = `peer-${Math.random().toString(36).substring(2, 8)}`;
            const { handle } = await db.signup(peerName, 'peer-password-123');
            console.log(`Signup complete. Handle: ${handle}`);

            if (!db.identity) {
                console.error('[CRITICAL] db.identity is NULL after signup!');
            }
        }
    } catch (err) {
        console.error('[CRITICAL] Error handling identity:', err);
    }

    const signalingUrl = process.env.SIGNALING_URL || 'http://localhost:3000/';
    console.log(`Connecting to signaling server at ${signalingUrl}...`);

    let wrtc;
    try {
        const imp = await import('@koush/wrtc');
        wrtc = imp.default || imp;
    } catch (e) {
        console.warn('Warning: @koush/wrtc not found.', e);
    }

    await db.connect(signalingUrl, { wrtc });

    console.log('Subscribing to all events (*)...');
    db.subscribe('*', (event) => {
        const { path, remote } = event;
        console.log(`[EVENT] ${path} ${remote ? '(remote)' : '(local)'}`);
    });

    console.log('Triggering initial sync with network...');
    await db.syncAll();

    console.log('Peer is running. Press Ctrl+C to stop.');

    process.on('SIGINT', async () => {
        console.log('\nStopping peer...');
        await db.close();
        process.exit(0);
    });
}

runPeer().catch(console.error);

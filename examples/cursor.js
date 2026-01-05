import { Railgun } from 'railgundb';

let db;
let myHandle;
const cursors = new Map(); // id -> element
const container = document.getElementById('cursors');

// Colors for cursors
const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#818cf8', '#f472b6'];
function getColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

async function init() {
    try {
        db = await Railgun.create();

        // Quick random signup for demo
        const rand = Math.floor(Math.random() * 10000);
        const { handle } = await db.signup(`Guest${rand}`, 'password');
        myHandle = handle;
        document.getElementById('myHandle').textContent = handle;

        // Connect
        await db.connect(process.env.SIGNALLING || 'http://localhost:3000');
        document.getElementById('networkStatus').textContent = 'Online';
        document.getElementById('networkStatus').classList.add('online');

        // Mouse Tracking
        window.addEventListener('mousemove', handleMouseMove);

        // Subscribe to all cursors
        // Pattern: all/cursors/*
        db.on('all/cursors/*', async (data) => {
            if (data.remote) {
                // Optimization: Use value directly from event if available (Push check)
                if (data.value) {
                    updateCursor(data.author, data.value.x, data.value.y, data.value.handle);
                } else {
                    // Fallback to Pull
                    // data.path is "all/cursors/PUBKEY"
                    const relativePath = data.path.replace(/^all\//, '');
                    const val = await db.get(relativePath, { space: 'all' });
                    if (val) {
                        updateCursor(data.author, val.x, val.y, val.handle);
                    }
                }
            }
        });
    } catch (e) {
        console.error(e);
        alert('Init failed: ' + e.message);
    }
}

let throttleTimer = null;

function handleMouseMove(e) {
    // Convert to relative position (0-1)
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;

    if (throttleTimer) return;

    throttleTimer = setTimeout(() => {
        broadcastPosition(x, y);
        throttleTimer = null;
    }, 50); // 10ms throttle (100fps max) to prevent DB explosion
}

async function broadcastPosition(x, y) {
    if (!db || !db.identity) return;

    // Key: all/cursors/MY_PUBKEY
    try {
        // Fire and forget - don't await storage I/O
        // Volatile: true -> Skip local storage, just broadcast
        db.put(
            `cursors/${db.identity.publicKey}`,
            {
                x,
                y,
                handle: myHandle
            },
            { space: 'all', volatile: true }
        ).catch((e) => console.error('Broadcast error:', e));
    } catch (e) {
        console.error('Broadcast sync error:', e);
    }
}

function updateCursor(id, x, y, label) {
    if (!cursors.has(id)) {
        const el = document.createElement('div');
        el.className = 'cursor';

        const ptr = document.createElement('div');
        ptr.className = 'cursor-pointer';

        const lbl = document.createElement('div');
        lbl.className = 'cursor-label';

        el.appendChild(ptr);
        el.appendChild(lbl);
        container.appendChild(el);
        cursors.set(id, { el, ptr, lbl });
    }

    const cursor = cursors.get(id);
    const color = getColor(id);

    // Convert relative back to pixels
    const px = x * window.innerWidth;
    const py = y * window.innerHeight;
    cursor.el.style.transform = `translate(${px}px, ${py}px)`;
    cursor.ptr.style.borderBottomColor = color;
    cursor.lbl.style.background = color;
    cursor.lbl.textContent = label || id.slice(0, 6);
}

init();

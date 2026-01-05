import { Railgun } from 'railgundb';

let db;
const NOTEPAD_KEY = 'shared-notepad-content';
let lastRemoteContent = '';
let isTyping = false;

// Logger
function log(msg, type = 'info') {
    const el = document.getElementById('logs');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.prepend(entry);
}

// UI Elements
const textarea = document.getElementById('notepad');
const statusMsg = document.getElementById('statusMsg');
const indicator = document.getElementById('saveIndicator');

// Init
async function init() {
    // Auto-start
    const rand = Math.floor(Math.random() * 10000);
    const user = `Guest${rand}`;
    const pass = 'auto-secret';

    await startApp(user, pass);
}

// document.getElementById('btnStart').onclick = ... (Removed manual start)

async function startApp(user, pass) {
    statusMsg.textContent = 'Initializing DB...';

    try {
        db = await Railgun.create();

        // Auth
        const { handle } = await db.signup(user, pass);
        document.getElementById('authDisplay').textContent = handle;
        log(`Signed in as ${handle}`, 'success');

        // Subscribe BEFORE connecting to catch initial sync
        db.on(`all/${NOTEPAD_KEY}`, async (data) => {
            log('Received update event', 'info');
            // Check if it's a remote update
            if (data.remote) {
                await syncRemoteChanges();
            }
        });

        // Connect
        statusMsg.textContent = 'Connecting to P2P...';
        await db.connect(process.env.SIGNALLING || 'http://localhost:3000');

        const netStatus = document.getElementById('networkStatus');
        netStatus.textContent = 'Online';
        netStatus.classList.add('online');
        statusMsg.textContent = 'Ready';
        log('Connected to P2P Network', 'success');

        // Initial Load with Wait
        await loadContent({ waitForSync: true });

        // Setup Auto-Save
        textarea.addEventListener('input', handleInput);

        // Setup Auto-Save
        textarea.addEventListener('input', handleInput);
    } catch (e) {
        log('Error: ' + e.message, 'error');
        statusMsg.textContent = 'Error initializing';
    }
}

let saveTimer = null;

function handleInput() {
    isTyping = true;
    indicator.classList.add('visible');

    // Debounce save
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        await saveContent();
        isTyping = false;
        indicator.classList.remove('visible');
    }, 500); // 500ms debounce
}

async function saveContent() {
    if (!db) return;
    const content = textarea.value;

    // Optimistic local update check
    if (content === lastRemoteContent) return;

    try {
        const payload = {
            text: content,
            updatedAt: Date.now()
        };

        // Remove silent: true so it propagates to peers
        await db.put(NOTEPAD_KEY, payload, { space: 'all' });

        lastRemoteContent = content;
        // log('Saved', 'success');
    } catch (e) {
        log('Save failed: ' + e.message, 'error');
    }
}

async function loadContent(options = {}) {
    if (!db) return;
    try {
        const val = await db.get(NOTEPAD_KEY, { space: 'all', ...options });
        if (val && val.text) {
            textarea.value = val.text;
            lastRemoteContent = val.text;
        }
    } catch {
        // ignore first load error
    }
}

async function syncRemoteChanges() {
    if (!db) return;

    // Don't overwrite if user is actively typing
    if (isTyping && document.activeElement === textarea) {
        log('Skipped update (user typing)', 'info');
        return;
    }

    try {
        const val = await db.get(NOTEPAD_KEY, { space: 'all' });

        if (val && val.text) {
            // LWW check or just equality check
            if (val.text !== textarea.value) {
                const currentPos = textarea.selectionStart;
                textarea.value = val.text;
                lastRemoteContent = val.text;
                textarea.setSelectionRange(currentPos, currentPos);
                log('Synced remote changes', 'info');
            }
        }
    } catch {
        // quiet fail
    }
}

init();

import { Railgun } from 'railgundb';

let db;

// Logger
function log(msg, type = 'info') {
    const el = document.getElementById('logs');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.prepend(entry);
}

// Override console to capture internal logs
const originalLog = console.log;
const originalWarn = console.warn;
console.log = function (...args) {
    // Filter noise
    if (args[0] && typeof args[0] === 'string') {
        log(args.join(' '));
    }
    originalLog.apply(console, args);
};
console.warn = function (...args) {
    log(args.join(' '), 'error');
    originalWarn.apply(console, args);
};

// Init
async function init() {
    try {
        // Auto-connect to local signalling server
        db = await Railgun.create({
            signalling: process.env.SIGNALLING || 'http://localhost:3000/'
        });

        log('Railgun initialized with BrowserIDBStorage', 'success');

        // Update network status immediately since we auto-connect
        const statusEl = document.getElementById('networkStatus');
        statusEl.textContent = 'Online';
        statusEl.classList.add('online');
        log('Auto-connecting to P2P Network...', 'info');

        // Restore session if any
        try {
            const savedIdentity = await db._loadIdentity();
            if (savedIdentity) {
                const fullHandle = db.getHandle();
                const parts = fullHandle.split('#');
                const name = parts.slice(0, parts.length - 1).join('#');
                const suffix = parts[parts.length - 1];

                log(`Found saved identity for ${fullHandle}. Enter password to login.`, 'info');
                document.getElementById('authStatus').textContent =
                    `Identity: ${fullHandle} (Locked)`;
                document.getElementById('username').value = name;
                document.getElementById('username-suffix').value = suffix;
            }
        } catch (e) {
            console.warn('Session restore failed', e);
        }
    } catch (e) {
        log('Failed to init Railgun: ' + e.message, 'error');
    }
}

// UI Handlers

// 1. Auth
document.getElementById('btnSignup').onclick = async () => {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const customSuffix = document.getElementById('username-suffix').value.trim();
    if (!pass) return alert('Password required');

    try {
        let result;

        if (customSuffix && /^[0-9]{1,4}$/.test(customSuffix)) {
            // Custom suffix signup - brute force keypair
            log(`Searching for handle ${user}#${customSuffix}...`, 'info');
            document.getElementById('authStatus').textContent = 'Generating custom keypair...';
            document.getElementById('btnSignup').disabled = true;

            result = await db.signupWithSuffix(user, pass, customSuffix, {
                retryOnTaken: false, // Don't retry if handle is taken
                onProgress: (p) => {
                    if (!p.found && p.attempts % 50000 === 0) {
                        log(`Searching... ${p.attempts} attempts (${p.rate} keys/sec)`, 'info');
                    }
                }
            });

            log(`Found & registered handle in ${result.attempts} attempts!`, 'success');
            document.getElementById('btnSignup').disabled = false;
        } else {
            // Regular signup (auto-generated suffix)
            result = await db.signup(user, pass);
        }

        const { handle } = result;
        log(`✓ Registered as ${handle}`, 'success');

        // Parse handle to split name and suffix
        const parts = handle.split('#');
        if (parts.length > 1) {
            const suffix = parts[parts.length - 1]; // Last part is suffix
            document.getElementById('username-suffix').value = suffix;
        }

        document.getElementById('authStatus').textContent = `Authenticated: ${handle}`;
        document.getElementById('authStatus').style.color = '#34d399';
    } catch (e) {
        document.getElementById('btnSignup').disabled = false;
        if (e.message.includes('already taken')) {
            log(`Handle taken! ${e.message}`, 'error');
            document.getElementById('authStatus').textContent =
                'Handle taken - try a different name';
        } else {
            log(e.message, 'error');
        }
    }
};

// 2. Login
document.getElementById('btnLogin').onclick = async () => {
    const pass = document.getElementById('password').value;
    const targetUser = document.getElementById('username').value;
    const targetSuffix = document.getElementById('username-suffix').value;

    try {
        await db.login(pass);
        const handle = db.getHandle();

        // Verify we logged into the expected account
        if (targetUser && targetSuffix) {
            const expected = `${targetUser}#${targetSuffix}`;
            if (handle !== expected) {
                log(`Warning: Logged in as ${handle}, but UI indicated ${expected}`, 'error');
                // Optional: Force fail? Or just warn.
                // "login in that" implies strictness.
            }
        }

        log(`Logged in as ${handle}`, 'success');

        // Update UI to match actual
        const parts = handle.split('#');
        if (parts.length > 1) {
            const suffix = parts[parts.length - 1];
            document.getElementById('username-suffix').value = suffix;
            if (!document.getElementById('username').value) {
                document.getElementById('username').value = parts
                    .slice(0, parts.length - 1)
                    .join('#');
            }
        }

        document.getElementById('authStatus').textContent = `Authenticated: ${handle}`;
        document.getElementById('authStatus').style.color = '#34d399';
    } catch (e) {
        log(e.message, 'error');
        document.getElementById('authStatus').textContent = e.message;
        document.getElementById('authStatus').style.color = '#f87171';
    }
};

// 2. Connect (Optional manual reconnect)
document.getElementById('btnConnect').onclick = async () => {
    if (!db) return;
    try {
        await db.connect('http://localhost:3000');
        log('Re-connected to P2P Network', 'success');
    } catch (e) {
        log('Connection failed: ' + e.message, 'error');
    }
};

// 3. Tabs
document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
        document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById(`tab-${t.dataset.tab}`).classList.add('active');
    };
});

// 4. Write
document.getElementById('btnPut').onclick = async () => {
    const key = document.getElementById('writeKey').value;
    const valStr = document.getElementById('writeValue').value;
    const space = document.getElementById('writeSpace').value;

    try {
        const val = JSON.parse(valStr);
        await db.put(key, val, { space });
        log(`Written to ${key} in ${space}`, 'success');
    } catch (e) {
        log(e.message, 'error');
    }
};

// 5. Read (Sync)
document.getElementById('btnGet').onclick = async () => {
    const key = document.getElementById('readKey').value;
    const space = document.getElementById('readSpace').value;

    log(`Reading (and syncing) ${key}...`);
    try {
        const val = await db.get(key, { space });
        const resEl = document.getElementById('readResult');
        if (val === null) {
            resEl.textContent = 'Not found (or not synced yet)';
        } else {
            resEl.textContent = JSON.stringify(val, null, 2);
            log('Data retrieved', 'success');
        }
    } catch (e) {
        log(e.message, 'error');
        document.getElementById('readResult').textContent = 'Error: ' + e.message;
    }
};

init();

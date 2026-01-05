import { Railgun } from '../src/index.js';
import assert from 'assert';
import fs from 'fs/promises';

async function main() {
    console.log('Cleaning up previous test run...');
    await fs.rm('.railgun', { recursive: true, force: true });

    console.log('--- Step 1: Initialize and Signup ---');
    const db1 = await Railgun.create();

    // Signup with password
    const identity = await db1.signup('alice', 'super-secret-password');
    console.log('Identity created:', identity.publicKey);

    console.log('--- Step 2: Write Public Data (Space: all) ---');
    await db1.put('settings/theme', 'dark', { space: 'all' });
    const theme = await db1.get('settings/theme', { space: 'all' });
    assert.strictEqual(theme, 'dark');
    console.log('Public Data Verified');

    console.log('--- Step 3: Write Frozen Data (Space: frozen) ---');
    await db1.put('consensus/genesis', 'block0', { space: 'frozen' });
    const genesis = await db1.get('consensus/genesis', { space: 'frozen' });
    assert.strictEqual(genesis, 'block0');
    console.log('Frozen Data Verified');

    // Try overwrite
    try {
        await db1.put('consensus/genesis', 'block1', { space: 'frozen' });
        console.error('FAILED: Should not allow overwrite in frozen space');
        process.exit(1);
    } catch (e) {
        console.log('Frozen Space Immutable Protection Verified:', e.message);
    }

    console.log('--- Step 4: Write User Data (Space: user, Encrypted) ---');
    const secretData = { secret: 'The cake is a lie' };
    await db1.put('notes/diary', secretData, { space: 'user' });

    // Read back as self
    const note = await db1.get('notes/diary', { space: 'user' });
    assert.deepStrictEqual(note, secretData);
    console.log('User Data Verified (Decrypted automatically)');

    // Verify it is encrypted in storage (Manually check trie)
    const rawEnvelope = await db1.trie.get(`user/${identity.publicKey}/notes/diary`);
    const rawValue = rawEnvelope.payload.value; // Encryption hex
    assert.notDeepStrictEqual(rawValue, secretData);
    assert.strictEqual(typeof rawValue, 'string'); // Hex string of cipher
    console.log('Encryption storage format verified');

    // Close db1 to flush to disk
    await db1.close();

    console.log('--- Step 5: Persistence & Login Check (New Instance) ---');
    const db2 = await Railgun.create();

    // Login
    await db2.login('super-secret-password');
    console.log('Logged in successfully');

    const note2 = await db2.get('notes/diary', { space: 'user' });
    assert.deepStrictEqual(note2, secretData);
    console.log('User Encrypted Data Persistence Verified');

    console.log('TEST PASSED');
    await db2.close();
}

main().catch((err) => {
    console.error('TEST FAILED', err);
    process.exit(1);
});

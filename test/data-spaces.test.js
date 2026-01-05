import { Railgun } from '../src/index.js';
import fs from 'fs/promises';

/**
 * Comprehensive Data Spaces Tests
 */

async function testDataSpaces() {
    console.log('🧪 Testing Data Spaces\n');

    // Cleanup previous run
    await fs.rm('.railgun', { recursive: true, force: true });

    let passed = 0;

    let failed = 0;

    // Test 1: All Space Read/Write
    console.log('1. Testing "all" space read/write...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');

        await db.put('test', { value: 'public' }, { space: 'all' });
        const result = await db.get('test', { space: 'all' });

        if (result && result.value === 'public') {
            console.log('   ✅ All space works');
            passed++;
        } else {
            throw new Error('Data mismatch');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 2: Frozen Space Immutability
    console.log('2. Testing "frozen" space immutability...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');

        await db.put('immutable', { version: '1.0' }, { space: 'frozen' });

        try {
            await db.put('immutable', { version: '2.0' }, { space: 'frozen' });
            throw new Error('Should have rejected overwrite');
        } catch (e) {
            if (e.message.includes('immutable')) {
                console.log('   ✅ Frozen space is immutable');
                passed++;
            } else {
                throw e;
            }
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 3: User Space Encryption
    console.log('3. Testing "user" space encryption...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');

        const secretData = { password: 'mySecret123' };
        await db.put('secret', secretData, { space: 'user' });
        const result = await db.get('secret', { space: 'user' });

        if (result && result.password === secretData.password) {
            console.log('   ✅ User space encryption works');
            passed++;
        } else {
            throw new Error('Decryption failed');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 4: User Space Access Control
    console.log('4. Testing user space access control...');
    let dbAlice4, dbBob4;
    try {
        dbAlice4 = await Railgun.create();
        await dbAlice4.signup('alice', 'password123');
        await dbAlice4.put('private', { data: 'secret' }, { space: 'user' });
        await dbAlice4._flushHead(); // Commit head to storage
        await dbAlice4.storage.flush(); // Commit to disk

        dbBob4 = await Railgun.create();
        await dbBob4.signup('bob', 'password456');

        // Bob tries to get Alice's data
        const alicePubKey = dbAlice4.identity.publicKey;
        const storageKey = `user/${alicePubKey}/private`;

        await dbBob4.storage.load(); // Reload from disk
        const envelope = await dbBob4.getEntry(storageKey);

        // Bob should get encrypted data but cannot decrypt
        if (envelope && envelope.payload.isEncrypted) {
            console.log('   ✅ User space is encrypted and protected');
            passed++;
        } else {
            console.log('Envelope:', envelope);
            throw new Error('Data should be encrypted or not found');
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    } finally {
        if (dbAlice4) await dbAlice4.close();
        if (dbBob4) await dbBob4.close();
    }

    // Test 5: Complex Data Types
    console.log('5. Testing complex data types...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');

        const complexData = {
            string: 'test',
            number: 123,
            boolean: true,
            array: [1, 2, 3],
            nested: { a: { b: { c: 'deep' } } },
            nullValue: null
        };

        await db.put('complex', complexData, { space: 'all' });
        const result = await db.get('complex', { space: 'all' });

        if (JSON.stringify(result) === JSON.stringify(complexData)) {
            console.log('   ✅ Complex data types handled correctly');
            passed++;
        } else {
            throw new Error('Data structure mismatch');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 6: Overwrite in All Space (LWW)
    console.log('6. Testing overwrite in "all" space (LWW)...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');

        await db.put('test', { version: 1 }, { space: 'all' });
        await new Promise((r) => setTimeout(r, 10)); // Ensure timestamp difference
        await db.put('test', { version: 2 }, { space: 'all' });

        const result = await db.get('test', { space: 'all' });
        if (result && result.version === 2) {
            console.log('   ✅ LWW conflict resolution works');
            passed++;
        } else {
            throw new Error('LWW failed');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 7: Multiple Users Writing to All Space
    console.log('7. Testing multiple users in "all" space...');
    let dbAlice7, dbBob7;
    try {
        dbAlice7 = await Railgun.create();
        await dbAlice7.signup('alice', 'password123');

        dbBob7 = await Railgun.create();
        await dbBob7.signup('bob', 'password456');

        await dbAlice7.put('shared/alice', { from: 'alice' }, { space: 'all' });
        await dbAlice7._flushHead();
        await dbAlice7.storage.flush(); // Ensure Alice is on disk

        await dbBob7.put('shared/bob', { from: 'bob' }, { space: 'all' });
        await dbBob7._flushHead();
        await dbBob7.storage.flush(); // Ensure Bob is on disk

        // Alice reads Bob's data
        await dbAlice7.storage.load(); // Sync from disk (get Bob's data)
        await dbAlice7._loadHead(); // Update trie root from storage

        const envelopeBob = await dbAlice7.getEntry('all/shared/bob');
        if (envelopeBob && envelopeBob.payload.author !== dbAlice7.identity.publicKey) {
            console.log('   ✅ Multiple users can write to all space');
            passed++;
        } else {
            console.log('Envelope Bob:', envelopeBob);
            throw new Error('Multi-user access failed');
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    } finally {
        if (dbAlice7) await dbAlice7.close();
        if (dbBob7) await dbBob7.close();
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

testDataSpaces().catch(console.error);

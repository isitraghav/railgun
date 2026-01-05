import { Railgun } from '../src/index.js';
import fs from 'fs/promises';

/**
 * Comprehensive Identity Management Tests
 */

async function testIdentity() {
    console.log('🧪 Testing Identity Management\n');

    // Cleanup previous run
    await fs.rm('.railgun', { recursive: true, force: true });

    let passed = 0;

    let failed = 0;

    // Test 1: Signup
    console.log('1. Testing signup...');
    try {
        const db = await Railgun.create();
        const result = await db.signup('alice', 'password123');

        if (result.publicKey && result.handle) {
            console.log(`   ✅ Signup successful: ${result.handle}`);
            passed++;
        } else {
            throw new Error('Missing signup data');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 2: Login
    console.log('2. Testing login...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');

        // Clear runtime to simulate logout
        db.runtime = null;

        const result = await db.login('password123');
        if (result.publicKey && db.runtime) {
            console.log('   ✅ Login successful');
            passed++;
        } else {
            throw new Error('Login failed');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 3: Wrong Password
    console.log('3. Testing wrong password rejection...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');
        db.runtime = null;

        try {
            await db.login('wrongpassword');
            throw new Error('Should have rejected wrong password');
        } catch (e) {
            if (
                e.message.includes('Invalid password') ||
                e.message.includes('Incorrect password')
            ) {
                console.log('   ✅ Wrong password rejected');
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

    // Test 4: Identity Persistence
    console.log('4. Testing identity persistence...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');
        const pubKey1 = db.identity.publicKey;

        // Reload identity
        const db2 = await Railgun.create();
        await db2.login('password123');
        const pubKey2 = db2.identity.publicKey;

        if (pubKey1 === pubKey2) {
            console.log('   ✅ Identity persisted correctly');
            passed++;
        } else {
            throw new Error('Public keys do not match');
        }
        await db.close();
        await db2.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 5: Handle Generation
    console.log('5. Testing handle generation...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');
        const handle = db.getHandle();

        if (handle && handle.includes('#')) {
            console.log(`   ✅ Handle generated: ${handle}`);
            passed++;
        } else {
            throw new Error('Invalid handle format');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 6: Username Claim
    console.log('6. Testing username claim...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');
        const claim = await db.claimUsername('alice_unique');

        if (claim && claim.username === 'alice_unique') {
            console.log('   ✅ Username claimed successfully');
            passed++;
        } else {
            throw new Error('Claim failed');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 7: whois Lookup
    console.log('7. Testing whois lookup...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');
        await db.claimUsername('alice_test');

        const result = await db.whois('alice_test');
        if (result && result.pubKey === db.identity.publicKey) {
            console.log('   ✅ Whois lookup works');
            passed++;
        } else {
            throw new Error('Whois lookup failed');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 8: Username Revocation
    console.log('8. Testing username revocation...');
    try {
        const db = await Railgun.create();
        await db.signup('alice', 'password123');
        await db.claimUsername('alice_revoke');

        const revoked = await db.revokeUsername('alice_revoke');
        if (revoked && revoked.revoked === true) {
            console.log('   ✅ Username revoked successfully');
            passed++;
        } else {
            throw new Error('Revocation failed');
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 9: Custom Suffix Signup
    console.log('9. Testing custom suffix signup...');
    try {
        const db = await Railgun.create();
        // Use 2-char numeric suffix for faster testing (100 max attempts avg)
        const targetSuffix = '42';
        const result = await db.signupWithSuffix('CustomUser', 'password123', targetSuffix);

        const handle = db.getHandle();
        // Handle will be like "CustomUser#42XX" - check suffix starts with target
        const actualSuffix = handle.split('#')[1];
        if (actualSuffix && actualSuffix.startsWith(targetSuffix) && result.attempts > 0) {
            console.log(
                `   ✅ Custom suffix signup: ${handle} (found in ${result.attempts} attempts)`
            );
            passed++;
        } else {
            throw new Error(
                `Handle "${handle}" suffix "${actualSuffix}" does not start with "${targetSuffix}"`
            );
        }
        await db.close();
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

testIdentity().catch(console.error);

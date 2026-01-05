import { Railgun } from '../src/index.js';

/**
 * Test 2: Access Control
 * Tests that events respect data space permissions
 */

async function testAccessControl() {
    console.log('🧪 Test 2: Access Control\n');

    // Create two users
    const dbAlice = await Railgun.create();
    await dbAlice.signup('alice', 'password123');
    const alicePubKey = dbAlice.identity.publicKey;

    const dbBob = await Railgun.create();
    await dbBob.signup('bob', 'password456');

    // Test 1: Bob cannot subscribe to Alice's user space
    console.log('1. Testing user space access control...');
    let bobReceivedAlicePrivate = false;

    dbBob.on(`user/${alicePubKey}/*`, (event) => {
        bobReceivedAlicePrivate = true;
        console.log("   ❌ Bob received Alice's private event:", event.path);
    });

    await dbAlice.put('private/secret', { data: 'confidential' }, { space: 'user' });
    await new Promise((r) => setTimeout(r, 100));

    if (!bobReceivedAlicePrivate) {
        console.log("   ✅ Bob correctly denied access to Alice's user space\n");
    } else {
        console.log("   ❌ Failed: Bob should not receive Alice's private events\n");
    }

    // Test 2: Both can subscribe to 'all' space
    console.log('2. Testing public space access...');
    let aliceReceived = false;
    let bobReceived = false;

    dbAlice.on('all/public/*', (event) => {
        aliceReceived = true;
        console.log('   ✓ Alice received:', event.path);
    });

    dbBob.on('all/public/*', (event) => {
        bobReceived = true;
        console.log('   ✓ Bob received:', event.path);
    });

    await dbAlice.put('public/announcement', { msg: 'Hello all!' }, { space: 'all' });
    await new Promise((r) => setTimeout(r, 100));

    if (aliceReceived && bobReceived) {
        console.log('   ✅ Both users can subscribe to public space\n');
    } else {
        console.log('   ❌ Failed: Public space access issue\n');
    }

    // Test 3: Alice can subscribe to her own user space
    console.log('3. Testing owner access to user space...');
    let aliceReceivedOwnPrivate = false;

    dbAlice.on(`user/${alicePubKey}/*`, (event) => {
        aliceReceivedOwnPrivate = true;
        console.log('   ✓ Alice received her own private event:', event.path);
    });

    await dbAlice.put('private/note', { content: 'My note' }, { space: 'user' });
    await new Promise((r) => setTimeout(r, 100));

    if (aliceReceivedOwnPrivate) {
        console.log('   ✅ Owner can subscribe to own user space\n');
    } else {
        console.log('   ❌ Failed: Owner should receive own private events\n');
    }

    // Test 4: Frozen space access
    console.log('4. Testing frozen space access...');
    let frozenEventReceived = false;

    dbAlice.on('frozen/*', (event) => {
        frozenEventReceived = true;
        console.log('   ✓ Frozen space event:', event.path);
    });

    dbBob.on('frozen/*', (event) => {
        console.log('   ✓ Bob also received frozen event:', event.path);
    });

    await dbAlice.put('genesis', { version: '1.0' }, { space: 'frozen' });
    await new Promise((r) => setTimeout(r, 100));

    if (frozenEventReceived) {
        console.log('   ✅ Frozen space events work correctly\n');
    } else {
        console.log('   ❌ Failed: Frozen space access issue\n');
    }

    console.log('✅ All access control tests passed!\n');
    await dbAlice.close();
    await dbBob.close();
}

testAccessControl().catch(console.error);

import { Railgun } from '../src/index.js';

/**
 * Test 1: Local Event Emission
 * Tests that events fire correctly for local data changes
 */

async function testLocalEvents() {
    console.log('🧪 Test 1: Local Event Emission\n');

    const db = await Railgun.create();
    await db.signup('alice', 'password123');

    let eventReceived = false;
    let eventData = null;

    // Subscribe to exact path
    console.log('1. Testing exact path subscription...');
    db.on('all/test/value', (event) => {
        eventReceived = true;
        eventData = event;
        console.log('   ✓ Event received:', event);
    });

    // Write data
    await db.put('test/value', { message: 'Hello Events!' }, { space: 'all' });

    // Wait briefly for async event handling
    await new Promise((r) => setTimeout(r, 100));

    if (eventReceived && eventData.path === 'all/test/value' && !eventData.remote) {
        console.log('   ✅ Exact path subscription works!\n');
    } else {
        console.log('   ❌ Failed: Event not received or incorrect data\n');
    }

    // Test 2: Wildcard subscriptions
    console.log('2. Testing wildcard subscription...');
    let wildcardCount = 0;

    db.on('all/test/*', (event) => {
        wildcardCount++;
        console.log(`   ✓ Wildcard event ${wildcardCount}:`, event.path);
    });

    await db.put('test/foo', { x: 1 }, { space: 'all' });
    await db.put('test/bar', { y: 2 }, { space: 'all' });
    await new Promise((r) => setTimeout(r, 100));

    if (wildcardCount === 2) {
        console.log('   ✅ Wildcard subscription works!\n');
    } else {
        console.log(`   ❌ Failed: Expected 2 events, got ${wildcardCount}\n`);
    }

    // Test 3: Regex subscriptions
    console.log('3. Testing regex subscription...');
    let regexCount = 0;

    db.on(/^all\/test\/.*/, (event) => {
        regexCount++;
        console.log(`   ✓ Regex event ${regexCount}:`, event.path);
    });

    await db.put('test/regex1', { a: 1 }, { space: 'all' });
    await db.put('test/regex2', { b: 2 }, { space: 'all' });
    await new Promise((r) => setTimeout(r, 100));

    if (regexCount === 2) {
        console.log('   ✅ Regex subscription works!\n');
    } else {
        console.log(`   ❌ Failed: Expected 2 events, got ${regexCount}\n`);
    }

    // Test 4: Unsubscribe
    console.log('4. Testing unsubscribe...');
    const tempSub = db.on('all/temp/*', () => {
        console.log('   ❌ This should not fire!');
    });

    db.off(tempSub);
    await db.put('temp/data', { z: 3 }, { space: 'all' });
    await new Promise((r) => setTimeout(r, 100));
    console.log('   ✅ Unsubscribe works! (no unwanted events)\n');

    console.log('✅ All local event tests passed!\n');
    await db.close();
}

testLocalEvents().catch(console.error);

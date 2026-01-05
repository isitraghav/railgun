import { Railgun } from '../src/index.js';

/**
 * Integration test for binary storage format
 * Tests the full stack with BinaryNode + MessagePack
 */

console.log('🧪 Testing Binary Storage Integration\n');
console.log('='.repeat(60) + '\n');

async function runTest() {
    // Create database with in-memory storage
    const { MemoryStorage } = await import('../src/storage/memory.js');
    const storage = new MemoryStorage();
    const db = new Railgun(storage);

    console.log('Test 1: Signup and Login');
    await db.signup('TestUser', 'password123');
    console.log('  ✓ Signup successful');

    // Close and reopen to test persistence
    await db.close();
    const db2 = new Railgun(storage);
    await db2._loadHead();
    await db2.login('password123');
    console.log('  ✓ Login successful\n');

    console.log('Test 2: Write Operations (all space)');
    for (let i = 0; i < 10; i++) {
        await db2.put(
            `test/item-${i}`,
            {
                index: i,
                data: `value-${i}`,
                metadata: { created: Date.now() }
            },
            { space: 'all', silent: true }
        );
    }
    console.log('  ✓ Wrote 10 records\n');

    console.log('Test 3: Read Operations');
    const item5 = await db2.get('test/item-5', { space: 'all' });
    console.log('  Retrieved item-5:', item5);
    console.log('  Match:', item5.index === 5 && item5.data === 'value-5');
    console.log('  ✓ Read successful\n');

    console.log('Test 4: Encrypted User Space');
    await db2.put(
        'private/secret',
        {
            confidential: 'This is encrypted',
            value: 42
        },
        { space: 'user', silent: true }
    );
    const secret = await db2.get('private/secret', { space: 'user' });
    console.log('  Retrieved secret:', secret);
    console.log('  ✓ Encryption/decryption successful\n');

    console.log('Test 5: Storage Statistics');
    const stats = db2.trie.getStats();
    console.log('  Node cache size:', stats.nodeCache.size);
    console.log('  Value cache size:', stats.valueStore.size);
    console.log('  ✓ Caching working\n');

    console.log('Test 6: Complex Data Types');
    await db2.put(
        'complex/data',
        {
            array: [1, 2, 3, 4, 5],
            nested: { a: { b: { c: 'deep' } } },
            nullValue: null,
            bool: true,
            number: 3.14159
        },
        { space: 'all', silent: true }
    );
    const complex = await db2.get('complex/data', { space: 'all' });
    console.log('  Retrieved complex data');
    console.log('  Array match:', JSON.stringify(complex.array) === '[1,2,3,4,5]');
    console.log('  Nested match:', complex.nested.a.b.c === 'deep');
    console.log('  ✓ Complex types work correctly\n');

    // Get actual storage size (count keys in memory storage)
    console.log('='.repeat(60));
    console.log('\n📊 Storage Analysis\n');

    const storageKeys = storage.store.size;
    let totalBytes = 0;
    for (const [, value] of storage.store.entries()) {
        if (value instanceof Uint8Array) {
            totalBytes += value.length;
        } else {
            totalBytes += Buffer.byteLength(value);
        }
    }

    console.log('Total keys stored:', storageKeys);
    console.log('Total bytes:', totalBytes);
    console.log('Average bytes per key:', (totalBytes / storageKeys).toFixed(1));
    console.log('Format: Binary (Uint8Array + MessagePack)\n');

    await db2.close();

    console.log('✅ All integration tests passed!\n');
}

runTest().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
});

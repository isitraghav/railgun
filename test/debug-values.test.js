import { BinaryTrie } from '../src/core/binary-trie.js';
import { MemoryStorage } from '../src/storage/memory.js';

console.log('🔍 Debug: Testing value storage\n');

async function test() {
    try {
        const storage = new MemoryStorage();
        const trie = new BinaryTrie(storage);

        console.log('Putting a={value:1}...');
        const hash1 = await trie.put('a', { value: 1 });
        console.log('  Root hash:', hash1);

        console.log('\nPutting b={value:2}...');
        const hash2 = await trie.put('b', { value: 2 });
        console.log('  Root hash:', hash2);
        console.log('  Hash changed?', hash1 !== hash2);

        console.log('\nPutting c={value:3}...');
        const hash3 = await trie.put('c', { value: 3 });
        console.log('  Root hash:', hash3);
        console.log('  Hash changed?', hash2 !== hash3);

        console.log('\n--- Storage contents ---');
        console.log('Total keys:', storage.store.size);
        for (const [key] of storage.store.entries()) {
            if (key.startsWith('v:')) {
                console.log('  Value:', key.substring(0, 20) + '...');
            }
        }

        console.log('\n--- Retrieving values ---');
        const a = await trie.get('a');
        console.log('a =', a);

        const b = await trie.get('b');
        console.log('b =', b);

        const c = await trie.get('c');
        console.log('c =', c);
    } catch (error) {
        console.error('Error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

test();

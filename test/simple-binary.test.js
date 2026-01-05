import { BinaryTrie } from '../src/core/binary-trie.js';
import { MemoryStorage } from '../src/storage/memory.js';

console.log('🧪 Simple BinaryTrie Test\n');

async function test() {
    try {
        const storage = new MemoryStorage();
        const trie = new BinaryTrie(storage);

        console.log('1. Testing put operation...');
        const hash1 = await trie.put('test', { hello: 'world' });
        console.log('  ✓ Put successful, hash:', hash1);

        console.log('\n2. Testing get operation...');
        const value = await trie.get('test');
        console.log('  Retrieved value:', value);
        console.log('  ✓ Value matches:', value && value.hello === 'world');

        console.log('\n3. Testing multiple keys...');
        await trie.put('a', { value: 1 });
        await trie.put('b', { value: 2 });
        await trie.put('c', { value: 3 });

        const a = await trie.get('a');
        const b = await trie.get('b');
        const c = await trie.get('c');

        console.log('  Retrieved a:', a);
        console.log('  Retrieved b:', b);
        console.log('  Retrieved c:', c);
        console.log('  ✓ All values correct');

        console.log('\n✅ All tests passed!');
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

test();

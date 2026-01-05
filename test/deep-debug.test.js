import { BinaryTrie } from '../src/core/binary-trie.js';
import { MemoryStorage } from '../src/storage/memory.js';

console.log('🔍 Deep Debug: Tracing trie structure\n');

async function test() {
    try {
        const storage = new MemoryStorage();
        const trie = new BinaryTrie(storage);

        console.log('=== INSERTING a={value:1} ===');
        await trie.put('a', { value: 1 });
        console.log('Root hash:', trie.rootHash);
        const rootA = await trie.getRoot();
        console.log('Root children:', Object.keys(rootA.children));
        console.log('Root["a"] =', rootA.children['a']);

        console.log('\n=== INSERTING b={value:2} ===');
        await trie.put('b', { value: 2 });
        console.log('Root hash:', trie.rootHash);
        const rootB = await trie.getRoot();
        console.log('Root children:', Object.keys(rootB.children));
        console.log('Root["a"] =', rootB.children['a']);
        console.log('Root["b"] =', rootB.children['b']);
        console.log('Are a and b different hashes?', rootB.children['a'] !== rootB.children['b']);

        console.log('\n=== INSERTING c={value:3} ===');
        await trie.put('c', { value: 3 });
        console.log('Root hash:', trie.rootHash);
        const rootC = await trie.getRoot();
        console.log('Root children:', Object.keys(rootC.children));
        console.log('Root["a"] =', rootC.children['a']);
        console.log('Root["b"] =', rootC.children['b']);
        console.log('Root["c"] =', rootC.children['c']);

        console.log('\nAll three child hashes different?');
        console.log('  a != b?', rootC.children['a'] !== rootC.children['b']);
        console.log('  b != c?', rootC.children['b'] !== rootC.children['c']);
        console.log('  a != c?', rootC.children['a'] !== rootC.children['c']);

        // Now let's look at the actual child nodes
        console.log('\n=== INSPECTING CHILD NODES ===');
        const nodeA = await storage.get(rootC.children['a']);
        const nodeB = await storage.get(rootC.children['b']);
        const nodeC = await storage.get(rootC.children['c']);

        console.log('Node A bytes:', nodeA);
        console.log('Node B bytes:', nodeB);
        console.log('Node C bytes:', nodeC);

        // Check their values
        console.log('\n=== CHECK NODE VALUES ===');
        const { BinaryNode } = await import('../src/core/binary-node.js');
        const parsedA = BinaryNode.deserialize(nodeA);
        const parsedB = BinaryNode.deserialize(nodeB);
        const parsedC = BinaryNode.deserialize(nodeC);

        console.log('Node A value ref:', parsedA.value);
        console.log('Node B value ref:', parsedB.value);
        console.log('Node C value ref:', parsedC.value);
        console.log(
            'Value refs different?',
            parsedA.value !== parsedB.value,
            parsedB.value !== parsedC.value
        );
    } catch (error) {
        console.error('Error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

test();

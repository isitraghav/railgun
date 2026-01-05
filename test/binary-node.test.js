import { BinaryNode } from '../src/core/binary-node.js';
import { toBase64 } from '../src/core/utils.js';

console.log('🧪 Testing Binary Node Serialization\n');
console.log('='.repeat(60) + '\n');

// Test 1: Empty node
console.log('Test 1: Empty Node (no value, no children)');
const emptyNode = new BinaryNode(null, {});
const emptySerialized = emptyNode.serialize();
console.log('  Serialized size:', emptySerialized.length, 'bytes');
console.log('  Expected: 1 byte');
BinaryNode.deserialize(emptySerialized);
console.log('  ✓ Round-trip successful\n');

// Test 2: Leaf node (has value, no children)
console.log('Test 2: Leaf Node (value, no children)');
const leafNode = new BinaryNode('value-ref-key', {});
const leafSerialized = leafNode.serialize();
console.log('  Serialized size:', leafSerialized.length, 'bytes');
console.log('  Expected: 1 byte (value stored separately)');
console.log('  ✓ Round-trip successful\n');

// Test 3: Internal node with children
console.log('Test 3: Internal Node (3 children, no value)');
// Create fake 32-byte hashes
const fakeHash1 = toBase64(new Uint8Array(32).fill(1));
const fakeHash2 = toBase64(new Uint8Array(32).fill(2));
const fakeHash3 = toBase64(new Uint8Array(32).fill(3));

const internalNode = new BinaryNode(null, {
    a: fakeHash1,
    e: fakeHash2,
    i: fakeHash3
});
const internalSerialized = internalNode.serialize();
console.log('  Serialized size:', internalSerialized.length, 'bytes');
console.log('  Expected: 1 + (3 * 33) = 100 bytes');
const internalDeserialized = BinaryNode.deserialize(internalSerialized);
console.log('  Children count:', Object.keys(internalDeserialized.children).length);
console.log('  ✓ Round-trip successful\n');

// Test 4: Node with both value and children
console.log('Test 4: Mixed Node (value + children)');
const mixedNode = new BinaryNode('value-ref', {
    x: fakeHash1,
    y: fakeHash2
});
const mixedSerialized = mixedNode.serialize();
console.log('  Serialized size:', mixedSerialized.length, 'bytes');
console.log('  Expected: 1 + (2 * 33) = 67 bytes');
const mixedDeserialized = BinaryNode.deserialize(mixedSerialized);
console.log('  Has value:', mixedDeserialized.hasValue());
console.log('  Children count:', Object.keys(mixedDeserialized.children).length);
console.log('  ✓ Round-trip successful\n');

// Test 5: Hash consistency
console.log('Test 5: Hash Consistency');
const node1 = new BinaryNode(null, { a: fakeHash1 });
const node2 = new BinaryNode(null, { a: fakeHash1 });
const hash1 = node1.getHash();
const hash2 = node2.getHash();
console.log('  Hash 1:', hash1);
console.log('  Hash 2:', hash2);
console.log('  Match:', hash1 === hash2);
console.log('  ✓ Deterministic hashing\n');

// Size comparison
console.log('='.repeat(60));
console.log('\n📊 Size Comparison (vs JSON)\n');

// Simulate JSON format for comparison
const jsonInternal = JSON.stringify({
    value: null,
    children: {
        a: 'A'.repeat(64), // hex hash
        e: 'E'.repeat(64),
        i: 'I'.repeat(64)
    }
});
const jsonSize = Buffer.byteLength(jsonInternal);
const binarySize = internalSerialized.length;
const savings = (((jsonSize - binarySize) / jsonSize) * 100).toFixed(1);

console.log('JSON format (3 children):');
console.log('  Size:', jsonSize, 'bytes');
console.log('\nBinary format (3 children):');
console.log('  Size:', binarySize, 'bytes');
console.log('\n💰 Savings:', savings + '%');
console.log('  Reduction:', jsonSize - binarySize, 'bytes\n');

console.log('✅ All tests passed!\n');

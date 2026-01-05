import { Node } from '../src/core/node.js';

/**
 * Analyze current storage format and identify inefficiencies
 */

console.log('📊 Storage Format Analysis\n');
console.log('='.repeat(60) + '\n');

// Test 1: Typical internal trie node
console.log('1. INTERNAL TRIE NODE (with children, no value)');
const internalNode = new Node({
    value: null,
    children: {
        a: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        e: '1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        i: '2123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        o: '3123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        u: '4123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    }
});
const internalSerialized = internalNode.serialize();
console.log('Serialized:', internalSerialized);
console.log('Size:', Buffer.byteLength(internalSerialized), 'bytes');
console.log('');

// Test 2: Leaf node (has value, no children)
console.log('2. LEAF NODE (with value, no children)');
const leafNode = new Node({
    value: { data: 'Hello World', timestamp: 1234567890, metadata: { type: 'test' } },
    children: {}
});
const leafSerialized = leafNode.serialize();
console.log('Serialized:', leafSerialized);
console.log('Size:', Buffer.byteLength(leafSerialized), 'bytes');
console.log('');

// Test 3: Node with both
console.log('3. MIXED NODE (both value and children)');
const mixedNode = new Node({
    value: { count: 42 },
    children: {
        x: '5123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        y: '6123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    }
});
const mixedSerialized = mixedNode.serialize();
console.log('Serialized:', mixedSerialized);
console.log('Size:', Buffer.byteLength(mixedSerialized), 'bytes');
console.log('');

// Analysis
console.log('='.repeat(60));
console.log('\n💡 IDENTIFIED INEFFICIENCIES:\n');

console.log('1. VERBOSE JSON KEYS');
console.log('   - "value": 8 bytes per node');
console.log('   - "children": 11 bytes per node');
console.log('   - Total overhead: 19+ bytes per node just for keys\n');

console.log('2. HEX-ENCODED HASHES');
console.log('   - SHA-256 hash = 32 bytes raw');
console.log('   - Hex encoding = 64 characters = 64 bytes');
console.log('   - Overhead: 100% increase (2x size)\n');

console.log('3. NULL VALUES');
console.log('   - Storing "value":null explicitly wastes 12 bytes');
console.log('   - Empty children object "{}" wastes 2 bytes\n');

console.log('4. OBJECT STRUCTURE');
console.log('   - JSON objects use {...} delimiters');
console.log('   - Quotes around every key and string');
console.log('   - Colons and commas\n');

const avgNodeSize =
    (Buffer.byteLength(internalSerialized) +
        Buffer.byteLength(leafSerialized) +
        Buffer.byteLength(mixedSerialized)) /
    3;
console.log(`Average node size: ${avgNodeSize.toFixed(0)} bytes`);
console.log('');

// Estimate potential savings
console.log('='.repeat(60));
console.log('\n🎯 OPTIMIZATION OPPORTUNITIES:\n');

console.log('1. Use Array Format [value, children]');
console.log('   - Saves 19 bytes per node (no "value"/"children" keys)\n');

console.log('2. Base64 Hash Encoding');
console.log('   - SHA-256: 32 bytes → 43 chars base64 (vs 64 hex)');
console.log('   - Saves 21 bytes per hash (33% reduction)\n');

console.log('3. Omit Null/Empty Fields');
console.log("   - Don't serialize null values");
console.log("   - Don't serialize empty objects");
console.log('   - Saves 10-14 bytes per node\n');

console.log('4. Use Short Keys for Children Map');
console.log('   - Single chars as-is, no need for JSON overhead');
console.log('   - Saves quotes and formatting\n');

console.log('ESTIMATED TOTAL SAVINGS: 40-60% storage reduction');
console.log('');

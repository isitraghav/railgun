import * as msgpack from '../src/core/msgpack.js';

console.log('🧪 Testing MessagePack Encoder/Decoder\n');
console.log('='.repeat(60) + '\n');

// Test data
const testCases = [
    { name: 'null', value: null },
    { name: 'boolean (true)', value: true },
    { name: 'boolean (false)', value: false },
    { name: 'small int', value: 42 },
    { name: 'large int', value: 123456 },
    { name: 'negative int', value: -42 },
    { name: 'float', value: 3.14159 },
    { name: 'short string', value: 'Hello World' },
    { name: 'long string', value: 'A'.repeat(100) },
    { name: 'empty array', value: [] },
    { name: 'array of ints', value: [1, 2, 3, 4, 5] },
    { name: 'empty object', value: {} },
    { name: 'simple object', value: { name: 'test', count: 42 } },
    {
        name: 'nested object',
        value: {
            user: 'Alice',
            data: { score: 100, items: ['a', 'b', 'c'] },
            timestamp: 1234567890
        }
    },
    {
        name: 'complex structure',
        value: {
            id: 1,
            name: 'Complex Test',
            values: [10, 20, 30],
            nested: { a: 1, b: 2, c: { deep: true } },
            flags: [true, false, null]
        }
    }
];

console.log('Running round-trip tests...\n');

let totalJsonSize = 0;
let totalMsgPackSize = 0;

for (const test of testCases) {
    try {
        // Encode
        const encoded = msgpack.encode(test.value);

        // Decode
        const decoded = msgpack.decode(encoded);

        // Compare
        const jsonStr = JSON.stringify(test.value);
        const decodedStr = JSON.stringify(decoded);
        const match = jsonStr === decodedStr;

        // Size comparison
        const jsonSize = Buffer.byteLength(jsonStr);
        const msgpackSize = encoded.length;
        const savings = (((jsonSize - msgpackSize) / jsonSize) * 100).toFixed(1);

        totalJsonSize += jsonSize;
        totalMsgPackSize += msgpackSize;

        console.log(`✓ ${test.name}`);
        console.log(`  JSON: ${jsonSize} bytes`);
        console.log(`  MessagePack: ${msgpackSize} bytes`);
        console.log(`  Savings: ${savings}%`);
        console.log(`  Match: ${match ? '✓' : '✗'}\n`);

        if (!match) {
            console.error('  ERROR: Values do not match!');
            console.error('  Original:', jsonStr);
            console.error('  Decoded:', decodedStr);
            process.exit(1);
        }
    } catch (error) {
        console.error(`✗ ${test.name} FAILED:`, error.message);
        process.exit(1);
    }
}

console.log('='.repeat(60));
console.log('\n📊 Overall Statistics\n');
console.log(`Total JSON size: ${totalJsonSize} bytes`);
console.log(`Total MessagePack size: ${totalMsgPackSize} bytes`);
const overallSavings = (((totalJsonSize - totalMsgPackSize) / totalJsonSize) * 100).toFixed(1);
console.log(`\n💰 Total savings: ${overallSavings}%`);
console.log(`   Reduction: ${totalJsonSize - totalMsgPackSize} bytes\n`);

console.log('✅ All MessagePack tests passed!\n');

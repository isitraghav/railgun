import { Railgun } from '../src/index.js';

/**
 * Comprehensive Stress Testing & Performance Benchmarks
 *
 * Measures:
 * - Write operations per second
 * - Read operations per second
 * - Concurrent operations
 * - Large dataset handling
 * - Memory usage
 */

class PerformanceMetrics {
    constructor() {
        this.metrics = {};
    }

    start(label) {
        this.metrics[label] = {
            startTime: Date.now(),
            startMemory: process.memoryUsage().heapUsed
        };
    }

    end(label, operations = 1) {
        if (!this.metrics[label]) {
            throw new Error(`No start time for ${label}`);
        }

        const duration = Date.now() - this.metrics[label].startTime;
        const memoryUsed = process.memoryUsage().heapUsed - this.metrics[label].startMemory;
        const opsPerSecond = (operations / duration) * 1000;

        return {
            duration,
            operations,
            opsPerSecond: opsPerSecond.toFixed(2),
            memoryUsed: (memoryUsed / 1024 / 1024).toFixed(2) + ' MB',
            avgTimePerOp: (duration / operations).toFixed(2) + ' ms'
        };
    }
}

async function runStressTests() {
    console.log('Railgun Stress Testing Suite\n');
    console.log('='.repeat(60) + '\n');

    const metrics = new PerformanceMetrics();
    const results = {};

    // Test 1: Write Performance
    console.log('[Write] Test 1: Write Performance\n');
    const db1 = await Railgun.create();
    await db1.signup('perf-user', 'password123');

    const writeOps = [100, 500, 1000];
    for (const ops of writeOps) {
        metrics.start(`write_${ops}`);

        for (let i = 0; i < ops; i++) {
            await db1.put(`test/item-${i}`, { index: i, data: `value-${i}` }, { space: 'all' });
        }

        const result = metrics.end(`write_${ops}`, ops);
        results[`write_${ops}`] = result;

        console.log(`   ${ops} writes:`);
        console.log(`   ├─ Duration: ${result.duration}ms`);
        console.log(`   ├─ Ops/sec: ${result.opsPerSecond}`);
        console.log(`   ├─ Avg time: ${result.avgTimePerOp}`);
        console.log(`   └─ Memory: ${result.memoryUsed}\n`);
    }

    await db1.close();

    // Test 2: Read Performance
    console.log('[Read] Test 2: Read Performance\n');
    const db2 = await Railgun.create();
    await db2.signup('read-user', 'password123');

    // Pre-populate data
    for (let i = 0; i < 1000; i++) {
        await db2.put(`read/item-${i}`, { value: i }, { space: 'all' });
    }

    const readOps = [100, 500, 1000];
    for (const ops of readOps) {
        metrics.start(`read_${ops}`);

        for (let i = 0; i < ops; i++) {
            await db2.get(`read/item-${i}`, { space: 'all' });
        }

        const result = metrics.end(`read_${ops}`, ops);
        results[`read_${ops}`] = result;

        console.log(`   ${ops} reads:`);
        console.log(`   ├─ Duration: ${result.duration}ms`);
        console.log(`   ├─ Ops/sec: ${result.opsPerSecond}`);
        console.log(`   ├─ Avg time: ${result.avgTimePerOp}`);
        console.log(`   └─ Memory: ${result.memoryUsed}\n`);
    }

    await db2.close();

    // Test 3: Concurrent Operations
    console.log('[Concurrent] Test 3: Concurrent Operations\n');
    const db3 = await Railgun.create();
    await db3.signup('concurrent-user', 'password123');

    const concurrentOps = 100;
    metrics.start('concurrent');

    const promises = [];
    for (let i = 0; i < concurrentOps; i++) {
        promises.push(db3.put(`concurrent/item-${i}`, { value: i }, { space: 'all' }));
    }

    await Promise.all(promises);
    const result = metrics.end('concurrent', concurrentOps);
    results.concurrent = result;

    console.log(`   ${concurrentOps} concurrent writes:`);
    console.log(`   ├─ Duration: ${result.duration}ms`);
    console.log(`   ├─ Ops/sec: ${result.opsPerSecond}`);
    console.log(`   ├─ Avg time: ${result.avgTimePerOp}`);
    console.log(`   └─ Memory: ${result.memoryUsed}\n`);
    await db3.close();

    // Test 4: Large Dataset
    console.log('[Large Data] Test 4: Large Dataset Handling\n');
    const db4 = await Railgun.create();
    await db4.signup('large-user', 'password123');

    const largeDataSizes = [1000, 5000];
    for (const size of largeDataSizes) {
        metrics.start(`large_${size}`);

        for (let i = 0; i < size; i++) {
            await db4.put(
                `large/item-${i}`,
                {
                    index: i,
                    data: `value-${i}`,
                    timestamp: Date.now(),
                    metadata: { created: new Date().toISOString() }
                },
                { space: 'all' }
            );
        }

        const result = metrics.end(`large_${size}`, size);
        results[`large_${size}`] = result;

        console.log(`   ${size} entries:`);
        console.log(`   ├─ Duration: ${result.duration}ms`);
        console.log(`   ├─ Ops/sec: ${result.opsPerSecond}`);
        console.log(`   ├─ Avg time: ${result.avgTimePerOp}`);
        console.log(`   └─ Memory: ${result.memoryUsed}\n`);
    }

    await db4.close();

    // Test 5: Encrypted Data (User Space)
    console.log('[Encrypted] Test 5: Encrypted Data Performance\n');
    const db5 = await Railgun.create();
    await db5.signup('encrypted-user', 'password123');

    const encryptedOps = 500;
    metrics.start('encrypted');

    for (let i = 0; i < encryptedOps; i++) {
        await db5.put(
            `private/item-${i}`,
            {
                secret: `confidential-${i}`,
                data: `encrypted-value-${i}`
            },
            { space: 'user' }
        );
    }

    const encResult = metrics.end('encrypted', encryptedOps);
    results.encrypted = encResult;

    console.log(`   ${encryptedOps} encrypted writes:`);
    console.log(`   ├─ Duration: ${encResult.duration}ms`);
    console.log(`   ├─ Ops/sec: ${encResult.opsPerSecond}`);
    console.log(`   ├─ Avg time: ${encResult.avgTimePerOp}`);
    console.log(`   └─ Memory: ${encResult.memoryUsed}\n`);
    await db5.close();

    // Test 6: Event Propagation Performance
    console.log('[Events] Test 6: Event Propagation Performance\n');
    const db6 = await Railgun.create();
    await db6.signup('event-user', 'password123');

    let eventCount = 0;
    db6.on('all/events/*', () => {
        eventCount++;
    });

    const eventOps = 500;
    metrics.start('events');

    for (let i = 0; i < eventOps; i++) {
        await db6.put(`events/item-${i}`, { value: i }, { space: 'all' });
    }

    await new Promise((r) => setTimeout(r, 100)); // Wait for events
    const eventResult = metrics.end('events', eventOps);
    results.events = eventResult;

    console.log(`   ${eventOps} writes with events:`);
    console.log(`   ├─ Duration: ${eventResult.duration}ms`);
    console.log(`   ├─ Ops/sec: ${eventResult.opsPerSecond}`);
    console.log(`   ├─ Events received: ${eventCount}`);
    console.log(`   ├─ Avg time: ${eventResult.avgTimePerOp}`);
    console.log(`   └─ Memory: ${eventResult.memoryUsed}\n`);
    await db6.close();

    // Summary
    console.log('='.repeat(60));
    console.log('\n[Summary] Performance Summary\n');

    console.log('Write Performance:');
    console.log(`   • 100 ops:  ${results.write_100.opsPerSecond} ops/sec`);
    console.log(`   • 500 ops:  ${results.write_500.opsPerSecond} ops/sec`);
    console.log(`   • 1000 ops: ${results.write_1000.opsPerSecond} ops/sec`);

    console.log('\nRead Performance:');
    console.log(`   • 100 ops:  ${results.read_100.opsPerSecond} ops/sec`);
    console.log(`   • 500 ops:  ${results.read_500.opsPerSecond} ops/sec`);
    console.log(`   • 1000 ops: ${results.read_1000.opsPerSecond} ops/sec`);

    console.log('\nConcurrent Performance:');
    console.log(`   • 100 concurrent: ${results.concurrent.opsPerSecond} ops/sec`);

    console.log('\nLarge Dataset:');
    console.log(`   • 1000 entries: ${results.large_1000.opsPerSecond} ops/sec`);
    console.log(`   • 5000 entries: ${results.large_5000.opsPerSecond} ops/sec`);

    console.log('\nEncrypted Data:');
    console.log(`   • 500 encrypted: ${results.encrypted.opsPerSecond} ops/sec`);

    console.log('\nEvent System:');
    console.log(`   • 500 with events: ${results.events.opsPerSecond} ops/sec`);

    console.log('\n' + '='.repeat(60) + '\n');
    console.log('[DONE] Stress testing complete!\n');
}

runStressTests().catch(console.error);

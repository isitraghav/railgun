/**
 * Test Runner - Runs all test suites
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { readdir } from 'fs/promises';

async function getTestFiles() {
    const files = await readdir(__dirname);
    return files
        .filter(
            (file) => (file.endsWith('.test.js') || file === 'usage.js') && file !== 'run-all.js'
        )
        .sort();
}

const tests = await getTestFiles();

async function runTest(testFile) {
    return new Promise((resolve, reject) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Running: ${testFile}`);
        console.log('='.repeat(60) + '\n');

        const testPath = join(__dirname, testFile);
        const proc = spawn('node', [testPath], {
            stdio: 'inherit',
            shell: true
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ test: testFile, passed: true });
            } else {
                resolve({ test: testFile, passed: false, code });
            }
        });

        proc.on('error', (err) => {
            reject({ test: testFile, error: err });
        });
    });
}

async function runAllTests() {
    console.log('🧪 Railgun Test Suite\n');
    console.log('Running all tests...\n');

    const results = [];

    for (const test of tests) {
        try {
            const result = await runTest(test);
            results.push(result);
        } catch (error) {
            results.push(error);
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60) + '\n');

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    results.forEach((result) => {
        const icon = result.passed ? '✅' : '❌';
        const status = result.passed ? 'PASSED' : `FAILED (code ${result.code || 'unknown'})`;
        console.log(`${icon} ${result.test}: ${status}`);
    });

    console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);

    if (failed === 0) {
        console.log('✅ All tests passed!\n');
        process.exit(0);
    } else {
        console.log('❌ Some tests failed!\n');
        process.exit(1);
    }
}

runAllTests().catch(console.error);

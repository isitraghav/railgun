import {
    generateKeyPair,
    sign,
    verify,
    generateSymmKey,
    exportSymmKey,
    encryptWithPassword,
    decryptWithPassword,
    encryptData,
    decryptData
} from '../src/core/crypto.js';

/**
 * Comprehensive Crypto Module Tests
 */

async function testCrypto() {
    console.log('🧪 Testing Crypto Module\n');
    let passed = 0;
    let failed = 0;

    // Test 1: Key Pair Generation
    console.log('1. Testing key pair generation...');
    try {
        const keyPair = await generateKeyPair();
        if (keyPair.publicKey && keyPair.privateKey) {
            console.log('   ✅ Key pair generated successfully');
            passed++;
        } else {
            throw new Error('Missing keys');
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 2: Signing and Verification
    console.log('2. Testing signing and verification...');
    try {
        const keyPair = await generateKeyPair();
        const message = 'Test message';
        const signature = await sign(message, keyPair.privateKey);
        const isValid = await verify(signature, message, keyPair.publicKey);

        if (isValid) {
            console.log('   ✅ Signature verification works');
            passed++;
        } else {
            throw new Error('Invalid signature');
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 3: Invalid Signature Detection
    console.log('3. Testing invalid signature detection...');
    try {
        const keyPair = await generateKeyPair();
        const message = 'Test message';
        const signature = await sign(message, keyPair.privateKey);
        const isValid = await verify(signature, 'Different message', keyPair.publicKey);

        if (!isValid) {
            console.log('   ✅ Invalid signature correctly rejected');
            passed++;
        } else {
            throw new Error('Should have rejected invalid signature');
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 4: Symmetric Key Generation
    console.log('4. Testing symmetric key generation...');
    try {
        const symmKey = await generateSymmKey();
        const exported = await exportSymmKey(symmKey);
        if (exported && typeof exported === 'string') {
            console.log('   ✅ Symmetric key generated and exported');
            passed++;
        } else {
            throw new Error('Export failed');
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 5: Password-based Encryption
    console.log('5. Testing password-based encryption...');
    try {
        const data = 'Secret data';
        const password = 'mypassword123';
        const encrypted = await encryptWithPassword(data, password);
        const decrypted = await decryptWithPassword(encrypted, password);

        if (decrypted === data) {
            console.log('   ✅ Password encryption/decryption works');
            passed++;
        } else {
            throw new Error('Decryption mismatch');
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 6: Wrong Password Detection
    console.log('6. Testing wrong password detection...');
    try {
        const data = 'Secret data';
        const encrypted = await encryptWithPassword(data, 'correct');
        try {
            await decryptWithPassword(encrypted, 'wrong');
            throw new Error('Should have failed with wrong password');
        } catch (e) {
            if (
                e.message.includes('Wrong') ||
                e.message.includes('decrypt') ||
                e.message.includes('operation-specific')
            ) {
                console.log('   ✅ Wrong password correctly rejected');
                passed++;
            } else {
                throw e;
            }
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 7: Data Encryption with Symmetric Key
    console.log('7. Testing data encryption with symmetric key...');
    try {
        const dataKey = await exportSymmKey(await generateSymmKey());
        const data = 'My secret message';
        const encrypted = await encryptData(data, dataKey);
        const decrypted = await decryptData(encrypted, dataKey);

        if (decrypted === data) {
            console.log('   ✅ Data encryption/decryption works');
            passed++;
        } else {
            throw new Error('Decryption mismatch');
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    // Test 8: Unicode Data Handling
    console.log('8. Testing unicode data handling...');
    try {
        const dataKey = await exportSymmKey(await generateSymmKey());
        const data = '🚀 Unicode test 中文 العربية';
        const encrypted = await encryptData(data, dataKey);
        const decrypted = await decryptData(encrypted, dataKey);

        if (decrypted === data) {
            console.log('   ✅ Unicode handling works');
            passed++;
        } else {
            throw new Error('Unicode mismatch');
        }
    } catch (e) {
        console.log('   ❌ Failed:', e.message);
        failed++;
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

testCrypto().catch(console.error);

import { decryptData, encryptData, generateSymmKey, exportSymmKey } from '../src/core/crypto.js';

async function testCrypto() {
    try {
        console.log('Generating key...');
        const key = await generateSymmKey();
        const keyHex = await exportSymmKey(key);
        console.log('Key:', keyHex);

        const data = JSON.stringify({ secret: 'The cake is a lie' });
        console.log('Encrypting...');
        const encrypted = await encryptData(data, keyHex);
        console.log('Encrypted:', encrypted);

        console.log('Decrypting...');
        const decrypted = await decryptData(encrypted, keyHex);
        console.log('Decrypted:', decrypted);

        if (decrypted !== data) throw new Error('Mismatch');
        console.log('SUCCESS');
    } catch (e) {
        console.error('FAILED:', e);
    }
}

testCrypto();

import { Railgun } from '../src/index.js';

async function testUserManagement() {
    console.log('🧪 Testing User Management API\n');
    let passed = 0;
    let failed = 0;

    try {
        console.log('1. Testing Logout & isLoggedIn...');
        const db1 = await Railgun.create();
        await db1.signup('user1', 'pass1');

        if (!db1.isLoggedIn()) throw new Error('isLoggedIn should be true after signup');
        await db1.logout();
        if (db1.isLoggedIn()) throw new Error('isLoggedIn should be false after logout');
        if (db1.runtime) throw new Error('Runtime should be null after logout');

        console.log('   ✅ Logout/Login status verified');
        passed++;

        console.log('2. Testing Change Password...');
        await db1.login('pass1');
        await db1.changePassword('pass1', 'newpass2');
        await db1.logout();

        // Try old password
        try {
            await db1.login('pass1');
            throw new Error('Should not login with old password');
        } catch (e) {
            if (!e.message.includes('Incorrect')) throw e;
        }

        // Try new password
        await db1.login('newpass2');
        console.log('   ✅ Password change verified');
        passed++;

        console.log('3. Testing Export/Import Identity...');
        const backup = await db1.exportIdentity('backup-pass'); // Encrypt backup with different pass
        if (!backup.includes('encryptedPrivateKey')) throw new Error('Backup format invalid');

        const db2 = await Railgun.create(); // New instance
        await db2.importIdentity(backup, 'backup-pass');

        if (db2.getHandle() !== db1.getHandle()) throw new Error('Imported handle mismatch');
        if (!db2.isLoggedIn()) throw new Error('Should be logged in after import');

        console.log('   ✅ Export/Import verified');
        await db1.close();
        await db2.close();

        passed++;
    } catch (e) {
        console.error('   ❌ FAILED:', e);
        failed++;
    }

    console.log(`\nPassed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(1);
    process.exit(0);
}

testUserManagement().catch(console.error);

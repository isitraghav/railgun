import { BinaryTrie } from './core/binary-trie.js';
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
} from './core/crypto.js';
import { canonicalize, normalizeKey, computeSuffix, findKeyWithSuffix } from './core/utils.js';
import './browser-shim.js';
import { ClaimManager } from './core/claims.js';
import { EventManager } from './core/events.js';

export * from './storage/index.js';
export * from './storage/memory.js';

import { NetworkManager } from './network/manager.js';

export class Railgun {
    constructor(storage, options = {}) {
        this.storage = storage;
        this.trie = new BinaryTrie(storage);
        this.identity = null;
        this.runtime = null;
        this.network = null;
        this.events = new EventManager(this);

        this.pendingHead = null;
        this.headSaveTimer = null;
        this.headSaveCount = 0;
        this.headSaveInterval = 50;
        this.headSaveBatchSize = 5;

        if (options.signalling) {
            this.connect(options.signalling, options).catch((err) => {
                console.error('Failed to auto-connect to signalling server:', err);
            });
        }
    }

    async connect(signalingUrl = 'http://localhost:3000/', options = {}) {
        this.wrtc = options.wrtc;
        this.network = new NetworkManager(this, signalingUrl);
        this.network.start();
    }

    async sync(key) {
        if (!this.network) throw new Error('Network not connected');
        this.network.request(key);
    }

    /**
     * Trigger a full bidirectional sync with all connected peers.
     * Pushes local changes and pulls remote changes.
     * Useful when coming back online after making offline changes.
     */
    async syncAll() {
        if (!this.network) throw new Error('Network not connected');
        this.network.triggerFullSync();
    }

    static async create(options = {}) {
        let storage;
        if (typeof window !== 'undefined' && window.indexedDB) {
            const { BrowserIDBStorage } = await import('./storage/browser-idb.js');
            storage = new BrowserIDBStorage();
        } else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            const { SingleFileStorage } = await import(
                /* @vite-ignore */ './storage/single-file.js'
            );
            storage = new SingleFileStorage('.railgun/database.rdb', {
                maxMemoryMB: 100,
                enableIdleFlush: false,
                snapshotInterval: 60000
            });
        } else {
            throw new Error(
                'Could not detect environment for default storage. Please provide an adapter.'
            );
        }

        const { signalling, ...otherOptions } = options;
        const db = new Railgun(storage, otherOptions);

        await db._loadHead();

        const loadedIdentity = await db._loadIdentity();
        if (loadedIdentity) {
            db.identity = loadedIdentity;
        }

        if (signalling) {
            await db.connect(signalling, options);
        }

        return db;
    }

    async _loadHead() {
        const head = await this.storage.get('head');
        if (head) {
            this.trie.rootHash = head;
        }
    }

    async _saveHead(hash) {
        this.pendingHead = hash;
        this.headSaveCount++;

        if (this.headSaveCount >= this.headSaveBatchSize) {
            await this._flushHead();
            return;
        }

        if (!this.headSaveTimer) {
            this.headSaveTimer = setTimeout(() => this._flushHead(), this.headSaveInterval);
        }
    }

    async _flushHead() {
        if (this.headSaveTimer) {
            clearTimeout(this.headSaveTimer);
            this.headSaveTimer = null;
        }

        if (this.pendingHead) {
            await this.storage.put('head', this.pendingHead);

            if (this.network) {
                this.network.announceIdentity();
            }

            this.pendingHead = null;
            this.headSaveCount = 0;
        }
    }

    /**
     * Apply a new root hash from a remote peer, diffusing changes to listeners.
     * @param {string} newRootHash
     */
    async applyRemoteRoot(newRootHash) {
        if (this.trie.rootHash === newRootHash) return;

        const oldRootHash = this.trie.rootHash;

        const changes = await this.trie.diff(oldRootHash, newRootHash);

        this.trie.rootHash = newRootHash;

        await this._saveHead(newRootHash);

        for (const change of changes) {
            const envelope = change.value;

            if (envelope && envelope.payload && envelope.payload.key) {
                await this.events.emit(envelope.payload.key, {
                    space: envelope.payload.space,
                    author: envelope.payload.author,
                    timestamp: envelope.payload.timestamp,
                    remote: true,
                    value: envelope.payload.value
                });
            }
        }
    }

    async signup(displayName, password) {
        if (!password) throw new Error('Password is required to create an account.');

        const keyPair = await generateKeyPair();
        const dataKey = await generateSymmKey();
        const dataKeyHex = await exportSymmKey(dataKey);

        const encryptedPrivateKey = await encryptWithPassword(keyPair.privateKey, password);
        const encryptedDataKey = await encryptWithPassword(dataKeyHex, password);

        this.identity = {
            publicKey: keyPair.publicKey,
            encryptedPrivateKey,
            encryptedDataKey,
            displayName: displayName || null
        };

        this.runtime = {
            privateKey: keyPair.privateKey,
            dataKey: dataKeyHex
        };

        const handle = this.getHandle();
        const status = await this.isHandleTaken(handle);
        if (status.taken) {
            this.identity = null;
            this.runtime = null;
            throw new Error(
                `Handle "${handle}" is already taken. Try a different display name or use signupWithSuffix() for a custom suffix.`
            );
        }

        await this._saveIdentity();

        await this.registerHandle(handle);

        if (this.network) {
            this.network.announceIdentity();
        }

        return {
            publicKey: this.identity.publicKey,
            handle: handle
        };
    }

    /**
     * Signup with a custom suffix by brute-forcing keypair generation
     * Keeps searching until finding an unclaimed handle
     * @param {string} displayName - Display name (non-unique)
     * @param {string} password - Password for encryption
     * @param {string} targetSuffix - Desired suffix (1-4 numeric digits: 0-9)
     * @param {object} options - { maxAttempts, onProgress, retryOnTaken }
     * @returns {Promise<{publicKey, handle, attempts}>}
     */
    async signupWithSuffix(displayName, password, targetSuffix, options = {}) {
        if (!password) throw new Error('Password is required to create an account.');
        if (!targetSuffix) throw new Error('Custom suffix is required. Use 1-4 numeric digits.');

        const maxHandleAttempts = options.maxHandleAttempts || 100;
        const retryOnTaken = options.retryOnTaken !== false;
        let totalAttempts = 0;
        let handleAttempts = 0;

        while (handleAttempts < maxHandleAttempts) {
            const keyPair = await findKeyWithSuffix(generateKeyPair, targetSuffix, {
                ...options,
                onProgress: options.onProgress
                    ? (p) => {
                          options.onProgress({
                              ...p,
                              attempts: totalAttempts + p.attempts,
                              handleAttempts
                          });
                      }
                    : null
            });
            totalAttempts += keyPair.attempts;

            const tempSuffix = computeSuffix(keyPair.publicKey);
            const handle = displayName ? `${displayName}#${tempSuffix}` : tempSuffix;

            const status = await this.isHandleTaken(handle);
            if (!status.taken) {
                const dataKey = await generateSymmKey();
                const dataKeyHex = await exportSymmKey(dataKey);

                const encryptedPrivateKey = await encryptWithPassword(keyPair.privateKey, password);
                const encryptedDataKey = await encryptWithPassword(dataKeyHex, password);

                this.identity = {
                    publicKey: keyPair.publicKey,
                    encryptedPrivateKey,
                    encryptedDataKey,
                    displayName: displayName || null
                };

                this.runtime = {
                    privateKey: keyPair.privateKey,
                    dataKey: dataKeyHex
                };

                await this._saveIdentity();

                await this.registerHandle(handle);

                if (this.network) {
                    this.network.announceIdentity();
                }

                return {
                    publicKey: this.identity.publicKey,
                    handle: handle,
                    attempts: totalAttempts
                };
            }

            if (!retryOnTaken) {
                throw new Error(
                    `Handle "${handle}" is already taken. Choose a different display name or suffix.`
                );
            }

            handleAttempts++;
            if (options.onProgress) {
                options.onProgress({
                    found: false,
                    handleTaken: true,
                    handle,
                    attempts: totalAttempts,
                    handleAttempts
                });
            }
        }

        throw new Error(
            `Could not find an unclaimed handle with suffix "${targetSuffix}" after ${handleAttempts} handle attempts (${totalAttempts} total keypair generations).`
        );
    }

    getHandle() {
        if (!this.identity) return null;
        const suffix = computeSuffix(this.identity.publicKey);
        return this.identity.displayName ? `${this.identity.displayName}#${suffix}` : suffix;
    }

    /**
     * Verify that a handle's suffix correctly matches the public key
     * This prevents attackers from claiming handles with forged suffixes
     * @param {string} handle - Full handle like "alice#4921"
     * @param {string} pubKey - Public key to verify
     * @returns {boolean}
     */
    verifyHandleOwnership(handle, pubKey) {
        const parts = handle.split('#');
        if (parts.length < 2) return false;

        const claimedSuffix = parts[parts.length - 1];
        const actualSuffix = computeSuffix(pubKey, claimedSuffix.length);

        return actualSuffix === claimedSuffix;
    }

    /**
     * Check if a handle is already taken in the frozen registry
     * Also validates that the claim is cryptographically valid
     * @param {string} handle - Full handle like "alice#4921"
     * @returns {Promise<{taken: boolean, owner?: string, valid?: boolean}>}
     */
    async isHandleTaken(handle) {
        const normalized = normalizeKey(handle);
        const storageKey = `frozen/handles/${normalized}`;

        if (this.network) {
            this.network.request(storageKey);
            await new Promise((r) => setTimeout(r, 300));
        }

        const envelope = await this.trie.get(storageKey);
        if (envelope && envelope.payload && envelope.payload.value) {
            const claim = envelope.payload.value;

            const isValid = this.verifyHandleOwnership(handle, claim.pubKey);
            return { taken: true, owner: claim.pubKey, valid: isValid };
        }
        return { taken: false };
    }

    /**
     * Register a handle in the frozen (immutable) registry
     * Includes cryptographic proof that the suffix matches the public key
     * @param {string} handle - Full handle like "alice#4921"
     * @returns {Promise<void>}
     */
    async registerHandle(handle) {
        if (!this.runtime || !this.runtime.privateKey) {
            throw new Error('Must be logged in to register handle');
        }

        if (!this.verifyHandleOwnership(handle, this.identity.publicKey)) {
            throw new Error(
                'Handle suffix does not match public key - potential tampering detected'
            );
        }

        const normalized = normalizeKey(handle);

        const status = await this.isHandleTaken(handle);
        if (status.taken) {
            throw new Error(
                `Handle "${handle}" is already taken by ${status.owner.slice(0, 10)}...`
            );
        }

        const claimData = {
            handle: normalized,
            pubKey: this.identity.publicKey,
            claimedAt: Date.now()
        };
        const proof = await sign(canonicalize(claimData), this.runtime.privateKey);

        await this.put(
            `handles/${normalized}`,
            {
                ...claimData,
                proof
            },
            { space: 'frozen' }
        );
    }

    async claimUsername(username) {
        if (!this.runtime || !this.runtime.privateKey)
            throw new Error('Login required to claim username');

        const normalized = normalizeKey(username);
        const storageKey = `all/claims/username/${normalized}`;

        const envelope = await this.trie.get(storageKey);
        const existingClaims = (envelope && envelope.payload && envelope.payload.value) || [];
        const winner = await ClaimManager.resolveWinner(existingClaims);

        if (winner && winner.pubKey !== this.identity.publicKey && !winner.revoked) {
            throw new Error(
                `Username '${username}' is already taken by ${winner.pubKey.slice(0, 10)}...`
            );
        }

        const newClaim = await ClaimManager.createClaim(
            username,
            this.identity.publicKey,
            this.runtime.privateKey
        );

        const updatedClaims = [
            ...existingClaims.filter((c) => c.pubKey !== this.identity.publicKey),
            newClaim
        ];

        await this.put(`claims/username/${normalized}`, updatedClaims, { space: 'all' });

        return newClaim;
    }

    async whois(username) {
        const normalized = normalizeKey(username);
        const storageKey = `all/claims/username/${normalized}`;
        const envelope = await this.trie.get(storageKey);
        const claims = (envelope && envelope.payload && envelope.payload.value) || null;

        if (!claims || !Array.isArray(claims)) return null;

        return await ClaimManager.resolveWinner(claims);
    }

    async resolveUsername(_pubKey) {
        return null;
    }

    async revokeUsername(username) {
        if (!this.runtime || !this.runtime.privateKey)
            throw new Error('Login required to revoke username');

        const normalized = normalizeKey(username);
        const storageKey = `all/claims/username/${normalized}`;

        const envelope = await this.trie.get(storageKey);
        const existingClaims = (envelope && envelope.payload && envelope.payload.value) || [];
        const myClaim = existingClaims.find(
            (c) => c.pubKey === this.identity.publicKey && !c.revoked
        );

        if (!myClaim) {
            throw new Error(`You do not have an active claim for username '${username}'`);
        }

        const revokedClaim = { ...myClaim, revoked: true };
        const payloadStr = canonicalize({
            username: revokedClaim.username,
            pubKey: revokedClaim.pubKey,
            createdAt: revokedClaim.createdAt,
            revoked: true
        });
        const { sign } = await import('./core/crypto.js');
        revokedClaim.signature = await sign(payloadStr, this.runtime.privateKey);

        const updatedClaims = [
            ...existingClaims.filter((c) => c.pubKey !== this.identity.publicKey),
            revokedClaim
        ];
        await this.put(`claims/username/${normalized}`, updatedClaims, { space: 'all' });

        return revokedClaim;
    }

    async login(password) {
        if (!password) {
            throw new Error('Password is required to login.');
        }

        this.identity = await this._loadIdentity();
        if (!this.identity) {
            throw new Error('No account found on this device. Please signup first.');
        }

        let privateKey, dataKey;
        try {
            privateKey = await decryptWithPassword(this.identity.encryptedPrivateKey, password);
            dataKey = await decryptWithPassword(this.identity.encryptedDataKey, password);
        } catch {
            throw new Error('Incorrect password. Please try again.');
        }

        const ed = await import('@noble/ed25519');
        const { toHex, fromHex } = await import('./core/utils.js');
        try {
            const derivedPubKey = toHex(await ed.getPublicKeyAsync(fromHex(privateKey)));
            if (derivedPubKey !== this.identity.publicKey) {
                throw new Error('Identity integrity check failed - public key mismatch');
            }
        } catch (e) {
            if (e.message.includes('integrity')) throw e;
            throw new Error('Incorrect password. Please try again.');
        }

        this.runtime = {
            privateKey,
            dataKey
        };

        if (this.network) {
            this.network.announceIdentity();
        }

        return { publicKey: this.identity.publicKey };
    }

    /**
     * Log out the current user by clearing runtime keys and identity from memory.
     */
    async logout() {
        this.runtime = null;
        this.identity = null;
    }

    /**
     * Check if a user is currently logged in.
     * @returns {boolean}
     */
    isLoggedIn() {
        return !!(this.runtime && this.runtime.privateKey);
    }

    /**
     * Change the encryption password for the current identity.
     * @param {string} oldPassword - Current password
     * @param {string} newPassword - New password
     */
    async changePassword(oldPassword, newPassword) {
        if (!this.isLoggedIn()) throw new Error('Must be logged in to change password');
        if (!newPassword) throw new Error('New password is required');

        try {
            await decryptWithPassword(this.identity.encryptedPrivateKey, oldPassword);
        } catch {
            throw new Error('Incorrect current password.');
        }

        const privateKey = this.runtime.privateKey;
        const dataKeyHex = this.runtime.dataKey;

        const encryptedPrivateKey = await encryptWithPassword(privateKey, newPassword);
        const encryptedDataKey = await encryptWithPassword(dataKeyHex, newPassword);

        this.identity.encryptedPrivateKey = encryptedPrivateKey;
        this.identity.encryptedDataKey = encryptedDataKey;

        await this._saveIdentity();
    }

    /**
     * Export the current identity as an encrypted backup string.
     * @param {string} password - Password to encrypt the backup with
     * @returns {Promise<string>} Encrypted JSON string
     */
    async exportIdentity(password) {
        if (!this.isLoggedIn()) throw new Error('Must be logged in to export identity');
        if (!password) throw new Error('Password for backup encryption is required');

        const privateKey = this.runtime.privateKey;
        const dataKeyHex = this.runtime.dataKey;

        const encryptedPrivateKey = await encryptWithPassword(privateKey, password);
        const encryptedDataKey = await encryptWithPassword(dataKeyHex, password);

        const exportData = {
            publicKey: this.identity.publicKey,
            displayName: this.identity.displayName,
            encryptedPrivateKey,
            encryptedDataKey,
            exportedAt: Date.now()
        };

        return JSON.stringify(exportData);
    }

    /**
     * Import an identity from an encrypted backup string.
     * @param {string} backupString - The JSON string from exportIdentity
     * @param {string} password - The password used to encrypt the backup
     */
    async importIdentity(backupString, password) {
        let backup;
        try {
            backup = JSON.parse(backupString);
        } catch {
            throw new Error('Invalid backup format: Not a valid JSON string');
        }

        if (!backup.encryptedPrivateKey || !backup.encryptedDataKey) {
            throw new Error('Invalid backup format: Missing keys');
        }

        let privateKey, dataKey;
        try {
            privateKey = await decryptWithPassword(backup.encryptedPrivateKey, password);
            dataKey = await decryptWithPassword(backup.encryptedDataKey, password);
        } catch {
            throw new Error('Incorrect backup password or corrupted backup file.');
        }

        const ed = await import('@noble/ed25519');
        const { toHex, fromHex } = await import('./core/utils.js');
        const derivedPubKey = toHex(await ed.getPublicKeyAsync(fromHex(privateKey)));

        if (backup.publicKey && derivedPubKey !== backup.publicKey) {
            throw new Error('Backup integrity check failed - public key mismatch');
        }

        this.identity = {
            publicKey: derivedPubKey,
            encryptedPrivateKey: backup.encryptedPrivateKey,
            encryptedDataKey: backup.encryptedDataKey,
            displayName: backup.displayName || null
        };

        this.runtime = {
            privateKey,
            dataKey
        };

        await this._saveIdentity();

        if (this.network) {
            this.network.announceIdentity();
        }

        return {
            publicKey: derivedPubKey,
            handle: this.getHandle()
        };
    }

    async _saveIdentity() {
        const idStr = JSON.stringify(this.identity);

        if (this.storage.forcePut) {
            await this.storage.forcePut('_identity', idStr);
        } else {
            await this.storage.put('_identity', idStr);
            if (this.storage.flush) {
                await this.storage.flush();
            }
        }
    }

    async _loadIdentity() {
        try {
            const data = await this.storage.get('_identity');
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    }

    /**
     * Writes a value to the path. Authorization via signature.
     * @param {string} key
     * @param {any} value
     * @param {object} options { space: 'all' | 'frozen' | 'user' }
     */
    async put(key, value, options = {}) {
        if (!this.runtime || !this.runtime.privateKey) {
            throw new Error('Must be logged in to write.');
        }

        const space = options.space || 'all';
        let storageKey = key;
        let finalValue = value;
        let isEncrypted = false;

        if (space === 'all') {
            storageKey = `all/${key}`;
        } else if (space === 'frozen') {
            storageKey = `frozen/${key}`;

            const existing = await this.trie.get(storageKey);
            if (existing) {
                throw new Error(
                    `Space 'frozen' implies immutable. Key '${key}' is already set in frozen space.`
                );
            }
        } else if (space === 'user') {
            storageKey = `user/${this.identity.publicKey}/${key}`;

            finalValue = await encryptData(JSON.stringify(value), this.runtime.dataKey);
            isEncrypted = true;
        } else {
            throw new Error(`Unknown space: ${space}`);
        }

        const timestamp = Date.now();
        const payload = {
            key: storageKey,
            value: finalValue,
            timestamp,
            author: this.identity.publicKey,
            isEncrypted,
            space
        };

        const payloadStr = canonicalize(payload);
        const signature = await sign(payloadStr, this.runtime.privateKey);

        const envelope = {
            payload,
            signature
        };

        let newRoot = null;
        if (!options.volatile) {
            newRoot = await this.trie.put(storageKey, envelope);
            await this._saveHead(newRoot);
        }

        if (!options.silent) {
            await this.events.emit(storageKey, {
                space,
                author: this.identity.publicKey,
                timestamp,
                remote: false,
                value: finalValue
            });

            if (this.network) {
                this.network.broadcastEnvelope(envelope);
            }
        }

        return newRoot;
    }

    async get(key, options = {}) {
        const space = options.space || 'all';
        let storageKey = key;

        if (space === 'all') {
            storageKey = `all/${key}`;
        } else if (space === 'frozen') {
            storageKey = `frozen/${key}`;
        } else if (space === 'user') {
            if (!this.identity) throw new Error('Login required for user space');
            storageKey = `user/${this.identity.publicKey}/${key}`;
        }

        if (this.network) {
            this.network.request(storageKey);
        }

        if (options.waitForSync && this.network) {
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    this.off(subId);
                    resolve();
                }, options.timeout || 2000);

                const subId = this.on(storageKey, () => {
                    clearTimeout(timeout);
                    this.off(subId);
                    resolve();
                });
            });
        }

        let envelope = await this.trie.get(storageKey);

        if (!envelope && !options.waitForSync && this.network) {
            await new Promise((r) => setTimeout(r, 200));
            envelope = await this.trie.get(storageKey);
        }

        if (!envelope) return null;

        let val = envelope.payload.value;

        if (envelope.payload.isEncrypted && space === 'user') {
            if (!this.runtime || !this.runtime.dataKey) {
                throw new Error('Locked wallet. Cannot decrypt.');
            }
            const decStr = await decryptData(val, this.runtime.dataKey);
            val = JSON.parse(decStr);
        }

        return val;
    }

    async getEntry(key) {
        return await this.trie.get(key);
    }
    async merge(envelope) {
        const { payload, signature } = envelope;

        try {
            const payloadStr = canonicalize(payload);
            const isValid = await verify(signature, payloadStr, payload.author);
            if (!isValid) {
                console.warn('Merge failed: Invalid signature from', payload.author);
                return false;
            }
        } catch (e) {
            console.warn('Merge failed: Verification error', e);
            return false;
        }

        if (payload.space === 'user') {
            const expectedPrefix = `user/${payload.author}/`;
            if (!payload.key.startsWith(expectedPrefix)) {
                console.warn('Merge failed: Author cannot write to this user space');
                return false;
            }
        } else if (payload.space === 'frozen') {
            const existing = await this.trie.get(payload.key);
            if (existing) {
                console.warn('Merge failed: Immutable space violation - key already exists');
                return false;
            }

            const MAX_CLAIM_AGE = 60 * 60 * 1000;
            if (Date.now() - payload.timestamp > MAX_CLAIM_AGE) {
                console.warn('Merge failed: Frozen claim too old - possible replay attack');
                return false;
            }

            if (!payload.author) {
                console.warn('Merge failed: Frozen space write requires author');
                return false;
            }

            if (payload.key.startsWith('frozen/handles/')) {
                const handleData = payload.value;
                if (!handleData || !handleData.pubKey || !handleData.handle) {
                    console.warn('Merge failed: Invalid handle claim format');
                    return false;
                }

                if (handleData.pubKey !== payload.author) {
                    console.warn(
                        'Merge failed: Handle claim author mismatch - cannot claim for another user'
                    );
                    return false;
                }

                if (!this.verifyHandleOwnership(handleData.handle, handleData.pubKey)) {
                    console.warn(
                        'Merge failed: Handle suffix does not match public key - forged claim detected'
                    );
                    return false;
                }

                if (!handleData.proof) {
                    console.warn('Merge failed: Handle claim missing proof signature');
                    return false;
                }

                const claimData = {
                    handle: handleData.handle,
                    pubKey: handleData.pubKey,
                    claimedAt: handleData.claimedAt
                };
                try {
                    const proofValid = await verify(
                        handleData.proof,
                        canonicalize(claimData),
                        handleData.pubKey
                    );
                    if (!proofValid) {
                        console.warn('Merge failed: Handle claim proof signature invalid');
                        return false;
                    }
                } catch (e) {
                    console.warn('Merge failed: Handle claim proof verification error', e);
                    return false;
                }
            }
        }

        const existingEnvelope = await this.trie.get(payload.key);
        if (existingEnvelope && existingEnvelope.payload) {
            if (payload.key.startsWith('all/claims/username/')) {
                const mergedValue = [...existingEnvelope.payload.value, ...payload.value];

                const seen = new Set();
                const unique = [];
                for (const c of mergedValue) {
                    if (!seen.has(c.signature)) {
                        seen.add(c.signature);
                        unique.push(c);
                    }
                }
                payload.value = unique;

                payload.timestamp = Math.max(payload.timestamp, existingEnvelope.payload.timestamp);
            } else if (existingEnvelope.payload.timestamp >= payload.timestamp) {
                return false;
            }
        }

        const newRoot = await this.trie.put(payload.key, envelope);
        await this._saveHead(newRoot);

        await this.events.emit(payload.key, {
            space: payload.space,
            author: payload.author,
            timestamp: payload.timestamp,
            remote: true
        });

        return true;
    }

    /**
     * Subscribe to path change events
     * @param {string|RegExp} pattern - Path pattern (exact, wildcard *, or RegExp)
     * @param {Function} callback - Called with { path, space, author, timestamp, remote }
     * @returns {number} subscriptionId
     */
    subscribe(pattern, callback) {
        const publicKey = this.identity ? this.identity.publicKey : null;
        const subscriptionId = this.events.subscribe(pattern, callback, { publicKey });

        if (this.network) {
            this.network.broadcastSubscription(pattern, subscriptionId);
        }

        return subscriptionId;
    }

    /**
     * Alias for subscribe() - cleaner API
     */
    on(pattern, callback) {
        return this.subscribe(pattern, callback);
    }

    /**
     * Unsubscribe from events
     * @param {number} subscriptionId
     * @returns {boolean}
     */
    unsubscribe(subscriptionId) {
        const result = this.events.unsubscribe(subscriptionId);

        if (this.network && result) {
            this.network.broadcastUnsubscription(subscriptionId);
        }

        return result;
    }

    /**
     * Alias for unsubscribe() - cleaner API
     */
    off(subscriptionId) {
        return this.unsubscribe(subscriptionId);
    }

    /**
     * Close the database and flush pending writes
     */
    async close() {
        await this._flushHead();

        if (this.storage && typeof this.storage.close === 'function') {
            await this.storage.close();
        }
    }
}

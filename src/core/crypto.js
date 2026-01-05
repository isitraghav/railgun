import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';
import { toHex, fromHex, toBase64 } from './utils.js';

export async function generateKeyPair() {
    const privateKey = ed.utils.randomSecretKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    return {
        privateKey: toHex(privateKey),
        publicKey: toHex(publicKey)
    };
}

export async function sign(message, privateKeyHex) {
    const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
    const sig = await ed.signAsync(msgBytes, fromHex(privateKeyHex));
    return toHex(sig);
}

export async function verify(signatureHex, message, publicKeyHex) {
    const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
    return await ed.verifyAsync(fromHex(signatureHex), msgBytes, fromHex(publicKeyHex));
}

const ALGO_NAME = 'AES-GCM';
const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN = 256;
const ITERATIONS = 100000;

export async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: ALGO_NAME, length: KEY_LEN },
        true,
        ['encrypt', 'decrypt']
    );
}

export async function encryptWithPassword(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const key = await deriveKey(password, salt);

    const encodedData = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const encrypted = await crypto.subtle.encrypt({ name: ALGO_NAME, iv }, key, encodedData);

    const buf = new Uint8Array(SALT_LEN + IV_LEN + encrypted.byteLength);
    buf.set(salt, 0);
    buf.set(iv, SALT_LEN);
    buf.set(new Uint8Array(encrypted), SALT_LEN + IV_LEN);
    return toHex(buf);
}

export async function decryptWithPassword(encryptedHex, password) {
    const raw = fromHex(encryptedHex);
    if (raw.length < SALT_LEN + IV_LEN) throw new Error('Invalid data');

    const salt = raw.slice(0, SALT_LEN);
    const iv = raw.slice(SALT_LEN, SALT_LEN + IV_LEN);
    const ciphertext = raw.slice(SALT_LEN + IV_LEN);

    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: ALGO_NAME, iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
}

export async function generateSymmKey() {
    return await crypto.subtle.generateKey({ name: ALGO_NAME, length: KEY_LEN }, true, [
        'encrypt',
        'decrypt'
    ]);
}

export async function encryptData(data, keyRawHex) {
    let key = keyRawHex;
    if (typeof keyRawHex === 'string') {
        key = await crypto.subtle.importKey('raw', fromHex(keyRawHex), ALGO_NAME, true, [
            'encrypt',
            'decrypt'
        ]);
    }

    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const encodedData = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    const encrypted = await crypto.subtle.encrypt({ name: ALGO_NAME, iv }, key, encodedData);

    const buf = new Uint8Array(IV_LEN + encrypted.byteLength);
    buf.set(iv, 0);
    buf.set(new Uint8Array(encrypted), IV_LEN);
    return toHex(buf);
}

export async function decryptData(encryptedHex, keyRawHex) {
    let key = keyRawHex;
    if (typeof keyRawHex === 'string') {
        key = await crypto.subtle.importKey('raw', fromHex(keyRawHex), ALGO_NAME, true, [
            'encrypt',
            'decrypt'
        ]);
    }

    const raw = fromHex(encryptedHex);
    const iv = raw.slice(0, IV_LEN);
    const ciphertext = raw.slice(IV_LEN);

    const decrypted = await crypto.subtle.decrypt({ name: ALGO_NAME, iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
}

export async function exportSymmKey(key) {
    const raw = await crypto.subtle.exportKey('raw', key);
    return toHex(new Uint8Array(raw));
}

export function hash(data) {
    const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBytes = sha256(input);

    return toBase64(hashBytes);
}

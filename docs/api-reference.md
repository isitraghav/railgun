# API Reference

## Class: `Railgun`

The main entry point for the library.

### Static Methods

#### `Railgun.create(options?)`

Creates a new Railgun instance, automatically selecting the storage adapter based on the environment.

- **Parameters**:
    - `options` (object): Configuration options.
        - `signalling` (string): Auto-connect to this signaling URL.
- **Returns**: `Promise<Railgun>`
- **Example**:
    ```javascript
    const db = await Railgun.create();
    ```

### Instance Methods

#### `signup(displayName, password)`

Generates a new Ed25519 keypair, encrypts the private key with the password, and creates a user identity.

- **Parameters**:
    - `displayName` (string): The desired display name.
    - `password` (string): The password to secure the identity.
- **Returns**: `Promise<{ publicKey: string, handle: string }>`
- **Example**:
    ```javascript
    const { handle } = await db.signup('bob', 'password123');
    ```

#### `signupWithSuffix(displayName, password, targetSuffix, options?)`

Brute-forces a keypair to generate an identity with a specific suffix.

- **Parameters**:
    - `displayName` (string): The desired display name.
    - `password` (string): The password to secure the identity.
    - `targetSuffix` (string): The desired 4-character suffix (e.g., "1234").
    - `options` (object):
        - `maxHandleAttempts` (number): Max unique handles to try. Default 100.
        - `retryOnTaken` (boolean): Whether to retry if the specific handle is taken. Default true.
        - `onProgress` (function): Callback for progress updates.
- **Returns**: `Promise<{ publicKey: string, handle: string, attempts: number }>`
- **Example**:
    ```javascript
    const { handle } = await db.signupWithSuffix('alice', 'pass', '1337');
    // Result: alice#1337
    ```

#### `login(password)`

Decrypts the locally stored identity using the provided password.

- **Parameters**:
    - `password` (string): The password used during signup.
- **Returns**: `Promise<{ publicKey: string }>`
- **Example**:
    ```javascript
    await db.login('password123');
    ```

#### `logout()`

Logs out the current user by clearing runtime keys from memory.

- **Returns**: `Promise<void>`

#### `isLoggedIn()`

Checks if a user is currently logged in.

- **Returns**: `boolean`

#### `changePassword(oldPassword, newPassword)`

Changes the encryption password for the current identity.

- **Parameters**:
    - `oldPassword` (string)
    - `newPassword` (string)
- **Returns**: `Promise<void>`

#### `exportIdentity(password)`

Exports the current identity as an encrypted backup string.

- **Parameters**:
    - `password` (string): Password to encrypt the backup with.
- **Returns**: `Promise<string>` (Encrypted JSON string)

#### `importIdentity(backupString, password)`

Imports an identity from an encrypted backup string.

- **Parameters**:
    - `backupString` (string): The export string.
    - `password` (string): The password used to encrypt the backup.
- **Returns**: `Promise<{ publicKey: string, handle: string }>`

#### `put(key, value, options?)`

Stores a value in the database.

- **Parameters**:
    - `key` (string): The path/key for the data.
    - `value` (any): The JSON-serializable data to store.
    - `options` (object):
        - `space` (string): Target space (`'all'`, `'frozen'`, or `'user'`). Default: `'user'`.
        - `volatile` (boolean): If true, skips persisting to disk (useful for high-freq updates).
        - `silent` (boolean): If true, suppresses event emission.
- **Returns**: `Promise<string>` (The hash of the stored node)

#### `get(key, options?)`

Retrieves a value from the database.

- **Parameters**:
    - `key` (string): The path/key to retrieve.
    - `options` (object):
        - `space` (string): Source space (`'all'`, `'frozen'`, or `'user'`).
- **Returns**: `Promise<any>`

#### `connect(signalingUrl, options?)`

Connects to the P2P network via a signaling server.

- **Parameters**:
    - `signalingUrl` (string): The URL of the WebSocket signaling server.
    - `options` (object): Configuration options for WebRTC.
- **Returns**: `Promise<void>`

#### `sync(key)`

Requests a specific key from connected peers.

- **Parameters**:
    - `key` (string)
- **Returns**: `Promise<void>`

#### `syncAll()`

Triggers a full bidirectional sync with specific connected peers.

- **Returns**: `Promise<void>`

#### `getHandle()`

Returns the full handle of the currently authenticated user.

- **Returns**: `string` (e.g., `alice#ABCD`)

#### `claimUsername(username)`

Claims a global username.

- **Parameters**:
    - `username` (string)
- **Returns**: `Promise<object>` (The claim object)

#### `whois(username)`

Look up a user by their global username.

- **Parameters**:
    - `username` (string)
- **Returns**: `Promise<object | null>` (The winner of the name claim)

#### `revokeUsername(username)`

Revokes a previously claimed username.

- **Parameters**:
    - `username` (string)
- **Returns**: `Promise<object>` (The revoked claim)

# Getting Started with Railgun

Railgun is a decentralized, peer-to-peer database library that provides cryptographic identity, content-addressable storage, and automatic synchronization.

## Prerequisites

- **Node.js**: v18 or higher (for server-side usage)
- **Browser**: Modern browser with WebRTC and IndexedDB support (Chrome, Firefox, Safari, Edge)

## Installation

Install the package using npm:

```bash
npm install railgundb
```

## Quick Start

This guide will help you set up a basic RAILGUN instance, create an identity, and share data.

### 1. Initialize the Database

Import `Railgun` and create an instance. Railgun automatically selects the best storage adapter for your environment (IndexedDB for browsers, File System for Node.js).

```javascript
import { Railgun } from 'railgundb';

const db = await Railgun.create();
```

### 2. Create an Identity

Create a new cryptographic identity using a display name and a secure password. The password encrypts your private key.

```javascript
// Signup creates a new keypair and registers your handle locally and on the network
const { handle } = await db.signup('alice', 'secure-password');
console.log(`Your handle: ${handle}`); // e.g., "alice#K9FQ"
```

> **Note**: Your "handle" includes a deterministic 4-character suffix generated from your public key. This ensures global uniqueness without a central registry.

### 3. Store Data

Store data in your private user space. This data is encrypted and only accessible by you.

```javascript
await db.put(
    'profile',
    {
        bio: 'Decentralized web enthusiast',
        created: Date.now()
    },
    { space: 'user' }
);
```

### 4. Connect to Peers

Connect to a signaling server to discover and sync with other peers. The signaling server helps facilitate the initial WebRTC handshake but does not see your encrypted data.

```javascript
await db.connect('http://localhost:3000');
```

### 5. Sync Data

Data synchronizes automatically when accessed or when updates occur.

```javascript
// Reading data triggers a network lookup if not found locally
const sharedData = await db.get('shared-config', { space: 'all' });
console.log(sharedData);

// Listen for real-time updates (if supported by your app logic)
db.events.on('shared-config', (data) => {
    console.log('Update received:', data);
});
```

## Next Steps

- Explore [Core Concepts](./concepts.md) to understand how Railgun works.
- Check the [API Reference](./api-reference.md) for detailed method documentation.
- Learn about the [Architecture](./architecture.md).

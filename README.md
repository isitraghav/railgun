# Railgun

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-orange.svg)

**A decentralized, encrypted, peer-to-peer database with cryptographic identity and deterministic conflict resolution.**

Railgun provides a secure, distributed storage layer for decentralized applications. It combines cryptographic identity (Ed25519), content-addressable storage (Merkle Tries), and peer-to-peer networking (WebRTC) into a simple, easy-to-use API.

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- [Getting Started](./docs/getting-started.md): Installation, quick start, and basic usage.
- [Core Concepts](./docs/concepts.md): Deep dive into Identity, Data Spaces, and P2P Sync.
- [API Reference](./docs/api-reference.md): Detailed documentation for all methods and classes.
- [Architecture](./docs/architecture.md): System design, layers, and storage adapters.

## Features

- **Cryptographic Identity**: Secure user accounts using Ed25519 keypairs.
- **Suffix-Based Handles**: Human-readable display names with deterministic suffixes (e.g., `alice#K9FQ`).
- **Merkle Trie Storage**: Verifiable, content-addressable data structure.
- **P2P Sync**: Real-time synchronization between peers using WebRTC.
- **Data Spaces**: Granular control over data visibility and mutability (`all`, `frozen`, `user`).
- **Platform Agnostic**: Runs in Node.js (File System) and Browsers (IndexedDB).

## Installation

```bash
npm install railgundb
```

## Quick Start

```javascript
import { Railgun } from 'railgundb';

// 1. Initialize
const db = await Railgun.create();

// 2. Create Identity
const { handle } = await db.signup('alice', 'my-secure-password');
console.log(`Signed up as ${handle}`);

// 3. Store Data (Encrypted)
await db.put('notes/secret', 'This is private', { space: 'user' });

// 4. Connect to Network
await db.connect('http://localhost:3000');
```

## License

MIT

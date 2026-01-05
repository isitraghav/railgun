# Architecture

Railgun is designed as a modular, layered system.

```mermaid
graph TD
    API[Public API] --> Identity[Identity & Auth Layer]
    Identity --> Trie[Merkle Trie (HAMT)]
    Trie --> Storage[Storage Adapters]
    API --> Network[P2P Network Layer]
    Network --> Signaling[Signaling Client]
    Network --> WebRTC[WebRTC Data Channels]
    Trie -. Sync .-> Network
```

## Layers

### 1. API Layer

The `Railgun` class provides the high-level interface for developers (`put`, `get`, `signup`, `connect`). It coordinates between the identity, storage, and network subsystems.

### 2. Identity & Encryption

Handles key generation, signing, and encryption.

- **Signatures**: Ed25519 (using `@noble/ed25519`).
- **Encryption**: AES-GCM for content encryption.
- **Key Derivation**: PBKDF2 for password-based key protection.
- **Brute-force Suffixes**: optimized key generation to find desired suffixes.

### 3. Merkle Trie (State)

The core data structure is a Hash Array Mapped Trie (HAMT).

- Ensures efficient lookups and updates.
- Provides a root hash that represents the entire state of the database.
- Enables efficient state synchronization by comparing hashes.
- **Binary Format**: Custom binary serialization for nodes to ensure compact storage.

### 4. Network Layer

Handles peer discovery and data transport.

- **Signaling**: Uses a simple WebSocket server to exchange SDP offers/answers.
- **Transport**: WebRTC Data Channels for low-latency, encrypted peer-to-peer transfer.
- **Protocol**: Custom JSON-RPC style protocol for `get`, `put`, and `sync` operations.

### 5. Storage Adapters

Abstracts the underlying persistence mechanism.

- **BrowserAdapter**: Uses `IndexedDB` for persistent browser storage.
- **NodeAdapter**: Uses the local file system (serialized files in `.railgun/`).
- **MemoryAdapter**: In-memory storage for testing.

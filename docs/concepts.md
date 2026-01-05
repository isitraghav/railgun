# Core Concepts

Railgun is built on several key concepts that enable secure, decentralized data synchronization.

## Identity System

Railgun eschews traditional centralized username registries in favor of cryptographic identities.

- **Public Key as ID**: Your stable identifier is your Ed25519 public key.
- **Display Names**: Users choose a display name (e.g., "alice").
- **Suffix Disambiguation**: To handle name collisions without a central authority, a deterministic 4-character suffix is generated from the public key hash.

### Handle Format

`displayName#suffix` (e.g., `alice#K9FQ`)

This ensures that while display names can be non-unique, the full handle is globally unique and verifiable.

## Data Spaces

Data is organized into "spaces" with different visibility and mutability rules.

### `all` (Public Space)

- **Access**: readable and writable by anyone.
- **Conflict Resolution**: Last-Write-Wins (LWW) based on timestamps.
- **Use Case**: Public announcements, shared configuration, chat rooms.

### `frozen` (Immutable Space)

- **Access**: Readable by anyone. Writable once.
- **Conflict Resolution**: First-Write-Wins. Attempts to overwrite valid data are rejected.
- **Use Case**: Trust anchors, historical records, genesis blocks, resolving global usernames.

### `user` (Private Space)

- **Access**: Readable and writable only by the owner (associated with the private key).
- **Encryption**: Data is encrypted using a key derived from the user's password/master key before storage and transmission.
- **Use Case**: User profiles, private notes, application settings.

## Merkle Trie Storage

Under the hood, Railgun stores data in a Merkle Trie (specifically a HAMT - Hash Array Mapped Trie).

- **Content Addressing**: Data is referenced by its hash.
- **Integrity**: Any change in data changes the root hash, making tampering evident.
- **Efficiency**: Only changed branches of the trie need to be synced.
- **Bit-level optimizaton**: Uses a custom binary format to reduce storage overhead by up to 75% compared to raw JSON.

## Peer-to-Peer Synchronization

Railgun uses a hybrid P2P approach.

1. **Signaling**: A lightweight WebSocket server helps peers find each other (SDP exchange).
2. **Data Transfer**: WebRTC Data Channels are used for direct, encrypted peer-to-peer communication.
3. **NAT Traversal**: STUN servers are used to punch holes through NATs, allowing direct connections.

When you request a key via `db.get()`, if it is not found locally, the query is propagated to connected peers.

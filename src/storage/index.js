/**
 * Base Storage Adapter Interface
 */
export class StorageAdapter {
    async put(_hash, _data) {
        throw new Error('Not implemented');
    }
    async get(_hash) {
        throw new Error('Not implemented');
    }
}

/**
 * Stub for SingleFileStorage in browser environments.
 * This file is swapped in by the "browser" field in package.json.
 */
export class SingleFileStorage {
    constructor() {
        throw new Error(
            'SingleFileStorage is not supported in the browser. Use BrowserIDBStorage instead.'
        );
    }
}

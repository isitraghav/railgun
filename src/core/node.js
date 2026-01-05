import { canonicalize } from './utils.js';
import { hash } from './crypto.js';

export class Node {
    constructor(data = {}) {
        this.value = data.value || null;
        this.children = data.children || {};
    }

    getHash() {
        const raw = {
            value: this.value,
            children: this.children
        };

        return hash(canonicalize(raw));
    }

    serialize() {
        return canonicalize({
            value: this.value,
            children: this.children
        });
    }

    static deserialize(jsonStr) {
        const data = JSON.parse(jsonStr);
        return new Node(data);
    }
}

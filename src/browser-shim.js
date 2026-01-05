if (typeof globalThis !== 'undefined') {
    if (typeof globalThis.process === 'undefined') {
        globalThis.process = {
            env: {},
            nextTick: function (cb, ...args) {
                if (typeof queueMicrotask === 'function') {
                    queueMicrotask(() => cb(...args));
                } else {
                    setTimeout(cb, 0, ...args);
                }
            },
            version: ''
        };
    } else if (!globalThis.process.nextTick) {
        globalThis.process.nextTick = function (cb, ...args) {
            if (typeof queueMicrotask === 'function') {
                queueMicrotask(() => cb(...args));
            } else {
                setTimeout(cb, 0, ...args);
            }
        };
    }
}

/**
 * Lightweight MessagePack encoder/decoder
 * Implements core MessagePack spec for compact binary serialization
 * Zero dependencies - works in browser and Node.js
 */

/**
 * Encode value to MessagePack binary format
 * @param {any} value - Value to encode
 * @returns {Uint8Array} - Encoded binary data
 */
export function encode(value) {
    const parts = [];

    function encodeValue(val) {
        if (val === null || val === undefined) {
            parts.push(0xc0);
        } else if (val === false) {
            parts.push(0xc2);
        } else if (val === true) {
            parts.push(0xc3);
        } else if (typeof val === 'number') {
            if (Number.isInteger(val)) {
                if (val >= 0) {
                    if (val < 128) {
                        parts.push(val);
                    } else if (val < 256) {
                        parts.push(0xcc, val);
                    } else if (val < 65536) {
                        parts.push(0xcd, val >> 8, val & 0xff);
                    } else if (val < 4294967296) {
                        parts.push(
                            0xce,
                            (val >> 24) & 0xff,
                            (val >> 16) & 0xff,
                            (val >> 8) & 0xff,
                            val & 0xff
                        );
                    } else {
                        encodeFloat64(val);
                    }
                } else {
                    if (val >= -32) {
                        parts.push(val & 0xff);
                    } else if (val >= -128) {
                        parts.push(0xd0, val & 0xff);
                    } else if (val >= -32768) {
                        parts.push(0xd1, (val >> 8) & 0xff, val & 0xff);
                    } else {
                        parts.push(
                            0xd2,
                            (val >> 24) & 0xff,
                            (val >> 16) & 0xff,
                            (val >> 8) & 0xff,
                            val & 0xff
                        );
                    }
                }
            } else {
                encodeFloat64(val);
            }
        } else if (typeof val === 'string') {
            const utf8 = new TextEncoder().encode(val);
            const len = utf8.length;

            if (len < 32) {
                parts.push(0xa0 | len);
            } else if (len < 256) {
                parts.push(0xd9, len);
            } else if (len < 65536) {
                parts.push(0xda, len >> 8, len & 0xff);
            } else {
                parts.push(
                    0xdb,
                    (len >> 24) & 0xff,
                    (len >> 16) & 0xff,
                    (len >> 8) & 0xff,
                    len & 0xff
                );
            }
            parts.push(...utf8);
        } else if (Array.isArray(val)) {
            const len = val.length;

            if (len < 16) {
                parts.push(0x90 | len);
            } else if (len < 65536) {
                parts.push(0xdc, len >> 8, len & 0xff);
            } else {
                parts.push(
                    0xdd,
                    (len >> 24) & 0xff,
                    (len >> 16) & 0xff,
                    (len >> 8) & 0xff,
                    len & 0xff
                );
            }
            val.forEach(encodeValue);
        } else if (val instanceof Uint8Array) {
            const len = val.length;
            if (len < 256) {
                parts.push(0xc4, len);
            } else if (len < 65536) {
                parts.push(0xc5, len >> 8, len & 0xff);
            } else {
                parts.push(
                    0xc6,
                    (len >> 24) & 0xff,
                    (len >> 16) & 0xff,
                    (len >> 8) & 0xff,
                    len & 0xff
                );
            }
            parts.push(...val);
        } else if (typeof val === 'object') {
            const keys = Object.keys(val);
            const len = keys.length;

            if (len < 16) {
                parts.push(0x80 | len);
            } else if (len < 65536) {
                parts.push(0xde, len >> 8, len & 0xff);
            } else {
                parts.push(
                    0xdf,
                    (len >> 24) & 0xff,
                    (len >> 16) & 0xff,
                    (len >> 8) & 0xff,
                    len & 0xff
                );
            }
            keys.forEach((key) => {
                encodeValue(key);
                encodeValue(val[key]);
            });
        }
    }

    function encodeFloat64(val) {
        parts.push(0xcb);
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setFloat64(0, val, false);
        const bytes = new Uint8Array(buffer);
        parts.push(...bytes);
    }

    encodeValue(value);
    return new Uint8Array(parts);
}

/**
 * Decode MessagePack binary to JavaScript value
 * @param {Uint8Array} buffer - Binary data to decode
 * @returns {any} - Decoded value
 */
export function decode(buffer) {
    let offset = 0;

    function decodeValue() {
        const byte = buffer[offset++];

        if (byte < 0x80) return byte;

        if ((byte & 0xf0) === 0x80) {
            const len = byte & 0x0f;
            return decodeMap(len);
        }

        if ((byte & 0xf0) === 0x90) {
            const len = byte & 0x0f;
            return decodeArray(len);
        }

        if ((byte & 0xe0) === 0xa0) {
            const len = byte & 0x1f;
            return decodeString(len);
        }

        if (byte >= 0xe0) return byte - 256;

        switch (byte) {
            case 0xc0:
                return null;
            case 0xc2:
                return false;
            case 0xc3:
                return true;

            case 0xcc:
                return buffer[offset++];
            case 0xcd:
                return (buffer[offset++] << 8) | buffer[offset++];
            case 0xce:
                return (
                    ((buffer[offset++] << 24) |
                        (buffer[offset++] << 16) |
                        (buffer[offset++] << 8) |
                        buffer[offset++]) >>>
                    0
                );

            case 0xd0:
                return (buffer[offset++] << 24) >> 24;
            case 0xd1:
                return (buffer[offset++] << 8) | buffer[offset++];
            case 0xd2:
                return (
                    (buffer[offset++] << 24) |
                    (buffer[offset++] << 16) |
                    (buffer[offset++] << 8) |
                    buffer[offset++]
                );

            case 0xcb: {
                const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
                offset += 8;
                return view.getFloat64(0, false);
            }

            case 0xd9:
                return decodeString(buffer[offset++]);
            case 0xda: {
                const len = (buffer[offset++] << 8) | buffer[offset++];
                return decodeString(len);
            }
            case 0xdb: {
                const len =
                    ((buffer[offset++] << 24) |
                        (buffer[offset++] << 16) |
                        (buffer[offset++] << 8) |
                        buffer[offset++]) >>>
                    0;
                return decodeString(len);
            }

            case 0xc4:
                return decodeBinary(buffer[offset++]);
            case 0xc5: {
                const len = (buffer[offset++] << 8) | buffer[offset++];
                return decodeBinary(len);
            }
            case 0xc6: {
                const len =
                    ((buffer[offset++] << 24) |
                        (buffer[offset++] << 16) |
                        (buffer[offset++] << 8) |
                        buffer[offset++]) >>>
                    0;
                return decodeBinary(len);
            }

            case 0xdc: {
                const len = (buffer[offset++] << 8) | buffer[offset++];
                return decodeArray(len);
            }
            case 0xdd: {
                const len =
                    ((buffer[offset++] << 24) |
                        (buffer[offset++] << 16) |
                        (buffer[offset++] << 8) |
                        buffer[offset++]) >>>
                    0;
                return decodeArray(len);
            }

            case 0xde: {
                const len = (buffer[offset++] << 8) | buffer[offset++];
                return decodeMap(len);
            }
            case 0xdf: {
                const len =
                    ((buffer[offset++] << 24) |
                        (buffer[offset++] << 16) |
                        (buffer[offset++] << 8) |
                        buffer[offset++]) >>>
                    0;
                return decodeMap(len);
            }

            default:
                throw new Error(`Unknown MessagePack type: 0x${byte.toString(16)}`);
        }
    }

    function decodeString(len) {
        const bytes = buffer.slice(offset, offset + len);
        offset += len;
        return new TextDecoder().decode(bytes);
    }

    function decodeBinary(len) {
        const bytes = buffer.slice(offset, offset + len);
        offset += len;
        return bytes;
    }

    function decodeArray(len) {
        const arr = [];
        for (let i = 0; i < len; i++) {
            arr.push(decodeValue());
        }
        return arr;
    }

    function decodeMap(len) {
        const obj = {};
        for (let i = 0; i < len; i++) {
            const key = decodeValue();
            const val = decodeValue();
            obj[key] = val;
        }
        return obj;
    }

    return decodeValue();
}

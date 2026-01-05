import { defineConfig, loadEnv } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
    // Load env file based on `mode` in the current working directory.
    // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
    const env = loadEnv(mode, process.cwd(), '');

    return {
        plugins: [
            nodePolyfills({
                globals: {
                    Buffer: true,
                    global: true,
                    process: true
                }
            })
        ],
        define: {
            'process.env.SIGNALLING': JSON.stringify(env.SIGNALLING)
        },
        build: {
            rollupOptions: {
                input: {
                    main: 'index.html',
                    notepad: 'notepad.html',
                    cursor: 'cursor.html',
                    stress: 'stress-test.html'
                }
            }
        },
        server: {
            port: 5173
        }
    };
});

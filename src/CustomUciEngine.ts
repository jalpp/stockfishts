import { EngineName } from './engineTypes';
import { EngineWorker } from './EngineWorker';
import { UciEngine } from './UciEngine';

export interface CustomUciEngineOptions {
    /**
     * Whether to verify WebAssembly support before constructing the engine.
     * Set to false if you are providing a custom worker implementation that does not rely on wasm.
     */
    checkWasmSupport?: boolean;
}

/**
 * A generic UCI engine wrapper for wasm-backed engines that are not limited to Stockfish.
 *
 * Use this when you have a worker script or custom worker implementation for another
 * UCI-compatible wasm engine and want to use the same API as the stockfish wrappers.
 */
export class CustomUciEngine extends UciEngine {
    /**
     * Creates a new custom UCI engine from either a worker script URL or an existing worker adapter.
     *
     * @param pathOrWorker A URL to a wasm worker script or a pre-built EngineWorker implementation.
     * @param name The engine name that will be exposed through the base engine API.
     * @param options Optional runtime behavior for wasm checks.
     */
    constructor(
        pathOrWorker: string | EngineWorker,
        name: string | EngineName = 'custom-uci-engine',
        options: CustomUciEngineOptions = {},
    ) {
        const { checkWasmSupport = true } = options;

        if (checkWasmSupport && !CustomUciEngine.isSupported()) {
            throw new Error(`${name} requires WebAssembly support.`);
        }

        const worker = typeof pathOrWorker === 'string'
            ? UciEngine.workerFromPath(pathOrWorker)
            : pathOrWorker;

        super(name, worker);
    }

    /**
     * Returns true when the current runtime exposes a usable WebAssembly implementation.
     */
    public static isSupported(): boolean {
        const wasm = (globalThis as typeof globalThis & { WebAssembly?: typeof WebAssembly }).WebAssembly;

        if (!wasm || typeof wasm.validate !== 'function') {
            return false;
        }

        try {
            return wasm.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
        } catch {
            return false;
        }
    }
}

import { EngineName } from './engineTypes';
import { EngineWorker } from './EngineWorker';
import { UciEngine } from './UciEngine';

/**
 * A Stockfish-specific wrapper around the generic UCI engine API.
 *
 * Use this class when you want to run a Stockfish-compatible wasm worker from a URL
 * or from a pre-built worker adapter that already implements the EngineWorker interface.
 */
export class StockfishWasmEngine extends UciEngine {
    /**
     * Creates a Stockfish wasm engine instance.
     *
     * @param pathOrWorker Either a URL to a worker script or an existing EngineWorker implementation.
     * @param name The engine identifier to expose through the base engine API.
     */
    constructor(pathOrWorker: string | EngineWorker, name: string | EngineName) {
        if (!StockfishWasmEngine.isSupported()) {
            throw new Error(`${name} is not supported`);
        }

         const worker =
            typeof pathOrWorker === 'string'
                ? UciEngine.workerFromPath(pathOrWorker)
                : pathOrWorker;
                
        super(name, worker);
    }

    /**
     * Returns true when the current runtime exposes a working WebAssembly implementation.
     */
    public static isSupported(): boolean {
        return (
            typeof WebAssembly === 'object' &&
            WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))
        );
    }
}


import { EngineName } from './engineTypes';
import { EngineWorker } from './EngineWorker';
import { UciEngine } from './UciEngine';

/**
 * A lightweight wrapper for running a Stockfish-compatible engine without a wasm support check.
 *
 * This is useful when your engine worker is already provided by a custom runtime or when you
 * want to use the same UCI-based API without requiring WebAssembly support.
 */
export class StockfishSimpleEngine extends UciEngine {

    /**
     * Creates a simple Stockfish engine wrapper.
     *
     * @param pathOrWorker Either a worker script URL or an existing EngineWorker implementation.
     * @param name The engine identifier to expose through the base engine API.
     */
    constructor(pathOrWorker: string | EngineWorker, name: string | EngineName) {
        const worker =
            typeof pathOrWorker === 'string'
                ? UciEngine.workerFromPath(pathOrWorker)
                : pathOrWorker;

        super(name, worker);
    }
}

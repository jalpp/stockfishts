import { Mutex } from 'async-mutex';
import { EngineWorker } from './EngineWorker.js';
import {
    ENGINE_DEPTH,
    ENGINE_HASH,
    ENGINE_LINE_COUNT,
    ENGINE_THREADS,
    EngineName,
    EvaluatePositionWithUpdateParams,
    PositionEval,
} from './engineTypes.js';
import { parseEvaluationResults } from './parseResults.js';



/**
 * Base abstraction for running a UCI-compatible engine through an EngineWorker.
 *
 * This class provides the common lifecycle and evaluation workflow used by
 * Stockfish-style engines, including initialization, command dispatch,
 * stopping searches, and incremental evaluation callbacks.
 */
export abstract class UciEngine {
    protected worker: EngineWorker | undefined;
    private ready = false;
    private engineName: EngineName | string;
    private multiPv: number = ENGINE_LINE_COUNT.Default;
    private threads: number = ENGINE_THREADS.Default;
    private hash: number = Math.pow(2, ENGINE_HASH.Default);
    private observers = new Set<(message: string) => void>();
    private elo = 2900;
    private stopMutex = new Mutex();
    private runMutex = new Mutex();

    /**
     * Creates an EngineWorker from a worker script URL.
     *
     * This uses the runtime's global Worker constructor when available. In Node.js
     * or other runtimes without a global Worker, create your own EngineWorker
     * implementation and pass it directly to the engine constructor instead.
     *
     * @param path The URL or path to the worker script.
     * @returns An EngineWorker adapter that forwards UCI messages to the worker.
     * @throws Error when the current runtime does not provide a Worker implementation.
     */
    public static workerFromPath(path: string): EngineWorker {
        if (typeof Worker === 'undefined') {
            throw new Error(
                'Global Worker is not available in this environment (e.g. Node.js). ' +
                'Construct your own EngineWorker (e.g. via child_process or worker_threads) ' +
                'and pass it directly to the engine constructor instead of a path.',
            );
        }

        const worker = new Worker(path);

        const engineWorker: EngineWorker = {
            uci(command) {
                worker.postMessage(command);
            },
            listen(data) {
                
            },
            onError(msg) {
                
            },
            terminate() {
                worker.terminate();
            },
        };

        worker.onmessage = (event: MessageEvent) => {
            engineWorker.listen(event.data as string);
        };
        worker.onerror = (err: ErrorEvent) => {
            engineWorker.onError(err);
        };

        return engineWorker;
    }

    /**
     * Constructs a new UciEngine instance.
     *
     * @param engineName The engine identifier shown by the base engine API.
     * @param worker An optional worker adapter that implements the UCI protocol.
     */
    constructor(engineName: EngineName | string, worker?: EngineWorker) {
        this.engineName = engineName;
        this.worker = worker;
      
        
    }

    /**
     * Initializes the engine by sending the standard UCI startup handshake.
     *
     * This must be called before evaluating positions or sending engine commands.
     */
    public async init(): Promise<void> {
        if (this.worker) {
            this.worker.listen = this.publishMessage;
            await this.sendCommands(['uci'], 'uciok');
            await this.sendCommands(
                ['setoption name UCI_ShowWDL value true', 'isready', `setoption name UCI_LimitStrength value true`,
                     `setoption name UCI_Elo value ${this.elo}`],
                'readyok',
            );
            await this.setMultiPv(this.multiPv, true);
            await this.setThreads(this.threads, true);
            await this.setHash(this.hash, true);
            this.ready = true;
           
        }
    }

    /**
     * Adds an observer to be notified of UCI messages.
     * @param observer The observer to add.
     */
    private addObserver(observer: (message: string) => void) {
        this.observers.add(observer);
    }

    /**
     * Removes an observer from being notified of UCI messages.
     * @param observer The observer to remove.
     */
    private removeObserver(observer: (message: string) => void) {
        this.observers.delete(observer);
    }

    /**
     * Publishes the given message to this UciEngine's observers.
     * @param message The message to publish.
     */
    private publishMessage = (message: string) => {
        for (const observer of this.observers) {
            observer(message);
        }
    };

    /**
     * Sets the engine Elo rating used during initialization.
     *
     * @param elo The Elo value to request from the engine.
     */
    public setElo(elo: number ){
        this.elo = elo;
    }

    /**
     * Sends the given UCI commands and resolves once the expected final message is returned.
     * @param commands The commands to send to the engine.
     * @param finalMessage The final message to wait for.
     * @param onNewMessage An optional function called with each new message from the engine.
     * @returns A Promise that resolves with all engine messages once finalMessage is detected.
     */
    protected async sendCommands(
        commands: string[],
        finalMessage: string,
        onNewMessage?: (messages: string[]) => void,
    ): Promise<string[]> {
        return new Promise((resolve) => {
            if (!this.worker) {
                return [];
            }

            const messages: string[] = [];

            const observer = (message: string) => {
                
                messages.push(message);
                onNewMessage?.(messages);

                if (message.startsWith(finalMessage)) {
                    this.removeObserver(observer);
                    resolve(messages);
                }
            };
            this.addObserver(observer);

            for (const command of commands) {
                
                this.worker.uci(command);
            }
        });
    }

    /**
     * Sets the multiPv (number of lines) option. See https://disservin.github.io/stockfish-docs/stockfish-wiki/Terminology.html#multiple-pvs.
     * @param multiPv The number of lines to set.
     * @param forceInit If true, the option is set even if multiPv is equal to this.multiPv. If false, an error is thrown if the engine is not ready.
     * @returns A Promise that resolves once the engine is ready.
     */
    private async setMultiPv(multiPv: number, forceInit = false) {
        if (!forceInit) {
            if (multiPv === this.multiPv) return;

            this.throwErrorIfNotReady();
        }

        if (multiPv > ENGINE_LINE_COUNT.Max) {
            throw new Error(`Invalid MultiPV value : ${multiPv}`);
        }
        if (multiPv < 1) {
            multiPv = 1;
        }

        await this.sendCommands([`setoption name MultiPV value ${multiPv}`, 'isready'], 'readyok');

        this.multiPv = multiPv;
    }

    /**
     * Sets the thread count for the engine.
     * @param threads The number of threads to use.
     * @param forceInit If true, the option is set even if threads is equal to this.threads.
     * @returns A Promise that resolves once the engine is ready.
     */
    private async setThreads(threads: number, forceInit = false) {
        if (!forceInit) {
            if (threads === this.threads) {
                return;
            }
            this.throwErrorIfNotReady();
        }

        if (threads < ENGINE_THREADS.Min || threads > ENGINE_THREADS.Max) {
           this.threads = ENGINE_THREADS.Min ;
        }
        await this.sendCommands([`setoption name Threads value ${threads}`, 'isready'], 'readyok');
        this.threads = threads;
    }

    /**
     * Sets the hash size in MB for the engine.
     * @param hash The hash size in MB.
     * @param forceInit If true, the option is set even if hash is equal to this.hash.
     * @returns A Promise that resolves once the engine is ready.
     */
    private async setHash(hash: number, forceInit = false) {
        if (!forceInit) {
            if (hash === this.hash) {
                return;
            }
            this.throwErrorIfNotReady();
        }

        if (hash < Math.pow(2, ENGINE_HASH.Min) || hash > Math.pow(2, ENGINE_HASH.Max)) {
            // throw new Error(
            //     `Invalid threads value (${hash}) is not in range [${Math.pow(2, ENGINE_HASH.Min)}, ${Math.pow(2, ENGINE_HASH.Max)}]`,
            // );
            this.hash = Math.pow(2, ENGINE_HASH.Min)
        }
        await this.sendCommands([`setoption name Hash value ${hash}`, 'isready'], 'readyok');
        this.hash = hash;
    }

    /**
     * Throws an error if the engine is not ready.
     */
    private throwErrorIfNotReady() {
        if (!this.ready) {
            throw new Error(`${this.engineName} is not ready`);
        }
    }

    /**
     * Shuts down the engine and terminates the underlying worker.
     */
    public shutdown(): void {
        this.ready = false;
        this.publishMessage('bestmove');
        this.worker?.uci('quit');
        this.worker?.terminate?.();
      
    }

    /**
     * Returns whether the engine has completed initialization.
     *
     * @returns True when the engine is ready to evaluate positions.
     */
    public isReady(): boolean {
        return this.ready;
    }

    /**
     * Stops the current search as soon as possible.
     *
     * @returns A promise resolving with the engine response messages.
     */
    public async stopSearch(): Promise<string[]> {
        return this.sendCommands(['stop', 'isready'], 'readyok');
    }

    /**
     * Evaluates a position and streams partial results while the engine is thinking.
     *
     * @param fen The FEN string describing the position to analyze.
     * @param depth The search depth to request from the engine.
     * @param multiPv The number of principal variation lines to request.
     * @param setPartialEval Called with incremental evaluation updates as new engine messages arrive.
     * @returns A promise resolving with the final evaluation result.
     */
    public async evaluatePositionWithUpdate({
        fen,
        depth = ENGINE_DEPTH.Default,
        multiPv = this.multiPv,
        threads = ENGINE_THREADS.Default,
        hash = Math.pow(2, ENGINE_HASH.Default),
        setPartialEval,
    }: EvaluatePositionWithUpdateParams): Promise<PositionEval> {
        this.throwErrorIfNotReady();

        this.stopMutex.cancel();
        await this.stopMutex.acquire();

        // Only 1 thread can stop current position and start running SF on new position now
        await this.stopSearch();

        return this.runMutex.runExclusive(async () => {
            await this.setMultiPv(multiPv);
            await this.setThreads(threads);
            await this.setHash(hash);

            const whiteToPlay = fen.split(' ')[1] === 'w';

            const onNewMessage = (messages: string[]) => {
                const parsedResults = parseEvaluationResults(fen, messages, whiteToPlay);
        
                setPartialEval?.(parsedResults);
            };

           
            const promise = this.sendCommands(
                [`position fen ${fen}`, `go depth ${depth}`],
                'bestmove',
                onNewMessage,
            );
            this.stopMutex.release(); // Other threads can now stop running this position

            const results = await promise;
            
            return parseEvaluationResults(fen, results, whiteToPlay);
        });
    }

    
}
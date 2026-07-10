/**
 * Minimal adapter contract for a UCI-compatible worker implementation.
 *
 * Consumers can provide their own implementation for browsers, Node.js, or any
 * custom runtime that can send and receive UCI commands.
 */
export interface EngineWorker {
    /**
     * Sends a single UCI command to the underlying engine worker.
     *
     * @param command The UCI command to send, for example "uci" or "go depth 10".
     */
    uci(command: string): void;

    /**
     * Receives data back from the worker and forwards it to the engine wrapper.
     *
     * @param data The raw message emitted by the worker.
     */
    listen: (data: string) => void;

    /**
     * Optional helper for engines that support NNUE network switching.
     *
     * @param data The buffer containing the NNUE data.
     * @param index Optional network index.
     */
    setNnueBuffer?: (data: Uint8Array, index?: number) => void;

    /**
     * Optional helper for engines that expose a recommended NNUE file.
     *
     * @param index Optional network index.
     * @returns A filename or identifier for the recommended NNUE file.
     */
    getRecommendedNnue?: (index?: number) => string;

    /**
     * Receives error data emitted by the worker.
     *
     * @param err The error object or message sent by the worker.
     */
    onError: (err: unknown) => void;

    /**
     * Stops the worker and releases any associated resources.
     */
    terminate?: () => void;
}

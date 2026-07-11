# stockfishts

stockfishts is a TypeScript library for running Stockfish engines from both frontend and backend projects. It supports WebAssembly-based engines, worker-based execution, and a small, ergonomic API for evaluating chess positions and receiving incremental updates. Stockfishts also supports API wrapper for cloud based stockfish based chessdb.

## Why use stockfishts?

- Run Stockfish-style engines in the browser with Web Workers and WebAssembly
- Use the same API in Node.js environments when a Worker-compatible runtime is available
- Send UCI commands directly through a simple engine abstraction
- Receive evaluation updates while the engine is thinking
- Connect to chessdb via ts based APIs

## Installation

```bash
npm install @jalpp/stockfishts
```

## Quick start

- Get the Stockfish.js wasm files from [Stockfish.js](https://github.com/nmrugg/stockfish.js/)

### Browser usage

```ts
import { StockfishWasmEngine, EngineName } from '@jalpp/stockfishts';

const engine = new StockfishWasmEngine('/stockfish.wasm.js', EngineName.Stockfish16);
await engine.init();

const result = await engine.evaluatePositionWithUpdate({
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  depth: 12,
  setPartialEval: (value) => console.log(value),
});

console.log(result);
engine.shutdown();
```

### Node.js usage

```ts
import { StockfishWasmEngine, EngineName } from '@jalpp/stockfishts';

const engine = new StockfishWasmEngine('/path/to/stockfish.wasm.js', EngineName.Stockfish18);
await engine.init();

const evaluation = await engine.evaluatePositionWithUpdate({
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  depth: 10,
});

console.log(evaluation);
engine.shutdown();
```

### ChessDB cloud database usage

```ts
import { ChessDbApi } from '@jalpp/stockfishts';

const cdb = new ChessDbApi();

const startpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// All known candidate moves, with eval, win rate, rank and a quality note
const all = await cdb.queryAll(startpos);
if (all.success) {
  console.log(all.data[0]); // { uci: 'e2e4', san: 'e4', score: '0.34', rawEval: 34, winrate: '55.32', rank: '1', note: 'Best' }
}

// ChessDB's single best known move
const best = await cdb.queryBest(startpos);
if (best.success) {
  console.log(best.data.move); // 'e2e4'
}

// Principal variation (best line) with score and depth
const pv = await cdb.queryPv(startpos);
if (pv.success) {
  console.log(pv.data.pvSAN.join(' '));
}

// Queue a position ChessDB doesn't know yet for background analysis
await cdb.queue(startpos);
```

Every `ChessDbApi` method returns a `ChessDbResult<T>` (`{ success: true, data: T }` or
`{ success: false, error: string }`) instead of throwing, so expected outcomes like an
unknown position or an invalid FEN can be handled without try/catch.

## Runtime notes

- In browser-based environments, the package expects a Worker-capable runtime and a reachable engine script URL.
- In Node.js environments, a Worker-compatible runtime must be available. If your runtime does not expose a global Worker constructor, provide one before creating an engine instance.
- WebAssembly support is checked at runtime before instantiating a wasm-backed engine.

## Framework examples

### Next.js example

```tsx
'use client';

import { useEffect, useState } from 'react';
import { StockfishWasmEngine, EngineName } from '@jalpp/stockfishts';

export default function ChessPage() {
  const [score, setScore] = useState<string>('Loading...');

  useEffect(() => {
    let engine: StockfishWasmEngine | undefined;

    async function run() {
      engine = new StockfishWasmEngine('/stockfish.wasm.js', EngineName.Stockfish18);
      await engine.init();

      const result = await engine.evaluatePositionWithUpdate({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        depth: 10,
      });

      setScore(result.lines[0]?.cp?.toString() ?? 'No evaluation');
      engine.shutdown();
    }

    run().catch(console.error);

    return () => engine?.shutdown();
  }, []);

  return <div>{score}</div>;
}
```

### React example

```tsx
import { useEffect, useState } from 'react';
import { StockfishWasmEngine, EngineName } from '@jalpp/stockfishts';

export function ChessEvaluator() {
  const [evaluation, setEvaluation] = useState('');

  useEffect(() => {
    const engine = new StockfishWasmEngine('/stockfish.wasm.js', EngineName.Stockfish16);

    engine.init().then(() => {
      return engine.evaluatePositionWithUpdate({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        depth: 8,
      });
    }).then((result) => {
      setEvaluation(result.bestMove ?? 'No move found');
      engine.shutdown();
    });
  }, []);

  return <div>{evaluation}</div>;
}
```

### UseEngine React hook (Next.js + React)

```tsx

import { useEffect, useState } from 'react';

import {
    EngineName,
    parseEngineName,
    StockfishSimpleEngine,
    StockfishWasmEngine,
    type UciEngine,
} from '@jalpp/stockfishts';

const ENGINE_PATHS: Record<EngineName, string> = {
    [EngineName.Stockfish18]: '/static/engine/stockfish-18/stockfish-18-lite-single.js#/static/engine/stockfish-18/stockfish-18-lite-single.wasm',
    [EngineName.Stockfish17Point]: '/static/engine/stockfish-17/stockfish-17.1-lite-single-03e3232.js#/static/engine/stockfish-17/stockfish-17.1-lite-single-03e3232.wasm',
    [EngineName.Stockfish17]: '/static/engine/stockfish-17/stockfish-17-lite.js#/static/engine/stockfish-17/stockfish-17-lite.wasm',
    [EngineName.Stockfish16]: '/static/engine/stockfish-16.1-lite.js#/static/engine/stockfish-16.1-lite.wasm',
    [EngineName.Stockfish11]: '/static/engine/stockfish-11.js',
};

export const useEngine = (enabled: boolean, engineName: EngineName | undefined) => {
    const [engine, setEngine] = useState<UciEngine>();
    const normalizedEngine = parseEngineName(engineName);

    useEffect(() => {
        if (!enabled || !normalizedEngine) return;

        const engine = pickEngine(normalizedEngine);
        console.log('Initializing engine');

        void engine.init().then(() => {
            console.log('Engine initialized');
            setEngine(engine);
        });

        return () => {
            engine.shutdown();
            setEngine(undefined);
        };
    }, [enabled, normalizedEngine]);

    return engine;
};

const pickEngine = (engine: EngineName): UciEngine => {
    const path = ENGINE_PATHS[engine];

    if (engine === EngineName.Stockfish11) {
        return new StockfishSimpleEngine(path, engine);
    }

    return new StockfishWasmEngine(path, engine);
};


```

### useChessDb React hook

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ChessDbApi, type ChessDbMove } from '@jalpp/stockfishts';

const cdb = new ChessDbApi();

export function useChessDb(fen: string) {
  const [data, setData] = useState<ChessDbMove[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMoves = useCallback(async (fenToQuery: string) => {
    setLoading(true);
    setError(null);

    const result = await cdb.queryAll(fenToQuery);
    if (result.success) {
      setData(result.data);
    } else {
      setData([]);
      setError(result.error);
      // Ask ChessDB to analyze positions it doesn't know yet.
      if (result.error === 'unknown') {
        void cdb.queue(fenToQuery);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchMoves(fen);
  }, [fen, fetchMoves]);

  return { data, loading, error, refetch: () => fetchMoves(fen) };
}
```

### Plain TypeScript example

```ts
import { StockfishWasmEngine, EngineName } from '@jalpp/stockfishts';

async function evaluate() {
  const engine = new StockfishWasmEngine('./stockfish.wasm.js', EngineName.Stockfish16);
  await engine.init();

  const result = await engine.evaluatePositionWithUpdate({
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    depth: 12,
  });

  console.log(result);
  engine.shutdown();
}

void evaluate();
```

### Custom wasm engine example

```ts
import { CustomUciEngine, EngineName } from '@jalpp/stockfishtss';

const engine = new CustomUciEngine('/my-custom-engine.wasm.js', EngineName.Stockfish16, {
  checkWasmSupport: true,
});

await engine.init();
const result = await engine.evaluatePositionWithUpdate({
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  depth: 10,
});

console.log(result);
engine.shutdown();
```

## API overview

The package exports:

- StockfishWasmEngine for Stockfish-compatible wasm engine usage
- StockfishSimpleEngine for simple worker-based engine usage
- CustomUciEngine for any UCI-compatible wasm engine that is not limited to Stockfish
- UciEngine as the base engine abstraction
- EngineWorker as the worker interface
- engine constants and result helpers from the engineTypes and parseResults modules
- ChessDbApi as a typed client for the ChessDB (chessdb.cn) cloud chess database

### Public API reference

#### UciEngine

- init(): initializes the engine and performs the standard UCI handshake
- setElo(elo): updates the Elo value requested during initialization
- stopSearch(): stops the current search immediately
- evaluatePositionWithUpdate(params): evaluates a position and streams partial updates
- shutdown(): terminates the underlying worker and resets the engine state
- isReady(): returns whether initialization has completed

#### StockfishWasmEngine

- constructor(pathOrWorker, name): creates a Stockfish-compatible wasm engine from a worker URL or existing worker adapter
- isSupported(): checks whether the current runtime exposes usable WebAssembly support

#### StockfishSimpleEngine

- constructor(pathOrWorker, name): creates a simple wrapper around a worker-style engine without wasm checks

#### CustomUciEngine

- constructor(pathOrWorker, name, options): creates a generic wrapper for any UCI-compatible wasm engine
- isSupported(): checks whether the current runtime exposes usable WebAssembly support

#### parseEvaluationResults(fen, results, whiteToPlay)

Parses raw UCI engine messages into a PositionEval object with principal variations and evaluation data.

#### ChessDbApi

A typed `fetch`-based client for the [ChessDB](https://www.chessdb.cn/cloudbookc_api_en.html) cloud chess
database. Every method resolves to a `ChessDbResult<T>` — `{ success: true, data: T }` on success, or
`{ success: false, error: string }` for both network failures and ChessDB's own error responses (e.g.
`"invalid board"`, `"unknown"`, `"nobestmove"`) — so callers don't need try/catch for expected outcomes.

- constructor(options?): creates a client. `options.baseUrl` overrides the ChessDB endpoint; `options.fetchImpl` overrides the `fetch` implementation (useful in Node.js runtimes without a global `fetch`, or for tests)
- queryAll(fen, options?): fetches every move ChessDB knows for a position, each with a formatted score, raw eval, win rate, rank and a human-readable quality note
- queryBest(fen, options?): asks ChessDB for the single best known move
- queryMove(fen, options?): asks ChessDB for one reasonable move, with some randomness (useful for varied play)
- querySearchMoves(fen, options?): asks ChessDB for a list of candidate moves worth searching further, e.g. to pass to a local engine as `searchmoves`
- queryScore(fen, options?): fetches ChessDB's standalone evaluation score for a position
- queryPv(fen, options?): fetches ChessDB's principal variation (score, depth and moves) for a position
- queue(fen): requests background analysis for a position ChessDB doesn't know yet
- store(fen, move): requests analysis of one particular move from a position

##### Helper functions

- getChessDbNoteWord(note): converts ChessDB's raw note character (`"!"`, `"*"`, `"?"`) into a `"Best"` / `"Good"` / `"Bad"` / `"unknown"` label
- getSideToMoveFromFen(fen): reads the side to move (`'w'` or `'b'`) out of a FEN string
- normalizeChessDbScore(score, sideToMove): converts a ChessDB score (always from White's perspective) into a score relative to the side to move

## Example methods

```ts
await engine.init();
await engine.stopSearch();
engine.setElo(3000);
engine.shutdown();
```

## Development

```bash
npm install
npm run build
```

## Credits

Special thanks to below authors who helped creating Stockfishts possible

- [Stockfish Authors](https://github.com/official-stockfish/Stockfish/blob/master/AUTHORS)
- [Jack Stenglein](https://github.com/jackstenglein)
- [ChessKit devs](https://github.com/GuillaumeSD/Chesskit)
- ChessDB devs


## Author

@jalpp

## License

MIT

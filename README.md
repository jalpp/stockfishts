# stockfishts

stockfishts is a TypeScript library for running Stockfish engines from both frontend and backend projects. It supports WebAssembly-based engines, worker-based execution, and a small, ergonomic API for evaluating chess positions and receiving incremental updates.

## Why use stockfishts?

- Run Stockfish-style engines in the browser with Web Workers and WebAssembly
- Use the same API in Node.js environments when a Worker-compatible runtime is available
- Send UCI commands directly through a simple engine abstraction
- Receive evaluation updates while the engine is thinking

## Installation

```bash
npm install stockfishts
```

## Quick start

- Get the Stockfish.js wasm files from [Stockfish.js](https://github.com/nmrugg/stockfish.js/)

### Browser usage

```ts
import { StockfishWasmEngine, EngineName } from 'stockfishts';

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
import { StockfishWasmEngine, EngineName } from 'stockfishts';

const engine = new StockfishWasmEngine('/path/to/stockfish.wasm.js', EngineName.Stockfish18);
await engine.init();

const evaluation = await engine.evaluatePositionWithUpdate({
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  depth: 10,
});

console.log(evaluation);
engine.shutdown();
```

## Runtime notes

- In browser-based environments, the package expects a Worker-capable runtime and a reachable engine script URL.
- In Node.js environments, a Worker-compatible runtime must be available. If your runtime does not expose a global Worker constructor, provide one before creating an engine instance.
- WebAssembly support is checked at runtime before instantiating a wasm-backed engine.

## Framework examples

### Next.js example

```tsx
'use client';

import { useEffect, useState } from 'react';
import { StockfishWasmEngine, EngineName } from 'stockfishts';

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
import { StockfishWasmEngine, EngineName } from 'stockfishts';

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

### Plain TypeScript example

```ts
import { StockfishWasmEngine, EngineName } from 'stockfishts';

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
import { CustomUciEngine, EngineName } from 'stockfishts';

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

Special thanks who helped creating Stockfishts possible

- [Stockfish Authors](https://github.com/official-stockfish/Stockfish/blob/master/AUTHORS)
- [Jack Stenglein](https://github.com/jackstenglein)
- [ChessKit devs](https://github.com/GuillaumeSD/Chesskit)


## Author

@jalpp

## License

MIT

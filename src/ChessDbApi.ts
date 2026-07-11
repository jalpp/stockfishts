/**
 * Thin, ergonomic wrapper around the Chess Cloud Database (ChessDB / "cdb")
 * HTTP API at https://www.chessdb.cn/cdb.php.
 *
 * ChessDB is a large community-maintained database of analyzed chess
 * positions, opening theory and endgame tablebase data. This module exposes
 * its actions (queryall, querybest/query/querysearch, queryscore, querypv,
 * queue, store) as a small class so consumers don't need to hand-roll
 * `fetch` calls, query string encoding or response parsing themselves.
 *
 * Reference: https://www.chessdb.cn/cloudbookc_api_en.html
 *
 * @author jalpp
 */

/** The side to move, using standard FEN color notation. */
export type ChessColor = 'w' | 'b';

/** The EGTB (endgame tablebase) metric ChessDB should use when relevant. */
export type ChessDbEgtbMetric = 'dtz' | 'dtm';

/** Options shared by every ChessDB query action. */
export interface ChessDbQueryOptions {
    /**
     * Whether ChessDB should automatically learn/deepen from this query.
     * Defaults to ChessDB's own default (enabled).
     */
    learn?: boolean;
    /** The EGTB metric to use when tablebase data is returned. Defaults to 'dtz'. */
    egtbMetric?: ChessDbEgtbMetric;
}

/** Options for {@link ChessDbApi.queryAll}. */
export interface ChessDbQueryAllOptions extends ChessDbQueryOptions {
    /**
     * When true, includes moves ChessDB has not scored yet in addition to
     * known moves. Defaults to false (only known/scored moves are returned).
     */
    showAll?: boolean;
}

/** Options for {@link ChessDbApi.queryBest}, {@link ChessDbApi.queryMove} and {@link ChessDbApi.querySearchMoves}. */
export interface ChessDbBestMoveOptions extends ChessDbQueryOptions {
    /** When true, only endgame tablebase (EGTB) moves are considered. Defaults to false. */
    endgameOnly?: boolean;
}

/** A single candidate move as returned by ChessDB's `queryall` action. */
export interface ChessDbMove {
    /** The move in UCI format, e.g. `"e2e4"`. */
    uci: string;
    /** The move in SAN format, e.g. `"e4"`. Populated when the request used `json=1`. */
    san: string;
    /**
     * The move's evaluation in pawns (centipawn score / 100), formatted to two
     * decimal places, from White's perspective. `"N/A"` when ChessDB did not
     * return a usable score.
     */
    score: string;
    /** The raw, unformatted centipawn score returned by ChessDB, from White's perspective. */
    rawEval: number;
    /** ChessDB's win rate percentage for the move, as a string, e.g. `"55.32"`. */
    winrate: string;
    /** ChessDB's rank for the move (higher is more strongly recommended). */
    rank: string;
    /** A human-readable move quality label derived from ChessDB's raw note field. */
    note: string;
}

/** The result of ChessDB's `querypv` action. */
export interface ChessDbPvResult {
    /** The evaluation score of the position in centipawns, from White's perspective. */
    score: number;
    /** The depth of the returned analysis line. */
    depth: number;
    /** The principal variation, in UCI format. */
    pv: string[];
    /** The principal variation, in SAN format. Populated when the request used `json=1`. */
    pvSAN: string[];
}

/** The kind of move ChessDB suggested for `querybest` / `query` / `querysearch`. */
export type ChessDbSuggestedMoveType = 'move' | 'egtb' | 'search';

/** A single suggested move as returned by ChessDB's `querybest`, `query` or `querysearch` actions. */
export interface ChessDbSuggestedMove {
    /** The suggested move in UCI format. */
    move: string;
    /**
     * The source of the suggested move: a normal opening-book/analysis move
     * (`"move"`), an endgame tablebase move (`"egtb"`), or a candidate move
     * that may need further engine search (`"search"`).
     */
    type: ChessDbSuggestedMoveType;
}

/** A successful ChessDB API result. */
export interface ChessDbSuccess<T> {
    success: true;
    data: T;
}

/** A failed ChessDB API result, e.g. an invalid FEN, an unknown position, or a network error. */
export interface ChessDbFailure {
    success: false;
    /** A short machine-readable reason, e.g. `"invalid board"`, `"unknown"`, `"nobestmove"`, or a network/HTTP error message. */
    error: string;
}

/** The result of any ChessDB API call. */
export type ChessDbResult<T> = ChessDbSuccess<T> | ChessDbFailure;

/** Options used to construct a {@link ChessDbApi} instance. */
export interface ChessDbApiOptions {
    /** The base URL of the ChessDB API endpoint. Defaults to `https://www.chessdb.cn/cdb.php`. */
    baseUrl?: string;
    /**
     * A custom `fetch` implementation, useful for testing or for runtimes
     * without a global `fetch`. Defaults to the global `fetch`.
     */
    fetchImpl?: typeof fetch;
}

/**
 * Converts ChessDB's raw note character(s) (e.g. `"!"`, `"*"`, `"?"`) into a
 * human-readable move quality label.
 *
 * @param note The raw note string returned by ChessDB for a move.
 * @returns `"Best"`, `"Good"`, `"Bad"`, or `"unknown"` when the note is unrecognized.
 */
export function getChessDbNoteWord(note: string): string {
    switch (note) {
        case '!':
            return 'Best';
        case '*':
            return 'Good';
        case '?':
            return 'Bad';
        default:
            return 'unknown';
    }
}

/**
 * Reads the side to move out of a FEN string.
 *
 * @param fen A FEN-encoded position.
 * @returns `'w'` or `'b'`. Defaults to `'w'` when the FEN is malformed.
 */
export function getSideToMoveFromFen(fen: string): ChessColor {
    const parts = fen.trim().split(/\s+/);
    return parts[1] === 'b' ? 'b' : 'w';
}

/**
 * Normalizes a ChessDB score (always reported from White's perspective) into
 * a score relative to the side to move.
 *
 * @param score The raw score, from White's perspective.
 * @param sideToMove The side to move in the evaluated position.
 * @returns The score relative to `sideToMove`: unchanged for White, negated for Black.
 */
export function normalizeChessDbScore(score: number, sideToMove: ChessColor): number {
    return sideToMove === 'b' ? -score : score;
}

const CHESSDB_ERROR_STATUSES = new Set([
    'invalid board',
    'unknown',
    'checkmate',
    'stalemate',
    'nobestmove',
]);

/**
 * A small client for the ChessDB (chessdb.cn) cloud chess database API.
 *
 * ChessDbApi exposes ChessDB's actions as typed, promise-based methods so
 * callers can avoid re-writing `fetch` calls, query-string building and
 * response parsing across a codebase. All network errors and ChessDB error
 * responses (e.g. `"invalid board"`, `"unknown"`) are surfaced as
 * `{ success: false, error }` rather than thrown, so callers don't need
 * try/catch for expected, non-exceptional outcomes.
 *
 * @example
 * ```ts
 * const cdb = new ChessDbApi();
 * const result = await cdb.queryAll('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
 * if (result.success) {
 *   console.log(result.data[0].san, result.data[0].score);
 * }
 * ```
 */
export class ChessDbApi {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;

    constructor(options: ChessDbApiOptions = {}) {
        this.baseUrl = options.baseUrl ?? 'https://www.chessdb.cn/cdb.php';

        if (options.fetchImpl) {
            this.fetchImpl = options.fetchImpl;
        } else if (typeof fetch === 'undefined') {
            throw new Error(
                'Global fetch is not available in this environment. ' +
                'Pass a fetchImpl (e.g. from undici or node-fetch) to the ChessDbApi constructor.',
            );
        } else {
            this.fetchImpl = fetch;
        }
    }

    /**
     * Fetches every move ChessDB knows about for a position, including its
     * evaluation, win rate, rank and a human-readable quality note.
     *
     * @param fen The FEN-encoded position to query.
     * @param options Optional query parameters.
     * @returns The known candidate moves for the position, or a failure result.
     */
    public async queryAll(
        fen: string,
        options: ChessDbQueryAllOptions = {},
    ): Promise<ChessDbResult<ChessDbMove[]>> {
        const params: Record<string, string> = {};
        if (options.showAll !== undefined) params.showall = options.showAll ? '1' : '0';
        this.applySharedOptions(params, options);

        const json = await this.requestJson(this.buildUrl('queryall', fen, params));
        if (!json.success) return json;

        const body = json.data;
        if (body.status !== 'ok') {
            return { success: false, error: String(body.status ?? 'unknown error') };
        }

        const moves = Array.isArray(body.moves) ? body.moves : [];
        return { success: true, data: this.processMoves(moves) };
    }

    /**
     * Asks ChessDB to suggest the single best known move for a position.
     *
     * @param fen The FEN-encoded position to query.
     * @param options Optional query parameters.
     * @returns The suggested move, or a failure result (e.g. `"nobestmove"`).
     */
    public async queryBest(
        fen: string,
        options: ChessDbBestMoveOptions = {},
    ): Promise<ChessDbResult<ChessDbSuggestedMove>> {
        const moves = await this.queryMoveAction('querybest', fen, options);
        if (!moves.success) return moves;
        if (moves.data.length === 0) return { success: false, error: 'nobestmove' };
        return { success: true, data: moves.data[0] };
    }

    /**
     * Asks ChessDB for one reasonable move for a position, chosen with some
     * randomness across ChessDB's known good moves (useful for varying play).
     *
     * @param fen The FEN-encoded position to query.
     * @param options Optional query parameters.
     * @returns The suggested move, or a failure result.
     */
    public async queryMove(
        fen: string,
        options: ChessDbBestMoveOptions = {},
    ): Promise<ChessDbResult<ChessDbSuggestedMove>> {
        const moves = await this.queryMoveAction('query', fen, options);
        if (!moves.success) return moves;
        if (moves.data.length === 0) return { success: false, error: 'nobestmove' };
        return { success: true, data: moves.data[0] };
    }

    /**
     * Asks ChessDB for a list of candidate moves that may warrant further
     * engine search (e.g. to pass to a local engine as `searchmoves`).
     *
     * @param fen The FEN-encoded position to query.
     * @param options Optional query parameters.
     * @returns The candidate moves, or a failure result.
     */
    public async querySearchMoves(
        fen: string,
        options: ChessDbBestMoveOptions = {},
    ): Promise<ChessDbResult<ChessDbSuggestedMove[]>> {
        return this.queryMoveAction('querysearch', fen, options);
    }

    /**
     * Fetches ChessDB's standalone evaluation score for a position, without
     * a principal variation.
     *
     * @param fen The FEN-encoded position to query.
     * @param options Optional query parameters.
     * @returns The evaluation score in centipawns (from White's perspective), or a failure result.
     */
    public async queryScore(
        fen: string,
        options: ChessDbQueryOptions = {},
    ): Promise<ChessDbResult<number>> {
        const params: Record<string, string> = {};
        this.applySharedOptions(params, options);

        const text = await this.requestText(this.buildUrl('queryscore', fen, params));
        if (!text.success) return text;

        if (CHESSDB_ERROR_STATUSES.has(text.data)) {
            return { success: false, error: text.data };
        }

        const match = text.data.match(/eval:(-?\d+)/);
        if (!match) return { success: false, error: `Unrecognized response: ${text.data}` };

        return { success: true, data: Number(match[1]) };
    }

    /**
     * Fetches ChessDB's principal variation (best line) for a position.
     *
     * @param fen The FEN-encoded position to query.
     * @param options Optional query parameters.
     * @returns The analysis line (score, depth, and moves), or a failure result.
     */
    public async queryPv(
        fen: string,
        options: ChessDbQueryOptions = {},
    ): Promise<ChessDbResult<ChessDbPvResult>> {
        const params: Record<string, string> = {};
        this.applySharedOptions(params, options);

        const json = await this.requestJson(this.buildUrl('querypv', fen, params));
        if (!json.success) return json;

        const body = json.data;
        if (body.status !== 'ok') {
            return { success: false, error: String(body.status ?? 'unknown error') };
        }

        return {
            success: true,
            data: {
                score: body.score,
                depth: body.depth,
                pv: body.pv ?? [],
                pvSAN: body.pvSAN ?? [],
            },
        };
    }

    /**
     * Requests that ChessDB analyze a position that isn't in its database
     * yet. This queues background analysis; it does not return an evaluation
     * directly. Re-query the position (e.g. with {@link queryAll}) after some
     * delay to see the results.
     *
     * @param fen The FEN-encoded position to queue for analysis.
     * @returns Success once ChessDB has accepted the request, or a failure result.
     */
    public async queue(fen: string): Promise<ChessDbResult<true>> {
        const json = await this.requestJson(this.buildUrl('queue', fen, { json: '1' }));
        if (!json.success) return json;

        if (json.data.status !== 'ok') {
            return { success: false, error: String(json.data.status ?? 'unknown error') };
        }
        return { success: true, data: true };
    }

    /**
     * Requests analysis of one particular move from a position, even if the
     * position itself is already known to ChessDB.
     *
     * @param fen The FEN-encoded position.
     * @param move The move to analyze, in UCI format, e.g. `"e2e4"`.
     * @returns Success once ChessDB has accepted the request, or a failure result.
     */
    public async store(fen: string, move: string): Promise<ChessDbResult<true>> {
        const params = { move: `move:${move}` };
        const text = await this.requestText(this.buildUrl('store', fen, params));
        if (!text.success) return text;

        if (text.data !== 'ok') {
            return { success: false, error: text.data };
        }
        return { success: true, data: true };
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private async queryMoveAction(
        action: 'querybest' | 'query' | 'querysearch',
        fen: string,
        options: ChessDbBestMoveOptions,
    ): Promise<ChessDbResult<ChessDbSuggestedMove[]>> {
        const params: Record<string, string> = {};
        if (options.endgameOnly !== undefined) params.endgame = options.endgameOnly ? '1' : '0';
        this.applySharedOptions(params, options);

        const text = await this.requestText(this.buildUrl(action, fen, params));
        if (!text.success) return text;

        if (CHESSDB_ERROR_STATUSES.has(text.data)) {
            return { success: false, error: text.data };
        }

        const moves = text.data
            .split('|')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => this.parseSuggestedMove(entry))
            .filter((move): move is ChessDbSuggestedMove => move !== null);

        return { success: true, data: moves };
    }

    private parseSuggestedMove(entry: string): ChessDbSuggestedMove | null {
        const [type, move] = entry.split(':');
        if (!move) return null;
        if (type === 'egtb') return { move, type: 'egtb' };
        if (type === 'search') return { move, type: 'search' };
        if (type === 'move') return { move, type: 'move' };
        return null;
    }

    private applySharedOptions(params: Record<string, string>, options: ChessDbQueryOptions): void {
        if (options.learn !== undefined) params.learn = options.learn ? '1' : '0';
        if (options.egtbMetric !== undefined) params.egtbmetric = options.egtbMetric;
    }

    private processMoves(moves: any[]): ChessDbMove[] {
        return moves.map((move: any) => {
            const scoreNum = Number(move.score);
            const note = getChessDbNoteWord(String(move.note ?? '').split(' ')[0] ?? '');
            const scoreStr = isNaN(scoreNum) ? 'N/A' : (scoreNum / 100).toFixed(2);

            return {
                uci: move.uci || 'N/A',
                san: move.san || 'N/A',
                score: scoreStr,
                rawEval: scoreNum,
                winrate: move.winrate || 'N/A',
                rank: String(move.rank ?? ''),
                note,
            };
        });
    }

    private buildUrl(action: string, fen: string, extraParams: Record<string, string> = {}): string {
        const params = new URLSearchParams({ action, board: fen, ...extraParams });
        return `${this.baseUrl}?${params.toString()}`;
    }

    private async requestJson(url: string): Promise<ChessDbResult<any>> {
        try {
            const jsonUrl = url.includes('json=1') ? url : `${url}&json=1`;
            const response = await this.fetchImpl(jsonUrl);
            if (!response.ok) {
                return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
            }
            const data = await response.json();
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    private async requestText(url: string): Promise<ChessDbResult<string>> {
        try {
            const response = await this.fetchImpl(url);
            if (!response.ok) {
                return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
            }
            const data = (await response.text()).trim();
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}

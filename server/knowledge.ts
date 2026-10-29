import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

// What the AI campus assistants know (plan 78): public ANU pages, crawled by
// server/crawl.ts, cut into short pieces and kept in their own SQLite file
// beside the app's (so it can be rebuilt or copied up on its own). A question
// is matched against the pieces with SQLite's full-text search (FTS5, no
// outside service); only the few best pieces and their addresses go to the
// model. No match at all, and the model isn't asked (npcs.ts).

const path = process.env.KNOWLEDGE_PATH ?? join(dirname(process.env.DATABASE_PATH ?? "data/app.db"), "knowledge.db");
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS pages (
    url        TEXT PRIMARY KEY,
    source     TEXT NOT NULL,
    year       INTEGER,
    title      TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS pages_by_source ON pages (source, fetched_at);
  CREATE VIRTUAL TABLE IF NOT EXISTS pieces USING fts5(
    title, body, url UNINDEXED, source UNINDEXED, year UNINDEXED,
    tokenize = 'porter unicode61'
  );
  CREATE TABLE IF NOT EXISTS crawl_runs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    started  TEXT NOT NULL DEFAULT (datetime('now')),
    finished TEXT,
    pages    INTEGER NOT NULL DEFAULT 0,
    failed   INTEGER NOT NULL DEFAULT 0
  );
`);

export interface Piece {
  title: string;
  body: string;
  url: string;
  source: string;
  year: number | null;
}

/** Puts a page's pieces in place of what it had (a page that changed loses its old pieces). */
export function savePage(page: { url: string; source: string; year: number | null; title: string; pieces: string[] }): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM pieces WHERE url = ?").run(page.url);
    const add = db.prepare("INSERT INTO pieces (title, body, url, source, year) VALUES (?, ?, ?, ?, ?)");
    for (const body of page.pieces) add.run(page.title, body, page.url, page.source, page.year);
    db.prepare("INSERT INTO pages (url, source, year, title) VALUES (?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET source = excluded.source, year = excluded.year, title = excluded.title, fetched_at = datetime('now')").run(
      page.url,
      page.source,
      page.year,
      page.title,
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** When `url` was last read (UTC "YYYY-MM-DD HH:MM:SS"), or undefined. */
export const fetchedAt = (url: string): string | undefined =>
  (db.prepare("SELECT fetched_at AS at FROM pages WHERE url = ?").get(url) as { at: string } | undefined)?.at;

export const startRun = (): number => Number(db.prepare("INSERT INTO crawl_runs DEFAULT VALUES").run().lastInsertRowid);
export const finishRun = (id: number, pages: number, failed: number): void =>
  void db.prepare("UPDATE crawl_runs SET finished = datetime('now'), pages = ?, failed = ? WHERE id = ?").run(pages, failed, id);
/** When the last whole crawl finished (UTC), or undefined if none has. */
export const lastFinished = (): string | undefined =>
  (db.prepare("SELECT finished FROM crawl_runs WHERE finished IS NOT NULL ORDER BY id DESC LIMIT 1").get() as { finished: string } | undefined)?.finished;

export function stats(): { pages: number; pieces: number; bySource: Record<string, number>; lastFinished?: string } {
  const pages = (db.prepare("SELECT COUNT(*) AS n FROM pages").get() as { n: number }).n;
  const pieces = (db.prepare("SELECT COUNT(*) AS n FROM pieces").get() as { n: number }).n;
  const bySource = Object.fromEntries((db.prepare("SELECT source, COUNT(*) AS n FROM pages GROUP BY source").all() as { source: string; n: number }[]).map((r) => [r.source, r.n]));
  return { pages, pieces, bySource, lastFinished: lastFinished() };
}

// --- matching a question ---------------------------------------------------------

const STOP = new Set(
  (
    "a an and are as at be but by can could do does did for from had has have how i if in into is it its me my of on or our should so than that the their them then there these they this to us was we what when where which who why will with would you your " +
    "about any anything tell know please hi hello hey thanks thank want need get give find help much many some there's i'm what's ok okay also just like really per a"
  ).split(" "),
);

/** The words worth searching for in a question (lowercase, no stopwords), course codes kept whole. */
export function keywords(question: string): string[] {
  const words = question.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => (w.length > 1 || /\d/.test(w)) && !STOP.has(w)))].slice(0, 12);
}

const YEAR = /\b(20\d\d)\b/;
/** A word without a plural or -ing/-ed ending, escaped for a RegExp. */
const stem = (w: string): string => (w.length > 4 ? w.replace(/(ies|es|s|ing|ed)$/, "") : w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The best few pieces for a question from these sources. A piece counts only
 * if it holds enough of the question's words (one if there are one or two,
 * else at least half and never fewer than two, or a course code); none, and the caller says it doesn't
 * know. A year in the question picks that year's catalogue; otherwise this
 * year's comes first, and pieces from other years still show their year.
 */
export function search(sources: string[], question: string, limit = 5): Piece[] {
  if (!sources.length) return [];
  // A small source (ANU Sport's five pages, about 12,000 characters) goes to the model whole, best
  // pieces first: picking five pieces of it lost answers that were on the page (the gym's address).
  // (A year asked for keeps other years' catalogue pieces out, as below.)
  const askedYear = [...question.matchAll(new RegExp(YEAR, "g"))].map((m) => Number(m[1])).pop();
  const all = everything(sources)?.filter((p) => !askedYear || p.year === null || p.year === askedYear) ?? null;
  if (all) {
    const best = searchPieces(sources, question, all.length);
    if (best.length) {
      // Asked where, a piece that gives an address leads even if it doesn't repeat the word asked about.
      const rest = all.filter((p) => !best.some((b) => b.url === p.url && b.body === p.body));
      const address = WHERE_Q.test(question) ? rest.filter((p) => ADDRESS.test(p.body)) : [];
      return [...address, ...best, ...rest.filter((p) => !address.includes(p))];
    }
  }
  return searchPieces(sources, question, limit);
}

const WHERE_Q = /\b(where|located|location|address|how (do|can) i get)\b/i;
const ADDRESS = /\b(located (at|on|in)|building \d+|\d+ \w+ (road|street|st|rd|avenue|ave|drive|dr)\b|ground floor|acton act)/i;

/** Every piece of these sources, if together they're small enough to send whole (else null). */
const WHOLE_CHARS = 16_000;
function everything(sources: string[]): Piece[] | null {
  const marks = sources.map(() => "?").join(", ");
  const size = (db.prepare(`SELECT COALESCE(SUM(LENGTH(body)), 0) AS n FROM pieces WHERE source IN (${marks})`).get(...sources) as { n: number }).n;
  if (!size || size > WHOLE_CHARS) return null;
  return db.prepare(`SELECT title, body, url, source, year FROM pieces WHERE source IN (${marks}) ORDER BY rowid`).all(...sources) as unknown as Piece[];
}

function searchPieces(sources: string[], question: string, limit: number): Piece[] {
  const words = keywords(question).filter((w) => !YEAR.test(w));
  if (!words.length) return [];
  const asked = [...question.matchAll(new RegExp(YEAR, "g"))].map((m) => m[1]).pop();
  const year = asked ? Number(asked) : new Date().getFullYear();
  const codes = words.filter((w) => /^[a-z]{4}\d{4}$/.test(w));
  // Pages say "Second Semester" where people ask "semester 2" (and the other way): search both.
  // And "when is it open" is answered by an hours table.
  const extra = [
    /\b(semester|sem|s)\s*1\b|\b1st\b/i.test(question) ? "first" : "",
    /\b(semester|sem|s)\s*2\b|\b2nd\b/i.test(question) ? "second" : "",
    /\b(opening hours|hours|(what time|when)\b.*\b(open|opens|close|closes|shut)|(open|close|closes|opens) (on|at|today|tonight|tomorrow|until|till|late)|(is|are) \w+ open\b)/i.test(question) && !words.includes("hours") ? "hours" : "",
  ].filter(Boolean);
  const match = [...words, ...extra].map((w) => `"${w.replace(/"/g, "")}"`).join(" OR ");
  // Each source drawn from on its own (up to 120 pieces each), so the
  // catalogue's thousands of course pages, which all say "semester" and
  // "census date", can't crowd a student page's answer out of the pool.
  const query = db.prepare(
    `SELECT title, body, url, source, year, bm25(pieces, 2.0, 1.0) AS score FROM pieces
     WHERE pieces MATCH ? AND source = ?
     ORDER BY (year IS NOT NULL AND year != ?) , score LIMIT 120`,
  );
  const rows = sources
    .flatMap((src) => query.all(match, src, year) as unknown as (Piece & { score: number })[])
    .sort((a, b) => a.score - b.score);
  const need = codes.length ? 1 : words.length <= 2 ? 1 : Math.max(2, Math.floor(words.length / 2));
  // Each candidate scored: how many of the question's words it holds, twice over in its title (whole
  // words, give or take an ending: "residence" counts for "residences",
  // "open" for "opening", "won" not for "wonderful"), then, asked about money,
  // how many prices it lists (a price table beats a page that mentions one),
  // then SQLite's own rank.
  const money = /\b(price|prices|cost|costs|fee|fees|cheap\w*|expensive|how much|\$)/i.test(question);
  const terms = [...words, ...extra].map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${stem(w)}[\\p{L}]{0,4}($|[^\\p{L}\\p{N}])`, "u"));
  // Numbers ("2", "2026") are in half the catalogue's titles: only words weigh in a title.
  // (Nor the added synonyms: every course page has "First Semester" and "Second Semester" headings.)
  const wordTerms = terms.filter((_, i) => i < words.length && !/^\d+$/.test(words[i]!) && !["semester", "date", "dates"].includes(words[i]!));
  // Asked when something opens or closes, an hours page comes first: "when does the library close"
  // otherwise goes to pages that say "library" more often than an hours table does.
  const when = words.includes("hours") || extra.includes("hours");
  // Asked where something is, a piece that says so (a building, a road, "located") ranks above one
  // that only names it: "where is the gym" is otherwise just "gym", which every sport page says.
  const placed = (r: { body: string }): number => (WHERE_Q.test(question) && ADDRESS.test(r.body) ? 1 : 0);
  const hoursFirst = (r: { title: string }): number => (when && /\bhours\b/i.test(r.title) ? 1 : 0);
  const catalogueLast = (r: { url: string; source: string }): number => (!codes.length && r.source === "catalogue" && /\/course\//.test(r.url) ? 1 : 0);
  const scored = rows
    .filter((r) => !(asked && r.year !== null && r.year !== year))
    .map((r, i) => {
      const text = `${r.title} ${r.body}`.toLowerCase();
      const hits = terms.filter((t) => t.test(text)).length;
      // A word in the title counts twice: the page is about it, not just mentioning it.
      // The piece's own headings ("## Majors") count like its title: that part of the page is about it.
      const title = `${r.title} ${(r.body.match(/^## .*$/gm) ?? []).join(" ")}`.toLowerCase();
      const weight = hits + wordTerms.filter((t) => t.test(title)).length;
      const prices = money ? Math.min(6, (r.body.match(/\$\s?\d|\d+(\.\d\d)?\s?\/\s?(wk|week)|per week|\bfrom \d/gi) ?? []).length) : 0;
      return { r, text, hits, weight, prices, i };
    })
    .filter((x) => x.hits >= need && (!codes.length || codes.some((c) => x.text.includes(c))))
    // On a tie, a general page before one of the catalogue's thousands of course pages, unless a course code was asked about.
    .sort((a, b) => hoursFirst(b.r) - hoursFirst(a.r) || placed(b.r) - placed(a.r) || b.weight - a.weight || b.prices - a.prices || catalogueLast(a.r) - catalogueLast(b.r) || a.i - b.i);
  const picked: Piece[] = [];
  const perUrl = new Map<string, number>();
  for (const { r } of scored) {
    // At most three pieces of one page, so a long page doesn't crowd the rest out.
    const n = perUrl.get(r.url) ?? 0;
    if (n >= 3) continue;
    perUrl.set(r.url, n + 1);
    picked.push({ title: r.title, body: r.body, url: r.url, source: r.source, year: r.year });
    if (picked.length >= limit) break;
  }
  return picked;
}

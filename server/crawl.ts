import { fetchedAt, finishRun, savePage, startRun, stats } from "./knowledge.ts";

// The crawler behind the AI campus assistants (plan 78). It reads public ANU
// pages one at a time, slowly (two seconds between requests, more where a
// site's robots.txt asks), keeps their text in knowledge.db in short pieces,
// and moves on; a page that fails keeps what it had. No model is used, so it
// costs nothing but time, and it runs without Claude: `pnpm crawl` by hand,
// or the server starts it once a month by itself (main.ts). It names itself
// and how to reach the author in its User-Agent, and never pretends to be one
// of the AI bots a site turns away by name.
//
// Sources, by assistant (npcs.ts says which assistant reads which):
//   catalogue  programsandcourses.anu.edu.au: every course, program, major,
//              minor and specialisation, this year and next (the year is kept)
//   students   ANU's student pages: dates, census, enrolment, fees, exams
//   computing  comp.anu.edu.au/study (School of Computing degrees)
//   library    anulib + library hours; academic Academic Skills pages
//   careers    ANU careers pages
//   anusa      anusa.com.au pages
//   sport      anu-sport.com.au
//   housing    study.anu.edu.au/accommodation
//   intl       ANU's pages for international students (visa, OSHC, arrival)

const UA = "ANU-Crossing-campus-guide/1.0 (unofficial student project, not an AI training crawler; contact u8321477@anu.edu.au)";
const GAP_MS = Number(process.env.CRAWL_GAP_MS) || 2000;
/** A page read within this long is skipped (so a crawl that stopped picks up where it was). */
const FRESH_DAYS = Number(process.env.CRAWL_FRESH_DAYS ?? 20);
const PIECE_CHARS = 1100;
const MAX_PIECES = 40;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const lastHit = new Map<string, number>();
const delayFor = new Map<string, number>();

/** Waits until this host may be asked again (two seconds, or its robots.txt Crawl-delay). */
async function politely(url: string): Promise<void> {
  const host = new URL(url).host;
  const gap = Math.max(GAP_MS, (delayFor.get(host) ?? 0) * 1000);
  const wait = (lastHit.get(host) ?? 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

// --- robots.txt -----------------------------------------------------------------
// Only the "*" group applies to us (the named groups are other bots). Longest
// matching rule wins, Allow over Disallow on a tie, as Google reads it.

const robots = new Map<string, { allow: string[]; disallow: string[] }>();
async function allowed(url: string): Promise<boolean> {
  const u = new URL(url);
  let rules = robots.get(u.host);
  if (!rules) {
    rules = { allow: [], disallow: [] };
    try {
      await politely(`${u.origin}/robots.txt`);
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000), redirect: "manual" });
      if (res.ok) {
        let mine = false;
        let lastWasAgent = false;
        for (const raw of (await res.text()).split("\n")) {
          const line = raw.replace(/#.*/, "").trim();
          const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
          if (!m) continue;
          const [, key, value] = m as unknown as [string, string, string];
          const k = key.toLowerCase();
          if (k === "user-agent") {
            mine = lastWasAgent ? mine || value === "*" : value === "*";
            lastWasAgent = true;
            continue;
          }
          lastWasAgent = false;
          if (!mine) continue;
          if (k === "allow" && value) rules.allow.push(value);
          else if (k === "disallow" && value) rules.disallow.push(value);
          else if (k === "crawl-delay" && Number(value) > 0) delayFor.set(u.host, Math.min(Number(value), 30));
        }
      }
    } catch {
      // No robots.txt to be had: the site set no rules for us.
    }
    robots.set(u.host, rules);
  }
  const path = u.pathname + u.search;
  // "*" is any run of characters and a final "$" ends the path ("/*?*" is any address with a query).
  const matches = (rule: string): boolean =>
    new RegExp(`^${rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\?\$$/, "$")}`).test(path);
  const longest = (list: string[]): number => Math.max(-1, ...list.filter(matches).map((p) => p.length));
  return longest(rules.allow) >= longest(rules.disallow);
}

// --- reading a page -------------------------------------------------------------

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "–", mdash: "—", hellip: "…", apos: "'" };
const decode = (t: string): string =>
  t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m; // &#99999999; would throw and stop the crawl
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** The page's readable text: the main content if it can be found, headings kept as "## …" lines so pieces can carry them. */
export function pageText(html: string): { title: string; text: string } {
  const clean = (t: string | undefined): string => decode((t ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  // The page's heading, or its <title> without the site's name when the heading is empty.
  // The catalogue's first h1 is its banner ("Programs and Courses"); its own title is in intro__degree-title.
  const title =
    clean(html.match(/class="intro__degree-title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) ||
    clean([...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1]).find((h) => clean(h) && clean(h) !== "Programs and Courses")) ||
    clean(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]).replace(/\s+[|–-]\s+[^|–]*$/, "");
  // The main content: <main>, or the catalogue's from its intro on (its banner and year menu are noise), or the body.
  const intro = html.indexOf('class="intro__inner"');
  let body = html.match(/<main[\s>][\s\S]*?<\/main>/i)?.[0] ?? (intro > 0 ? html.slice(html.lastIndexOf("<", intro)) : undefined) ?? html.match(/<body[\s>][\s\S]*<\/body>/i)?.[0] ?? html;
  // The catalogue's list of academic years to switch between.
  body = body.replace(/<select[\s\S]*?<\/select>/gi, " ").replace(/<ul[^>]*academic-year[\s\S]*?<\/ul>/gi, " ");
  // ANU's "principal dates" boxes put the date before its label (day, month, year, then the heading):
  // made into one line, label first, so the date can't pair with the next heading instead.
  body = body.replace(
    /<div class="dateblock[^"]*">\s*<div class="day">\s*(\d+)\s*<\/div>\s*<div class="month">\s*(\w+)\s*<\/div>\s*<div class="year">\s*(\d+)\s*<\/div>\s*<\/div>\s*<div class="datetext">\s*<h\d[^>]*>([\s\S]*?)<\/h\d>/gi,
    (_m, d: string, mo: string, y: string, label: string) => `<p>${label.replace(/<[^>]+>/g, " ").trim()}: ${Number(d)} ${mo} ${y}</p>`,
  );
  body = body
    .replace(/<(script|style|nav|header|footer|svg|noscript|form|button|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, (_m, h: string) => `\n## ${h.replace(/<[^>]+>/g, " ")}\n`)
    .replace(/<(li)[^>]*>/gi, "\n- ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/ul|\/ol|\/table|\/section|\/h[5-6])[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l && l !== "-" && l !== "|")
    // Site furniture that isn't content: page owners, feedback, sign-up buttons, share and cookie lines.
    .filter((l) => !/^(page owner:?|university feedback|send email|join now|sign up online|share this|back to top|skip to (main )?content|accept( all)? cookies?|location)$/i.test(l.replace(/^- /, "")))
    // A run of bare years is the catalogue's year switcher, not content.
    .filter((l, i, all) => !/^20\d\d$/.test(l) || !(/^20\d\d$/.test(all[i + 1] ?? "") || /^20\d\d$/.test(all[i - 1] ?? "")))
    // A heading with nothing under it (galleries, menus) is just noise.
    .filter((l, i, all) => !l.startsWith("## ") || !(all[i + 1] ?? "## ").startsWith("## "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { title: title || "(untitled)", text };
}

/** Cuts text into pieces of about PIECE_CHARS, on line breaks, each starting with the heading it falls under. */
export function pieces(text: string): string[] {
  const out: string[] = [];
  let heading = "";
  let cur = "";
  const flush = (): void => {
    const t = cur.trim();
    if (t.length > 40) out.push(heading && !t.startsWith(heading) ? `${heading}\n${t}` : t);
    cur = "";
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      if (cur.length > PIECE_CHARS / 3) flush();
      heading = line;
      cur += `${line}\n`;
      continue;
    }
    if (cur.length + line.length > PIECE_CHARS) flush();
    // A single very long line (a table) is cut too.
    for (let i = 0; i < line.length; i += PIECE_CHARS) {
      cur += `${line.slice(i, i + PIECE_CHARS)}\n`;
      if (cur.length > PIECE_CHARS) flush();
    }
  }
  flush();
  return out.slice(0, MAX_PIECES);
}

async function get(url: string, accept = "text/html"): Promise<{ ok: true; body: string; finalUrl: string } | { ok: false; why: string }> {
  await politely(url);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (!/html|xml|json|text\/plain/.test(type)) return { ok: false, why: `type ${type}` };
    // Big pages are cut, so a 256 MB server never holds much at once.
    const body = (await res.text()).slice(0, 1_500_000);
    return { ok: true, body, finalUrl: res.url || url };
  } catch (err) {
    return { ok: false, why: (err as Error).name || "network" };
  }
}

/** Login screens and empty shells aren't knowledge. */
const looksUseless = (title: string, text: string): boolean =>
  text.length < 200 || /\b(sign in|log ?in)\b/i.test(title) || /page not found|404 error|access denied/i.test(`${title} ${text.slice(0, 300)}`);

// --- what to read -----------------------------------------------------------------

interface Target {
  url: string;
  source: string;
  year: number | null;
}

async function sitemap(url: string): Promise<string[]> {
  const r = await get(url, "application/xml,text/xml");
  if (!r.ok) return [];
  const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]!));
  // A sitemap index: read each child (they're on the same host).
  if (/<sitemapindex/i.test(r.body)) {
    const all: string[] = [];
    for (const child of locs) all.push(...(await sitemap(child)));
    return all;
  }
  return locs;
}

const CATALOGUE = "https://programsandcourses.anu.edu.au";
/** Every course, program, major, minor and specialisation in the catalogue for `year`, from the catalogue's own search data. */
async function catalogue(year: number): Promise<Target[]> {
  const q = `ShowAll=true&PageIndex=0&MaxPageSize=10000&PageSize=10000&SelectedYear=${year}&SearchText=`;
  const out: Target[] = [];
  const add = (kind: string, code: unknown): void => {
    if (typeof code === "string" && /^[A-Za-z0-9-]+$/.test(code.trim())) out.push({ url: `${CATALOGUE}/${year}/${kind}/${code.trim()}`, source: "catalogue", year });
  };
  const list = async (path: string): Promise<Record<string, unknown>[]> => {
    const r = await get(`${CATALOGUE}/data/${path}?${q}${path.startsWith("Course") ? "&AppliedFilter=FilterByAllCourses" : ""}`, "application/json");
    if (!r.ok) return [];
    try {
      return ((JSON.parse(r.body) as { Items?: Record<string, unknown>[] }).Items ?? []).filter((i) => !i.Year || Number(i.Year) === year || Number(i.ProgramAcademicYear) === year);
    } catch {
      return [];
    }
  };
  for (const p of ["ProgramSearch/GetProgramsUnderGraduate", "ProgramSearch/GetProgramsPostGraduate", "ProgramSearch/GetProgramsResearch", "ProgramSearch/GetProgramsNonAward"])
    for (const i of await list(p)) add("program", i.AcademicPlanCode);
  for (const [p, kind] of [
    ["MajorSearch/GetMajors", "major"],
    ["MinorSearch/GetMinors", "minor"],
    ["SpecialisationSearch/GetSpecialisations", "specialisation"],
  ] as const)
    for (const i of await list(p)) add(kind, i.SubPlanCode);
  for (const i of await list("CourseSearch/GetCourses")) add("course", i.CourseCode);
  return out;
}

const WWW_STUDENTS = /^https:\/\/www\.anu\.edu\.au\/students\/(program-administration\/(program-management|fees-payments|assessments-exams|enrolment|timetabling)|information-for|health-safety-wellbeing|contacts)\//;

/** Every page to read, in order: small sources first, the big catalogue last. */
export async function targets(only?: string[]): Promise<Target[]> {
  const want = (s: string): boolean => !only?.length || only.includes(s);
  const out: Target[] = [];
  const add = (source: string, urls: string[]): void => {
    if (want(source)) for (const url of urls) out.push({ url, source, year: null });
  };

  if (want("students") || want("library") || want("careers") || want("intl")) {
    const www = await sitemap("https://www.anu.edu.au/sitemap.xml");
    add("students", [
      "https://www.anu.edu.au/directories/university-calendar",
      "https://www.anu.edu.au/students/program-administration/program-management/census-dates",
      ...www.filter((u) => WWW_STUDENTS.test(u) && !/\/contacts\/academic-skills\/|\/prizes\//.test(u) && !/international|visa/.test(u)),
    ]);
    add("library", [...www.filter((u) => /\/students\/(academic-skills|contacts\/academic-skills)(\/|$)/.test(u) && !/\/contacts\/academic-skills\/./.test(u))]);
    add("careers", www.filter((u) => /\/students\/careers-opportunities\//.test(u)));
    add("intl", [
      ...www.filter((u) => /international|visa|overseas-student-health/.test(u) && /\/students\//.test(u) && !/\/prizes\/|events-stories/.test(u)),
      "https://study.anu.edu.au/apply/international-student-visa-requirements",
      "https://study.anu.edu.au/apply/overseas-student-health-cover-oshc",
    ]);
  }
  if (want("library")) {
    add("library", ["https://anu.libcal.com/hours", ...(await sitemap("https://anulib.anu.edu.au/sitemap.xml")).filter((u) => !/\/news\/|\/events?\//.test(u))]);
  }
  if (want("computing")) add("computing", (await sitemap("https://comp.anu.edu.au/sitemap.xml")).filter((u) => /comp\.anu\.edu\.au\/study\//.test(u)));
  if (want("anusa")) add("anusa", await sitemap("https://anusa.com.au/wp-sitemap-posts-page-1.xml"));
  if (want("sport")) add("sport", ["https://anu-sport.com.au/", "https://anu-sport.com.au/gym", "https://anu-sport.com.au/gym/Memberships", "https://anu-sport.com.au/clubs", "https://anu-sport.com.au/footer/faqs"]);
  if (want("housing")) add("housing", (await sitemap("https://study.anu.edu.au/sitemap.xml")).filter((u) => /\/accommodation(\/|$)/.test(u)));
  if (want("catalogue")) {
    const year = new Date().getFullYear();
    out.push(...(await catalogue(year)), ...(await catalogue(year + 1)));
  }
  // The same page twice (two sitemaps) is read once.
  const seen = new Set<string>();
  return out.filter((t) => !seen.has(t.url) && seen.add(t.url));
}

/** Reads every target not read lately; returns how many were saved and how many failed. */
export async function crawl(opts: { only?: string[]; log?: (line: string) => void } = {}): Promise<{ saved: number; failed: number; skipped: number }> {
  const say = opts.log ?? ((l: string) => console.log(l));
  const run = startRun();
  const list = await targets(opts.only);
  say(JSON.stringify({ at: new Date().toISOString(), event: "crawl-start", targets: list.length }));
  let saved = 0;
  let failed = 0;
  let skipped = 0;
  const freshAfter = Date.now() - FRESH_DAYS * 86400_000;
  for (const [i, t] of list.entries()) {
    const at = fetchedAt(t.url);
    if (at && Date.parse(`${at}Z`) > freshAfter) {
      skipped++;
      continue;
    }
    if (!(await allowed(t.url))) {
      skipped++;
      continue;
    }
    const r = await get(t.url);
    if (!r.ok) {
      failed++;
      if (failed % 20 === 1) say(JSON.stringify({ event: "crawl-fail", url: t.url, why: r.why }));
      continue;
    }
    const { title, text } = pageText(r.body);
    if (looksUseless(title, text)) {
      skipped++;
      continue;
    }
    const year = t.year ? ` (${t.year} academic year)` : "";
    // A catalogue page's code leads its title ("COMP2300 Computer Architecture"), so a code in a question finds it.
    const code = t.source === "catalogue" ? `${decodeURIComponent(t.url.split("/").pop() ?? "").toUpperCase()} ` : "";
    try {
      // An hours page lists weeks far ahead; the first few (this week and the next) are the ones worth asking about.
      const all = pieces(text);
      // A table the page fills in with JavaScript arrives as rows of dashes ("Chifley | – | – |…"): not an answer, and misleading.
      const real = all.filter((p) => (p.match(/\|\s*[–-]\s*(?=\|)/g) ?? []).length < 6);
      const kept = /libcal\.com\/hours/.test(t.url) ? real.slice(0, 3) : real;
      savePage({ url: t.url, source: t.source, year: t.year, title: `${code}${title}${year}`, pieces: kept });
      saved++;
    } catch {
      failed++;
    }
    if ((i + 1) % 100 === 0) say(JSON.stringify({ at: new Date().toISOString(), event: "crawl-progress", done: i + 1, of: list.length, saved, failed, skipped }));
  }
  finishRun(run, saved, failed);
  say(JSON.stringify({ at: new Date().toISOString(), event: "crawl-done", saved, failed, skipped, ...stats() }));
  return { saved, failed, skipped };
}

// `node server/crawl.ts [source …]`: crawl now (all sources, or the ones named).
if (import.meta.main) {
  await crawl({ only: process.argv.slice(2) });
}

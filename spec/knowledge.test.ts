import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The assistants answer only from crawled pages (plan 78): the pieces a
// question matches, with their addresses; no match, and the model is never
// asked. Checked on the server's own code with a throwaway knowledge file and
// a page made up here (no network, no model).

process.env.KNOWLEDGE_PATH = join(mkdtempSync(join(tmpdir(), "knowledge-")), "k.db");
const k = await import("../server/knowledge.ts");
const crawl = await import("../server/crawl.ts");
// No model in the spec: AWS and Anthropic keys are never set for it.
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.ANTHROPIC_API_KEY;

const PAGE = `<html><head><title>x</title></head><body><nav>Menu Home</nav><main>
<h1>Compare residences</h1><p>Compare the costs of each residence.</p>
<table><tr><td>Fenner Hall</td><td>Self-catered</td><td>From 395.00 /wk</td></tr>
<tr><td>Bruce Hall</td><td>Catered</td><td>From 595.00 /wk</td></tr></table>
<h2>Applying</h2><p>Applications for 2027 open in August. Apply through the ANU accommodation portal before the round closes.</p>
</main><footer>Footer text</footer></body></html>`;

describe("what the assistants know", () => {
  it("keeps a page's main text in pieces with its address, and finds them by a question's words", () => {
    const { title, text } = crawl.pageText(PAGE);
    expect(title).toBe("Compare residences");
    expect(text).toContain("Fenner Hall");
    expect(text).not.toContain("Menu Home");
    expect(text).not.toContain("Footer text");
    k.savePage({ url: "https://example.anu/compare", source: "housing", year: null, title, pieces: crawl.pieces(text) });
    k.savePage({ url: "https://example.anu/2026/course/COMP2300", source: "catalogue", year: 2026, title: "Computer Architecture (2026 academic year)", pieces: ["COMP2300 is offered in First Semester 2026."] });
    k.savePage({ url: "https://example.anu/2027/course/COMP2300", source: "catalogue", year: 2027, title: "Computer Architecture (2027 academic year)", pieces: ["COMP2300 is offered in Second Semester 2027."] });

    const hit = k.search(["housing"], "How much is Fenner Hall a week?");
    expect(hit[0]?.url).toBe("https://example.anu/compare");
    expect(hit[0]?.body).toContain("395");
    // Only the assistant's own sources.
    expect(k.search(["sport"], "How much is Fenner Hall a week?")).toEqual([]);
    // Nothing on the pages: nothing found.
    expect(k.search(["housing"], "Who won the 2022 world cup?")).toEqual([]);
    // A year in the question picks that year's catalogue.
    expect(k.search(["catalogue"], "When is COMP2300 offered in 2027?").map((p) => p.year)).toEqual([2027]);
  });

  it("sends a small source whole, best first, so an answer on the page isn't lost; a 'where' question puts the address first", () => {
    k.savePage({ url: "https://example.anu/gym", source: "tiny", year: null, title: "Gym", pieces: ["The gym has a cardio theatre. Gym memberships for everyone."] });
    k.savePage({ url: "https://example.anu/faq", source: "tiny", year: null, title: "FAQs", pieces: ["Where is it? ANU Sport is located at Building 19, North Road."] });
    const hit = k.search(["tiny"], "where is the gym");
    expect(hit.map((p) => p.url)).toEqual(["https://example.anu/faq", "https://example.anu/gym"]);
  });

  it("answers when something closes from an hours page, not from pages that say the place's name more", () => {
    k.savePage({ url: "https://example.anu/lib", source: "library", year: null, title: "Using the Library", pieces: ["The library lends books. Library rooms close for cleaning at times; library printing and library study spaces."] });
    k.savePage({ url: "https://example.anu/hours", source: "library", year: null, title: "Opening Hours", pieces: ["Library opening hours this week.\nChifley | 24 hours | 24 hours |"] });
    expect(k.search(["library"], "what time does the library close")[0]?.url).toBe("https://example.anu/hours");
  });

  it("each has sources and a model; with no model, it says it's offline", async () => {
    const { answer, NPCS } = await import("../server/npcs.ts");
    for (const n of NPCS) {
      expect(n.sources.length).toBeGreaterThan(0);
      expect(["haiku", "nova"]).toContain(n.model);
    }
    // No model here, so an answer only proves the order: with no key it says it's offline.
    const robin = NPCS.find((n) => n.id === "library")!;
    expect(await answer(robin, "Who won the 2022 world cup?")).toMatch(/not connected|couldn't find/);
  });

  it("with nothing on its pages, the model's brief allows no facts: an introduction for a hello, else 'couldn't find' and links", async () => {
    const { noSourcesFor, NPCS } = await import("../server/npcs.ts");
    const kai = NPCS.find((n) => n.id === "sport")!;
    const brief = noSourcesFor(kai, "Reply in English.");
    expect(brief).toContain("NO source pages");
    expect(brief).toMatch(/do NOT state any fact/);
    expect(brief).toMatch(/couldn't find that/);
    expect(brief).toContain(kai.links[0]!.url);
    expect(brief).not.toContain("<source");
  });
});

describe("the reply's language", () => {
  it("is named from the question's letters: English for Latin letters, Korean for Hangul, even beside a course code", async () => {
    const { replyIn } = await import("../server/npcs.ts");
    expect(replyIn("who r u")).toMatch(/^Reply in English/);
    expect(replyIn("COMP1100 언제 해?")).toMatch(/^Reply in Korean/);
    expect(replyIn("你好")).toMatch(/^Reply in Chinese/);
    expect(replyIn("こんにちは")).toMatch(/^Reply in Japanese/);
  });
});

describe("the crawler's manners", () => {
  it("names itself and its author, never as a known AI bot", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync("server/crawl.ts", "utf8"));
    const ua = src.match(/const UA = "([^"]+)"/)?.[1] ?? "";
    expect(ua).toMatch(/u8321477@anu\.edu\.au/);
    expect(ua).not.toMatch(/GPTBot|ClaudeBot|CCBot|Google-Extended|PerplexityBot|Amazonbot|anthropic-ai/i);
    expect(Number(src.match(/CRAWL_GAP_MS\) \|\| (\d+)/)?.[1])).toBeGreaterThanOrEqual(2000);
  });
});

describe("tidy answers", () => {
  it("drops numbered references and links bare addresses", async () => {
    const { tidy } = await import("../server/npcs.ts");
    expect(tidy("Five items【Pantry](https://a.anu/p), [Pantry](https://a.anu/p)].")).toBe("Five items[Pantry](https://a.anu/p).");
    expect(tidy("Open 24 hours [1]. See [[2]](https://a.b/c) and <https://x.y/h> [source 3].")).toBe(
      "Open 24 hours. See [source](https://a.b/c) and [https://x.y/h](https://x.y/h).",
    );
  });
});

describe("voice tickets", () => {
  it("are LiveKit tokens for one room, signed with the secret, short-lived", async () => {
    process.env.LIVEKIT_API_KEY = "key1";
    process.env.LIVEKIT_API_SECRET = "s3cret";
    process.env.LIVEKIT_URL = "wss://voice.example";
    const { voiceToken } = await import("../server/voice.ts");
    const { createHmac } = await import("node:crypto");
    const t = voiceToken("ann", "room-team-library-1-abc", 600, 1_700_000_000_000);
    const [h, p, sig] = t.split(".");
    expect(createHmac("sha256", "s3cret").update(`${h}.${p}`).digest("base64url")).toBe(sig);
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    expect(claims).toMatchObject({ iss: "key1", sub: "ann", exp: 1_700_000_600, video: { room: "room-team-library-1-abc", roomJoin: true } });
  });
});

describe("assistants with nothing to go on", () => {
  it("each has example questions to offer, and with no model they say so rather than guess", async () => {
    const { answer, NPCS } = await import("../server/npcs.ts");
    for (const n of NPCS) expect(n.examples.length).toBeGreaterThan(0);
    // The spec has no model: any message gets the honest "not connected" line, never an invented fact.
    expect(await answer(NPCS.find((n) => n.id === "sport")!, "who r u")).toMatch(/not connected/);
  });
});

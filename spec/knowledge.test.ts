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

  it("says it doesn't know, with its pages, when nothing matches, without asking a model", async () => {
    const { answer, NPCS } = await import("../server/npcs.ts");
    for (const n of NPCS) {
      expect(n.sources.length).toBeGreaterThan(0);
      expect(["haiku", "nova"]).toContain(n.model);
    }
    // No model here, so an answer only proves the order: with no key it says it's offline.
    const robin = NPCS.find((n) => n.id === "library")!;
    expect(await answer(robin, "Who won the 2022 world cup?")).toMatch(/not connected|couldn't find/);
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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pieces } from "./crawl.ts";
import { savePage } from "./knowledge.ts";

// Seongsu, the author's ghost (plan 94), answers from the project's own documents: what good means
// here (README), how it was built (PROCESS), the decision records, the reflections and the product
// rules (CLAUDE.md). They're read from the repo at start and kept in knowledge.db as the "project"
// source, so he answers like every other assistant: from these pages only, linking each (the user,
// 11/9: he used to give only the secret room's hint, whatever he was asked).

const REPO = "https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/blob/main/";

/** The documents, newest thinking first; a missing one (a slim image) is skipped. */
function documents(): string[] {
  // AWS and the AI: PROCESS, decisions 003-005, CLAUDE.md and the self-hosting guide say how S3, SES,
  // Bedrock, the IAM user, LiveKit on EC2 and the crawler fit together (the user, 11/9).
  const list = ["README.md", "PROCESS.md", "CLAUDE.md", "docs/self-hosting.md", "docs/roles.md"];
  for (const dir of ["docs/decisions", "reflections"]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) if (f.endsWith(".md") && f !== "README.md") list.push(join(dir, f));
  }
  return list.filter((f) => existsSync(f));
}

/** Markdown down to plain lines: links keep their text, images and HTML tags go, every heading groups. */
function plain(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "## ")
    .replace(/[*_`]+/g, "")
    .replace(/[ \t]+/g, " ");
}

/** Loads (or refreshes) the project's documents as the "project" source; returns how many pages. */
export function loadProjectDocs(): number {
  let n = 0;
  for (const file of documents()) {
    const md = readFileSync(file, "utf8");
    const title = /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? file;
    const parts = pieces(plain(md));
    if (!parts.length) continue;
    savePage({ url: REPO + file, source: "project", year: null, title: `${title} (${file})`, pieces: parts });
    n++;
  }
  return n;
}

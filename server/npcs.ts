import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { search, type Piece } from "./knowledge.ts";

// The AI campus assistants (plan 56, 78): people standing about campus who
// answer questions about one part of ANU each, only from its public pages
// (crawled into knowledge.db, see crawl.ts). Where each stands, what it
// covers, which pages it reads and which model answers live here; the client
// draws them from GET /api/npcs. Nothing anyone asks is stored.

export interface Npc {
  id: string;
  name: string;
  /** Who they are, under their name: "Library help desk". */
  role: string;
  space: string;
  x: number;
  z: number;
  /** Which way they face (radians about y; 0 faces +z). */
  rot: number;
  /** How far in front of them you stand to talk (over a desk: further). Default 1.6 m. */
  reach?: number;
  /** Their look: palette indexes, as for anyone (db.ts validLook). */
  look: { body: number; skin: number; hair: number; top: number; bottom: number; hat: number; hatColour: number };
  /** The pages they draw on (public, crawlable; see the plan's research). */
  links: { label: string; url: string }[];
  greeting: string;
  /** "male" or "female", for the voice that says hello (plan 79). */
  voice: "male" | "female";
  /** The crawled sources it answers from (crawl.ts); none, and it only points to its pages. */
  sources: string[];
  /** Sits (on a bench) rather than stands. */
  seated?: boolean;
  /** A model of its own instead of a person (assets/npc/<model>.glb). */
  model3d?: string;
  /** Not ready to answer yet: says this instead of asking the model (Seongsu, until his pages are written). */
  notYet?: string;
  /** "haiku" for the careful ones (courses, careers), "nova" for the rest (plan 78, 10/29). */
  model: "haiku" | "nova";
}

export const NPCS: Npc[] = [
  {
    id: "library",
    name: "Robin",
    role: "Library help desk",
    space: "library",
    // Behind reception (the desk is z -8.6..-7.4), facing the room; you talk over it.
    x: -9,
    z: -9.5,
    rot: 0,
    reach: 3,
    look: { body: 1, skin: 2, hair: 3, top: 3, bottom: 1, hat: 0, hatColour: 1 },
    links: [
      { label: "Chifley Library", url: "https://anulib.anu.edu.au/using-library/branches/chifley-library" },
      { label: "Opening hours", url: "https://anu.libcal.com/hours" },
      { label: "Borrowing", url: "https://anulib.anu.edu.au/using-library/borrow" },
      { label: "Book a room or desk", url: "https://anu.libcal.com/" },
      { label: "Academic Skills", url: "https://www.anu.edu.au/students/contacts/academic-skills" },
    ],
    greeting: "Hi! Ask me about library hours, borrowing, booking a room, or Academic Skills (writing, study and referencing help).",
    voice: "female",
    sources: ["library"],
    model: "nova",
  },
  {
    id: "sport",
    name: "Kai",
    role: "ANU Sport",
    space: "outdoor",
    // Inside the tent at the table's east end, clear of the PC's E spot.
    x: -43.8, // SPORT_PC.x + 1.7 (client/src/spaces/sportstent.ts)
    z: -31,
    rot: 0,
    reach: 1.5,
    look: { body: 0, skin: 1, hair: 0, top: 0, bottom: 7, hat: 2, hatColour: 7 },
    links: [
      { label: "The gym", url: "https://anu-sport.com.au/gym" },
      { label: "Memberships", url: "https://anu-sport.com.au/gym/Memberships" },
      { label: "Clubs", url: "https://anu-sport.com.au/clubs" },
      { label: "FAQs", url: "https://anu-sport.com.au/footer/faqs" },
    ],
    greeting: "G'day! Ask me about the gym, memberships and sports clubs.",
    voice: "male",
    sources: ["sport"],
    model: "nova",
  },
  {
    id: "anusa",
    name: "Sam",
    role: "ANUSA",
    space: "anusa",
    // Behind the counter's east end; you talk over it, clear of the PC's E spot.
    x: -2.4,
    z: -6.2,
    rot: 0,
    reach: 2.2,
    look: { body: 1, skin: 4, hair: 1, top: 3, bottom: 1, hat: 0, hatColour: 1 },
    links: [
      { label: "What ANUSA is", url: "https://anusa.com.au/about/whatisanusa/" },
      { label: "Student assistance", url: "https://anusa.com.au/student-assistance/" },
      { label: "Free legal service", url: "https://anusa.com.au/legal/" },
      { label: "Services (pantry, meals)", url: "https://anusa.com.au/services/" },
      { label: "Clubs", url: "https://anusa.com.au/clubs/" },
    ],
    greeting: "Hey! I can tell you about ANUSA's support, legal help, the pantry and clubs.",
    voice: "female",
    sources: ["anusa"],
    model: "nova",
  },
  {
    id: "course",
    name: "Priya",
    role: "Course adviser",
    space: "hub",
    // In the pocket behind reception's short east leg (x -8.9..-8), side by
    // side, facing east over it, clear of the PCs on the bar.
    x: -9.4,
    z: -5.9,
    rot: Math.PI / 2,
    reach: 2.3,
    look: { body: 1, skin: 3, hair: 0, top: 5, bottom: 7, hat: 0, hatColour: 1 },
    links: [
      { label: "Program and course advice", url: "https://www.anu.edu.au/students/program-administration/program-management/program-and-course-advice" },
      { label: "Computing degrees and majors", url: "https://comp.anu.edu.au/study/bachelor/" },
      { label: "Programs and Courses", url: "https://programsandcourses.anu.edu.au/" },
    ],
    greeting: "Hello! Ask me about any ANU course, degree, major or its requirements (say the year if it isn't this one), key dates and enrolment rules.",
    voice: "female",
    sources: ["catalogue", "computing", "students"],
    model: "haiku",
  },
  {
    id: "careers",
    name: "Alex",
    role: "Careers adviser",
    // Behind the Career Hub's desk, facing the room (plan 111; client/src/spaces/careers.ts).
    space: "careers",
    x: 0.6,
    z: -7.5,
    rot: 0,
    reach: 2.1,
    look: { body: 0, skin: 0, hair: 2, top: 1, bottom: 1, hat: 0, hatColour: 1 },
    links: [
      { label: "Careers & Employability", url: "https://www.anu.edu.au/students/careers-opportunities/careers" },
      { label: "Planning your career", url: "https://www.anu.edu.au/students/careers-opportunities/careers/planning-your-career" },
      { label: "Computing internships", url: "https://systems.anu.edu.au/students/student-employability/internships/computing/" },
      { label: "Research and Honours projects", url: "https://comp.anu.edu.au/study/projects/" },
    ],
    greeting: "Hi! Cloud, security, AI, data, research: let's talk about where you'd like to go.",
    voice: "male",
    sources: ["careers", "computing"],
    model: "haiku",
  },
  {
    id: "housing",
    name: "Jordan",
    role: "Accommodation",
    space: "outdoor",
    // Behind the green tent's table, at its east end (client/src/spaces/sportstent.ts HOUSING_TENT).
    x: -37.6,
    z: -31,
    rot: 0,
    reach: 1.5,
    look: { body: 0, skin: 3, hair: 4, top: 6, bottom: 1, hat: 0, hatColour: 1 },
    links: [
      { label: "Compare residences", url: "https://study.anu.edu.au/accommodation/compare-residences" },
      { label: "Our residences", url: "https://study.anu.edu.au/accommodation/our-residences" },
      { label: "Applying", url: "https://study.anu.edu.au/accommodation/application-advice" },
      { label: "Fees & agreements", url: "https://study.anu.edu.au/accommodation/support-resources/fees-occupancy-agreements" },
    ],
    greeting: "Hi! I can compare ANU's residences for you: prices, catered or self-catered, and how to apply.",
    voice: "male",
    sources: ["housing"],
    model: "nova",
  },
  {
    id: "intl",
    name: "Mei",
    role: "International students",
    space: "hub",
    // Behind reception's short leg, where the careers adviser stood before the Career Hub opened.
    x: -9.4,
    z: -7.4,
    rot: Math.PI / 2,
    reach: 2.3,
    look: { body: 1, skin: 1, hair: 5, top: 8, bottom: 1, hat: 0, hatColour: 1 },
    links: [
      { label: "Current international students", url: "https://www.anu.edu.au/students/information-for/current-international-students" },
      { label: "Student visa conditions", url: "https://www.anu.edu.au/students/program-administration/program-management/information-for-international-student-visa-holders-studying-in-australia" },
      { label: "OSHC (health cover)", url: "https://study.anu.edu.au/apply/overseas-student-health-cover-oshc" },
    ],
    greeting: "Welcome! Ask me about student visas, OSHC health cover and settling in at ANU.",
    voice: "female",
    sources: ["intl"],
    model: "nova",
  },
  {
    id: "seongsu",
    name: "Seongsu",
    role: "Who made this",
    space: "outdoor",
    // Sitting on the east bench of the east picnic table north of Badger & Co, facing east (client/src/spaces/creek.ts PICNIC).
    x: -38.38,
    z: -11.55,
    rot: Math.PI / 2,
    reach: 1.3,
    seated: true,
    model3d: "boo",
    look: { body: 0, skin: 0, hair: 0, top: 0, bottom: 0, hat: 0, hatColour: 0 },
    links: [
      { label: "This project's README", url: "/readme/" },
      { label: "The code (GitHub)", url: "https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader" },
    ],
    greeting: "Boo! I'm Seongsu, the student who built this campus with Claude Code. Ask me how it works.",
    voice: "male",
    sources: ["project"],
    model: "haiku",
    notYet: "I'm still writing down how I built this place, so I can't answer yet, sorry! Come back in a few days, or read the README below.",
  },
];

export const npcById = (id: unknown): Npc | undefined => NPCS.find((n) => n.id === id);

// --- the model ----------------------------------------------------------------
// Amazon Bedrock, with the same AWS keys and region as S3 (no new key): the
// careful assistants (courses, careers) on Claude Haiku, the rest on Amazon
// Nova 2 Lite, each a Fly secret away from changing (NPC_MODEL_HAIKU,
// NPC_MODEL_NOVA). For a server without AWS, NPC_MODEL may name a Claude
// model for the Anthropic API key (ANTHROPIC_API_KEY) instead. No key is ever
// in the repo. To keep the bill from running away: 400 output tokens, 30
// questions a person a day (main.ts) and 50 an assistant a day here
// (NPC_PER_DAY). AWS's budget only warns, so these limits are what stop it.
// What's asked goes to the model and nowhere else: not stored, not logged.

const MODELS = {
  haiku: process.env.NPC_MODEL_HAIKU || "au.anthropic.claude-haiku-4-5-20251001-v1:0",
  nova: process.env.NPC_MODEL_NOVA || "global.amazon.nova-2-lite-v1:0",
};
/** An Anthropic-API model for every assistant, when the server has that key rather than AWS. */
const API_MODEL = process.env.NPC_MODEL && !/^[a-z0-9-]+\.[a-z0-9]/i.test(process.env.NPC_MODEL) ? process.env.NPC_MODEL : "";
const bedrock = !API_MODEL && process.env.AWS_ACCESS_KEY_ID ? new BedrockRuntimeClient({ region: process.env.AWS_REGION }) : null;
const client = API_MODEL && process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const PER_NPC_DAY = Number(process.env.NPC_PER_DAY) || 50;
const asked = new Map<string, { day: string; n: number }>();
/** Takes one of today's questions for this assistant; false once its 50 are used. */
function takeOne(npc: Npc): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const a = asked.get(npc.id);
  const n = a?.day === day ? a.n : 0;
  if (n >= PER_NPC_DAY) return false;
  asked.set(npc.id, { day, n: n + 1 });
  return true;
}
export const modelReady = (): boolean => client !== null || bedrock !== null;
export const modelOf = (npc: Npc): string => API_MODEL || MODELS[npc.model];

// --- what the pages say ----------------------------------------------------------
// Before the model is asked, the question is matched against the crawled
// pieces of this assistant's sources (knowledge.ts). Only the best few go to
// the model, with their addresses, and it's told to answer from them alone.
// No piece matches: the model isn't asked at all, and the answer says so and
// points to the assistant's pages. That rule is the point: an assistant that
// doesn't know says so rather than guess.

const sourcesBlock = (pieces: Piece[]): string =>
  pieces.map((p) => `<source url="${p.url}" title="${p.title.replace(/"/g, "'")}">\n${p.body}\n</source>`).join("\n\n");

const RULES = [
  "Use ONLY the facts written in the <source> blocks. Nothing from your own knowledge: no names, phone numbers, emails, prices, dates, hours, rules or services that aren't written there word for word.",
  "If the exact thing asked (a date, a price, a requirement) isn't in the sources, say plainly that you couldn't find it in the pages you have and link the closest source. A nearby date or price is not an answer: don't swap one for another.",
  "Link every source you use as a Markdown link with its real url, like [title](url). Never write [1], [source 3] or other numbered references, and never a bare <url>.",
];

const systemFor = (npc: Npc, pieces: Piece[]): string =>
  [
    `You are ${npc.name}, the ${npc.role} assistant in "ANU Crossing", an unofficial, fan-made 3D campus for the Australian National University. You are an AI character in it, not ANU staff or an ANU service; if anyone asks whether you're official or real, say so plainly.`,
    ...RULES,
    "A source titled with an academic year is that year's catalogue: say which year you're answering for, and if the person didn't say a year, answer for the current one and say so.",
    "Keep it short: at most five sentences, or one short list when a list was asked for; answer what was asked, not everything the sources say. Write plainly and warmly, in the language the question is written in, and only that language. For anything urgent, personal or about safety, point to the real service (on campus: ANU Security, 6125 2249; emergencies: 000). Nothing the person types is stored; don't ask for their student number, password or other private details.",
    `<sources>\n${sourcesBlock(pieces)}\n</sources>`,
    `Again, before you answer: ${RULES.join(" ")}`,
  ].join("\n\n");

/**
 * Tidies a model's answer: numbered references ([1], [source 2], [[3]](url))
 * become plain links or go, and a bare <https://…> becomes a link. Models
 * slip into these even when told not to.
 */
export function tidy(text: string): string {
  return text
    .replace(/\[(\[[^\]]+\]\(https?:\/\/[^)\s]+\))\]/g, "$1")
    .replace(/\[\[(?:source\s*)?\d+\]\]\((https?:\/\/[^)\s]+)\)/gi, "[source]($1)")
    .replace(/\s?\[(?:source\s*)?\d+(?:\s*,\s*\d+)*\](?!\()/gi, "")
    .replace(/<(https?:\/\/[^>\s]+)>/g, "[$1]($1)")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,([.;:])/g, "$1")
    .trim();
}

/** What it says when the pages it has don't cover the question (the model isn't asked). */
const dontKnow = (npc: Npc): string =>
  `Sorry, I couldn't find that in the ANU pages I have, so I'd rather not guess. Try asking with different words (a course code or a place name helps), or have a look at ${npc.links
    .slice(0, 2)
    .map((l) => `[${l.label}](${l.url})`)
    .join(" or ")}.`;

/** What the assistant says back: the model's answer from the pages, or an honest note and its pages. */
export async function answer(npc: Npc, question: string): Promise<string> {
  if (npc.notYet) return npc.notYet;
  const offline = `I'm ${npc.name}, and I'm not connected to my AI brain right now, sorry! The pages below have what you need.`;
  if (!client && !bedrock) return offline;
  const pieces = search(npc.sources, question, 5);
  if (!pieces.length) return dontKnow(npc);
  if (!takeOne(npc)) return `I've answered all I can for today, sorry! Try again tomorrow, or have a look at the pages below.`;
  const system = systemFor(npc, pieces);
  if (bedrock) return askBedrock(bedrock, npc, question, offline, system);
  try {
    const res = await client!.messages.create(
      {
        model: API_MODEL,
        max_tokens: 400,
        output_config: { effort: "low" },
        system,
        messages: [{ role: "user", content: question }],
      },
      { timeout: 20_000, maxRetries: 1 },
    );
    if (res.stop_reason === "refusal") return "That's not something I can help with here. The pages below may.";
    const text = tidy(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n"));
    return text || offline;
  } catch (err) {
    // Out of credit (or past the account's spend limit): say so plainly, so a
    // marker knows it's the bill, not the app, and whom to tell (the course's
    // rule for outside AI services).
    if (err instanceof Anthropic.APIError && /credit|billing|spend limit/i.test(err.message)) {
      console.error(JSON.stringify({ at: new Date().toISOString(), event: "npc-error", npc: npc.id, code: "NPC-CREDIT" }));
      return CREDIT_OUT;
    }
    const code = err instanceof Anthropic.RateLimitError ? "NPC-BUSY" : err instanceof Anthropic.AuthenticationError ? "NPC-KEY" : err instanceof Anthropic.APIError ? `NPC-${err.status ?? "API"}` : "NPC-NET";
    console.error(JSON.stringify({ at: new Date().toISOString(), event: "npc-error", npc: npc.id, code }));
    return `I couldn't think just now (error ${code}). Try again in a moment, or use the pages below.`;
  }
}

const CREDIT_OUT = "My AI's credit has run out for now (error NPC-CREDIT), so I can't answer. Please let the app's author know at u8321477@anu.edu.au. The pages below still work.";

/** The same question through Bedrock's Converse API, on the assistant's own model. A refused call reads as out of credit. */
async function askBedrock(br: BedrockRuntimeClient, npc: Npc, question: string, offline: string, system: string): Promise<string> {
  try {
    const res = await br.send(
      new ConverseCommand({
        modelId: MODELS[npc.model],
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: question }] }],
        inferenceConfig: { maxTokens: 400, temperature: 0 },
      }),
      { abortSignal: AbortSignal.timeout(25_000) },
    );
    let raw = (res.output?.message?.content ?? []).flatMap((b) => (b.text ? [b.text] : [])).join("\n");
    // Cut off at the token limit: end at the last whole line rather than mid-link.
    if (res.stopReason === "max_tokens" && raw.includes("\n")) raw = raw.slice(0, raw.lastIndexOf("\n"));
    const text = tidy(raw);
    return text || offline;
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    const code = name === "AccessDeniedException" ? "NPC-CREDIT" : name === "ThrottlingException" ? "NPC-BUSY" : name === "TimeoutError" || name === "AbortError" ? "NPC-NET" : `NPC-${name.replace(/Exception$/, "") || "API"}`;
    console.error(JSON.stringify({ at: new Date().toISOString(), event: "npc-error", npc: npc.id, code }));
    if (code === "NPC-CREDIT") return CREDIT_OUT;
    return `I couldn't think just now (error ${code}). Try again in a moment, or use the pages below.`;
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

// The AI campus assistants (plan 56): five people standing about campus who
// answer questions about one part of ANU each, from its public pages. Where
// each stands and what it covers lives here; the client draws them from
// GET /api/npcs. Nothing anyone asks is stored, and each says so.
//
// The school's model (the course proxy) can't be reached from Fly, so they
// run on Claude with a paid key (the user's call, 10/24); see "the model" below.

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
    ],
    greeting: "Hi! I can point you to library hours, borrowing and booking a room.",
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
    greeting: "Hello! I can help you think through courses, degree plans and prerequisites.",
  },
  {
    id: "careers",
    name: "Alex",
    role: "Careers adviser",
    space: "hub",
    x: -9.4,
    z: -7.4,
    rot: Math.PI / 2,
    reach: 2.3,
    look: { body: 0, skin: 0, hair: 2, top: 1, bottom: 1, hat: 0, hatColour: 1 },
    links: [
      { label: "Careers & Employability", url: "https://www.anu.edu.au/students/careers-opportunities/careers" },
      { label: "Planning your career", url: "https://www.anu.edu.au/students/careers-opportunities/careers/planning-your-career" },
      { label: "Computing internships", url: "https://systems.anu.edu.au/students/student-employability/internships/computing/" },
      { label: "Research and Honours projects", url: "https://comp.anu.edu.au/study/projects/" },
    ],
    greeting: "Hi! Cloud, security, AI, data, research: let's talk about where you'd like to go.",
  },
];

export const npcById = (id: unknown): Npc | undefined => NPCS.find((n) => n.id === id);

// --- the model ----------------------------------------------------------------
// Either Amazon Bedrock, when the Fly secret NPC_MODEL names a Bedrock model or
// inference profile (it then uses the same AWS keys and region as S3, so no new
// key), or Claude by the API key in the Fly secret ANTHROPIC_API_KEY. Neither
// key is ever in the repo. Short answers to short questions, so cheap. To keep
// a bill from running away: 400 output tokens, 30 questions a person a day and
// NPC_PER_DAY (150 by default) in all. main.ts checks the per-person part and
// `budgetLeft` the total. With no model, the honest "not connected" answer
// stays. What's asked goes to the model and nowhere else: not stored, not
// logged (only that someone asked, and how long).

const MODEL = process.env.NPC_MODEL || "claude-haiku-5-5";
/** Bedrock ids look like "anthropic.claude-…", "au.anthropic.…", "amazon.nova-micro-…". */
const ON_BEDROCK = /^((au|apac|us|eu|global)\.)?(anthropic|amazon|meta|mistral)\./.test(MODEL);
const bedrock = ON_BEDROCK && process.env.AWS_ACCESS_KEY_ID ? new BedrockRuntimeClient({ region: process.env.AWS_REGION }) : null;
const client = !ON_BEDROCK && process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const PER_DAY = Number(process.env.NPC_PER_DAY) || 150;
let today = "";
let askedToday = 0;
/** False once today's questions (all assistants, everyone) are used up. */
function budgetLeft(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== today) [today, askedToday] = [day, 0];
  return askedToday < PER_DAY;
}
export const modelReady = (): boolean => client !== null || bedrock !== null;

const systemFor = (npc: Npc): string =>
  [
    `You are ${npc.name}, the ${npc.role} assistant standing in "ANU Crossing", an unofficial, fan-made 3D campus for the Australian National University. You are a character in it, not an ANU service, and you say so if anyone thinks otherwise.`,
    `What you help with: ${npc.greeting}`,
    `The pages you point people to (link them by name when they help):\n${npc.links.map((l) => `- ${l.label}: ${l.url}`).join("\n")}`,
    "Answer in two to five short sentences, plainly and warmly, in the language the question is in. You don't browse the web: if you aren't sure of a fact that changes (opening hours, prices, dates, rules), say so and point to the right page rather than guess. Never make up names, phone numbers or policies. For anything urgent, personal or about safety, point to the real service (for urgent help on campus: ANU Security, 6125 2249; emergencies: 000).",
    "Nothing the person types is stored; don't ask for their student number, password or other private details.",
  ].join("\n\n");

/** What the assistant says back: the model's answer, or, without one, an honest note and its pages. */
export async function answer(npc: Npc, question: string): Promise<string> {
  const offline = `I'm ${npc.name}, and I'm not connected to my AI brain right now, sorry! The pages below have what you need. (Nothing you type here is kept.)`;
  if (!client && !bedrock) return offline;
  if (!budgetLeft()) return `I've answered all I can for today, sorry! Try again tomorrow, or have a look at the pages below.`;
  askedToday++;
  if (bedrock) return askBedrock(bedrock, npc, question, offline);
  try {
    const res = await client!.messages.create(
      {
        model: MODEL,
        max_tokens: 400,
        output_config: { effort: "low" },
        system: systemFor(npc),
        messages: [{ role: "user", content: question }],
      },
      { timeout: 20_000, maxRetries: 1 },
    );
    if (res.stop_reason === "refusal") return "That's not something I can help with here. The pages below may.";
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
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

/** The same question through Bedrock's Converse API. A refused call (the monthly budget's deny policy) reads as out of credit. */
async function askBedrock(br: BedrockRuntimeClient, npc: Npc, question: string, offline: string): Promise<string> {
  try {
    const res = await br.send(
      new ConverseCommand({
        modelId: MODEL,
        system: [{ text: systemFor(npc) }],
        messages: [{ role: "user", content: [{ text: question }] }],
        inferenceConfig: { maxTokens: 400 },
      }),
      { abortSignal: AbortSignal.timeout(20_000) },
    );
    const text = (res.output?.message?.content ?? []).flatMap((b) => (b.text ? [b.text] : [])).join("\n").trim();
    return text || offline;
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    const code = name === "AccessDeniedException" ? "NPC-CREDIT" : name === "ThrottlingException" ? "NPC-BUSY" : name === "TimeoutError" || name === "AbortError" ? "NPC-NET" : `NPC-${name.replace(/Exception$/, "") || "API"}`;
    console.error(JSON.stringify({ at: new Date().toISOString(), event: "npc-error", npc: npc.id, code }));
    if (code === "NPC-CREDIT") return CREDIT_OUT;
    return `I couldn't think just now (error ${code}). Try again in a moment, or use the pages below.`;
  }
}


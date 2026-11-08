import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { keywords, search, type Piece } from "./knowledge.ts";

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
  /** More sources for questions that match `when` (its own pages first, these beside them). */
  alsoFor?: { when: RegExp; sources: string[] };
  /** Sits (on a bench) rather than stands. */
  seated?: boolean;
  /** A model of its own instead of a person (assets/npc/<model>.glb). */
  model3d?: string;
  /** Not ready to answer yet: says this instead of asking the model (Seongsu, until his pages are written). */
  notYet?: string;
  /** What a short, vague question to it is about ("price" at the gym means a gym membership). */
  topic: string;
  /** How its pages' words map to the way people ask (said in its brief), if they differ. */
  hint?: string;
  /** Two questions it can answer, offered when someone just says hello. */
  examples: string[];
  /** "haiku" for the careful ones (courses, careers, and accommodation's price comparisons), "nova" for the rest (plan 78). */
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
    topic: "Chifley library hours borrowing rooms",
    // The hours table lists every branch by week, its header row in one piece and the rows in the
    // next: the helper QA (11/8) got "24 hours except at weekends…" and other branches mixed in.
    hint: "You work at Chifley Library. Asked when the library opens or closes, answer for Chifley first in one plain sentence: the building's hours, then the Chifley information service's hours (its desk), for today or the week asked about; name other branches only if asked. Each row of the hours table reads: branch | Monday | Tuesday | … | Sunday, in the order of the dates above it.",
    examples: ["When is Chifley Library open this week?", "How do I book an Academic Skills appointment?"],
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
    topic: "gym membership",
    examples: ["How much is a student gym membership?", "What sports clubs are there?"],
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
    topic: "ANUSA student services",
    examples: ["Is there a free food pantry?", "Can ANUSA help me with a legal problem?"],
    greeting: "Hey! I can tell you about ANUSA's support, legal help, the pantry and clubs.",
    voice: "female",
    sources: ["anusa"],
    model: "nova",
  },
  {
    id: "canberra",
    name: "Riley",
    role: "Getting around Canberra",
    space: "anusa",
    // Behind the counter, Sam's mirror image across the PC (Sam east of it, Riley west; the user, 11/8).
    x: -5.6,
    z: -6.2,
    rot: 0,
    reach: 2.2,
    look: { body: 0, skin: 2, hair: 2, top: 3, bottom: 1, hat: 0, hatColour: 1 },
    links: [
      { label: "Catching public transport", url: "https://services.anu.edu.au/campus-environment/transport-parking/catching-public-transport" },
      { label: "Transport Canberra", url: "https://www.transport.act.gov.au/getting-around" },
      { label: "MyWay+ fares", url: "https://www.transport.act.gov.au/tickets-and-myway/fares" },
      { label: "Safety on campus", url: "https://services.anu.edu.au/campus-environment/safety-security" },
      { label: "Cost of living in Canberra", url: "https://www.anu.edu.au/students/program-administration/fees-payments/estimated-cost-of-living-in-canberra" },
    ],
    topic: "Canberra transport buses light rail MyWay campus safety cost of living",
    hint: "People ask in their own words: \"the bus\" means Transport Canberra's buses (once called ACTION), \"the tram\" means the light rail, \"the city\" or \"town\" means Civic (Canberra's city centre, next to campus). For getting home at night, name what the pages offer (ANU Security, the ANUOK app) and never promise a service the pages don't describe. Asked where to buy groceries: say what the pages offer (the ANUSA Union Pantry, grocery vouchers, Student Bites, budgeting tips) and that they don't name particular supermarkets.",
    examples: ["How do I get from campus to Civic?", "How much is a bus fare with MyWay+?"],
    greeting: "Hi! I can help with getting around Canberra: buses, the light rail, MyWay+ fares, getting to Civic, staying safe at night, and the cost of living.",
    voice: "male",
    sources: ["canberra"],
    // Food questions also search ANUSA's pages (the pantry, grocery vouchers, Student Bites): the user
    // asked Riley where to buy groceries (11/8). Only then, so ANUSA's many pages don't crowd transport out.
    alsoFor: { when: /\b(grocer\w*|shopping|supermarket\w*|food|pantry|eat\w*|meals?|cheap food)\b/i, sources: ["anusa"] },
    model: "nova",
  },
  {
    id: "it",
    name: "Taylor",
    role: "Computing & IT help",
    space: "hub",
    // Standing between the two office pods (desks x -4.3..0.3 and 6.2..10.8), in line with them,
    // facing the room (the user, 11/8); you talk from just south of the gap.
    x: 3.25,
    z: -7.55,
    rot: 0,
    reach: 1.8,
    // A yellow hard hat (the user, 11/9): the IT desk, at a glance.
    look: { body: 1, skin: 0, hair: 4, top: 3, bottom: 1, hat: 7, hatColour: 1 },
    links: [
      { label: "ANU ID and password", url: "https://services.anu.edu.au/information-technology/id-and-password" },
      { label: "Multi-factor authentication", url: "https://services.anu.edu.au/multi-factor-authentication-mfa" },
      { label: "ANU Wi-Fi (ANU-Secure, eduroam)", url: "https://services.anu.edu.au/information-technology/remote-access-wi-fi/anu-wi-fi" },
      { label: "Your ANU email", url: "https://services.anu.edu.au/information-technology/email/accessing-your-email" },
      { label: "Canvas", url: "https://www.anu.edu.au/students/learning-platforms/canvas" },
      { label: "IT security", url: "https://services.anu.edu.au/information-technology/information-security" },
    ],
    topic: "ANU IT password MFA email Wi-Fi Canvas Wattle ANUHub security",
    hint: "People ask in their own words: \"ISIS\" is the old student system, now ANUHub; \"Wattle\" is the old learning system, being replaced by Canvas (say which the pages say to use now); \"uni Wi-Fi\" means ANU-Secure or eduroam; \"reset my password\" means the ANU ID password. Forgot a password: lead with the pages' reset route for someone who can't sign in (not the steps for changing a password you still know). Asked whether Wattle or Canvas is in use: answer that first, from the Wattle and Canvas pages. Use ANU's own formats from the pages (u1234567@anu.edu.au), never a generic example. For security, give the pages' do's and don'ts plainly (never share your password or MFA codes, report phishing). Never ask for or accept anyone's password, student number or codes.",
    examples: ["How do I connect to eduroam?", "I forgot my ANU password. What do I do?"],
    greeting: "Hi, I'm the Computing & IT desk. Ask me about your ANU password and MFA, email, Wi-Fi (ANU-Secure, eduroam), Canvas, Wattle and ANUHub, or staying safe online.",
    voice: "female",
    sources: ["it"],
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
      { label: "How to enrol", url: "https://www.anu.edu.au/students/program-administration/enrolment/enrol-for-the-first-time-as-a-coursework-student" },
      { label: "Program and course advice", url: "https://www.anu.edu.au/students/program-administration/program-management/program-and-course-advice" },
      { label: "Computing degrees and majors", url: "https://comp.anu.edu.au/study/bachelor/" },
      { label: "Programs and Courses", url: "https://programsandcourses.anu.edu.au/" },
    ],
    topic: "course program requirements",
    examples: ["How do I enrol in my courses?", "What are the prerequisites for COMP2300?"],
    greeting: "Hello! Ask me how to enrol, or about any ANU course, degree, major or its requirements (say the year if it isn't this one) and key dates.",
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
    z: -7.4,
    rot: 0,
    reach: 2.1,
    look: { body: 0, skin: 0, hair: 2, top: 1, bottom: 1, hat: 0, hatColour: 1 },
    links: [
      { label: "Careers & Employability", url: "https://www.anu.edu.au/students/careers-opportunities/careers" },
      { label: "Planning your career", url: "https://www.anu.edu.au/students/careers-opportunities/careers/planning-your-career" },
      { label: "Computing internships", url: "https://systems.anu.edu.au/students/student-employability/internships/computing/" },
      { label: "Research and Honours projects", url: "https://comp.anu.edu.au/study/projects/" },
    ],
    topic: "careers internships jobs",
    examples: ["How do I find a computing internship?", "Can I get help with my CV?"],
    greeting: "Hi! Cloud, security, AI, data, research: let's talk about where you'd like to go.",
    voice: "male",
    sources: ["careers", "computing"],
    model: "haiku",
  },
  {
    id: "housing",
    // The user's screenshot (11/4): asked for the cheapest residence "coursework students" can enter, Jordan
    // said its pages don't sort by student type, though the comparison table has a resident-type column.
    hint: "Students ask in their own words: \"coursework\" students are undergraduates or postgraduates studying by coursework (not research), so use the table's Undergraduate / Postgraduate resident types; \"cheapest\" means the lowest \"From … /wk\" room rate. Give the cheapest one or two for each type that fits, with their weekly rates.",
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
    topic: "residence accommodation",
    examples: ["What is the cheapest catered residence?", "How do I apply for accommodation?"],
    greeting: "Hi! I can compare ANU's residences for you: prices, catered or self-catered, and how to apply.",
    voice: "male",
    sources: ["housing"],
    model: "haiku",
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
    topic: "international students visa",
    examples: ["What is OSHC?", "How many hours can I work on a student visa?"],
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
    topic: "project",
    examples: ["How did you set up AWS?", "How do the AI assistants work?"],
    greeting: "Boo! I'm Seongsu, the student who built this campus with Claude Code. Ask me how it works.",
    voice: "male",
    sources: ["project"],
    model: "haiku",
    // Whatever you ask, he lets you in on the secret (the user's ask, 11/4): the hidden room at Lab Coffee's far end.
    // The secret room is still his to tell (the user's ask, 11/4), now as a tip, not his only answer.
    hint: "You are the author's ghost and answer about this project: what it is and why, how it was planned and built with several Claude Code sessions, the stack (Node and Hono on one Fly.io machine, SQLite, Three.js, WebSockets), how AWS is set up (one IAM user with only S3, SES and Bedrock permissions, files through signed S3 links, sign-up codes by SES, the assistants on Bedrock, voice on a LiveKit server on the author's EC2, a budget that only warns), how the AI assistants work (crawled ANU pages, search, answers only from them), the decisions and their reasons, and what the app keeps about people. Speak as the author, in the first person, briefly. If someone asks for a secret or something fun, tell them: go to Lab Coffee at 154's north-west corner, walk to the far end of its terrace, and press E at the unmarked 'Staff only' door.",

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
// No piece matches: the model gets no sources and a brief that allows no
// facts (noSourcesFor). That rule is the point: an assistant that doesn't
// know says so rather than guess.

const sourcesBlock = (pieces: Piece[]): string =>
  pieces.map((p) => `<source url="${p.url}" title="${p.title.replace(/"/g, "'")}">\n${p.body}\n</source>`).join("\n\n");

const RULES = [
  "Use ONLY the facts in the <source> blocks: put them in your own words, put two together, but add nothing from your own knowledge (no names, phone numbers, emails, prices, dates, hours, rules or services the sources don't give).",
  "Answer the question directly and specifically first (the address, the price, the date, the steps), with the details the sources give, then link where it came from. Don't send the person off to a page for something the sources already say.",
  "If the exact thing asked (a date, a price, a requirement) isn't in the sources, say plainly that you couldn't find it in the pages you have and link the closest source. A nearby date or price is not an answer: don't swap one for another.",
  "Link every source you use as a Markdown link with its real url, like [title](url). Never write [1], [source 3] or other numbered references, and never a bare <url>.",
];

/**
 * The language to reply in, named in the brief. Left to itself the model
 * drifted both ways (Nova answered "who r u" in Korean when the brief's
 * example named Korean, and a Korean hello in English when told "the
 * user's language"), so the language is named from the question's letters:
 * Hangul is Korean, kana Japanese, and so on. Latin letters are English,
 * unless the message is plainly Spanish, French…
 */
const SCRIPTS: [RegExp, string][] = [
  [/\p{Script=Hangul}/u, "Korean"],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "Japanese"],
  [/\p{Script=Han}/u, "Chinese"],
  [/\p{Script=Cyrillic}/u, "Russian (or the Cyrillic language it's in)"],
  [/\p{Script=Arabic}/u, "Arabic (or the language in Arabic script it's in)"],
  [/\p{Script=Thai}/u, "Thai"],
  [/\p{Script=Devanagari}/u, "Hindi (or the Devanagari language it's in)"],
  [/\p{Script=Greek}/u, "Greek"],
  [/\p{Script=Hebrew}/u, "Hebrew"],
];
export function replyIn(question: string): string {
  const named = SCRIPTS.find(([re]) => re.test(question))?.[1];
  if (named) return `Reply in ${named}, the language of the user's message, even though your pages are in English.`;
  if (/[^\p{Script=Latin}\P{L}]/u.test(question)) return "Reply in the language of the user's message, even though your pages are in English.";
  return "Reply in English, unless the user's message is clearly written in another language (Spanish, French…): then in that language.";
}

const systemFor = (npc: Npc, pieces: Piece[], lang: string): string =>
  [
    lang,
    `You are ${npc.name}, the ${npc.role} assistant in "ANU Crossing", an unofficial, fan-made 3D campus for the Australian National University. You are an AI character in it, not ANU staff or an ANU service; if anyone asks whether you're official or real, say so plainly.`,
    ...RULES,
    "A source titled with an academic year is that year's catalogue: say which year you're answering for, and if the person didn't say a year, answer for the current one and say so.",
    ...(npc.hint ? [npc.hint] : []),
    "Earlier messages in this chat are the conversation so far: a short follow-up (\"then which club?\", \"how much is it?\") is about what was said there (a sport, a residence, a course). Answer it for that, from the sources.",
    "The pages' words may differ from the question's: a course page's \"Requisite and Incompatibility\" (\"To enrol in this course you must have completed…\") is its prerequisites (if that section only says \"Incompatible with…\", it has no prerequisites: say so); \"Offered in\" is when it runs. Use them.",
    "Keep it short: at most five sentences, or one short list when a list was asked for; answer what was asked, not everything the sources say. Write plainly and warmly. Only when the question is urgent, personal or about safety, point to the real service (on campus: ANU Security, 6125 2249; emergencies: 000). Don't end with a note about yourself, being unofficial, or emergency numbers unless asked. Nothing the person types is stored; don't ask for their student number, password or other private details.",
    `<sources>\n${sourcesBlock(pieces)}\n</sources>`,
    `Again, before you answer: ${RULES.join(" ")} ${lang}`,
  ].join("\n\n");

/**
 * Tidies a model's answer: numbered references ([1], [source 2], [[3]](url))
 * become plain links or go, and a bare <https://…> becomes a link. Models
 * slip into these even when told not to.
 */
export function tidy(text: string): string {
  return onceEach(text
    .replace(/\[(\[[^\]]+\]\(https?:\/\/[^)\s]+\))\]/g, "$1")
    .replace(/\[\[(?:source\s*)?\d+\]\]\((https?:\/\/[^)\s]+)\)/gi, "[source]($1)")
    .replace(/\s?\[(?:source\s*)?\d+(?:\s*,\s*\d+)*\](?!\()/gi, "")
    .replace(/<(https?:\/\/[^>\s]+)>/g, "[$1]($1)")
    // Nova sometimes opens a link with a CJK bracket (【title](url) … )] ) and repeats the same link.
    .replace(/【/g, "[")
    .replace(/\)\](?=[\s.,;]|$)/g, ")")
    .replace(/(\[[^\]]+\]\([^)\s]+\))(?:,?\s*\1)+/g, "$1")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,([.;:])/g, "$1")
    .trim());
}

/** A link already given earlier in the answer becomes its plain text the second time (the model cites the same page after every sentence). */
function onceEach(text: string): string {
  // The first label each page was linked with: a repeat with the same label is only a citation;
  // a repeat with other words ("the deadline is [11 November](…)") keeps them, unlinked.
  const first = new Map<string, string>();
  return text
    .replace(/(\s?)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, space: string, label: string, url: string, at: number, all: string) => {
      const seen = first.get(url);
      if (seen === undefined) {
        first.set(url, label);
        return m;
      }
      const tacked = /^[.,;:!?]|^\s*$/.test(all.slice(at + m.length));
      if (/^(source|link|here|\d+)$/i.test(label.trim()) || label === url || (tacked && label === seen)) return "";
      return `${space}${label}`;
    })
    .replace(/\s+([,.;:])/g, "$1")
    // A dropped link can leave its joining word behind: "…[here](url) and." → "…[here](url)."
    .replace(/,?\s+(and|or)\s*([.;:])/g, "$2")
    .replace(/ {2,}/g, " ");
}


/**
 * No piece matched: the model still answers, but with no sources and a
 * strict brief (the user's design, 10/30): a hello, thanks or "what can you
 * do?" (in any wording, language or spelling) gets an introduction and two
 * example questions; anything else gets "I couldn't find that in my pages"
 * and a pointer, with no facts at all. With nothing to draw on there's
 * nothing to make up; the brief forbids it anyway.
 */
export const noSourcesFor = (npc: Npc, lang: string): string =>
  [
    lang,
    `You are ${npc.name}, the ${npc.role} assistant in "ANU Crossing", an unofficial, fan-made 3D campus for the Australian National University. You are an AI character, not ANU staff; say so if asked.`,
    `What you help with: ${npc.greeting}`,
    `Questions you can answer from ANU's pages, as examples: ${npc.examples.map((e) => `"${e}"`).join(", ")}.`,
    "For this message you have NO source pages.",
    "If it is a greeting, thanks, small talk, or a question about you or what you can do: reply warmly in one to three sentences, say what you help with, and offer the example questions.",
    "Otherwise: do NOT state any fact (no prices, dates, hours, names, rules, numbers, places). Say plainly that you couldn't find that in the ANU pages you have, suggest asking with different words or one of the example questions, and point to these pages as Markdown links: " +
      npc.links
        .slice(0, 2)
        .map((l) => `[${l.label}](${l.url})`)
        .join(", ") +
      ".",
    `Never write numbered references. ${lang}`,
  ].join("\n\n");

/** What the assistant says back: the model's answer from the pages, or an honest note and its pages. */
/** The turns so far in one open chat window (the client keeps them; nothing is stored here). */
export type Turn = { q: string; a: string };

export async function answer(npc: Npc, question: string, recent: Turn[] = []): Promise<string> {
  if (npc.notYet) return npc.notYet;
  const offline = `I'm ${npc.name}, and I'm not connected to my AI brain right now, sorry! The pages below have what you need.`;
  if (!client && !bedrock) return offline;
  // The pages are in English: a question in another language (Korean, Chinese…) is first turned
  // into English search words by the cheap model, then searched; the answer still comes in its language.
  // Mixed ("COMP2300은 언제 열려?") counts too: the particle stuck to the code would match nothing.
  // Checked against the day's limit first: the translation is a model call as well.
  if (!takeOne(npc)) return `I've answered all I can for today, sorry! Try again tomorrow, or have a look at the pages below.`;
  const foreign = /[^\p{Script=Latin}\P{L}]/u.test(question);
  const query = foreign ? ((await englishQuery(question)) ?? question) : question;
  // A short, vague question ("what's the price?", "where is it?") is about this assistant's own
  // topic, but only if its one word finds nothing alone ("Where is Fenner?" must stay about Fenner).
  const vague = keywords(query).filter((w) => !/^\d+$/.test(w)).length <= 1;
  // A follow-up ("then recommend a program", after "I like tennis") is searched with the question
  // before it, so the pages match what the talk is about (the user, 11/4: it forgot at once).
  const before = recent.at(-1)?.q;
  const context = before ? (/[^\p{Script=Latin}\P{L}]/u.test(before) ? ((await englishQuery(before)) ?? before) : before) : "";
  const sources = npc.alsoFor?.when.test(query) ? [...npc.sources, ...npc.alsoFor.sources] : npc.sources;
  let pieces = search(sources, context && keywords(query).length <= 4 ? `${query} ${context}` : query, 8);
  if (!pieces.length && vague) pieces = search(sources, `${query} ${npc.topic}`, 8);
  // No sources: the model still replies, under a brief that allows no facts (see noSourcesFor).
  const lang = replyIn(question);
  const system = pieces.length ? systemFor(npc, pieces, lang) : noSourcesFor(npc, lang);
  if (bedrock) return askBedrock(bedrock, npc, question, offline, system, recent);
  try {
    const res = await client!.messages.create(
      {
        model: API_MODEL,
        max_tokens: 400,
        output_config: { effort: "low" },
        system,
        messages: [...recent.flatMap((t) => [{ role: "user" as const, content: t.q }, { role: "assistant" as const, content: t.a }]), { role: "user", content: question }],
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

/** A question in another language as a short English search query (a few words), or null without a model. */
async function englishQuery(question: string): Promise<string | null> {
  // Keep what is being asked, not just the topic: "COMP2100 선수과목" came back as "COMP2100 course details" and missed the requisites.
  const ask = "Translate this question into a short English search query of 3 to 8 keywords for ANU's websites. Keep course codes and names as they are, and keep the exact thing asked in plain English words (prerequisites, price, opening hours, location, deadline, how to apply…). Reply with the keywords only.";
  try {
    if (bedrock) {
      const res = await bedrock.send(
        new ConverseCommand({ modelId: MODELS.nova, system: [{ text: ask }], messages: [{ role: "user", content: [{ text: question.slice(0, 500) }] }], inferenceConfig: { maxTokens: 40, temperature: 0 } }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      return (res.output?.message?.content ?? []).flatMap((b) => (b.text ? [b.text] : [])).join(" ").trim() || null;
    }
    if (client) {
      const res = await client.messages.create({ model: API_MODEL, max_tokens: 40, system: ask, messages: [{ role: "user", content: question.slice(0, 500) }] }, { timeout: 10_000, maxRetries: 0 });
      return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim() || null;
    }
  } catch {
    // No translation: the search just won't find much.
  }
  return null;
}

/** The same question through Bedrock's Converse API, on the assistant's own model. A refused call reads as out of credit. */
async function askBedrock(br: BedrockRuntimeClient, npc: Npc, question: string, offline: string, system: string, recent: Turn[] = []): Promise<string> {
  try {
    const res = await br.send(
      new ConverseCommand({
        modelId: MODELS[npc.model],
        system: [{ text: system }],
        // The window's earlier turns first, so "then which one?" means what was just said.
        messages: [...recent.flatMap((t) => [{ role: "user" as const, content: [{ text: t.q }] }, { role: "assistant" as const, content: [{ text: t.a }] }]), { role: "user", content: [{ text: question }] }],
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

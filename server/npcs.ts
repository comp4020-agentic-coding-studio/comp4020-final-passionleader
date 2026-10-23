// The AI campus assistants (plan 56): five people standing about campus who
// answer questions about one part of ANU each, from its public pages. Where
// each stands and what it covers lives here; the client draws them from
// GET /api/npcs. Nothing anyone asks is stored, and each says so.
//
// The model isn't connected yet: the course proxy (the school's model) can't
// be reached from Fly, and a paid key is the user's call. Until then each
// assistant answers honestly that it isn't connected, and points to its
// pages. `answer` is the one place a model goes in later.

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
    x: -9,
    z: -7.3,
    rot: 0,
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
    x: -24.8,
    z: -30.4,
    rot: 0,
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
    x: -4,
    z: -6.2,
    rot: 0,
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
    x: -13.4,
    z: -5.3,
    rot: 0,
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
    x: -11.2,
    z: -5.3,
    rot: 0,
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

/** What the assistant says back. Not connected to a model yet: an honest answer and its pages. */
export function answer(npc: Npc, _question: string): string {
  return `I'm ${npc.name}, and I'm not connected to my AI brain yet, sorry! For now, the pages below have what you need. (Nothing you type here is kept.)`;
}

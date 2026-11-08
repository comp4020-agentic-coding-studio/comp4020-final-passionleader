import type { Look } from "./lookpicker.ts";
import type { SpaceId } from "./world.ts";

// Thin wrapper around the server's HTTP API (server/main.ts). Live movement,
// chat and emotes go over the socket instead (net.ts).

export interface Session {
  name: string;
  token: string;
  /** guest: no sign-up; student and staff: signed up with an ANU email; user: a test account; admin. */
  role: "guest" | "student" | "staff" | "user" | "admin";
  /** Where to stand on entering: the last space and spot, or the campus spawn. */
  spawn: { space: SpaceId; x: number; z: number };
  /** The look they saved last time, if any. */
  look: Look | null;
}

export interface Note {
  id: number;
  space: SpaceId;
  author: string;
  x: number;
  z: number;
  text: string;
  createdAt: string;
  /** When it disappears: a month after it was stuck (UTC). */
  expiresAt: string;
  comments: number;
  /** Hidden after reports, awaiting the admin: only you (its author) or the admin get it. */
  hidden?: boolean;
}

export interface Comment {
  id: number;
  noteId: number;
  author: string;
  text: string;
  createdAt: string;
  /** Who has hearted it; the server pins the most-hearted on top. */
  heartedBy?: string[];
  /** The most-hearted comment, pinned on top. */
  hot?: boolean;
  /** Hidden after reports, awaiting the admin: only its author and the admin get it. */
  hidden?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The rest of the server's answer (e.g. a taken name that has a password). */
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// Ordinary names: letters, digits, underscore, up to 8. qa_ names are the
// password accounts, which may run to 12.
const NAME_RE = /^[A-Za-z0-9_]{1,8}$/;
export const RESERVED_RE = /^qa_/i;
export const isValidName = (name: string): boolean => NAME_RE.test(name) || /^qa_[A-Za-z0-9_]{1,9}$/i.test(name);

// When the server refuses a guest something that needs signing up (it says
// `signup: true`), main shows one prompt for it, whichever panel asked.
let onSignupNeeded: (() => void) | null = null;
export const whenSignupNeeded = (f: () => void): void => {
  onSignupNeeded = f;
};

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server.");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body: fall through to the generic message below.
  }
  if (!res.ok) {
    // A deploy restarts the one server for a few seconds: say so rather than a bare code.
    const msg = (data as { error?: string } | null)?.error ?? (res.status === 502 || res.status === 503 || res.status === 504 ? "The campus server is restarting. Wait a moment and try again." : `Server error (${res.status}).`);
    if ((data as { signup?: boolean } | null)?.signup) onSignupNeeded?.();
    throw new ApiError(res.status, msg, (data as Record<string, unknown> | null) ?? {});
  }
  return data as T;
}

export const join = (name: string, token?: string, password?: string): Promise<Session> =>
  request<Session>("/api/join", "POST", { name, token, password });

/** Who's signing up or resetting: a student number, or staff's @anu.edu.au address. */
export type AnuWho = { studentNo: string } | { staff: true; email: string };
/** In as a guest: this browser's guest back, or a new guestNNN. */
export const joinAsGuest = (token?: string): Promise<Session> => request<Session>("/api/guest", "POST", { token });
/** Emails a six-digit sign-up code to the ANU address. */
export const signupStart = (who: AnuWho): Promise<{ sent: boolean; to: string }> => request("/api/signup/start", "POST", who);
/** Checks the emailed code before the name and password steps (a try, but the code stays). */
export const signupCheck = (who: AnuWho, code: string): Promise<{ ok: true }> => request("/api/signup/check", "POST", { ...who, code });
export const signupFinish = (who: AnuWho, code: string, name: string, password: string): Promise<Session> =>
  request<Session>("/api/signup/finish", "POST", { ...who, code, name, password });
/** Emails a code to reset a forgotten password (the same answer whether or not there's an account). */
export const resetStart = (who: AnuWho): Promise<{ sent: boolean; to: string }> => request("/api/password/start", "POST", who);
export const resetFinish = (who: AnuWho, code: string, password: string): Promise<Session> => request<Session>("/api/password/finish", "POST", { ...who, code, password });
/** An AI campus assistant (plan 56): where they stand and what they cover. */
export interface NpcDef {
  id: string;
  name: string;
  role: string;
  space: SpaceId;
  x: number;
  z: number;
  rot: number;
  /** How far in front of them you stand to talk (default 1.6 m; further over a desk). */
  reach?: number;
  look: Look;
  links: { label: string; url: string }[];
  greeting: string;
  /** Whose voice says hello (plan 79). */
  voice?: "male" | "female";
  /** Sits rather than stands (and doesn't wave). */
  seated?: boolean;
  /** A model of its own instead of a person (assets/npc/<model3d>.glb). */
  model3d?: string;
}
/** Meeting-room chats you saved (plan 37): yours only, 30 days. */
export const getSavedChats = (token: string): Promise<{ id: number; space: SpaceId; kind?: "chat" | "notes"; savedAt: string }[]> => request("/api/chats", "POST", { token });
export const getSavedChat = (token: string, id: number): Promise<{ id: number; space: SpaceId; kind?: "chat" | "notes"; savedAt: string; lines: { name: string; text: string; system?: boolean }[] }> =>
  request(`/api/chats/${id}`, "POST", { token });
export const deleteSavedChat = (token: string, id: number): Promise<unknown> => request(`/api/chats/${id}`, "DELETE", { token });
/** A ticket for the voice where you are now (plan 86). */
export const voiceTicket = (token: string): Promise<{ url: string; token: string; room: string }> => request("/api/voice", "POST", { token });
export const getNpcs = (): Promise<NpcDef[]> => request<NpcDef[]>("/api/npcs");
export const askNpc = (token: string, id: string, text: string, recent: { q: string; a: string }[] = []): Promise<{ reply: string }> =>
  request(`/api/npc/${id}/ask`, "POST", { token, text, recent });

/** A message to or from someone signed up (plan 16). */
export interface MailItem {
  id: number;
  sender: string;
  reader: string;
  subject: string;
  body: string;
  sentAt: string;
  readAt: string | null;
}
export const sendMailTo = (token: string, to: string, subject: string, text: string): Promise<MailItem> => request("/api/mail", "POST", { token, to, subject, text });
export const getMailbox = (token: string): Promise<{ inbox: MailItem[]; sent: MailItem[]; unread: number }> => request("/api/mail/box", "POST", { token });
export const readMail = (token: string, id: number): Promise<{ unread: number }> => request(`/api/mail/${id}/read`, "POST", { token });
export const deleteMail = (token: string, id: number): Promise<{ unread: number }> => request(`/api/mail/${id}`, "DELETE", { token });

/** Signed up (or a test account): may post, comment, heart, attach files and report. */
/** ANU staff and the admin: Notices, opening classrooms, what their boards open, private questions. */
export const isStaff = (s: { role: string } | null | undefined): boolean => !!s && (s.role === "staff" || s.role === "admin");
export const isMember = (s: { role: string } | null | undefined): boolean => !!s && s.role !== "guest";

/** Your interest tags and the fixed list to pick from (members only; the server checks the pick). */
export const getTags = (token: string): Promise<{ tags: string[]; courses: string[]; interests: string[]; max: number }> => request("/api/tags/mine", "POST", { token });
export const saveTags = (token: string, tags: string[]): Promise<unknown> => request("/api/tags", "PUT", { token, tags });

/** Who you follow for "tell me when they're on", and whether people you don't follow back may be told (members only; server-checked). */
export const getFollows = (token: string): Promise<{ follows: string[]; max: number; mutualOnly: boolean }> => request("/api/follows", "POST", { token });
export const setFollow = (token: string, name: string, on: boolean): Promise<unknown> => request("/api/follows", "PUT", { token, name, on });
export const setMutualOnly = (token: string, on: boolean): Promise<unknown> => request("/api/follows/mutual-only", "PUT", { token, on });

export const saveLook = (token: string, look: Look): Promise<unknown> => request("/api/look", "PUT", { token, look });

/** A space's notes; with a token, a note of yours that was hidden after reports (or any, for the admin) comes too, marked hidden. */
export const getNotes = (space: SpaceId, token?: string): Promise<Note[]> => request<Note[]>(`/api/notes?space=${space}${token ? `&token=${encodeURIComponent(token)}` : ""}`);

export const myNoteCount = (token: string, space: SpaceId): Promise<{ count: number; limit: number }> =>
  request("/api/notes/mine", "POST", { token, space });

export const postNote = (token: string, space: SpaceId, x: number, z: number, text: string): Promise<{ note: Note; replaced: number | null }> =>
  request("/api/notes", "POST", { token, space, x, z, text });

export const deleteNote = (token: string, id: number): Promise<unknown> => request(`/api/notes/${id}`, "DELETE", { token });

export const getComments = (noteId: number, token?: string): Promise<Comment[]> =>
  request<Comment[]>(`/api/notes/${noteId}/comments${token ? `?token=${encodeURIComponent(token)}` : ""}`);

export const postComment = (token: string, noteId: number, text: string): Promise<Comment> =>
  request<Comment>(`/api/notes/${noteId}/comments`, "POST", { token, text });

export const deleteComment = (token: string, id: number): Promise<unknown> => request(`/api/comments/${id}`, "DELETE", { token });
/** Hearts a note's comment, or takes the heart back. */
export const heartComment = (token: string, id: number): Promise<{ hearted: boolean; hearts: number }> =>
  request(`/api/comments/${id}/heart`, "POST", { token });

export interface Classroom {
  code: string;
  space: SpaceId;
  /** What the whiteboard opens, if the admin has set it (not COMP8020's: that's fixed). */
  boardUrl?: string | null;
  /** What the board right of the whiteboard opens, if set. */
  sideUrl?: string | null;
  /** Each link opens in a new tab instead of the in-app window. */
  boardNewTab?: boolean;
  sideNewTab?: boolean;
}

export const getClassrooms = (): Promise<Classroom[]> => request<Classroom[]>("/api/classrooms");

export const createClassroom = (token: string, code: string): Promise<Classroom> =>
  request<Classroom>("/api/classrooms", "POST", { token, code });

export const removeClassroom = (token: string, code: string): Promise<unknown> =>
  request(`/api/classrooms/${encodeURIComponent(code)}`, "DELETE", { token });

export const setClassroomLink = (token: string, code: string, which: "board" | "side", url: string | null, newTab: boolean): Promise<unknown> =>
  request(`/api/classrooms/${encodeURIComponent(code)}/link`, "PUT", { token, which, url, newTab });

export const getProjects = (): Promise<{ projects: { name: string; url: string }[]; checkedAt: string | null }> =>
  request("/api/projects");

/** `about.item` names the one note, post or comment a report is about: three members reporting it hide it for review. */
export const sendBugReport = (token: string, text: string, space: SpaceId | null, about?: { name: string; withChat: boolean; item?: ItemRef } | null): Promise<{ id: number }> =>
  request("/api/bugs", "POST", { token, text, space, about: about?.name, withChat: about?.withChat, item: about?.item });
export interface ItemRef {
  kind: "note" | "comment" | "post" | "post-comment";
  id: number;
}

export type BoardTab = string;
export interface BoardConfig {
  title: string;
  tabs: { id: BoardTab; label: string; staffOnly?: boolean }[];
  notice?: string;
  /** "grid": posts as thumbnails (first picture, else the title), two a row. */
  layout?: "grid";
  /** Posts go after this many days (the lawn's). */
  keepDays?: number;
  /** Writers may mark a post private (the Hub's enquiry board). */
  allowPrivate?: boolean;
  /** Posts are study groups with a size that people join (the ANUSA board). */
  groups?: boolean;
}
/** A board's title, tabs and who posts where (404 if there's none). Its key is its space, or "hub-desk". */
export const getBoardConfig = (key: string): Promise<BoardConfig> => request<BoardConfig>(`/api/board-config?space=${encodeURIComponent(key)}`);
/** A file attached to a post, a bug report or a room's chat. */
export interface FileInfo {
  id: string;
  name: string;
  size: number;
}
export interface Post {
  id: number;
  tab: BoardTab;
  author: string;
  title: string;
  text: string;
  createdAt: string;
  editedAt?: string | null;
  comments: number;
  /** The fixed note at the top of a staff-only tab like Notices (not a real post: id 0, no comments). */
  pinned?: boolean;
  files?: FileInfo[];
  /** Only its author and staff see it. */
  private?: boolean;
  /** Hidden after reports, awaiting the admin: only its author and the admin get it. */
  hidden?: boolean;
  /** A study group's size, and who has joined (its writer first). */
  capacity?: number | null;
  members?: string[];
}
export interface PostComment {
  id: number;
  postId: number;
  author: string;
  text: string;
  createdAt: string;
  editedAt?: string | null;
  heartedBy?: string[];
  /** Hidden after reports, awaiting the admin: only its author and the admin get it. */
  hidden?: boolean;
}

/** A board's posts; with a token, private ones of yours (or all of them, for the admin) too. */
export const getPosts = (key: string, tab: BoardTab, token?: string): Promise<Post[]> =>
  request<Post[]>(`/api/board?space=${encodeURIComponent(key)}&tab=${tab}${token ? `&token=${encodeURIComponent(token)}` : ""}`);
export const createPost = (token: string, key: string, tab: BoardTab, title: string, text: string, isPrivate = false, capacity?: number): Promise<Post> =>
  request<Post>("/api/board", "POST", { token, space: key, tab, title, text, private: isPrivate, capacity });
/** Joins a study group, or leaves it. */
export const joinGroup = (token: string, id: number): Promise<{ joined: boolean; members: string[] }> => request(`/api/board/${id}/join`, "POST", { token });
export const removePost = (token: string, id: number): Promise<unknown> => request(`/api/board/${id}`, "DELETE", { token });
export const editPost = (token: string, id: number, title: string, text: string, capacity?: number): Promise<Post> =>
  request<Post>(`/api/board/${id}`, "PATCH", { token, title, text, capacity });
export const getPostComments = (id: number, token?: string): Promise<PostComment[]> =>
  request<PostComment[]>(`/api/board/${id}/comments${token ? `?token=${encodeURIComponent(token)}` : ""}`);
export const createPostComment = (token: string, id: number, text: string): Promise<PostComment> =>
  request<PostComment>(`/api/board/${id}/comments`, "POST", { token, text });
export const editPostComment = (token: string, id: number, text: string): Promise<PostComment> =>
  request<PostComment>(`/api/board-comments/${id}`, "PATCH", { token, text });
export const removePostComment = (token: string, id: number): Promise<unknown> => request(`/api/board-comments/${id}`, "DELETE", { token });
/** Hearts a board comment, or takes the heart back. */
export const heartPostComment = (token: string, id: number): Promise<{ hearted: boolean; hearts: number }> =>
  request(`/api/board-comments/${id}/heart`, "POST", { token });

// --- files (see uploads.ts) ---------------------------------------------------

export type FileTarget = { kind: "bug"; bug: number } | { kind: "board"; post: number } | { kind: "room" };
export const askUpload = (token: string, target: FileTarget, name: string, size: number): Promise<{ id: string; url: string; type: string }> =>
  request("/api/files", "POST", { token, ...target, name, size });
export const uploadDone = (token: string, id: string): Promise<unknown> => request(`/api/files/${id}/done`, "POST", { token });
export const fileLink = (token: string, id: string, inline = false): Promise<{ url: string; name: string }> =>
  request(`/api/files/${id}/link`, "POST", { token, inline });

/** One line of the "Join now" panel: a post on `board` (a space's id, "hub-desk" or "study-groups"). */
export interface ActivityItem {
  board: string;
  tab: BoardTab;
  id: number;
  title: string;
  author: string;
  createdAt: string;
}
export interface Activity {
  /** Places left, people in, and the size, besides the post. */
  groups: (ActivityItem & { left: number; joined: number; capacity: number })[];
  /** Whether it's private (so only you or staff see it), besides the post. */
  questions: (ActivityItem & { private: boolean })[];
  ads: ActivityItem[];
}
/** What is open to join or answer now; with a token, your own private questions too. */
export const getActivity = (token?: string): Promise<Activity> => request<Activity>(`/api/activity${token ? `?token=${encodeURIComponent(token)}` : ""}`);

// --- events timetable (see events.ts) ---------------------------------------------

export interface EventView {
  id: number;
  author: string;
  space: SpaceId;
  spaceLabel: string;
  title: string;
  /** Epoch seconds. */
  start: number;
  end: number;
}
export interface EventList {
  /** The server's clock (epoch seconds), so a skewed computer clock doesn't move the banner. */
  now: number;
  events: EventView[];
  /** Where an event may be held. */
  spaces: { id: SpaceId; label: string }[];
}
export const getEvents = (): Promise<EventList> => request<EventList>("/api/events");
/** `start` is a Canberra date and time ("2026-11-12T14:30"), `minutes` 15 to 180. */
export const createEvent = (token: string, e: { title: string; space: SpaceId; start: string; minutes: number }): Promise<EventView> => request<EventView>("/api/events", "POST", { token, ...e });
export const removeEvent = (token: string, id: number): Promise<unknown> => request(`/api/events/${id}`, "DELETE", { token });

// --- visit stamps and what they unlock (server/db.ts, spaces.ts STAMPS) ----------------

export interface StampCard {
  member: boolean;
  /** Every stamp there is; the Poop Room's is a secret place until it is found. */
  stamps: { id: string; label: string; got: boolean }[];
  count: number;
  total: number;
  /** Hat styles and colours that wait for this many stamps (server/db.ts LOOK_UNLOCKS). */
  unlocks: { part: "hat" | "hatColour"; index: number; stamps: number }[];
}
/** Without a token (the join screen) it is an empty card, so the look window still knows what is locked. */
export const getStamps = (token?: string): Promise<StampCard> => request<StampCard>("/api/stamps", "POST", { token });

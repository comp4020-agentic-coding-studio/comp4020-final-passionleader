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
}

export interface Comment {
  id: number;
  noteId: number;
  author: string;
  text: string;
  createdAt: string;
  /** Who has hearted it; the server sends the most-hearted first. */
  heartedBy?: string[];
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
    const msg = (data as { error?: string } | null)?.error ?? `Server error (${res.status}).`;
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
  look: Look;
  links: { label: string; url: string }[];
  greeting: string;
}
export const getNpcs = (): Promise<NpcDef[]> => request<NpcDef[]>("/api/npcs");
export const askNpc = (token: string, id: string, text: string): Promise<{ reply: string }> => request(`/api/npc/${id}/ask`, "POST", { token, text });

/** Signed up (or a test account): may post, comment, heart, attach files and report. */
export const isMember = (s: { role: string } | null | undefined): boolean => !!s && s.role !== "guest";

export const saveLook = (token: string, look: Look): Promise<unknown> => request("/api/look", "PUT", { token, look });

export const getNotes = (space: SpaceId): Promise<Note[]> => request<Note[]>(`/api/notes?space=${space}`);

export const myNoteCount = (token: string, space: SpaceId): Promise<{ count: number; limit: number }> =>
  request("/api/notes/mine", "POST", { token, space });

export const postNote = (token: string, space: SpaceId, x: number, z: number, text: string): Promise<{ note: Note; replaced: number | null }> =>
  request("/api/notes", "POST", { token, space, x, z, text });

export const deleteNote = (token: string, id: number): Promise<unknown> => request(`/api/notes/${id}`, "DELETE", { token });

export const getComments = (noteId: number): Promise<Comment[]> => request<Comment[]>(`/api/notes/${noteId}/comments`);

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

export const sendBugReport = (token: string, text: string, space: SpaceId | null, about?: { name: string; withChat: boolean } | null): Promise<{ id: number }> =>
  request("/api/bugs", "POST", { token, text, space, about: about?.name, withChat: about?.withChat });

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

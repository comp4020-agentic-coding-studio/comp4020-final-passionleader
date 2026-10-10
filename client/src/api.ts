import type { SpaceId } from "./world.ts";

// Thin wrapper around the server's HTTP API (server/main.ts). Live movement,
// chat and emotes go over the socket instead (net.ts).

export interface Session {
  name: string;
  token: string;
  role: "user" | "admin";
  /** Where to stand on entering: the last space and spot, or the campus spawn. */
  spawn: { space: SpaceId; x: number; z: number };
}

export interface Note {
  id: number;
  space: SpaceId;
  author: string;
  x: number;
  z: number;
  text: string;
  createdAt: string;
  comments: number;
}

export interface Comment {
  id: number;
  noteId: number;
  author: string;
  text: string;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Ordinary names: letters, digits, underscore, up to 8. qa_ names are the
// password accounts, which may run to 12.
const NAME_RE = /^[A-Za-z0-9_]{1,8}$/;
export const RESERVED_RE = /^qa_/i;
export const isValidName = (name: string): boolean => NAME_RE.test(name) || /^qa_[A-Za-z0-9_]{1,9}$/i.test(name);

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
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const join = (name: string, token?: string, password?: string): Promise<Session> =>
  request<Session>("/api/join", "POST", { name, token, password });

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

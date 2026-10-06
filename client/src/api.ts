// Thin wrapper around the server API. Append ?mock to the page URL to run
// against an in-browser fake (localStorage) while the real server is down.

export interface Poop {
  name: string;
  x: number;
  z: number;
  updatedAt: string | number;
}

export interface Session {
  name: string;
  token: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const NAME_RE = /^[A-Za-z_]{1,8}$/;
export const isValidName = (name: string): boolean => NAME_RE.test(name);

const useMock = new URLSearchParams(location.search).has("mock");

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
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

// --- mock server -----------------------------------------------------------

interface MockDb {
  users: Record<string, { name: string; token: string }>; // keyed by lowercase name
  poops: Record<string, Poop>; // keyed by lowercase name
}

function mockDb(): MockDb {
  try {
    return JSON.parse(localStorage.getItem("poop.mockdb") ?? "") as MockDb;
  } catch {
    return { users: {}, poops: {} };
  }
}
const saveMock = (db: MockDb): void => localStorage.setItem("poop.mockdb", JSON.stringify(db));
const clamp = (v: number): number => Math.max(-10, Math.min(10, v));

async function mockJoin(name: string, token?: string): Promise<Session> {
  if (!isValidName(name)) throw new ApiError(400, "Letters and underscore only, 1-8 characters.");
  const db = mockDb();
  const key = name.toLowerCase();
  const existing = db.users[key];
  if (existing && existing.token !== token) throw new ApiError(409, "That name is taken.");
  const user = existing ?? { name, token: crypto.randomUUID() };
  db.users[key] = user;
  saveMock(db);
  return { name: user.name, token: user.token };
}

async function mockPoop(token: string, x: number, z: number): Promise<Poop> {
  const db = mockDb();
  const user = Object.values(db.users).find((u) => u.token === token);
  if (!user) throw new ApiError(401, "Unknown session.");
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new ApiError(400, "Bad coordinates.");
  const poop: Poop = { name: user.name, x: clamp(x), z: clamp(z), updatedAt: Date.now() };
  db.poops[user.name.toLowerCase()] = poop;
  saveMock(db);
  return poop;
}

// --- public API ------------------------------------------------------------

export const join = (name: string, token?: string): Promise<Session> =>
  useMock ? mockJoin(name, token) : request<Session>("/api/join", "POST", { name, token });

export const getPoops = (): Promise<Poop[]> =>
  useMock ? Promise.resolve(Object.values(mockDb().poops)) : request<Poop[]>("/api/poops", "GET");

export const postPoop = (token: string, x: number, z: number): Promise<Poop> =>
  useMock ? mockPoop(token, x, z) : request<Poop>("/api/poop", "POST", { token, x, z });

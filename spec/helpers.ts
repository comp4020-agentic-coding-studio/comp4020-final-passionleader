import { inject } from "vitest";

// Shared bits for the specs that talk to the running app over HTTP and WebSocket.

export const baseUrl = (): string => inject("baseUrl");

export const freshName = (): string =>
  Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");

export function api(path: string, method = "GET", body?: unknown): Promise<Response> {
  return fetch(new URL(path, baseUrl()), {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function visitor(): Promise<{ name: string; token: string }> {
  const name = freshName();
  const res = await api("/api/join", "POST", { name });
  return { name, ...(await res.json()) };
}

export type Msg = { t: string; [k: string]: unknown };

export interface Socket {
  ws: WebSocket;
  send(msg: unknown): void;
  /** Resolves with the first message (already seen or still to come) that matches. */
  next(pred: (m: Msg) => boolean, ms?: number): Promise<Msg>;
  /** Resolves true if a matching message arrives within ms, false otherwise. */
  sees(pred: (m: Msg) => boolean, ms: number): Promise<boolean>;
}

const open: WebSocket[] = [];
export const closeAll = (): void => void open.splice(0).forEach((ws) => ws.close());

export function wsUrl(token: string): string {
  const u = new URL("/ws", baseUrl());
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("token", token);
  return u.href;
}

export function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(token));
    open.push(ws);
    const seen: Msg[] = [];
    const waiters: { pred: (m: Msg) => boolean; done: (m: Msg) => void }[] = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Msg;
      seen.push(m);
      for (const w of [...waiters]) {
        if (w.pred(m)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.done(m);
        }
      }
    };
    const next = (pred: (m: Msg) => boolean, ms = 1000): Promise<Msg> =>
      new Promise((done, fail) => {
        const hit = seen.find(pred);
        if (hit) return done(hit);
        const timer = setTimeout(() => fail(new Error(`nothing matching within ${ms}ms`)), ms);
        waiters.push({ pred, done: (m) => (clearTimeout(timer), done(m)) });
      });
    ws.onerror = () => reject(new Error("socket failed to open"));
    ws.onopen = () =>
      resolve({
        ws,
        send: (msg) => ws.send(JSON.stringify(msg)),
        next,
        sees: (pred, ms) => next(pred, ms).then(() => true, () => false),
      });
  });
}

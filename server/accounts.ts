import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Ordinary visitors pick a name and their browser keeps a token. Names that
// start with "qa_" are reserved for the test and admin accounts, which sign in
// with a password instead, so they work from any browser. Only scrypt hashes
// are ever stored; the passwords live outside the repo.

// Letters, digits and underscores, at most eight: short enough to float over a
// head, narrow enough that a stranger can't write a sentence into the room.
export const NAME_RULE = /^[A-Za-z0-9_]{1,8}$/;
export const RESERVED = /^qa_/i;
// Reserved names may run a little longer (qa_master is nine).
export const RESERVED_RULE = /^qa_[A-Za-z0-9_]{1,9}$/i;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function checkPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

// Notes and comments: up to 100 words, and a character cap so one giant
// unbroken "word" can't get round the word limit.
export const MAX_WORDS = 100;
export const MAX_CHARS = 600;
export const MAX_CHAT = 200;

// Board posts run longer than notes: up to 500 words, with a title.
export const MAX_POST_WORDS = 500;
export const MAX_POST_CHARS = 3000;
export const MAX_TITLE = 80;

export function postError(title: unknown, text: unknown): string | null {
  if (typeof title !== "string" || title.trim() === "") return "Give it a title.";
  if (title.trim().length > MAX_TITLE) return `Keep the title under ${MAX_TITLE} characters.`;
  if (typeof text !== "string" || text.trim() === "") return "Write something first.";
  if (text.length > MAX_POST_CHARS) return `Keep it under ${MAX_POST_CHARS} characters.`;
  if (words(text) > MAX_POST_WORDS) return `Keep it to ${MAX_POST_WORDS} words.`;
  return null;
}

/** Notices are for lecturers and staff; until there's a staff role, that's the admin. */
export const mayPostIn = (v: { role: string }, tab: string): boolean => tab !== "notices" || v.role === "admin";

export function textError(text: unknown): string | null {
  if (typeof text !== "string" || text.trim() === "") return "Write something first.";
  if (text.length > MAX_CHARS) return `Keep it under ${MAX_CHARS} characters.`;
  if (words(text) > MAX_WORDS) return `Keep it to ${MAX_WORDS} words.`;
  return null;
}

/** Authors remove their own notes and comments; admins remove anyone's. */
export const mayRemove = (v: { name: string; role: string }, author: string): boolean =>
  v.role === "admin" || v.name.toLowerCase() === author.toLowerCase();

// Half-written text kept in localStorage, so closing the window or reloading
// doesn't lose a note, post or mail. One key per kind and context (campus.draft.
// <kind>.<where>); a draft only comes back where it was written. Every access
// is in try/catch: private mode and blocked storage throw, and then the
// composer simply works without a draft.

const PREFIX = "campus.draft.";

/** The saved fields under `key`, or null (nothing saved, bad data, or no storage). */
export function loadDraft(key: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    const fields: Record<string, string> = {};
    for (const [name, value] of Object.entries(data)) if (typeof value === "string") fields[name] = value;
    return fields;
  } catch {
    return null;
  }
}

/** Keeps `fields`; if they are all blank there is nothing to keep, so the draft goes. */
export function saveDraft(key: string, fields: Record<string, string>): void {
  if (Object.values(fields).every((v) => v.trim() === "")) return clearDraft(key);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(fields));
  } catch {
    // Private mode or a full store: the draft just isn't kept.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to clear without storage.
  }
}

/** Every draft in this browser (signing out on a shared computer). */
export function clearAllDrafts(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // Nothing to clear without storage.
  }
}

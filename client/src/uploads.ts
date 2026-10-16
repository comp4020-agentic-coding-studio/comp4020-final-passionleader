import { ApiError, askUpload, fileLink, uploadDone, type FileTarget } from "./api.ts";

// Uploading and fetching attached files. The server checks the file and hands
// back a five-minute link; the browser puts the file straight into S3 with it
// (so a 200 MB file never passes through our small server), then says it's
// done, and the server checks it all arrived. Opening one asks the server for
// a five-minute link to it, which it gives only to those allowed.
// The same rules as server/files.ts, checked there too.

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.docx,.pptx,.xlsx,.zip";
export const ACCEPT_IMAGES = ".png,.jpg,.jpeg,.gif,.webp";

/** The message for when S3 can't be reached at all from the browser. */
const S3_NET = "Uploads aren't available right now. Please tell the admin. Error code: S3-CORS";

/** "1.2 MB", "340 KB". */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Uploads one file to `target`. Resolves to an error message, or null once
 * the server has it. `progress` gets 0..1 as it goes.
 */
export async function upload(token: string, target: FileTarget, file: File, progress?: (done: number) => void): Promise<string | null> {
  if (file.size > MAX_FILE_BYTES) return "Files can be up to 200 MB.";
  if (file.size === 0) return "That file is empty.";
  let ticket: { id: string; url: string; type: string };
  try {
    ticket = await askUpload(token, target, file.name, file.size);
  } catch (err) {
    return err instanceof ApiError ? err.message : "Could not upload that.";
  }
  // XHR rather than fetch, for the progress bar on a big file.
  const status = await new Promise<number>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.url);
    xhr.setRequestHeader("Content-Type", ticket.type);
    xhr.upload.addEventListener("progress", (e) => e.lengthComputable && progress?.(e.loaded / e.total));
    xhr.addEventListener("load", () => resolve(xhr.status));
    xhr.addEventListener("error", () => resolve(0));
    xhr.addEventListener("abort", () => resolve(-1));
    xhr.send(file);
  });
  if (status === -1) return "Upload cancelled.";
  // Status 0: blocked before S3 answered (the bucket's CORS, or the network).
  if (status === 0) return S3_NET;
  if (status === 403) return "Uploads aren't available right now. Please tell the admin. Error code: S3-AUTH";
  if (status < 200 || status >= 300) return `Uploads aren't available right now. Please tell the admin. Error code: S3-${status}`;
  try {
    await uploadDone(token, ticket.id);
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.message : "Could not finish the upload.";
  }
}

/** Whether a file is a picture the board shows in place (the same list as the server's). */
export const isImage = (name: string): boolean => /\.(png|jpe?g|gif|webp)$/i.test(name);

// Links last five minutes; a picture's is reused for four, so redrawing a post doesn't ask again.
const shown = new Map<string, { url: string; until: number }>();

/** A link that shows an image in place, or null if it can't be had. */
export async function imageLink(token: string, id: string): Promise<string | null> {
  const hit = shown.get(id);
  if (hit && hit.until > Date.now()) return hit.url;
  try {
    const { url } = await fileLink(token, id, true);
    shown.set(id, { url, until: Date.now() + 4 * 60 * 1000 });
    return url;
  } catch {
    return null;
  }
}

/** Opens (downloads) a file, if the server lets this visitor have it. Resolves to an error message, or null. */
export async function openFile(token: string, id: string): Promise<string | null> {
  try {
    const { url } = await fileLink(token, id);
    // S3 sends it as an attachment, so following the link downloads it and
    // the game stays where it is (no new tab, which phones block after a wait).
    window.location.assign(url);
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.message : "Could not open that file.";
  }
}

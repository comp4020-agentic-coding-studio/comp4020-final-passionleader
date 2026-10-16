// Files people attach: a screenshot on a bug report, files on a classroom
// board post, and files shared in a meeting room's chat. They live in one
// private S3 bucket (bug-shots/, board-files/, room-files/), never on the Fly
// machine: the server checks who may upload what, then hands the browser a
// five-minute link to put that one file straight into S3, and later a
// five-minute link to fetch it, after checking who's asking. The bucket deletes
// everything 30 days after upload, and the server stops listing it then too.
//
// Configured by four Fly secrets: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
// AWS_REGION and S3_BUCKET. Without them (CI, a laptop) uploads say so, with
// an error code to tell the admin, and everything else works as before.

import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type FileKind = "bug" | "board" | "room";
export const PREFIX: Record<FileKind, string> = { bug: "bug-shots", board: "board-files", room: "room-files" };

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const FILE_DAYS = 30;
const LINK_SECONDS = 300;

// What may be uploaded, by extension; the type sent to S3 comes from here,
// never from the browser. No executables, no web pages or scripts. Images
// may be shown in place (the admin's bug reports); everything else downloads.
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};
const IMAGES = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

const extOf = (name: string): string => /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase() ?? "";

/** A file name fit to show and to download as: no paths or control characters, at most 120 characters. */
export function cleanName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  if (!base || base.length > 120) return null;
  return base;
}

/** Why this file can't be uploaded (as `kind`), or null with its content type. */
export function fileError(kind: FileKind, name: string, size: unknown): string | null {
  const ext = extOf(name);
  if (!TYPES[ext]) return "Only images (png, jpg, gif, webp), PDF, txt, md, docx, pptx, xlsx and zip files.";
  if (kind === "bug" && !IMAGES.has(ext)) return "A screenshot must be an image (png, jpg, gif or webp).";
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) return "That file is empty.";
  if (size > MAX_FILE_BYTES) return "Files can be up to 200 MB.";
  return null;
}

export const typeOf = (name: string): string => TYPES[extOf(name)] ?? "application/octet-stream";
export const isImage = (name: string): boolean => IMAGES.has(extOf(name));
export const keyFor = (kind: FileKind, id: string, name: string): string => `${PREFIX[kind]}/${id}.${extOf(name)}`;

// --- S3 ---------------------------------------------------------------------------

/** The error codes the person sees ("Error code: S3-…") and tells the admin. */
export type S3Code = "S3-CONFIG" | "S3-AUTH" | "S3-NET" | "S3-MISSING";
export const s3Message = (code: S3Code): string => `Uploads aren't available right now. Please tell the admin. Error code: ${code}`;

export class S3Failure extends Error {
  code: S3Code;
  constructor(code: S3Code) {
    super(s3Message(code));
    this.code = code;
  }
}

const bucket = process.env.S3_BUCKET ?? "";
const configured = !!(bucket && process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const s3 = configured ? new S3Client({ region: process.env.AWS_REGION }) : null;

export const s3Ready = (): boolean => s3 !== null;

function classify(err: unknown): S3Failure {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const name = e.Code ?? e.name ?? "";
  if (name === "AccessDenied") return new S3Failure("S3-MISSING");
  if (e.$metadata?.httpStatusCode) return new S3Failure("S3-AUTH");
  return new S3Failure("S3-NET");
}

/** A five-minute link to PUT exactly `size` bytes of `type` at `key`. */
export async function uploadLink(key: string, type: string, size: number): Promise<string> {
  if (!s3) throw new S3Failure("S3-CONFIG");
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: type, ContentLength: size }), {
    expiresIn: LINK_SECONDS,
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}

/** A five-minute link to fetch `key`, saved as `name` (or shown in place, for an image the admin opens). */
export async function downloadLink(key: string, name: string, inline = false): Promise<string> {
  if (!s3) throw new S3Failure("S3-CONFIG");
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition, ResponseContentType: typeOf(name) }), {
    expiresIn: LINK_SECONDS,
  });
}

/**
 * The size of what arrived at `key`. The server's key may only read, write
 * and delete objects, not list them, so S3 answers "access denied" for a
 * file that never arrived: that's S3-MISSING.
 */
export async function arrivedSize(key: string): Promise<number> {
  if (!s3) throw new S3Failure("S3-CONFIG");
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-0" }));
    await res.Body?.transformToByteArray();
    const total = /\/(\d+)$/.exec(res.ContentRange ?? "")?.[1];
    return total ? Number(total) : (res.ContentLength ?? 0);
  } catch (err) {
    throw classify(err);
  }
}

/** Deletes objects now rather than waiting for the bucket's 30 days (a removed post, an emptied room). Best effort. */
export function removeObjects(keys: string[]): void {
  if (!s3 || keys.length === 0) return;
  void s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } })).catch(() => {});
}

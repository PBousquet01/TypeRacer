// Profile photos (AUTH-04, SEC-02). The browser's word about a file means
// nothing: its name and its Content-Type are both just text it sends. So the
// server checks the size itself, reads the first bytes to see what the file
// really is, decodes it (a file that only looks like an image fails here),
// and stores its own resized copy, never the upload.
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { avatars } from "./schema";
import type { ErrorCode } from "../lib/types";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // AUTH-04: 2 MB
const SIZE = 256; // pixels, square
// A small file can still describe a gigantic image that would take all the
// memory to decode; anything over this many pixels is refused.
const MAX_PIXELS = 40_000_000;

type ImageKind = "jpeg" | "png" | "webp";

/** What the file's first bytes say it is (its "magic number"), or null. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // "RIFF" … "WEBP"
  return null;
}

/** The photo as it will be stored and shown, or why it was refused. */
export async function prepareAvatar(bytes: Buffer): Promise<{ image: Buffer } | { error: ErrorCode }> {
  if (bytes.length > MAX_AVATAR_BYTES) return { error: "image-too-big" };
  const kind = sniffImage(bytes);
  if (!kind) return { error: "image-type" };
  try {
    const meta = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
    if (meta.format !== kind) return { error: "image-type" };
    const image = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
      .rotate() // phones store photos sideways and say so in the EXIF data
      .resize(SIZE, SIZE, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    return { image };
  } catch {
    return { error: "image-unreadable" };
  }
}

export async function saveAvatar(userId: number, image: Buffer): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(avatars)
    .values({ userId, image, updatedAt })
    .onConflictDoUpdate({ target: avatars.userId, set: { image, updatedAt } });
}

export async function deleteAvatar(userId: number): Promise<void> {
  await db.delete(avatars).where(eq(avatars.userId, userId));
}

export async function loadAvatar(userId: number): Promise<Buffer | null> {
  const [row] = await db.select({ image: avatars.image }).from(avatars).where(eq(avatars.userId, userId));
  return row ? Buffer.from(row.image) : null;
}

/** The address of a user's photo, versioned so browsers can cache it for good; null without one. */
export async function avatarUrl(userId: number): Promise<string | null> {
  const [row] = await db.select({ at: avatars.updatedAt }).from(avatars).where(eq(avatars.userId, userId));
  return row ? `/api/avatars/${userId}?v=${row.at.getTime()}` : null;
}

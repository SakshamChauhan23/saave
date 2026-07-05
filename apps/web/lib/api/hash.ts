import { createHash } from "crypto";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashUrl(url: string): string {
  return sha256Hex(url.trim().toLowerCase());
}

export function hashText(content: string): string {
  return sha256Hex(content);
}
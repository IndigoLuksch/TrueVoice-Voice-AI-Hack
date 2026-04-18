import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Room ids are lowercase nanoid (a–z, 0–9). Normalizes URL segments and pasted input. */
export function normalizeRoomId(raw: string | string[] | undefined | null): string {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null) return "";
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

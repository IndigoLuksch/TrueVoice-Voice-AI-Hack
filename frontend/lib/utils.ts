import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Room codes are 4 digits (matches backend). Strips non-digits and caps length. */
export const ROOM_CODE_LEN = 4;

export function normalizeRoomId(raw: string | string[] | undefined | null): string {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null) return "";
  return String(s).replace(/\D/g, "").slice(0, ROOM_CODE_LEN);
}

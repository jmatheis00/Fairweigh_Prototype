/**
 * Favourite suppliers (expert interviews, 10 Nov 2026), kept per user since 16 Nov 2026: each demo user
 * starts with one or two of their own until they change them. Saved in this browser only, like the
 * decision log; storage can be unavailable, so every access is guarded.
 */
import type { DemoUser } from "./users";

const keyFor = (userId: string) => `scc-favourite-suppliers-v2:${userId}`;

export function loadFavourites(user: DemoUser): string[] {
  try {
    const raw = window.localStorage.getItem(keyFor(user.id));
    if (raw === null) return [...user.defaultFavourites];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [...user.defaultFavourites];
  } catch {
    return [...user.defaultFavourites];
  }
}

export function saveFavourites(user: DemoUser, ids: string[]): void {
  try {
    window.localStorage.setItem(keyFor(user.id), JSON.stringify(ids));
  } catch {
    // Storage blocked: favourites last until reload.
  }
}

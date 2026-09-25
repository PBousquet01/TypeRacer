import { useMemo, useSyncExternalStore } from "react";
import type { Profile } from "./types";

// sessionStorage (not localStorage) so two tabs can be two different players.
const KEY = "chocobo-profile";
const CLIENT_KEY = "chocobo-client-id";

/** Identifies this tab across reloads, so a host who refreshes gets their seat back. */
export function clientId(): string | null {
  try {
    let id = sessionStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return null; // storage blocked: no reclaim, just a normal join
  }
}

// Some browsers (private windows, "block site data") throw on storage.
// Keeping a copy in memory means the game still works in that tab.
let memoryProfile: string | null = null;

function readRaw() {
  try {
    return sessionStorage.getItem(KEY) ?? memoryProfile;
  } catch {
    return memoryProfile;
  }
}

export function saveProfile(profile: Profile): void {
  memoryProfile = JSON.stringify(profile);
  try {
    sessionStorage.setItem(KEY, memoryProfile);
  } catch {
    // Storage blocked: the in-memory copy above carries this tab through.
  }
}

const noSubscribe = () => () => {};

/**
 * The saved profile, read safely during rendering.
 *   undefined → still rendering on the server (we can't know yet)
 *   null      → this tab has no profile
 *   object    → { name, color, role }
 */
export function useSavedProfile(): Profile | null | undefined {
  const raw = useSyncExternalStore(noSubscribe, readRaw, () => undefined);
  return useMemo(() => {
    if (raw === undefined || raw === null) return raw;
    try {
      return JSON.parse(raw) as Profile;
    } catch {
      return null;
    }
  }, [raw]);
}

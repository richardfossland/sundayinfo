"use client";

// Offline survival: the last good snapshot + device token live in
// localStorage. No service worker (TV browsers are unreliable there) — the
// app shell itself needs the network once per boot, but a booted screen keeps
// rotating from this cache through any outage.

import type { ZoneSnapshot } from "@/lib/types";

const TOKEN_KEY = "sundayinfo:deviceToken";
const SNAPSHOT_KEY = "sundayinfo:snapshot";

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // private mode / quota — pairing will just repeat next boot
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}

export function loadSnapshot(): ZoneSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as ZoneSnapshot) : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: ZoneSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore — display still works from memory
  }
}

// Flash message system — set a message in a cookie, read it on next page load.
// Used for success/error feedback after POST redirects (PRG pattern).
//
// Usage in routes:
//   import { setFlash } from "../lib/flash";
//   setFlash(c, "success", "Cliente criado com sucesso!");
//   return c.redirect("/clients");
//
// The base layout reads the flash cookie and renders a toast automatically.

import type { Context } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { APP_URL } from "./env";

export type FlashType = "success" | "error" | "warning" | "info";

const FLASH_COOKIE = "flash-msg";

// Set a flash message cookie. Will be consumed on the next page load.
export function setFlash(c: Context, type: FlashType, message: string) {
  const payload = JSON.stringify({ type, message });
  setCookie(c, FLASH_COOKIE, payload, {
    path: "/",
    httpOnly: true,
    secure: APP_URL.startsWith("https"),
    sameSite: "Strict",
    maxAge: 10, // 10 seconds — just enough for one redirect
  });
}

// Read and clear the flash message. Call this in the layout renderer.
export function getFlash(c: Context): { type: FlashType; message: string } | null {
  const raw = getCookie(c, FLASH_COOKIE);
  if (!raw) return null;
  // Clear the cookie so it doesn't show again on refresh.
  deleteCookie(c, FLASH_COOKIE, { path: "/" });
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

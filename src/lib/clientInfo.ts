/**
 * Client identity capture for the security audit log.
 *
 * Two pieces of context are stamped onto every log entry:
 *   • device — a human-readable descriptor derived from the User-Agent
 *     (browser + OS). NOTE: browsers deliberately do NOT expose the machine's
 *     hostname/computer name, so this is the closest privacy-safe identifier.
 *   • ip     — the client's PUBLIC IP. A browser can't read its own public IP,
 *     so we fetch it once from a public echo service and cache it. Best-effort:
 *     falls back to "unknown" if the request is blocked/offline.
 */

/** Parse a readable "Browser on OS" label from a User-Agent string. */
export function detectDevice(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  if (!ua) return "Unknown device";

  // Operating system
  let os = "Unknown OS";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows NT 6\.3/.test(ua)) os = "Windows 8.1";
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X 10[._]15/.test(ua)) os = "macOS Catalina+";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/(iPhone|iPad|iPod)/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  // Browser (order matters — Edge/Chrome both contain "Chrome")
  let browser = "Unknown browser";
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Edg\/(\d+)/))) browser = `Edge ${m[1]}`;
  else if ((m = ua.match(/OPR\/(\d+)/))) browser = `Opera ${m[1]}`;
  else if (/Chrome/.test(ua) && !/Chromium/.test(ua) && (m = ua.match(/Chrome\/(\d+)/))) browser = `Chrome ${m[1]}`;
  else if ((m = ua.match(/Firefox\/(\d+)/))) browser = `Firefox ${m[1]}`;
  else if (/Safari/.test(ua) && (m = ua.match(/Version\/(\d+)/))) browser = `Safari ${m[1]}`;

  return `${browser} · ${os}`;
}

// --- Active actor (who is signed in) ---------------------------------------
// The store's addLog() lives ABOVE AuthProvider in the tree, so it can't read
// auth context directly. AuthProvider pushes the signed-in identity here and
// addLog reads it synchronously when stamping an entry.

let activeActor = "System";
let activeActorEmail = "";

/** Record who is currently signed in. Pass null when signed out. */
export function setActiveActor(name: string | null, email?: string | null) {
  activeActor = name && name.trim() ? name.trim() : "System";
  activeActorEmail = email && email.trim() ? email.trim() : "";
}

/** The current actor name for audit logs ("System" when nobody is signed in). */
export function getActiveActor(): string {
  return activeActor;
}

/** The current actor's email ("" when unknown/signed out). */
export function getActiveActorEmail(): string {
  return activeActorEmail;
}

// --- Public IP (best-effort, cached for the session) -----------------------

let cachedIp = "unknown";
let ipPromise: Promise<string> | null = null;

/** Synchronously read the last-resolved public IP ("unknown" until resolved). */
export function getCachedIp(): string {
  return cachedIp;
}

/**
 * Resolve the client's public IP once and cache it. Subsequent calls return the
 * same in-flight/settled promise. Never throws — resolves to "unknown" on any
 * failure (offline, blocked, timeout).
 */
export function resolvePublicIp(): Promise<string> {
  if (ipPromise) return ipPromise;
  ipPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      // ipify echoes the caller's own public IP back as JSON.
      const res = await fetch("https://api.ipify.org?format=json", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const json = (await res.json()) as { ip?: string };
        if (json.ip) cachedIp = json.ip;
      }
    } catch {
      // stay "unknown" — never break logging over a failed IP lookup
    }
    return cachedIp;
  })();
  return ipPromise;
}

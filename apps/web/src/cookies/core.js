// Source for Web imports and generated Keycloak browser assets. No server/auth dependencies.
export const PREFERENCE_COOKIE_NAMES = Object.freeze({
  language: "formiq_locale", theme: "formiq_theme", contrast: "formiq_contrast",
});
const legacyNames = {
  [PREFERENCE_COOKIE_NAMES.language]: "NEXT_LOCALE",
  [PREFERENCE_COOKIE_NAMES.theme]: "modulon_theme",
  [PREFERENCE_COOKIE_NAMES.contrast]: "modulon_contrast",
};

/** @param {string} name @returns {string | undefined} */
export function legacyPreferenceCookieName(name) { return Object.hasOwn(legacyNames, name) ? legacyNames[name] : undefined; }

/** @param {string} name @param {(name: string) => string | undefined} [read] */
export function readPreferenceCookie(name, read = readBrowserCookie) {
  const value = read(name);
  const legacy = legacyPreferenceCookieName(name);
  return value ?? (legacy ? read(legacy) : undefined);
}

/** Remove a legacy name only after its replacement is readable. @param {string} name @param {string} value @param {boolean} secure @param {string} [scope] */
function removeLegacyPreference(name, value, secure, scope) {
  const legacy = legacyPreferenceCookieName(name);
  if (!legacy || readBrowserCookie(legacy) === undefined || readBrowserCookie(name) !== value) return;
  removePreferenceCookie(legacy, secure);
  if (scope) removePreferenceCookie(legacy, secure, scope);
}

/** Shared by public configuration and browser writers. Auth cookies use a separate policy. */
/** @param {string} value */
export function isPreferenceCookieName(value) {
  return /^[A-Za-z0-9_-]{1,100}$/.test(value) && !/^__(?:Secure|Host|Http)-/.test(value);
}

/** DNS syntax only; the browser must confirm domain scope against its public suffix list. */
/** @param {string} value */
export function isPreferenceCookieDomain(value) {
  return value.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value);
}

export const PREFERENCE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Non-sensitive preferences only. Authentication cookies must be issued by the auth server.
 * @param {string} name @param {string} value @param {boolean} [secure] @param {string} [domain] */
export function preferenceCookie(name, value, secure = true, domain) {
  return serializePreferenceCookie(name, value, PREFERENCE_COOKIE_MAX_AGE, secure, domain);
}

/** @param {string} name @param {string} value @param {number} maxAge @param {boolean} secure @param {string} [domain] */
function serializePreferenceCookie(name, value, maxAge, secure, domain) {
  if (!isPreferenceCookieName(name)) throw new Error("Invalid preference cookie name");
  if (domain && !isPreferenceCookieDomain(domain)) throw new Error("Invalid preference cookie domain");
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}${domain ? `; Domain=${domain}` : ""}`;
}

/** Delete the same name, path and domain used by the preference writer.
 * @param {string} name @param {boolean} [secure] @param {string} [domain] */
export function removePreferenceCookie(name, secure = true, domain) {
  document.cookie = serializePreferenceCookie(name, "", 0, secure, domain);
}

/** Confirm browser acceptance before removing a host-only preference during migration.
 * @param {string} name @param {string} value @param {string} [domain] */
export function persistPreferenceCookie(name, value, domain = "") {
  const secure = window.location.protocol === "https:";
  const hostCookie = preferenceCookie(name, value, secure);
  const scope = preferenceDomain(domain, window.location.hostname);
  if (!scope) {
    document.cookie = hostCookie;
    removeLegacyPreference(name, value, secure);
    return;
  }

  // Independent name: a same-value host cookie cannot produce a false positive.
  const probe = `preference_scope_${crypto.getRandomValues(new Uint32Array(2)).join("")}`;
  let accepted = false;
  try {
    document.cookie = serializePreferenceCookie(probe, "1", 60, secure, scope);
    accepted = readBrowserCookie(probe) === "1";
  } finally {
    removePreferenceCookie(probe, secure, scope);
  }
  if (!accepted) {
    document.cookie = hostCookie;
    removeLegacyPreference(name, value, secure);
    return;
  }
  removePreferenceCookie(name, secure);
  document.cookie = preferenceCookie(name, value, secure, scope);
  // Preserve a usable host preference if the final write is rejected too.
  if (readBrowserCookie(name) !== value) document.cookie = hostCookie;
  removeLegacyPreference(name, value, secure, scope);
}

/** @param {string} name @returns {string | undefined} */
export function readBrowserCookie(name) {
  if (typeof document === "undefined") return undefined;
  const value = document.cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  if (value === undefined) return undefined;
  try { return decodeURIComponent(value); } catch { return undefined; }
}

/** @param {string} domain @param {string} hostname @returns {string | undefined} */
export function preferenceDomain(domain, hostname) {
  if (!isPreferenceCookieDomain(domain)) return undefined;
  domain = domain.toLowerCase();
  hostname = hostname.toLowerCase();
  return hostname === domain || hostname.endsWith(`.${domain}`) ? domain : undefined;
}


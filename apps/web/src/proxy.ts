import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { getPublicConfig } from "@/config/server";
import { PREFERENCE_COOKIE_MAX_AGE, readCookieConsent } from "@/cookies/core.js";
import { routing } from "@/i18n/routing";

const withPreferences = createMiddleware({
  ...routing,
  localeCookie: {
    name: getPublicConfig().LANGUAGE_COOKIE_NAME,
    maxAge: PREFERENCE_COOKIE_MAX_AGE,
    sameSite: "lax",
  },
});

const withoutPreferences = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const allowed = readCookieConsent(name => request.cookies.get(name)?.value) === "preferences";
  return (allowed ? withPreferences : withoutPreferences)(request);
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|_vercel(?:/|$)|.*\\..*).*)", "/(pl|en)/:path*"],
};

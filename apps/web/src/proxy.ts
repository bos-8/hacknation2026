import createMiddleware from "next-intl/middleware";
import { getPublicConfig } from "@/config/server";
import { PREFERENCE_COOKIE_MAX_AGE } from "@/cookies/preferences";
import { routing } from "@/i18n/routing";

export default createMiddleware({
  ...routing,
  localeCookie: {
    name: getPublicConfig().LANGUAGE_COOKIE_NAME,
    maxAge: PREFERENCE_COOKIE_MAX_AGE,
    sameSite: "lax",
  },
});

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|_vercel(?:/|$)|.*\\..*).*)", "/(pl|en)/:path*"],
};

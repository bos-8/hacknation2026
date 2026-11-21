import { getTranslations } from "next-intl/server";
import { getSession } from "@/server/auth/session";
import type { AppLocale } from "@/schemas/i18n";
import { AuthControl } from "./auth-control";
import { UserPanelV2 } from "./user-panel-v2";
import { getAuthConfig } from "@/server/auth/config";
import { getIdentityDirectory, type IdentityProfile } from "@/server/auth/directory";
import type { AppRole, SessionStatus } from "@/schemas/session";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getAuth } from "@/server/auth/auth";
import { ExpiredSessionLogout } from "./expired-session-logout";
import { NotificationCenter } from "./notification-center";
import { DocumentActivity } from "@/app/[locale]/admin/files/ocr/activity";
import { ADMIN_ACCESS, roleLevel } from "@/schemas/access";

/** A server-rendered form: credentials and session tokens never enter a client auth store. */
export async function AuthButton({ locale }: { locale: AppLocale }) {
  // Keep prerender interruption outside application error recovery. Catching it
  // leaves a broken Suspense boundary and prevents client hydration.
  await connection();
  const t = await getTranslations({ locale, namespace: "common.auth" });
  let session: Awaited<ReturnType<typeof getSession>> = null;
  let profile: IdentityProfile | null = null;
  let sessionReadFailed = false;
  // A transient session read failure must not permanently block the next sign-in attempt.
  try {
    session = await getSession();
    if (session) profile = await getIdentityDirectory().byUuid(session.user.keycloakUuid);
  } catch { sessionReadFailed = true; /* A transient error must not force provider logout. */ }
  if (session && profile) {
    const config = getAuthConfig();
    const account = new URL(`${config.AUTH_ISSUER}/account/`);
    account.searchParams.set("kc_locale", locale);
    let roles: AppRole[] | null = null;
    try { roles = await getIdentityDirectory().rolesByUuid?.(profile.keycloakUuid) ?? []; } catch { /* Display unavailable without assuming a role. */ }
    return <><NotificationCenter key={`notifications-${session.user.id}`} ownerUuid={session.user.id} />
      {roleLevel(roles ?? []) >= ADMIN_ACCESS.minRoleLevel && <DocumentActivity ownerUuid={session.user.id} />}
      <UserPanelV2 key={session.session.id} locale={locale} displayName={profile.name} firstName={profile.firstName} lastName={profile.lastName}
      lifecycle={{ sessionUuid: session.session.id, userUuid: session.user.id,
        expiresAt: new Date(session.session.expiresAt).toISOString(), serverTime: new Date().toISOString(),
        warningSeconds: config.SESSION_WARNING, ttlSeconds: config.SESSION_TTL, autoRefresh: config.SESSION_AUTO_REFRESH,
        refreshes: session.session.renewalCount, maxRefreshes: config.SESSION_MAX_REFRESHES, roles }}
      email={profile.email} image={profile.image} expiresAt={new Date(session.session.expiresAt).toISOString()} accountUrl={account.href} /></>;
  }
  let pendingLogout: SessionStatus | null = null;
  if (!session && !sessionReadFailed) {
    try {
      const saved = await getAuth().api.logoutStatus({ headers: await headers() });
      if (saved) {
        const config = getAuthConfig();
        pendingLogout = { ...saved, serverTime: new Date().toISOString(),
          warningSeconds: config.SESSION_WARNING, ttlSeconds: config.SESSION_TTL, autoRefresh: false,
          refreshes: 0, maxRefreshes: config.SESSION_MAX_REFRESHES, roles: [] };
      }
    } catch { /* Missing/unavailable logout context never authenticates a user. */ }
  }
  if (pendingLogout) return <ExpiredSessionLogout key={pendingLogout.sessionUuid} initial={pendingLogout} />;
  return <AuthControl locale={locale}
    labels={{ signIn: t("signIn"), signOut: t("signOut"), pending: t("pending"),
      unavailable: t("unavailable"), error: t("error"), close: t("close") }} />;
}

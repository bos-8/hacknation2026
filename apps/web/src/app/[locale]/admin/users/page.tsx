// Access is resolved at request time; the shared authenticated shell can block navigation.
export const instant = false;

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/schemas/i18n";
import { parseAdminUsersQuery, type AdminUsersQuery } from "@/schemas/admin-users";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { withAdminSession } from "@/server/auth/admin-action";
import { getIdentityDirectory } from "@/server/auth/directory";
import { Heading, Throbber } from "@/ui/basic";
import { UsersResults } from "./users-results";

async function loadUsers(query: AdminUsersQuery) {
  try { return await getIdentityDirectory().listUsers(query); }
  catch { return null; }
}

async function UsersContent({ params, searchParams }: PageProps<"/[locale]/admin/users">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireAdminAccess();
  const query = parseAdminUsersQuery(await searchParams);
  const t = await getTranslations({ locale, namespace: "common.admin.users" });

  async function refreshUsers(nextQuery: AdminUsersQuery = query) {
    "use server";
    return withAdminSession(async () => {
      const page = await loadUsers(nextQuery);
      return page ? { status: "ok" as const, page } : { status: "failed" as const };
    });
  }

  return <article aria-labelledby="users-title" className="min-w-0 space-y-1">
    <header className="pb-4">
      <Heading level={2} id="users-title" className="text-xl">{t("title")}</Heading>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
    </header>
    <UsersResults locale={locale} query={query} initial={null} refreshAction={refreshUsers} />
  </article>;
}

export default function UsersPage(props: PageProps<"/[locale]/admin/users">) {
  return <Suspense fallback={<div role="status" className="flex justify-center p-8"><Throbber /></div>}><UsersContent {...props} /></Suspense>;
}

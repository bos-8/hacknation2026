"use client";

import { useTranslations } from "next-intl";
import { ArrowClockwise, ChevronDown, ChevronExpand, ChevronUp } from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { ADMIN_USERS_MAX_PAGE, parseAdminUsersQuery, adminUsersSortColumnSchema, type AdminUser, type AdminUsersPage, type AdminUsersQuery, type AdminUsersSortColumn } from "@/schemas/admin-users";
import type { AppLocale } from "@/schemas/i18n";
import { Button, Table, TableHead, TableHeader, TableRow, Throbber } from "@/ui/basic";
import { UsersFilters } from "./users-filters";
import { UsersSearch } from "./users-page-controls";
import { UsersPaginator } from "./users-paginator";
import { usersHref, usersPath } from "./users-query";
import { UsersTableBody } from "./users-table-body";
import { useTableRefresh, type TableRefreshResult } from "@/ui/components/use-table-refresh";
import { TableQuery, useTableQuery } from "@/ui/components/table-query";
import { TableLoadingBody, TableMessageBody } from "@/ui/components/table-loading-body";
import { TableDataRegion } from "@/ui/components/table-data-region";

const sortValues: Record<AdminUsersSortColumn, (user: AdminUser) => string> = {
  username: user => user.username,
  name: user => [user.firstName, user.lastName].filter(Boolean).join(" "),
  email: user => user.email ?? "",
  enabled: user => user.enabled ? "1" : "0",
  emailVerified: user => user.email && user.emailVerified ? "1" : "0",
};

function sortUsers(users: AdminUser[], query: AdminUsersQuery, locale: string) {
  if (!query.sort) return users;
  const value = sortValues[query.sort];
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const direction = query.direction === "desc" ? -1 : 1;
  return users.toSorted((a, b) => {
    const left = value(a), right = value(b);
    if (!left || !right) return Number(!left) - Number(!right);
    return direction * collator.compare(left, right);
  });
}

export function UsersResults({ locale, query: initialQuery, initial, refreshAction }: {
  locale: AppLocale;
  query: AdminUsersQuery;
  initial: AdminUsersPage | null;
  refreshAction: (query: AdminUsersQuery) => Promise<TableRefreshResult<AdminUsersPage>>;
}) {
  const t = useTranslations("common.admin.users");
  const query = useTableQuery(initialQuery, parseAdminUsersQuery);
  const { result, refresh, pending, status } = useTableRefresh(initial, query, refreshAction);
  const lastPage = Math.min(ADMIN_USERS_MAX_PAGE, Math.max(1, Math.ceil((result?.total ?? 0) / query.limit)));
  const action = `/${locale}${usersPath}`;

  return <TableQuery locale={locale} pathname="/admin/users" pending={pending}>
    <UsersFilters action={action} query={query} search={<UsersSearch action={action} query={query} />} refreshButton={
      <Button size="icon" className="size-7 p-0" aria-label={t("refresh")} tooltip={t("refresh")} tooltipPlacement="bottom"
        disabled={pending} onClick={refresh}>
        {pending ? <Throbber size="sm" /> : <ArrowClockwise aria-hidden="true" className="size-3.5" />}
      </Button>
    } />
    {status === "failed" && result && <p role="status" className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">{t("refreshFailed")}</p>}
      <TableDataRegion label={t("title")}>
        <Table className="[&_th]:py-1 [&_td:not([colspan])]:py-1">
          <caption className="sr-only">{t("title")}</caption>
          <TableHead><TableRow>
            <TableHeader scope="col" className="w-1"><span className="sr-only">{t("selection")}</span></TableHeader>
            {adminUsersSortColumnSchema.options.map(column => {
              const label = t(column === "enabled" ? "status" : column);
              const active = query.sort === column;
              const descending = active && query.direction === "desc";
              const Icon = !active ? ChevronExpand : descending ? ChevronDown : ChevronUp;
              const direction = active && !descending ? "desc" : "asc";
              const sortLabel = t(direction === "asc" ? "sortAscending" : "sortDescending", { column: label });
              return <TableHeader key={column} scope="col" className="relative" aria-sort={active ? descending ? "descending" : "ascending" : undefined}>
                <Link href={usersHref({ ...query, sort: column, direction })} locale={locale} prefetch={false}
                  aria-label={sortLabel} title={sortLabel}
                  className="inline-flex items-center gap-1 whitespace-nowrap hover:text-primary focus-visible:outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
                  {label}<Icon aria-hidden="true" className={active ? "size-3.5 shrink-0 text-primary" : "size-3.5 shrink-0 text-muted-foreground"} />
                </Link>
              </TableHeader>;
            })}
            <TableHeader actionColumn scope="col" className="w-1">{t("rowActions")}</TableHeader>
          </TableRow></TableHead>
          {!result && pending ? <TableLoadingBody colSpan={7} label={t("loadingData")} /> : !result
            ? <TableMessageBody colSpan={7} error message={t(status === "denied" ? "refreshDenied" : "error")} />
            : <UsersTableBody key={JSON.stringify([query.page, query.limit, query.search, query.enabled, query.emailVerified])} users={sortUsers(result.users, query, locale)} loading={pending}
              emptyMessage={t(query.page > lastPage ? "outOfRange" : query.search ? "noResults" : "empty")} />}
        </Table>
      </TableDataRegion>
      <UsersPaginator locale={locale} query={query} total={result?.total ?? null} rowCount={result?.users.length ?? 0} />
  </TableQuery>;
}

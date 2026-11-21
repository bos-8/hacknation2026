import { ADMIN_USERS_PAGE_SIZES, ADMIN_USERS_MAX_PAGE, adminUsersUrlParams, type AdminUsersQuery } from "@/schemas/admin-users";
import type { AppLocale } from "@/schemas/i18n";
import { TablePaginator } from "@/ui/components/table-paginator";

export function UsersPaginator({ locale, query, total, rowCount }: {
  locale: AppLocale; query: AdminUsersQuery; total: number | null; rowCount: number;
}) {
  return <TablePaginator locale={locale} namespace="common.admin.users" pathname="/admin/users"
    params={adminUsersUrlParams(query)} page={query.page} limit={query.limit} total={total ?? 0} unavailable={total === null} rowCount={rowCount}
    sizes={ADMIN_USERS_PAGE_SIZES} maxPage={ADMIN_USERS_MAX_PAGE} />;
}

"use client";

import { ADMIN_USERS_PAGE_SIZES, adminUsersUrlParams, type AdminUsersQuery } from "@/schemas/admin-users";
import { TableSearch } from "@/ui/components/table-search";
import { TablePageSize } from "@/ui/components/table-page-size";

export function UsersSearch({ action, query }: { action: string; query: AdminUsersQuery }) {
  const preserved = adminUsersUrlParams(query);
  delete preserved.page;
  delete preserved.search;
  return <TableSearch action={action} value={query.search} inputId="users-search" namespace="common.admin.users" preserved={preserved} />;
}

export function UsersPageSize({ limit, label }: { limit: number; label: string }) {
  return <TablePageSize limit={limit} label={label} sizes={ADMIN_USERS_PAGE_SIZES} />;
}

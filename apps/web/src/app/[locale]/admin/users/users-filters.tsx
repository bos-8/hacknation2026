"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { adminUsersUrlParams, type AdminUsersQuery } from "@/schemas/admin-users";
import { TableFilters } from "@/ui/components/table-filters";

export function UsersFilters({ action, query, search, refreshButton }: {
  action: string;
  query: AdminUsersQuery;
  search: ReactNode;
  refreshButton: ReactNode;
}) {
  const t = useTranslations("common.admin.users");
  const preserved = adminUsersUrlParams(query);
  delete preserved.page;
  delete preserved.enabled;
  delete preserved.emailVerified;
  const values: Record<string, string> = {};
  if (query.enabled !== undefined) values.enabled = String(query.enabled);
  if (query.emailVerified !== undefined) values.emailVerified = String(query.emailVerified);
  return <TableFilters action={action} namespace="common.admin.users" values={values} preserved={preserved} search={search} refreshButton={refreshButton}
    definitions={[
      { key: "enabled", label: t("status"), options: [{ value: "true", label: t("enabled") }, { value: "false", label: t("disabled") }] },
      { key: "emailVerified", label: t("emailVerified"), options: [{ value: "true", label: t("yes") }, { value: "false", label: t("no") }] },
    ]} />;
}

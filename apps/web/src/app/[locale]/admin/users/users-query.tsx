import { adminUsersUrlParams, type AdminUsersQuery } from "@/schemas/admin-users";

export const usersPath = "/admin/users";

export function usersHref(query: AdminUsersQuery) {
  return { pathname: usersPath, query: adminUsersUrlParams(query) };
}

export function UsersQueryFields({ query, omit = [] }: { query: AdminUsersQuery; omit?: (keyof AdminUsersQuery)[] }) {
  return Object.entries(adminUsersUrlParams(query)).map(([name, value]) =>
    omit.some(key => key === name) ? null : <input key={name} type="hidden" name={name} value={value} />);
}

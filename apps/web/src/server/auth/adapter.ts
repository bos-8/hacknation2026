import "server-only";
import { createAdapterFactory, type CustomAdapter, type CleanedWhere, type DBAdapter } from "better-auth/adapters";
import type { BetterAuthOptions } from "better-auth";
import type { PrismaClient, Prisma } from "@formiq/database";
import type { IdentityDirectory } from "./directory.ts";

type Row = Record<string, unknown>;
type Store = PrismaClient | Prisma.TransactionClient;
interface Delegate {
  create(args: { data: Row }): Promise<Row>;
  findFirst(args: Row): Promise<Row | null>;
  findMany(args: Row): Promise<Row[]>;
  update(args: Row): Promise<Row>;
  updateMany(args: Row): Promise<{ count: number }>;
  deleteMany(args: Row): Promise<{ count: number }>;
  count(args: Row): Promise<number>;
}
const fields: Record<string, readonly string[]> = {
  user: ["uuid", "keycloakUuid", "createdAt", "updatedAt"],
  session: ["uuid", "userUuid", "token", "expiresAt", "createdAt", "updatedAt", "ipAddress", "userAgent", "renewalCount"],
  account: ["uuid", "userUuid", "provider", "subject", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "createdAt", "updatedAt"],
  verification: ["uuid", "identifier", "value", "expiresAt", "createdAt", "updatedAt"],
};
const profileFields = new Set(["name", "email", "emailVerified", "image"]);

/** Better Auth uses logical id/userId; only uuid/userUuid are written to PostgreSQL. */
export function identityAdapter(store: Store, directory: IdentityDirectory): (options: BetterAuthOptions) => DBAdapter {
  return (options: BetterAuthOptions) => createAdapterFactory({
    config: {
      adapterId: "formiq-prisma-keycloak", supportsDates: true, supportsBooleans: true,
      supportsUUIDs: true, supportsNumericIds: false, disableIdGeneration: true,
      mapKeysTransformInput: { id: "uuid", userId: "userUuid", providerId: "provider", accountId: "subject" },
      mapKeysTransformOutput: { uuid: "id", userUuid: "userId", provider: "providerId", subject: "accountId" },
      transaction: "$transaction" in store ? (callback) => store.$transaction(async (tx) =>
        callback(identityAdapter(tx, directory)(options))) : false,
    },
    adapter: () => {
      function delegate(model: string): Delegate {
        if (!Object.hasOwn(fields, model)) throw new Error("Unsupported authentication model");
        return store[model as "user"] as unknown as Delegate;
      }
      async function hydrate(model: string, row: Row | null): Promise<Row | null> {
        if (!row || model !== "user") return row;
        if (typeof row.keycloakUuid !== 'string' || row.systemKey) return null;
        const profile = await directory.byUuid(String(row.keycloakUuid));
        return profile ? { ...row, ...profile } : null;
      }
      function data(model: string, input: Row) {
        delegate(model);
        return Object.fromEntries(Object.entries(input).filter(([key, value]) => {
          if (key === "uuid" || value === undefined || (model === "user" && profileFields.has(key))) return false;
          if (!fields[model].includes(key)) throw new Error("Unsupported authentication field");
          return true;
        }));
      }
      async function where(model: string, conditions: CleanedWhere[] = []) {
        delegate(model);
        const and: Row[] = [], or: Row[] = [];
        for (const condition of conditions) {
          let { field, value } = condition;
          if (model === "user" && field === "email" && condition.operator === "eq") {
            const profile = await directory.byEmail(String(value));
            if (!profile) return { uuid: { in: [] } };
            field = "keycloakUuid"; value = profile.keycloakUuid;
          }
          if (!fields[model].includes(field)) throw new Error("Unsupported authentication filter");
          const operators: Record<string, string> = { eq: "equals", ne: "not", in: "in", not_in: "notIn", lt: "lt", lte: "lte", gt: "gt", gte: "gte", contains: "contains", starts_with: "startsWith", ends_with: "endsWith" };
          const operator = operators[condition.operator];
          if (!operator) throw new Error("Unsupported authentication operator");
          const filter = { [field]: { [operator]: value } };
          (condition.connector === "OR" ? or : and).push(filter);
        }
        return { ...(and.length ? { AND: and } : {}), ...(or.length ? { OR: or } : {}) };
      }
      const adapter: CustomAdapter = {
        async create<T extends Row>({ model, data: input }: { model: string; data: T }) {
          const values = data(model, input);
          if (model === "user" && !await directory.byUuid(String(values.keycloakUuid))) throw new Error("Verified Keycloak identity required");
          return await hydrate(model, await delegate(model).create({ data: values })) as T;
        },
        async findOne<T>({ model, where: conditions }: Parameters<CustomAdapter["findOne"]>[0]) {
          return await hydrate(model, await delegate(model).findFirst({ where: await where(model, conditions) })) as T | null;
        },
        async findMany<T>({ model, where: conditions, limit, offset, sortBy }: Parameters<CustomAdapter["findMany"]>[0]) {
          if (sortBy && !fields[model]?.includes(sortBy.field)) throw new Error("Unsupported authentication sort");
          const rows = await delegate(model).findMany({ where: await where(model, conditions), take: limit, skip: offset,
            ...(sortBy ? { orderBy: { [sortBy.field]: sortBy.direction } } : {}) });
          return (await Promise.all(rows.map(row => hydrate(model, row)))).filter(row => row !== null) as T[];
        },
        async update<T>({ model, where: conditions, update }: { model: string; where: CleanedWhere[]; update: T }) {
          if (!conditions.length) return null;
          const filter = await where(model, conditions);
          const row = await delegate(model).findFirst({ where: filter });
          if (!row) return null;
          const values = data(model, update as Row);
          if (model === "user" && values.keycloakUuid && values.keycloakUuid !== row.keycloakUuid) throw new Error("Provider identity is immutable");
          try { return await hydrate(model, await delegate(model).update({ where: { ...filter, uuid: row.uuid }, data: values })) as T | null; }
          catch (error) { if ((error as { code?: string }).code === "P2025") return null; throw error; }
        },
        async updateMany({ model, where: conditions, update }) {
          if (model === "user") throw new Error("Bulk identity changes are disabled");
          return (await delegate(model).updateMany({ where: await where(model, conditions), data: data(model, update) })).count;
        },
        async delete({ model, where: conditions }) {
          if (!conditions.length) throw new Error("An authentication deletion filter is required");
          const row = await delegate(model).findFirst({ where: await where(model, conditions) });
          if (row) await delegate(model).deleteMany({ where: { ...await where(model, conditions), uuid: row.uuid,
            ...(model === "session" ? { expiresAt: row.expiresAt, renewalCount: row.renewalCount } : {}) } });
        },
        async deleteMany({ model, where: conditions }) {
          if (!conditions?.length) throw new Error("An authentication deletion filter is required");
          return (await delegate(model).deleteMany({ where: await where(model, conditions) })).count;
        },
        async consumeOne<T>({ model, where: conditions }: { model: string; where: CleanedWhere[] }) {
          if (model !== "verification" || !conditions.length) throw new Error("Only verification records can be consumed");
          const filter = await where(model, conditions);
          const row = await delegate(model).findFirst({ where: filter });
          if (!row) return null;
          const removed = await delegate(model).deleteMany({ where: { ...filter, uuid: row.uuid } });
          return removed.count === 1 ? row as T : null;
        },
        async count({ model, where: conditions }) { return delegate(model).count({ where: await where(model, conditions) }); },
      };
      return adapter;
    },
  })(options);
}

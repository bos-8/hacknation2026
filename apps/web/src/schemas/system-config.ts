import { z } from 'zod';
import type { ConfigQuery } from '@formiq/database/config';
export const configQuerySchema = z.object({ page: z.number().int().min(1).max(40001).default(1), limit: z.union([z.literal(10),z.literal(25),z.literal(50)]).default(25), search: z.string().max(200).default(''), status: z.enum(['DRAFT','PUBLISHED','ARCHIVED']).optional() });
export function parseConfigQuery(params: Record<string,string|string[]|undefined>): ConfigQuery {
  const first = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined;
  const value = configQuerySchema.safeParse({ page: Number(first('page') || 1), limit: Number(first('limit') || 25), search: (first('search') || '').trim(), status: first('status') || undefined });
  return value.success ? value.data : { page: 1, limit: 25, search: '' };
}

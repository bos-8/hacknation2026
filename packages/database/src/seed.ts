import { RoleCode, type PrismaClient } from './generated/prisma/client.js';
import { CONFIG_DEFAULTS } from './config-contracts.js';

export const SYSTEM_KEY = 'formiq';
export const SYSTEM_USER_KEY = 'SYSTEM';
export const DEFAULT_SYSTEM_PROMPT = "Respond in the same language as the user's request. Focus only on the most important points. Do not add anything else.";
export const SYSTEM_ROLES = [RoleCode.ROOT, RoleCode.SADMIN, RoleCode.ADMIN, RoleCode.SYSTEM,
  RoleCode.AUDITOR, RoleCode.VIEWER, RoleCode.USER, RoleCode.GUEST, RoleCode.LOGED] as const;

/** Check first, insert only missing defaults, and serialize concurrent seed runs. */
export function seedDatabase(database: PrismaClient, { activateLlmPrompt = false } = {}) {
  return database.$transaction(async (tx) => {
    const existingSystem = await tx.system.findUnique({ where: { key: SYSTEM_KEY }, select: { uuid: true } });
    const created = { system: 0, roles: 0, systemUser: 0, configuration: 0, llmPrompt: 0 };
    if (!existingSystem) {
      created.system = (await tx.system.createMany({ data: [{ key: SYSTEM_KEY }], skipDuplicates: true })).count;
    }
    const [locked] = await tx.$queryRaw<{ uuid: string; activeConfigUuid: string | null }[]>`SELECT uuid, active_config_uuid AS "activeConfigUuid" FROM system WHERE key = ${SYSTEM_KEY} FOR UPDATE`;
    if (!locked) throw new Error('System identity missing');
    const existingRoles = await tx.role.findMany({ where: { code: { in: [...SYSTEM_ROLES] } }, select: { code: true } });
    const knownRoles = new Set(existingRoles.map(role => role.code));
    const missingRoles = SYSTEM_ROLES.filter(code => !knownRoles.has(code));
    if (missingRoles.length) {
      created.roles = (await tx.role.createMany({ data: missingRoles.map(code => ({ code })), skipDuplicates: true })).count;
    }
    const existingActor = await tx.user.findUnique({ where: { systemKey: SYSTEM_USER_KEY }, select: { uuid: true } });
    if (!existingActor) {
      created.systemUser = (await tx.user.createMany({ data: [{ systemKey: SYSTEM_USER_KEY }], skipDuplicates: true })).count;
    }
    const systemUser = await tx.user.findUniqueOrThrow({ where: { systemKey: SYSTEM_USER_KEY } });
    if (systemUser.keycloakUuid !== null) throw new Error('SYSTEM actor must not have a provider identity');
    // Bootstrap once. Existing versions and active choices always belong to the administrator.
    if (!locked.activeConfigUuid && await tx.systemConfigVersion.count({ where: { systemUuid: locked.uuid } }) === 0) {
      const config = await tx.systemConfigVersion.create({ data: { ...CONFIG_DEFAULTS, description: 'Initial system configuration', systemUuid: locked.uuid, version: 1, status: 'PUBLISHED',
        createdByUuid: systemUser.uuid, updatedByUuid: systemUser.uuid, publishedAt: new Date(), publishedByUuid: systemUser.uuid } });
      await tx.system.update({ where: { uuid: locked.uuid }, data: { activeConfigUuid: config.uuid } });
      await tx.systemConfigActivation.create({ data: { systemUuid: locked.uuid, configUuid: config.uuid, createdByUuid: systemUser.uuid } });
      created.configuration = 1;
    }
    // Share the same row lock as administrator draft saves and activations.
    const [llm] = await tx.$queryRaw<{ uuid: string; activePromptUuid: string }[]>`
      SELECT uuid, active_prompt_uuid AS "activePromptUuid" FROM llm_settings WHERE key = 'chat' FOR UPDATE
    `;
    if (!llm) throw new Error('LLM settings missing');
    const active = await tx.llmPromptVersion.findUniqueOrThrow({ where: { uuid: llm.activePromptUuid },
      select: { uuid: true, version: true, createdByUuid: true, systemPrompt: true } });
    let llmPromptActivated = false;
    if (active.systemPrompt !== DEFAULT_SYSTEM_PROMPT) {
      let seeded = await tx.llmPromptVersion.findFirst({
        where: { settingsUuid: llm.uuid, systemPrompt: DEFAULT_SYSTEM_PROMPT }, orderBy: { version: 'desc' }, select: { uuid: true },
      });
      // Regular startup upgrades the migration default once and preserves later choices.
      if (activateLlmPrompt || (!seeded && active.version === 1 && active.createdByUuid === null)) {
        if (!seeded) {
          const latest = await tx.llmPromptVersion.findFirstOrThrow({
            where: { settingsUuid: llm.uuid }, orderBy: { version: 'desc' }, select: { version: true },
          });
          seeded = await tx.llmPromptVersion.create({
            data: { settingsUuid: llm.uuid, version: latest.version + 1, systemPrompt: DEFAULT_SYSTEM_PROMPT, createdByUuid: systemUser.uuid },
            select: { uuid: true },
          });
          created.llmPrompt = 1;
        }
        await tx.llmSettings.update({ where: { uuid: llm.uuid },
          data: { activePromptUuid: seeded.uuid, updatedByUuid: systemUser.uuid } });
        llmPromptActivated = true;
      }
    }
    return {
      system: await tx.system.findUniqueOrThrow({ where: { key: SYSTEM_KEY }, select: { uuid: true, key: true, activeConfigUuid: true } }),
      systemUser,
      roles: await tx.role.findMany({ where: { code: { in: [...SYSTEM_ROLES] } }, select: { uuid: true, code: true }, orderBy: { code: 'asc' } }),
      created,
      llmPromptActivated,
      status: llmPromptActivated || Object.values(created).some(count => count > 0) ? 'seeded' as const : 'unchanged' as const,
    };
  }, { timeout: 20000 });
}

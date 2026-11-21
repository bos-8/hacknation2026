-- Preserve the existing system UUID, its settings and the authors of custom prompts.
UPDATE "system" SET "key" = 'formiq' WHERE "key" = 'modulon';

UPDATE "llm_prompt_version"
SET "system_prompt" = 'You are the FORMIQ assistant. Answer clearly in the user''s language. If you are unsure, say so.'
WHERE "version" = 1 AND "created_by" IS NULL
  AND "system_prompt" = 'You are the Modulon assistant. Answer clearly in the user''s language. If you are unsure, say so.';

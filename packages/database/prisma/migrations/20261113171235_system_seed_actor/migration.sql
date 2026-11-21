-- AlterTable
ALTER TABLE "user" ADD COLUMN     "system_key" VARCHAR(80),
ALTER COLUMN "keycloakUuid" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_system_key_key" ON "user"("system_key");

-- A technical audit actor has no external identity; human identities remain provider-bound.
ALTER TABLE "user" ADD CONSTRAINT user_identity_kind CHECK (
 ("keycloakUuid" IS NOT NULL AND system_key IS NULL)
 OR ("keycloakUuid" IS NULL AND system_key IS NOT NULL AND system_key = 'SYSTEM')
);
CREATE FUNCTION protect_user_identity_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."keycloakUuid" IS DISTINCT FROM OLD."keycloakUuid" OR NEW.system_key IS DISTINCT FROM OLD.system_key THEN
  RAISE EXCEPTION 'User identity kind and provider reference are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER user_identity_kind_guard BEFORE UPDATE OF "keycloakUuid", system_key ON "user"
 FOR EACH ROW EXECUTE FUNCTION protect_user_identity_kind();
CREATE FUNCTION reject_system_auth_subject() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "user" WHERE uuid=NEW."userUuid" AND system_key IS NOT NULL) THEN
  RAISE EXCEPTION 'Technical SYSTEM actors cannot own authentication sessions or accounts';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER system_session_guard BEFORE INSERT OR UPDATE OF "userUuid" ON session
 FOR EACH ROW EXECUTE FUNCTION reject_system_auth_subject();
CREATE TRIGGER system_account_guard BEFORE INSERT OR UPDATE OF "userUuid" ON account
 FOR EACH ROW EXECUTE FUNCTION reject_system_auth_subject();

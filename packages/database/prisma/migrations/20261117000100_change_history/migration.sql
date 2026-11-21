CREATE TABLE "change_history" (
  "uuid" uuid PRIMARY KEY DEFAULT uuidv7(),
  "entity" varchar(32) NOT NULL,
  "entity_uuid" uuid NOT NULL,
  "parent_uuid" uuid,
  "actor_uuid" uuid,
  "operation" varchar(16) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  "occurred_at" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  "before" jsonb,
  "after" jsonb
);
CREATE INDEX "change_history_entity_entity_uuid_occurred_at_idx"
  ON "change_history" (entity, entity_uuid, occurred_at);
CREATE INDEX "change_history_parent_uuid_uuid_idx" ON "change_history" (parent_uuid, uuid);

CREATE FUNCTION record_catalog_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous jsonb;
  current_value jsonb;
  identity_value jsonb;
  actor text;
BEGIN
  IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN current_value := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' AND previous = current_value THEN RETURN NEW; END IF;
  -- Preserve exact Decimal/BigInt values across JSON clients using IEEE doubles.
  IF TG_TABLE_NAME = 'product' THEN
    IF previous IS NOT NULL THEN previous := jsonb_set(previous, '{price}', to_jsonb(previous->>'price')); END IF;
    IF current_value IS NOT NULL THEN current_value := jsonb_set(current_value, '{price}', to_jsonb(current_value->>'price')); END IF;
  ELSIF TG_TABLE_NAME = 'file_version' THEN
    IF previous IS NOT NULL THEN previous := jsonb_set(previous, '{size}', to_jsonb(previous->>'size')); END IF;
    IF current_value IS NOT NULL THEN current_value := jsonb_set(current_value, '{size}', to_jsonb(current_value->>'size')); END IF;
  END IF;
  identity_value := COALESCE(current_value, previous);
  actor := NULLIF(current_setting('app.actor_uuid', true), '');
  IF TG_OP <> 'DELETE' THEN
    actor := COALESCE(actor, identity_value->>'updated_by', identity_value->>'created_by');
  END IF;
  INSERT INTO change_history(entity, entity_uuid, parent_uuid, actor_uuid, operation, "before", "after")
  VALUES (TG_TABLE_NAME, (identity_value->>'uuid')::uuid,
    CASE WHEN TG_TABLE_NAME = 'file_version' THEN (identity_value->>'file_uuid')::uuid END,
    actor::uuid, TG_OP, previous, current_value);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER product_change_history AFTER INSERT OR UPDATE OR DELETE ON product
  FOR EACH ROW EXECUTE FUNCTION record_catalog_change();
CREATE TRIGGER file_change_history AFTER INSERT OR UPDATE OR DELETE ON file
  FOR EACH ROW EXECUTE FUNCTION record_catalog_change();
CREATE TRIGGER file_version_change_history AFTER INSERT OR UPDATE OR DELETE ON file_version
  FOR EACH ROW EXECUTE FUNCTION record_catalog_change();

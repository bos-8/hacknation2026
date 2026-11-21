ALTER TABLE document_analysis ADD COLUMN ocr_progress integer
  CHECK (ocr_progress BETWEEN 0 AND 100);

ALTER TABLE system_config_version ADD COLUMN ocr_poll_seconds integer NOT NULL DEFAULT 10
  CHECK (ocr_poll_seconds BETWEEN 1 AND 3600);

CREATE FUNCTION protect_published_ocr_interval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published configuration is immutable; create a draft copy';
END $$;
CREATE TRIGGER published_ocr_interval_guard BEFORE UPDATE OF ocr_poll_seconds ON system_config_version
  FOR EACH ROW WHEN (OLD.status <> 'DRAFT' AND NEW.ocr_poll_seconds <> OLD.ocr_poll_seconds)
  EXECUTE FUNCTION protect_published_ocr_interval();

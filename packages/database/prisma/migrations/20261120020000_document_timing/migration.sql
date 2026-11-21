ALTER TABLE document_analysis
  ADD COLUMN queued_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN started_at timestamptz(3),
  ADD COLUMN sampled_at timestamptz(3),
  ADD COLUMN estimate_ms integer,
  ADD COLUMN ocr_ms integer,
  ADD COLUMN detect_ms integer;

ALTER TABLE document_export
  ADD COLUMN queued_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN started_at timestamptz(3),
  ADD COLUMN sampled_at timestamptz(3),
  ADD COLUMN estimate_ms integer,
  ADD COLUMN progress integer CHECK (progress BETWEEN 0 AND 100),
  ADD COLUMN duration_ms integer;

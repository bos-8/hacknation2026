CREATE TABLE "form_upload" (
  "file_uuid" uuid PRIMARY KEY REFERENCES "file"("uuid") ON DELETE CASCADE ON UPDATE CASCADE,
  "modified_at" timestamptz(3) NOT NULL
);

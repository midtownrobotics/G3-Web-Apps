-- Process categories. Existing processes become 'regular'.
ALTER TABLE processes ADD COLUMN type TEXT NOT NULL DEFAULT 'regular'
  CHECK (type IN ('regular', 'file_producer', 'file_consumer'));

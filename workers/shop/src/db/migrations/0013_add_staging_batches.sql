-- Staging batches for File Producer processes. Several can be open per process at once;
-- each groups staged instances with the one file they share. Completed batches are closed,
-- not deleted, so they double as a history of who produced which instances with which file.
CREATE TABLE staging_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id INTEGER NOT NULL REFERENCES processes(id),
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX idx_staging_batches_process ON staging_batches(process_id, closed_at);

ALTER TABLE part_instance_processes
  ADD COLUMN batch_id INTEGER REFERENCES staging_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_part_instance_processes_batch ON part_instance_processes(batch_id);

-- Move anything already staged (in progress at a File Producer process) into one open batch
-- per process, carrying over the file most of those instances share.
INSERT INTO staging_batches (process_id, created_by, created_at)
SELECT p.id, 'migration', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM processes p
WHERE p.type = 'file_producer'
  AND EXISTS (
    SELECT 1 FROM part_instance_processes pip
    WHERE pip.process_id = p.id AND pip.status = 'doing'
  );

UPDATE part_instance_processes
SET batch_id = (
  SELECT b.id FROM staging_batches b WHERE b.process_id = part_instance_processes.process_id
)
WHERE status = 'doing'
  AND process_id IN (SELECT id FROM processes WHERE type = 'file_producer');

UPDATE staging_batches
SET file_id = (
  SELECT pif.file_id
  FROM part_instance_processes pip
  JOIN part_instance_files pif ON pif.part_instance_id = pip.part_instance_id
  WHERE pip.batch_id = staging_batches.id
  GROUP BY pif.file_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
);

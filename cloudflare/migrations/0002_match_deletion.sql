-- Retain the ID to stop host retries or repeated imports resurrecting deleted matches.
ALTER TABLE matches ADD COLUMN deleted_at INTEGER;

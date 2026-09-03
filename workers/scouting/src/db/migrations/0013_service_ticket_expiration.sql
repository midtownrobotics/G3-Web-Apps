CREATE INDEX IF NOT EXISTS service_tickets_status_updated_idx
  ON service_tickets(status, updated_at DESC);

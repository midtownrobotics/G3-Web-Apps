CREATE INDEX IF NOT EXISTS checklist_items_list_index_idx
ON checklist_items(list_id, "index");

CREATE INDEX IF NOT EXISTS checklist_issues_item_created_idx
ON checklist_issues(item_id, created_at);

INSERT INTO "shift_definitions" ("shift_type", "label", "start_time", "end_time", "spans_midnight", "margin_minutes")
VALUES ('REPOS', 'Repos', NULL, NULL, false, 0)
ON CONFLICT ("shift_type") DO NOTHING;

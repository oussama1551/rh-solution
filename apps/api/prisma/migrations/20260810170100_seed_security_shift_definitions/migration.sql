INSERT INTO "shift_definitions" ("shift_type", "label", "start_time", "end_time", "spans_midnight", "margin_minutes")
VALUES
  ('SEC_MORNING', 'SEC Matin', '07:00', '16:00', false, 90),
  ('SEC_NIGHT', 'SEC Nuit', '16:00', '07:00', true, 90)
ON CONFLICT ("shift_type") DO UPDATE SET
  "label" = EXCLUDED."label",
  "start_time" = EXCLUDED."start_time",
  "end_time" = EXCLUDED."end_time",
  "spans_midnight" = EXCLUDED."spans_midnight",
  "margin_minutes" = EXCLUDED."margin_minutes",
  "updated_at" = CURRENT_TIMESTAMP;

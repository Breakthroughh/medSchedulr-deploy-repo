-- Create the essential on-call posts directly
INSERT INTO post_configs (id, name, type, active, "createdAt", "updatedAt") 
VALUES 
  ('post_on_call', 'On-Call', 'BOTH', true, NOW(), NOW()),
  ('post_standby_oncall', 'Standby Oncall', 'WEEKEND', true, NOW(), NOW()),
  ('post_weekend_shift', 'Weekend Shift', 'WEEKEND', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;
-- Drop old 2-arg versions of retry/dismiss/acknowledge before creating new 1-arg versions
DROP FUNCTION IF EXISTS retry_failed_step(uuid, uuid);
DROP FUNCTION IF EXISTS dismiss_dead_letter_step(uuid, uuid);
DROP FUNCTION IF EXISTS acknowledge_failed_run(uuid, uuid);

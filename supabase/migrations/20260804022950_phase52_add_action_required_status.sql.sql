-- Add action_required status to automation_step_runs check constraint
ALTER TABLE automation_step_runs DROP CONSTRAINT IF EXISTS automation_step_runs_status_check;
ALTER TABLE automation_step_runs ADD CONSTRAINT automation_step_runs_status_check 
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'skipped', 'dead_letter', 'scheduled', 'action_required'));

-- Also add action_required to communication_messages status check if needed
ALTER TABLE communication_messages DROP CONSTRAINT IF EXISTS communication_messages_status_check;
ALTER TABLE communication_messages ADD CONSTRAINT communication_messages_status_check
  CHECK (status IN ('queued', 'sending', 'sent', 'sent_mock', 'delivered', 'failed', 'failed_mock', 'cancelled', 'skipped', 'action_required'));

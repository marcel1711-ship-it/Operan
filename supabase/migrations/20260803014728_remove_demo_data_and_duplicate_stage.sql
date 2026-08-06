-- Delete demo reservations
DELETE FROM reservations WHERE ghl_opportunity_id IN ('demo-1', 'demo-5', 'demo-9');

-- Delete demo opportunities
DELETE FROM ghl_opportunities WHERE id IN ('demo-1', 'demo-5', 'demo-9');

-- Delete the fake demo stage
DELETE FROM ghl_pipeline_stages WHERE id = 'stage-new-booking';

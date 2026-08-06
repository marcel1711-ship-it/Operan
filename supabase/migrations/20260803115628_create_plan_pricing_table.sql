/*
# Create plan_pricing table for editable plan prices

1. New Tables
- `plan_pricing`
  - `id` (uuid, primary key)
  - `plan` (text, unique, values: starter | pro | enterprise)
  - `price` (numeric, monthly price in USD)
  - `features` (text[], array of feature descriptions)
  - `updated_at` (timestamptz, auto-updated)

2. Data
- Seeds 3 rows: starter ($79), pro ($149), enterprise ($499)
- Removes the "50 bookings" limit from starter — no booking limits enforced anywhere

3. Security
- RLS enabled
- Super admin (authenticated) can read and update prices
- No delete or insert from the client (plans are fixed at 3 tiers)
*/

CREATE TABLE IF NOT EXISTS plan_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan text NOT NULL UNIQUE CHECK (plan IN ('starter', 'pro', 'enterprise')),
  price numeric NOT NULL DEFAULT 0,
  features text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plan_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_plan_pricing" ON plan_pricing;
CREATE POLICY "read_plan_pricing" ON plan_pricing FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_plan_pricing" ON plan_pricing;
CREATE POLICY "update_plan_pricing" ON plan_pricing FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Seed default prices
INSERT INTO plan_pricing (plan, price, features) VALUES
  ('starter', 79, ARRAY[
    '1 business account',
    'Dashboard & calendar',
    'Reservations management',
    'Email support'
  ]),
  ('pro', 149, ARRAY[
    '1 business account',
    'Unlimited reservations',
    'Custom branding (colors, logo)',
    'Waivers & forms',
    'Priority support'
  ]),
  ('enterprise', 499, ARRAY[
    'Multiple business accounts',
    'Custom domain',
    'API access',
    'Embeddable booking widget',
    'Dedicated account manager'
  ])
ON CONFLICT (plan) DO NOTHING;

-- Update existing tenants with starter plan to new price
UPDATE tenants SET monthly_amount = 79.00 WHERE plan = 'starter' AND monthly_amount = 49.00;

-- $20/month subscription state, kept in step with Stripe by the webhook.
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN subscription_id TEXT;
ALTER TABLE users ADD COLUMN sub_status TEXT NOT NULL DEFAULT 'none';   -- none | active | trialing | past_due | canceled | ...
ALTER TABLE users ADD COLUMN sub_period_end INTEGER;                     -- unix seconds
CREATE INDEX users_stripe_customer ON users(stripe_customer_id);

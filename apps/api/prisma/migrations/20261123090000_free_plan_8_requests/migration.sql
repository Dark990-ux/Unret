-- Free plan: 8 new requests per day; free professionals can chat but receive a limited number of new customers
UPDATE "SubscriptionPlan"
SET features = jsonb_set(jsonb_set(features, '{requestsPerDay}', '8'), '{highlights}',
  '["Up to 8 new requests per day", "Public profile and portfolio", "Chat with the customers who contact you"]'::jsonb)
WHERE code = 'free';

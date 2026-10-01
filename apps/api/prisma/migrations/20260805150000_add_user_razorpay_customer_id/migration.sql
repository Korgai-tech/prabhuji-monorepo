-- Razorpay's handle for a person as a PAYER (`cust_xxx`).
--
-- On the user, not on `mandates`: a customer belongs to the human and outlives
-- any individual mandate. Razorpay refuses a second customer for the same
-- contact ("Customer already exists for the merchant") and has no lookup-by-
-- phone endpoint, so without this every re-registration died before the order.
--
-- Nullable and unindexed: it is only ever read by primary key, alongside the
-- rest of the user row.
ALTER TABLE "User" ADD COLUMN "razorpay_customer_id" TEXT;

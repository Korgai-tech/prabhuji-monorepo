-- Handles a client SDK needs to open its own approval sheet.
--
-- Razorpay's UPI Autopay authorization is raised by Razorpay Checkout ON THE
-- DEVICE, so that flow produces no `auth_url` to store. Additive and nullable:
-- every existing row (Decentro, Cashfree) keeps its link and reads NULL here.
ALTER TABLE "mandates" ADD COLUMN "provider_checkout" JSONB;

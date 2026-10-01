import { z } from 'zod';

/**
 * MIRRORS the server's `AdminCreateTestUserBody` (`apps/api` test-users admin
 * schemas). Fast feedback only — the server's Zod is authoritative.
 *
 * `bucket` is `''` while the number input is empty (that is what `<EntityForm>`
 * writes for a cleared number field); the page maps it to "no bucket".
 */
export const TestUserFormSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number starting 6-9'),
  premium: z.boolean(),
  bucket: z.union([
    z.literal(''),
    z
      .number({ message: 'Bucket must be a number' })
      .int('Bucket must be a whole number')
      .min(0, 'Bucket must be between 0 and 999')
      .max(999, 'Bucket must be between 0 and 999'),
  ]),
  note: z.string().max(200, 'At most 200 characters'),
});

export type TestUserFormInput = z.infer<typeof TestUserFormSchema>;

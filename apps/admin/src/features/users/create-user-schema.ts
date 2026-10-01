import { z } from 'zod';

/**
 * MIRRORS the server's `RegisterBody` (`apps/api` auth schemas: email, name
 * min 1, password min 8).
 *
 * Fast feedback ONLY — the server's Zod at the route boundary is authoritative.
 * If these ever disagree, the server wins and its message is what the editor
 * sees (`unwrap()` surfaces it). Keep in sync by hand; this is a mirror, not a
 * generated artifact.
 */
export const CreateUserSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

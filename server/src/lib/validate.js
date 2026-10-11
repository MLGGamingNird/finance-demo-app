import { z } from 'zod';

// Replaces req.body with the parsed value, or responds 400 with
// field-level messages.
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const { fieldErrors, formErrors } = z.flattenError(result.error);
      return res.status(400).json({ error: formErrors[0] ?? 'Invalid request body', fields: fieldErrors });
    }
    req.body = result.data;
    next();
  };
}

export function validateIdParam(req, res, next) {
  if (!z.uuid().safeParse(req.params.id).success) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}

// Postgres error codes surfaced by Supabase.
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

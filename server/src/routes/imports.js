import express, { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/requireAuth.js';
import { validateBody } from '../lib/validate.js';
import { rateLimit } from '../lib/rateLimit.js';
import { ImportError, readBankCsv } from '../lib/bankImport.js';
import { suggestCategories } from '../lib/categorize.js';

export const importsRouter = Router();

// Auth runs before the body is read, so only signed-in users can send a
// large file. The app mounts this router ahead of its default 100 kB parser.
importsRouter.use(requireAuth);
importsRouter.use(express.json({ limit: '2mb' }));

const MAX_CSV_LENGTH = 1_500_000;
const column = z.number().int().min(-1).max(500);

// Both endpoints take the raw CSV text. The server stays stateless, so the
// client sends the same file again to import it after the preview.
const importSchema = z.strictObject({
  csv: z.string().min(1, 'The file is empty').max(MAX_CSV_LENGTH, 'The file is too large (1.5 MB max)'),
  flip_signs: z.boolean().default(false),
  columns: z
    .strictObject({ date: column, description: column, amount: column, debit: column, credit: column })
    .optional(),
});

// Each import can make several AI calls.
const importLimiter = rateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: (req) => `${req.user.id}:${req.ip}` });

function readOrRespond(req, res) {
  try {
    return readBankCsv(req.body.csv, { columns: req.body.columns, flipSigns: req.body.flip_signs });
  } catch (err) {
    if (!(err instanceof ImportError)) throw err;
    res.status(400).json({ error: err.message, header: err.header });
    return null;
  }
}

async function existingHashes(userId, rows) {
  const { data, error } = await supabase.rpc('existing_import_hashes', {
    p_user_id: userId,
    p_hashes: rows.map((r) => r.import_hash),
  });
  if (error) throw error;
  return new Set(data);
}

const PREVIEW_ROWS = 20;

importsRouter.post('/preview', validateBody(importSchema), async (req, res) => {
  const file = readOrRespond(req, res);
  if (!file) return;

  const existing = await existingHashes(req.user.id, file.rows);
  res.json({
    header: file.header,
    columns: file.columns,
    suggest_flip: file.suggestFlip,
    total: file.rows.length,
    duplicates: file.rows.filter((r) => existing.has(r.import_hash)).length,
    error_count: file.errors.length,
    errors: file.errors.slice(0, PREVIEW_ROWS),
    sample: file.rows.slice(0, PREVIEW_ROWS).map(({ occurred_at, description, amount, import_hash }) => ({
      occurred_at,
      description,
      amount,
      duplicate: existing.has(import_hash),
    })),
  });
});

importsRouter.post('/', importLimiter, validateBody(importSchema), async (req, res) => {
  const file = readOrRespond(req, res);
  if (!file) return;

  // Skip known rows before categorizing, so re-imports don't spend AI calls.
  const existing = await existingHashes(req.user.id, file.rows);
  const fresh = file.rows.filter((r) => !existing.has(r.import_hash));
  const categoryIds = await suggestCategories(req.user.id, fresh);

  const rows = fresh.map((r, i) => ({
    ...r,
    user_id: req.user.id,
    category_id: categoryIds[i],
    auto_categorized: categoryIds[i] !== null,
  }));

  // The unique (user_id, import_hash) constraint makes this safe to repeat,
  // even if two imports of the same file race.
  let inserted = [];
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('transactions')
      .upsert(rows, { onConflict: 'user_id,import_hash', ignoreDuplicates: true })
      .select('id, category_id');
    if (error) return res.status(500).json({ error: error.message });
    inserted = data;
  }

  res.status(201).json({
    imported: inserted.length,
    duplicates: file.rows.length - inserted.length,
    categorized: inserted.filter((r) => r.category_id !== null).length,
    error_count: file.errors.length,
  });
});

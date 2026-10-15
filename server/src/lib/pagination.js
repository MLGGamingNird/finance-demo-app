import { z } from 'zod';

// Keyset pagination for transactions, newest first. The cursor is the sort key
// of the last row on the previous page, so rows added or deleted elsewhere
// can't shift pages the way an offset would. The id breaks ties, since a batch
// insert gives every row the same created_at.
const cursorSchema = z.tuple([z.iso.date(), z.iso.datetime({ offset: true }), z.uuid()]);

export function encodeCursor(row) {
  return Buffer.from(JSON.stringify([row.occurred_at, row.created_at, row.id])).toString('base64url');
}

// Returns null for anything that isn't a cursor this server produced.
export function decodeCursor(cursor) {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// PostgREST filter for rows that sort after the cursor in
// (occurred_at desc, created_at desc, id desc) order. The values were
// validated by decodeCursor, so they can't inject filter syntax.
export function afterCursorFilter([occurredAt, createdAt, id]) {
  return [
    `occurred_at.lt.${occurredAt}`,
    `and(occurred_at.eq.${occurredAt},created_at.lt."${createdAt}")`,
    `and(occurred_at.eq.${occurredAt},created_at.eq."${createdAt}",id.lt.${id})`,
  ].join(',');
}

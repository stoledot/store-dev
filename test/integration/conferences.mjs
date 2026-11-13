import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { ensureConferenceAccessForOrder, markOrderConferenceParticipantsInvited } from '../../src/features/conferences/access.ts';

const mf = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response("ok") } }',
  compatibilityDate: '2026-07-20',
  d1Databases: ['DB'],
});

try {
  const db = await mf.getD1Database('DB');
  for (const sql of [
    'CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, email TEXT, refunded_cents INTEGER, amount_total_cents INTEGER)',
    'CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, description TEXT)',
    'CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, product_id INTEGER, name TEXT, quantity INTEGER)',
    "CREATE TABLE conferences (id INTEGER PRIMARY KEY, public_id TEXT, title TEXT, description TEXT, status TEXT, created_at TEXT, updated_at TEXT)",
    'CREATE TABLE conference_sessions (id INTEGER PRIMARY KEY, conference_id INTEGER, title TEXT, starts_at TEXT, duration_minutes INTEGER, time_zone TEXT, join_url TEXT, passcode TEXT)',
    'CREATE TABLE product_conferences (product_id INTEGER PRIMARY KEY, conference_id INTEGER)',
    "CREATE TABLE conference_participants (id INTEGER PRIMARY KEY, public_id TEXT UNIQUE, conference_id INTEGER, name TEXT, email TEXT, access_key TEXT, source_order_id INTEGER, status TEXT DEFAULT 'pending', invited_at TEXT, last_email_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(conference_id,email))",
    "CREATE TABLE conference_access (id INTEGER PRIMARY KEY, order_id INTEGER, order_item_id INTEGER, seat_number INTEGER, access_key TEXT UNIQUE, zoom_url TEXT, instructions TEXT, conference_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(order_item_id,seat_number))",
    "INSERT INTO conferences VALUES (1,'conf_1','Taller','Descripción','published','','')",
    "INSERT INTO products VALUES (1,'Taller A','taller-a',''), (2,'Taller B','taller-b',''), (3,'Otro','otro','')",
    'INSERT INTO product_conferences VALUES (1,1), (2,1)',
    "INSERT INTO orders VALUES (1,'paid',' Buyer@Example.com ',0,100), (2,'paid','buyer@example.com',0,100), (3,'paid','refund@example.com',100,100), (4,'paid','other@example.com',0,100), (5,'pending','pending@example.com',0,100)",
    "INSERT INTO order_items VALUES (1,1,1,'Taller A',2), (2,1,2,'Taller B',1), (3,1,3,'Otro',1), (4,2,1,'Taller A',1), (5,3,1,'Taller A',1), (6,4,3,'Otro',1), (7,5,1,'Taller A',1)",
  ]) await db.prepare(sql).run();

  const first = await ensureConferenceAccessForOrder(db, 1);
  assert.equal(first.length, 3);
  const participant = await db.prepare('SELECT * FROM conference_participants').first();
  assert.equal(participant.email, 'buyer@example.com');
  assert.equal(first[0].access_key, participant.access_key);
  assert.equal(new Set(first.map((entry) => entry.access_key)).size, 3);
  assert(first.every((entry) => entry.conference_id === 1 && entry.instructions.includes('Taller')));
  assert(first.every((entry) => entry.instructions.includes('Sesiones por programar.')));
  assert.deepEqual(await ensureConferenceAccessForOrder(db, 1), first);
  assert.deepEqual(await ensureConferenceAccessForOrder(db, 3), []);
  assert.deepEqual(await ensureConferenceAccessForOrder(db, 4), []);
  assert.deepEqual(await ensureConferenceAccessForOrder(db, 5), []);

  const second = await ensureConferenceAccessForOrder(db, 2);
  assert.equal(second.length, 1);
  const updated = await db.prepare('SELECT * FROM conference_participants').first();
  assert.equal(updated.source_order_id, 2);
  await ensureConferenceAccessForOrder(db, 1);
  assert.equal((await db.prepare('SELECT * FROM conference_participants').first()).access_key, updated.access_key);
  await markOrderConferenceParticipantsInvited(db, 1);
  assert.equal((await db.prepare('SELECT status FROM conference_participants').first()).status, 'invited');

  await db.prepare('DELETE FROM conference_access WHERE order_item_id=1 AND seat_number=2').run();
  assert.equal((await ensureConferenceAccessForOrder(db, 1)).length, 3);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM conference_participants').first()).n, 1);
  console.log('Conference purchase enrollment integration passed.');
} finally {
  await mf.dispose();
}

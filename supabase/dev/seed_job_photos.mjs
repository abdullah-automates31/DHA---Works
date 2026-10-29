// LOCAL DEVELOPMENT ONLY. Adds tiny fake photos to some of the seeded jobs so the job feed can show thumbnails.
// Run after seed_open_jobs.sql:  node supabase/dev/seed_job_photos.mjs   (from the repo root, local stack running)
// It reads the LOCAL service-role key from `supabase status` for this one run; the key is never printed or saved.
// Never run it against hosted DEV or production.
import { execSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const status = JSON.parse(execSync('supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/^[^{]*/, ''));
if (!String(status.API_URL).startsWith('http://127.0.0.1')) throw new Error('refusing to run: not the local stack');
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const RESIDENT = '11111111-1111-4111-8111-111111111111';
// Tiny solid-colour PNGs (64x64), built here so there is nothing to download and no real photo is involved.
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function solidPng(r, g, b, size = 64) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const COLOURS = [[207, 224, 214], [246, 231, 180], [214, 230, 247]];
// A silent 2 second MP3 (77 frames of MPEG-1 Layer III, 128 kbps, 44.1 kHz), so the voice note on the first seeded job can be played.
const silentMp3 = Buffer.concat(Array.from({ length: 77 }, () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(413)])));
const plan = [
  ['11111111-1111-4111-8111-1111111111b1', 3], // Kitchen sink leakage: three photos
  ['11111111-1111-4111-8111-1111111111b2', 5], // AC not cooling: five photos (the detail row scrolls)
  ['11111111-1111-4111-8111-1111111111b3', 1], // Geyser not heating: one photo
];

const voice = await admin.storage.from('job-media').upload(`${RESIDENT}/seed-voice.mp3`, silentMp3, { contentType: 'audio/mpeg', upsert: true });
if (voice.error) throw new Error('voice upload failed: ' + voice.error.message);

const rows = [];
for (const [job, count] of plan) {
  for (let sort = 0; sort < count; sort++) {
    const path = `${RESIDENT}/seed-${job.slice(-2)}-${sort}.png`;
    const [r, g, b] = COLOURS[(rows.length) % COLOURS.length];
    const { error } = await admin.storage.from('job-media').upload(path, solidPng(r, g, b), { contentType: 'image/png', upsert: true });
    if (error) throw new Error('upload failed: ' + error.message);
    rows.push(`('${job}', '${path}', ${sort})`);
  }
}
const sql = `insert into public.job_photos (job_id, storage_path, sort) values ${rows.join(', ')}
  on conflict (job_id, sort) do update set storage_path = excluded.storage_path;`;
execSync('docker exec -i supabase_db_dha-works psql -U postgres -d postgres -v ON_ERROR_STOP=1', { input: sql, stdio: ['pipe', 'ignore', 'inherit'] });
console.log(`added ${rows.length} fake job photos`);

/**
 * Wipes all user data and starts from an empty database.
 * Usage:  npm run reset
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const targets = ['gradient.db', 'gradient.db-wal', 'gradient.db-shm'];

const force = process.argv.includes('--force');

if (!force) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('This deletes every account and all academic records. Type "reset" to confirm: ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'reset') {
    console.log('Cancelled — nothing was deleted.');
    process.exit(0);
  }
}

let removed = 0;
for (const file of targets) {
  const p = path.join(DATA_DIR, file);
  if (fs.existsSync(p)) { fs.unlinkSync(p); removed += 1; }
}
console.log(removed ? `Database reset (${removed} file(s) removed).` : 'No database found — already clean.');
console.log('Start the server again and the schema will be recreated automatically.');

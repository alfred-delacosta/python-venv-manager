/* Copyright Advanced Software and AI Solutions LLC */
import readline from 'node:readline';
import { loadConfig } from '../core/config.js';
import { openDatabase } from '../core/db.js';
import { resetAdminPassword } from '../server/users.js';

async function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const onData = (char: Buffer) => {
      const c = char.toString('utf8');
      if (c === '\n' || c === '\r' || c === '\u0004') {
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(buffer);
        return;
      }
      if (c === '\u0003') {
        process.exit(1);
      }
      if (c === '\u007f' || c === '\b') {
        buffer = buffer.slice(0, -1);
        return;
      }
      buffer += c;
    };
    let buffer = '';
    process.stdout.write(question);
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const password = await promptHidden('New admin password: ');
  const confirm = await promptHidden('Confirm password: ');
  if (!password || password !== confirm) {
    console.error('Passwords do not match or were empty.');
    process.exit(1);
  }
  resetAdminPassword(db, password);
  db.close();
  console.log('Admin password updated.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

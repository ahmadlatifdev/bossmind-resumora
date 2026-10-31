import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Replicate from 'replicate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.replicate') });

async function main() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || token === 'PASTE_YOUR_KEY_HERE') {
    console.error('Error: REPLICATE_API_TOKEN is not set. Open .env.replicate and paste your key.');
    process.exit(1);
  }

  const replicate = new Replicate({ auth: token });

  const account = await replicate.accounts.current();
  console.log('Authenticated successfully.');
  console.log('Account:', JSON.stringify(account, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});

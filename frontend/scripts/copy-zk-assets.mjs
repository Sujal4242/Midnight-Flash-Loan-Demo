/**
 * Copies the compiled contract artifacts from `contracts/managed/flash-loan`
 * into the frontend so the browser bundle is fully self-contained:
 *
 *   - the compiled contract module (index.js / index.d.ts)  -> src/
 *   - .bzkir / .prover / .verifier assets                   -> public/midnight/flash-loan/
 *
 * The assets are served statically and fetched at runtime by
 * FetchZkConfigProvider (`/midnight/flash-loan/zkir/<circuit>.bzkir`,
 * `/midnight/flash-loan/keys/<circuit>.prover|.verifier`).
 *
 * Run via `npm run copy-zk-assets` in frontend/ (also part of `npm run build`).
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const managed = join(root, '..', 'contracts', 'managed', 'flash-loan');

if (!existsSync(managed)) {
  console.error('❌ contracts/managed/flash-loan not found. Run `npm run compile` at the repo root first.');
  process.exit(1);
}

const contractSrc = join(managed, 'contract');
const zkirSrc = join(managed, 'zkir');
const keysSrc = join(managed, 'keys');

const contractDst = join(root, 'src');
const zkirDst = join(root, 'public', 'midnight', 'flash-loan', 'zkir');
const keysDst = join(root, 'public', 'midnight', 'flash-loan', 'keys');

mkdirSync(contractDst, { recursive: true });
mkdirSync(zkirDst, { recursive: true });
mkdirSync(keysDst, { recursive: true });

cpSync(join(contractSrc, 'index.js'), join(contractDst, 'compiled-contract.js'));
cpSync(join(contractSrc, 'index.d.ts'), join(contractDst, 'compiled-contract.d.ts'));

let copiedZkir = 0;
for (const file of readdirSync(zkirSrc)) {
  if (file.endsWith('.bzkir')) {
    cpSync(join(zkirSrc, file), join(zkirDst, file));
    copiedZkir++;
  }
}

let copiedKeys = 0;
for (const file of readdirSync(keysSrc)) {
  if (file.endsWith('.prover') || file.endsWith('.verifier')) {
    cpSync(join(keysSrc, file), join(keysDst, file));
    copiedKeys++;
  }
}

console.log(`✓ copied contract module -> src/compiled-contract.{js,d.ts}`);
console.log(`✓ copied ${copiedZkir} .bzkir  -> public/midnight/flash-loan/zkir/`);
console.log(`✓ copied ${copiedKeys} keys    -> public/midnight/flash-loan/keys/`);

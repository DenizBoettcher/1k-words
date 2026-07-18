// Copies the onnxruntime WASM files into public/ort/ (self-hosted, version-
// exact). Piper's phonemize files load from jsDelivr; if found locally in the
// package they're copied too, but missing ones are NOT fatal.
import { cpSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const outDir = 'public/ort';
mkdirSync(outDir, { recursive: true });

const ortDist = 'node_modules/onnxruntime-web/dist';
let copied = 0;
for (const file of readdirSync(ortDist)) {
  if (file.startsWith('ort-wasm')) { cpSync(join(ortDist, file), join(outDir, file)); copied++; }
}

function findRecursive(dir, names, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) findRecursive(full, names, found);
      else if (names.includes(entry)) found.push(full);
    } catch { /* ignore */ }
  }
  return found;
}
try {
  const piperFiles = findRecursive('node_modules/@mintplex-labs/piper-tts-web',
    ['piper_phonemize.data', 'piper_phonemize.wasm']);
  for (const file of piperFiles) { cpSync(file, join(outDir, file.split(/[\\/]/).pop())); copied++; }
  if (piperFiles.length === 0) console.log('piper_phonemize files not in package will load from jsDelivr.');
} catch { /* package layout differs jsDelivr fallback handles it */ }

console.log(`TTS wasm setup done (${copied} files in public/ort/).`);

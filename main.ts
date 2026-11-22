// make.fun news-image-20261121 entry program (Node 22, standard library only).
// The finished image ships with the repository; this program hands it in:
// it validates the image against the contest gate, then copies it to the
// output directory as entry.png.

import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const MAX_BYTES = 1_048_576; // gate: at most 1 MiB
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SOURCE = resolve(import.meta.dirname ?? '.', 'entry.png');
const DESTINATION = join(OUTPUT_DIR, 'entry.png');

function fail(why: string): never {
  console.error(`entry refused: ${why}`);
  process.exit(1);
}

// The gate reads only the bytes of entry.png; make sure ours is a whole,
// correctly-sized image before it leaves the repository.
let bytes: Buffer;
try {
  bytes = readFileSync(SOURCE);
} catch {
  fail('entry.png is missing from the repository');
}
if (bytes.length === 0) fail('entry.png is empty');
if (bytes.length > MAX_BYTES) fail(`entry.png is ${bytes.length} bytes, over the ${MAX_BYTES}-byte cap`);

const isPng = bytes[0] === 0x89 && bytes.subarray(1, 8).toString('latin1') === 'PNG\r\n\x1a\n';
const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
if (!isPng && !isJpeg) fail('entry.png is neither a PNG nor a JPEG by its first bytes');

const dimension = (kind: 'png' | 'jpeg'): { width: number; height: number } => {
  if (kind === 'png') return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  // JPEG: walk the segment markers to the start-of-frame for the true dimensions.
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
};

const { width, height } = dimension(isPng ? 'png' : 'jpeg');
if (width === 0 || height === 0) fail('entry.png carries no readable dimensions — a truncated or broken image');
if (width > 1024 || height > 1024) fail(`entry.png is ${width}x${height}, over the 1024x1024 gate`);

// Hand it in: one clean copy into the output directory.
mkdirSync(OUTPUT_DIR, { recursive: true });
copyFileSync(SOURCE, DESTINATION);

const handedIn = statSync(DESTINATION);
// A short digest of the handed-in bytes, so two runs of this program can be
// compared byte for byte without opening the image again.
const digest = (data: Buffer): string => {
  let sum = 0x811c9dc5; // FNV-1a, stdlib-only and stable across runs
  for (const byte of data) { sum ^= byte; sum = Math.imul(sum, 0x01000193) >>> 0; }
  return sum.toString(16).padStart(8, '0');
};
// Integrity self-check: the bytes sitting in the output directory must be
// exactly the bytes we validated above, so a truncated or divergent copy
// can never ship in place of the reviewed image.
const copied = readFileSync(DESTINATION);
if (copied.length !== bytes.length || digest(copied) !== digest(bytes)) {
  fail('the copy in the output directory does not match the validated source bytes');
}
console.log(
  `handed in ${basename(DESTINATION)}: ${handedIn.size} bytes, ${width}x${height}, ` +
  `${isPng ? 'PNG' : 'JPEG'}, digest ${digest(bytes)} — ` +
  `the world's news of 20 November 2026 in one frame`,
);

#!/usr/bin/env node
/** SVG original -> PNG HiDPI + ICO multirresolução, em cada build npm. */
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.join(root, 'assets', 'icon.svg');
const out = path.join(root, 'build');
const sizes = [16, 24, 32, 48, 64, 128, 256];
let temporary;
try {
  const svg = await readFile(input);
  await mkdir(out, { recursive: true });
  temporary = await mkdtemp(path.join(tmpdir(), 'termo-icons-'));
  const paths = [];
  for (const size of sizes) {
    const output = path.join(temporary, `${size}.png`);
    await sharp(svg, { density: 288 }).resize(size, size).png().toFile(output);
    paths.push(output);
  }
  await sharp(svg, { density: 288 }).resize(1024, 1024).png()
    .toFile(path.join(out, 'icon.png'));
  await writeFile(path.join(out, 'icon.ico'), await pngToIco(paths));
  console.log(`Ícones atualizados: ${path.relative(root, input)} -> build/icon.ico (${sizes.join(', ')}px), build/icon.png (1024px)`);
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}

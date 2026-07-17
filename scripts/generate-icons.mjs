/**
 * Rasterize the brand SVGs into every icon the apps need.
 *
 *   npm run icons        (from the repo root; requires `sharp`, a devDependency)
 *
 * To use the ORIGINAL raster logo instead of the vector recreation, overwrite
 * assets/brand/bearboard-mark.png with a 1024×1024 export of it and re-run —
 * the script prefers a PNG master when one exists.
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'assets', 'brand');
const mobileAssets = path.join(root, 'apps', 'mobile', 'assets');
const webPublic = path.join(root, 'apps', 'web', 'public');

const masterPng = path.join(brand, 'bearboard-mark.png');
const masterSvg = path.join(brand, 'bearboard-mark.svg');
const transparentSvg = path.join(brand, 'bearboard-mark-transparent.svg');

const master = existsSync(masterPng) ? masterPng : masterSvg;

async function out(src, file, size, opts = {}) {
  const img = sharp(src, { density: 300 }).resize(size, size, {
    fit: 'contain',
    background: opts.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  await img.png().toFile(file);
  console.log('wrote', path.relative(root, file));
}

await mkdir(mobileAssets, { recursive: true });
await mkdir(webPublic, { recursive: true });

// Mobile (Expo): app icon, Android adaptive foreground, splash, favicon, in-app logo.
await out(master, path.join(mobileAssets, 'icon.png'), 1024);
await out(transparentSvg, path.join(mobileAssets, 'adaptive-icon.png'), 1024);
await out(transparentSvg, path.join(mobileAssets, 'splash-icon.png'), 512);
await out(master, path.join(mobileAssets, 'favicon.png'), 48);
await out(master, path.join(mobileAssets, 'logo.png'), 512);

// Web: PWA-ish icons (icon.svg in src/app is the primary favicon).
await out(master, path.join(webPublic, 'apple-touch-icon.png'), 180);
await out(master, path.join(webPublic, 'icon-512.png'), 512);

console.log('done');

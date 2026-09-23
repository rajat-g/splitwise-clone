// Regenerates raster app icons from the SVG masters (reproducible, committed).
// Run: npm run icons
// Inputs : public/icons/icon.svg (regular), public/icons/maskable-icon.svg (safe-zone padded)
// Outputs: 192/512 app icons, 512 maskable, 180 apple-touch, 32 favicon fallback,
//          plus public/favicon.svg (SVG master copy, referenced by index.html).

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const iconsDir = path.join(root, "public", "icons");

const JOBS = [
  { src: "icon.svg", dest: "icon-192.png", size: 192 },
  { src: "icon.svg", dest: "icon-512.png", size: 512 },
  { src: "maskable-icon.svg", dest: "maskable-512.png", size: 512 },
  { src: "icon.svg", dest: "apple-touch-icon.png", size: 180 },
  { src: "icon.svg", dest: "favicon-32.png", size: 32 },
];

await mkdir(iconsDir, { recursive: true });
for (const { src, dest, size } of JOBS) {
  const out = path.join(iconsDir, dest);
  await sharp(path.join(iconsDir, src)).resize(size, size).png().toFile(out);
  const meta = await sharp(out).metadata();
  if (meta.width !== size || meta.height !== size) {
    throw new Error(`${dest}: expected ${size}x${size}, got ${meta.width}x${meta.height}`);
  }
  console.log(`  [ok] icons/${dest} (${size}x${size})`);
}
// Favicon served at /favicon.svg mirrors the icon master.
await copyFile(path.join(iconsDir, "icon.svg"), path.join(root, "public", "favicon.svg"));
console.log("  [ok] favicon.svg synced from icons/icon.svg");

// Generates Helm app icons — a refined ship's-wheel mark on a violet gradient.
// Run from the project root:  node scripts/gen-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

// Shared wheel geometry (also mirrored in src/components/Brand.tsx), expressed as
// fractions of `size` so the app mark and the icon stay visually consistent.
function wheelPaths(size, cx, cy, k = 1) {
  const R = size * 0.255 * k; // rim center radius
  const rimW = size * 0.036 * k;
  const innerR = R * 0.46;
  const innerW = size * 0.018 * k;
  const hubR = size * 0.058 * k;
  const dotR = size * 0.023 * k;
  const spokeW = size * 0.028 * k;
  const spokeInner = hubR * 0.55;
  const spokeOuter = R - rimW * 0.5;
  const handleW = size * 0.03 * k;
  const handleInner = R + rimW * 0.5;
  const handleOuter = R * 1.3 * k;

  let spokes = "";
  let handles = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8; // offset so a spoke points up-right, not flat
    const c = Math.cos(a);
    const s = Math.sin(a);
    spokes += `<line x1="${(cx + spokeInner * c).toFixed(1)}" y1="${(cy + spokeInner * s).toFixed(1)}" x2="${(
      cx + spokeOuter * c
    ).toFixed(1)}" y2="${(cy + spokeOuter * s).toFixed(1)}" stroke="#fff" stroke-width="${spokeW.toFixed(
      1,
    )}" stroke-linecap="round"/>`;
    handles += `<line x1="${(cx + handleInner * c).toFixed(1)}" y1="${(cy + handleInner * s).toFixed(1)}" x2="${(
      cx + handleOuter * c
    ).toFixed(1)}" y2="${(cy + handleOuter * s).toFixed(1)}" stroke="#fff" stroke-width="${handleW.toFixed(
      1,
    )}" stroke-linecap="round"/>`;
  }
  return `${handles}${spokes}
    <circle cx="${cx}" cy="${cy}" r="${R.toFixed(1)}" fill="none" stroke="#fff" stroke-width="${rimW.toFixed(1)}"/>
    <circle cx="${cx}" cy="${cy}" r="${innerR.toFixed(1)}" fill="none" stroke="#fff" stroke-width="${innerW.toFixed(
      1,
    )}"/>
    <circle cx="${cx}" cy="${cy}" r="${hubR.toFixed(1)}" fill="#fff"/>
    <circle cx="${cx}" cy="${cy}" r="${dotR.toFixed(1)}" fill="#6d28d9"/>`;
}

function buildSvg({ size = 512, corner = 112, wheelScale = 1 }) {
  const cx = size / 2;
  const cy = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.3" cy="0.24" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${corner}" fill="url(#g)"/>
  <rect width="${size}" height="${size}" rx="${corner}" fill="url(#sheen)"/>
  ${wheelPaths(size, cx, cy, wheelScale)}
</svg>`;
}

const rounded = buildSvg({ size: 512, corner: 116, wheelScale: 1 });
const maskable = buildSvg({ size: 512, corner: 0, wheelScale: 0.8 });
const apple = buildSvg({ size: 512, corner: 0, wheelScale: 0.92 });

await sharp(Buffer.from(rounded)).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(Buffer.from(rounded)).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile("public/icon-maskable-512.png");
await sharp(Buffer.from(apple)).resize(180, 180).png().toFile("public/apple-touch-icon.png");
writeFileSync("public/favicon.svg", rounded);

console.log("✓ Wrote icon-192/512, icon-maskable-512, apple-touch-icon, favicon.svg to public/");

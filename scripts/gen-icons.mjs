// Generates Helm app icons — the brass ship's-wheel mark with a negative-space
// "H" hub on a deep-navy gradient tile. Mirrors src/components/Brand.tsx so the
// in-app logo and the app icon stay identical.
// Run from the project root:  node scripts/gen-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BRASS = "#e0ae49"; // wheel stroke
const NAVY = "#0a263e"; // hub knockout / gradient end (the "H" reads as this)

// Shared wheel geometry (mirrored in src/components/Brand.tsx), expressed as
// fractions of `size` so the app mark and the icon stay visually consistent.
// `u` is one Brand viewBox unit (Brand draws the wheel in a 100-unit space with
// R = 25.5); here R = size * 0.255 * k, so one Brand-unit = size * 0.01 * k.
function wheelPaths(size, cx, cy, k = 1) {
  const R = size * 0.255 * k; // rim center radius
  const rimW = size * 0.036 * k;
  const innerR = R * 0.46;
  const innerW = size * 0.018 * k;
  const hubR = R * 0.431; // letter hub (Brand: 11 / 25.5)
  const spokeW = size * 0.028 * k;
  const spokeInner = hubR * 0.55;
  const spokeOuter = R - rimW * 0.5;
  const handleW = size * 0.03 * k;
  const handleInner = R + rimW * 0.5;
  const handleOuter = R * 1.3 * k;
  const u = size * 0.01 * k; // one Brand viewBox unit, for the "H" knockout

  let spokes = "";
  let handles = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8; // offset so a spoke points up-right, not flat
    const c = Math.cos(a);
    const s = Math.sin(a);
    spokes += `<line x1="${(cx + spokeInner * c).toFixed(1)}" y1="${(cy + spokeInner * s).toFixed(1)}" x2="${(
      cx + spokeOuter * c
    ).toFixed(1)}" y2="${(cy + spokeOuter * s).toFixed(1)}" stroke="${BRASS}" stroke-width="${spokeW.toFixed(
      1,
    )}" stroke-linecap="round"/>`;
    handles += `<line x1="${(cx + handleInner * c).toFixed(1)}" y1="${(cy + handleInner * s).toFixed(1)}" x2="${(
      cx + handleOuter * c
    ).toFixed(1)}" y2="${(cy + handleOuter * s).toFixed(1)}" stroke="${BRASS}" stroke-width="${handleW.toFixed(
      1,
    )}" stroke-linecap="round"/>`;
  }

  // Negative-space capital "H" knocked out of the solid brass hub (offsets from
  // center in Brand-units, matching Brand.tsx exactly).
  const rect = (dx, dy, w, h) =>
    `<rect x="${(cx + dx * u).toFixed(1)}" y="${(cy + dy * u).toFixed(1)}" width="${(w * u).toFixed(
      1,
    )}" height="${(h * u).toFixed(1)}" rx="${(0.7 * u).toFixed(1)}" fill="${NAVY}"/>`;
  const letterH = `${rect(-4.6, -6.8, 2.7, 13.6)}${rect(1.9, -6.8, 2.7, 13.6)}${rect(-4.6, -1.4, 9.2, 2.8)}`;

  return `${handles}${spokes}
    <circle cx="${cx}" cy="${cy}" r="${R.toFixed(1)}" fill="none" stroke="${BRASS}" stroke-width="${rimW.toFixed(1)}"/>
    <circle cx="${cx}" cy="${cy}" r="${innerR.toFixed(1)}" fill="none" stroke="${BRASS}" stroke-width="${innerW.toFixed(
      1,
    )}"/>
    <circle cx="${cx}" cy="${cy}" r="${hubR.toFixed(1)}" fill="${BRASS}"/>
    ${letterH}`;
}

function buildSvg({ size = 512, corner = 112, wheelScale = 1 }) {
  const cx = size / 2;
  const cy = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0e3052"/>
      <stop offset="1" stop-color="#0a263e"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.3" cy="0.24" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.14"/>
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

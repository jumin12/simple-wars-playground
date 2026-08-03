const fs = require('fs');
const path = require('path');

const ART = path.join(__dirname, '..', 'skins/art');
const TARGET = 512;
const PAD = 0.11;

function mapPoint(x, y) {
  return [x * 2 - 5, y * 2 - 51];
}

const circle = { cx: 225, cy: 123, r: 90 };
const body = ['195,213', '95,463', '355,463', '255,213'];
const arms = ['35,211', '35,219', '415,219', '415,211'];

const points = [
  ...body.map((p) => p.split(',').map(Number)),
  ...arms.map((p) => p.split(',').map(Number)),
  [circle.cx - circle.r, circle.cy],
  [circle.cx + circle.r, circle.cy],
  [circle.cx, circle.cy - circle.r],
  [circle.cx, circle.cy + circle.r],
];

let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const [x, y] of points) {
  minX = Math.min(minX, x);
  minY = Math.min(minY, y);
  maxX = Math.max(maxX, x);
  maxY = Math.max(maxY, y);
}

const w = maxX - minX;
const h = maxY - minY;
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const inner = TARGET * (1 - 2 * PAD);
const scale = Math.min(inner / w, inner / h);
const tx = TARGET / 2 - cx * scale;
const ty = TARGET / 2 - cy * scale;
const transform = `translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${scale.toFixed(6)})`;
const strokeWidth = (8 * 2).toFixed(3);

const carthage1 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<title>Carthage — Tanit</title>
<g transform="${transform}" fill="#000">
  <circle cx="225" cy="123" r="90"/>
  <polygon points="${body.join(' ')}"/>
  <polygon points="${arms.join(' ')}"/>
</g>
</svg>
`;

const carthage2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<title>Carthage — Tanit outline</title>
<g transform="${transform}" fill="none" stroke="#000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="225" cy="123" r="90"/>
  <polygon points="${body.join(' ')}"/>
  <polyline points="${arms.join(' ')}"/>
</g>
</svg>
`;

fs.writeFileSync(path.join(ART, 'carthage1.svg'), carthage1);
fs.writeFileSync(path.join(ART, 'carthage2.svg'), carthage2);
console.log('Restored Carthage SVGs from original Tanit geometry');
console.log({ transform, strokeWidth });

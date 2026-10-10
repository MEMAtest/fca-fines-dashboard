// Renders the Meridian mark to email-safe PNGs (Gmail/Outlook do not render SVG).
// Official colours are kept; the on-dark variant only lightens the ink strokes.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(new URL('../../public/regactions-mark.svg', import.meta.url), 'utf8');
const cropped = svg.replace('viewBox="0 0 48 48"', 'viewBox="4.8 4.8 38.4 38.4"');
const variants = {
  'regactions-mark-96.png': cropped,
  'regactions-mark-white-96.png': cropped.replaceAll('#0B1F2A', '#F4F6F8'),
};
for (const [name, source] of Object.entries(variants)) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: 96 }, background: 'rgba(0,0,0,0)' }).render().asPng();
  const out = new URL(`../../public/email/${name}`, import.meta.url);
  writeFileSync(out, png);
  console.log(name, statSync(out).size, 'bytes');
}

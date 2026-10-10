/**
 * Renders every RegActions email template with fictional fixture data into
 * email-previews/*.html plus an index. Logos load from the local public/ folder.
 *
 *   npm run email:previews
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setEmailAssetBase } from '../../server/services/emailKit/index.js';
import { previews } from '../../server/services/emailTemplates/allPreviews.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'email-previews');
setEmailAssetBase('../public');

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const groups = new Map<string, string[]>();
  for (const p of previews) {
    const built = await p.build();
    writeFileSync(path.join(outDir, `${p.file}.html`), built.html);
    writeFileSync(path.join(outDir, `${p.file}.txt`), built.text);
    const list = groups.get(p.group) ?? [];
    list.push(`<li><a href="${p.file}.html">${p.name}</a> <span>— ${built.subject.replace(/</g, '&lt;')}</span> <a class="txt" href="${p.file}.txt">text</a></li>`);
    groups.set(p.group, list);
  }
  const body = [...groups].map(([g, items]) => `<h2>${g}</h2><ul>${items.join('')}</ul>`).join('');
  writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>RegActions email previews</title><style>body{font:15px/1.6 Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#0F2846}a{color:#0F7C81}span{color:#64748B}.txt{font-size:12px}</style><h1>RegActions email previews</h1>${body}`);
  console.log(`Rendered ${previews.length} previews to ${outDir}`);
}
void main();

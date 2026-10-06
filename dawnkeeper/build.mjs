// Bundles src/ into a single self-contained index.html (plays offline, even from a
// downloaded file) and stamps the service worker cache version.
// Usage: node dawnkeeper/build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const jsDir = join(root, 'src', 'js');
const files = readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
const js = files.map((f) => `// ===== ${f} =====\n` + readFileSync(join(jsDir, f), 'utf8')).join('\n');
const code = `(function () {\n${js}\n})();`;
if (/<\/script/i.test(code)) throw new Error('Game code must not contain a closing script tag');

const tpl = readFileSync(join(root, 'src', 'index.template.html'), 'utf8');
if (!tpl.includes('/*GAME_JS*/')) throw new Error('Template is missing the /*GAME_JS*/ placeholder');
const html = tpl.replace('/*GAME_JS*/', () => code);
writeFileSync(join(root, 'index.html'), html);

const version = createHash('sha256').update(html).digest('hex').slice(0, 12);
const sw = readFileSync(join(root, 'src', 'sw.template.js'), 'utf8').replace('__VERSION__', version);
writeFileSync(join(root, 'sw.js'), sw);

console.log(`Built index.html (${(html.length / 1024).toFixed(1)} KB from ${files.length} modules), sw.js cache ${version}`);

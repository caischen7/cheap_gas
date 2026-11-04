// Turns the single-file Vite build into a claude.ai artifact page: the publish step
// supplies <!doctype>/<html>/<head>/<body>, so we keep only the title, meta tags,
// font links, styles, the root element and the inlined script.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-artifact/index.html', 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/i)[1];
const body = src.match(/<body>([\s\S]*?)<\/body>/i)[1];
const keep = [
  ...head.matchAll(/<title>[\s\S]*?<\/title>/gi),
  ...head.matchAll(/<meta name="claude:[^>]*>/gi),
  ...head.matchAll(/<link [^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi),
  ...head.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi),
].map((m) => m[0]);
const scripts = [...head.matchAll(/<script[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]);
const out = `${keep.join('\n')}\n${body.trim()}\n${scripts.join('\n')}\n`;
writeFileSync('dist-artifact/roadtrip-fuel-optimizer.html', out);
console.log(`artifact page: dist-artifact/roadtrip-fuel-optimizer.html (${(out.length / 1024).toFixed(0)} KB)`);

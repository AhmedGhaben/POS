// Read-only presentation audit. Does not import the application or launch a browser.
const fs = require('node:fs');
const cp = require('node:child_process');
const ts = require('typescript');
const crypto = require('node:crypto');
const z = require('node:zlib');
const changed = cp.execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(x => x.endsWith('.tsx'));
function normalize(text) {
  const sf = ts.createSourceFile('audit.tsx', text.replace(/\r\n/g, '\n'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = ts.transform(sf, [ctx => root => {
    function visit(n) {
      if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'className') return undefined;
      if (ts.isJsxText(n) && !n.text.trim()) return undefined;
      // Exactly one approved presentation-only addition: original logo in AuthLayout.
      if (ts.isJsxElement(n) && n.openingElement.tagName.getText(sf) === 'div' && n.children.some(c => ts.isJsxSelfClosingElement(c) && c.tagName.getText(sf) === 'img' && c.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'src' && p.initializer?.text === '/brand/storbit-original-reference.png'))) return undefined;
      if (ts.isCallExpression(n) && n.expression.getText(sf) === 'cva' && ts.isStringLiteral(n.arguments[0])) return ts.factory.updateCallExpression(n, n.expression, n.typeArguments, [ts.factory.createStringLiteral('STYLE_CLASSES'), ...n.arguments.slice(1)]);
      return ts.visitEachChild(n, visit, ctx);
    }
    return ts.visitNode(root, visit);
  }]);
  const value = ts.createPrinter({ removeComments: true }).printFile(result.transformed[0]);
  result.dispose();
  return value;
}
for (const f of changed) {
  const before = cp.execFileSync('git', ['show', 'HEAD:' + f], { encoding: 'utf8' });
  if (normalize(before) !== normalize(fs.readFileSync(f, 'utf8'))) throw Error('Non-presentation change: ' + f);
  console.log('PRESENTATION_ONLY', f);
}
const css = 'apps/web/src/styles/globals.css';
if (!fs.readFileSync(css, 'utf8').replace(/\r\n/g, '\n').startsWith(cp.execFileSync('git', ['show', 'HEAD:' + css], { encoding: 'utf8' }).replace(/\r\n/g, '\n').trimEnd())) throw Error('Original CSS changed');
console.log('ORIGINAL_ROOT_PRINT_TOUCH_CSS_PREFIX_INTACT');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const [a, b] of [
  ['docs/STORBIT-Codex-Visual-Only-Handoff-v2/brand-reference/storbit_original_star_logo.png', 'apps/web/public/brand/storbit-original-reference.png'],
  ['node_modules/prisma/build/public/assets/inter-all-400-normal.4c1f8a0d.woff', 'apps/web/public/fonts/storbit/Inter-Regular.woff'],
  ['node_modules/prisma/build/public/assets/inter-all-600-normal.d0a7c8a9.woff', 'apps/web/public/fonts/storbit/Inter-SemiBold.woff'],
]) {
  if (hash(a) !== hash(b)) throw Error('Modified source asset: ' + b);
  console.log('BYTE_IDENTICAL', b, hash(b));
}
for (const file of ['Inter-Regular.woff', 'Inter-SemiBold.woff']) {
  const b = fs.readFileSync('apps/web/public/fonts/storbit/' + file);
  let cmap;
  for (let i = 0; i < b.readUInt16BE(12); i++) {
    const o = 44 + i * 20;
    if (b.toString('ascii', o, o + 4) === 'cmap') {
      const at = b.readUInt32BE(o + 4), n = b.readUInt32BE(o + 8), length = b.readUInt32BE(o + 12);
      cmap = n === length ? b.subarray(at, at + n) : z.inflateSync(b.subarray(at, at + n));
    }
  }
  let map;
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const o = cmap.readUInt32BE(8 + i * 8);
    if (cmap.readUInt16BE(o) === 4) map = cmap.subarray(o);
  }
  const count = map.readUInt16BE(6) / 2;
  function glyph(code) {
    for (let i = 0; i < count; i++) {
      const end = map.readUInt16BE(14 + i * 2), start = map.readUInt16BE(16 + count * 2 + i * 2);
      if (code >= start && code <= end) {
        const delta = map.readInt16BE(16 + count * 4 + i * 2), at = 16 + count * 6 + i * 2, offset = map.readUInt16BE(at);
        if (!offset) return (code + delta) & 65535;
        const v = map.readUInt16BE(at + offset + (code - start) * 2);
        return v ? (v + delta) & 65535 : 0;
      }
    }
    return 0;
  }
  for (const ch of 'ÀÁÂÃÇÉÊÍÓÔÕÚàáâãçéêíóôõú€\u202f') if (!glyph(ch.codePointAt(0))) throw Error('Missing glyph: ' + ch + ' in ' + file);
  console.log('PORTUGUESE_AND_CURRENCY_GLYPHS_PRESENT', file);
}

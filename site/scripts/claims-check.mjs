// Claims and placeholder guard over the built HTML in dist/ (WEBSITE_SPEC §4,
// About brief §3.5, handoff §5). Fails the build on a violation.
// - Both modes: absolute promises, pt-BR words, unlabelled illustrations.
// - Public builds additionally: any preview-only marker, bracket placeholders,
//   AGT approval wording.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
if (!existsSync(dist)) { console.error('dist/ not found: build first'); process.exit(1); }
const files = readdirSync(dist, { recursive: true }).filter((f) => String(f).endsWith('.html')).map(String);
const preview = files.includes('pre-visualizacao.html');

const text = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/\s+/g, ' ');

const always = [
  [/nunca p[áa]ra/i, 'absolute promise "nunca pára"'],
  [/sem perder vendas/i, 'absolute promise "sem perder vendas"'],
  [/nenhuma venda perdida/i, 'absolute promise "nenhuma venda perdida"'],
  [/as vendas chegam todas/i, 'absolute promise "as vendas chegam todas"'],
  [/n[ãa]o precisa de fazer nada/i, 'absolute promise "não precisa de fazer nada"'],
  [/tudo segue sozinho/i, 'absolute promise "tudo segue sozinho"'],
  [/compat[íi]vel com a AGT|pronto para a AGT|certificad[oa] pela AGT|aprovad[oa] pela AGT/i, 'AGT approval wording'],
  [/\b(estoque|usu[áa]rio|celular|contato|baixar|registro|equipe)\b/i, 'pt-BR word'],
  [/Fale conosco|Agende uma demo/i, 'pt-BR phrasing'],
  [/Lorem ipsum/i, 'lorem ipsum'],
  [/Ilustração · substituir/i, 'mockup label'],
  [/\+\s?\d+\s?clientes/i, 'customer count'],
  // English pages
  [/never (stops|loses)|no (lost|missed) sales|zero data loss|all (your )?sales (always )?(arrive|get through)|you don'?t need to do anything|works? by itself/i, 'absolute promise (en)'],
  [/AGT[- ](compliant|approved|certified|ready)|(approved|certified) by (the )?AGT|ready for (the )?AGT/i, 'AGT approval wording (en)'],
  [/\+\s?\d+\s?customers/i, 'customer count (en)'],
];
const publicOnly = [
  [/data-preview-only|class="pv-tag|class="pv-block/, 'preview-only marker in a public build', 'html'],
  [/\[[^\]\n]{0,40}(—|confirmar|Nome legal|NIF|Morada|descrição)[^\]\n]{0,40}\]/i, 'bracket placeholder'],
  [/Em prepara[çc][ãa]o|Em curso|Pendente/, 'AGT status wording other than "Ainda não validado"'],
  [/certificad|homologad/i, '"certificado"/"homologado"'],
  [/\baprovad[oa]s?\b/i, '"aprovado" in public copy'],
  [/Pré-visualização|PRÉ-VISUALIZAÇÃO|por configurar|por definir/, 'preview wording in a public build'],
  [/Private preview|to be configured|to be defined|To verify|to be confirmed/, 'preview wording in a public build (en)'],
  [/\b(certified|certification|approved)\b|in progress|\bpending\b/i, 'AGT status wording other than "Not yet validated" (en)'],
];

let problems = 0;
for (const f of files) {
  const html = readFileSync(join(dist, f), 'utf8');
  const t = text(html);
  const rules = preview ? always : [...always, ...publicOnly];
  for (const [re, why, where] of rules) {
    const hay = where === 'html' ? html : t;
    const m = hay.match(re);
    if (m) { problems++; console.error(`✗ ${f}: ${why} → "${m[0]}"`); }
  }
}
if (problems) { console.error(`\nclaims-check: ${problems} problem(s) in ${preview ? 'preview' : 'public'} build`); process.exit(1); }
console.log(`claims-check: OK (${files.length} pages, ${preview ? 'preview' : 'public'} build)`);

import { P, lerTodos, gravar } from './lib.mjs';
import { join } from 'node:path';
import { rmSync, existsSync, readFileSync } from 'node:fs';

const SITE = process.env.SITE_URL || 'https://temlivropraisso.com';
const NOME = process.env.SITE_NOME || 'Tem livro pra isso';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataBr = (d) => d ? String(d).split('-').reverse().join('/') : '';

const CSS = `
:root{--tinta:#1c1a17;--suave:#6b655c;--linha:#e3ded5;--fundo:#fbf9f5;--caixa:#fff;--acento:#8a5a2b;--ok:#2f6b4f;--off:#a8a29a}
@media (prefers-color-scheme:dark){:root:not([data-tema=claro]){--tinta:#ece7de;--suave:#a39c91;--linha:#332f2a;--fundo:#171512;--caixa:#201d19;--acento:#d4a373;--ok:#7fb79a;--off:#6b655c}}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);font:17px/1.6 ui-serif,Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased}
.env{max-width:62rem;margin:0 auto;padding:0 16px}
header{border-bottom:1px solid var(--linha);padding:20px 0;margin-bottom:32px}
header a{font:600 15px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em;color:var(--tinta);text-decoration:none}
h1{font-size:clamp(1.7rem,4.5vw,2.4rem);line-height:1.2;margin:0 0 .4em;letter-spacing:-.015em}
h2{font-size:1.25rem;margin:2.2em 0 .6em;letter-spacing:-.01em}
.sub{color:var(--suave);font-size:1.05rem;margin:0 0 2em;max-width:44rem}
a{color:var(--acento)}
.grade{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));padding:0;list-style:none;margin:0}
.cartao{background:var(--caixa);border:1px solid var(--linha);border-radius:10px;padding:18px 20px}
.cartao a{text-decoration:none;font-weight:600;font-size:1.05rem}
.cartao p{color:var(--suave);font-size:.92rem;margin:.4em 0 0}
.rolo{overflow-x:auto;margin:0 -16px;padding:0 16px}
table{border-collapse:collapse;width:100%;font:14px/1.45 ui-sans-serif,system-ui,sans-serif;min-width:44rem}
th,td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--linha);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--suave);font-weight:600;white-space:nowrap}
td.c{text-align:center;font-variant-numeric:tabular-nums}
.sim{color:var(--ok);font-weight:600}.nao{color:var(--off)}
.pick{background:var(--caixa);border:1px solid var(--linha);border-left:3px solid var(--acento);border-radius:0 10px 10px 0;padding:16px 20px;margin:0 0 14px}
.pick h3{margin:0 0 .3em;font-size:1rem;font-family:ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em;color:var(--suave);text-transform:uppercase;font-size:12px}
.pick .t{font-weight:600;font-size:1.1rem}
blockquote{margin:.6em 0 0;padding-left:14px;border-left:2px solid var(--linha);color:var(--suave);font-size:.95rem}
.ficha{font:14px/1.7 ui-sans-serif,system-ui,sans-serif;list-style:none;padding:0;margin:0 0 2em}
.ficha li{display:flex;gap:10px;border-bottom:1px solid var(--linha);padding:7px 0}
.ficha b{min-width:8.5rem;color:var(--suave);font-weight:500}
.ev{background:var(--caixa);border:1px solid var(--linha);border-radius:10px;padding:16px 20px;margin:0 0 12px}
.ev .meta{font:12px/1.4 ui-sans-serif,system-ui,sans-serif;color:var(--suave);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5em}
.ev q{font-style:italic}
.aviso{font:14px/1.6 ui-sans-serif,system-ui,sans-serif;color:var(--suave);background:var(--caixa);border:1px dashed var(--linha);border-radius:10px;padding:14px 18px;margin:0 0 12px}
footer{margin:64px 0 40px;padding-top:20px;border-top:1px solid var(--linha);color:var(--suave);font:13px/1.6 ui-sans-serif,system-ui,sans-serif}
.selo{font:12px/1 ui-sans-serif,system-ui,sans-serif;color:var(--suave)}
`;

const pagina = ({ titulo, desc, corpo, canon }) => `<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canon)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<style>${CSS}</style>
<header><div class="env"><a href="/">${esc(NOME)}</a></div></header>
<main class="env">
${corpo}
</main>
<footer class="env">
  <p>Cada afirmação sobre um livro aqui vem de uma fonte que dá pra abrir e conferir — sinopse da editora, ficha catalográfica ou resenha assinada. O que a fonte não diz, a página diz que não sabe.</p>
  <p>Este site descreve livros. Não dá orientação psicológica nem recomendação clínica.</p>
</footer>
</html>
`;

const SIM = '<span class="sim">sim</span>', NAO = '<span class="nao">–</span>';
const bin = (v, quando) => v === quando ? SIM : (v === 'nao_coberto' || v === undefined ? NAO : NAO);
const val = (r, campo) => { const v = r?.[campo]; return typeof v === 'object' ? v?.valor : v; };

const situacoes = lerTodos(P.situacoes);
const livros = lerTodos(P.livros);
const porSit = new Map(situacoes.map(s => [s.slug, []]));
for (const l of livros) for (const s of (l.situacoes || [])) if (porSit.has(s)) porSit.get(s).push(l);
for (const [, arr] of porSit) arr.sort((a, b) => String(a.idade_editora).localeCompare(String(b.idade_editora)) || a.titulo.localeCompare(b.titulo, 'pt'));

if (existsSync(P.site)) rmSync(P.site, { recursive: true });
const urls = [];
const escreve = (rel, html) => { gravar(join(P.site, rel), html); urls.push(rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, '')); };

// ---- home
escreve('index.html', pagina({
  titulo: `${NOME} — livro infantil pra cada momento difícil`,
  desc: 'Catálogo de livro infantil por situação da vida da criança. Cada indicação carrega a fonte que a sustenta.',
  canon: SITE + '/',
  corpo: `<h1>Tem um livro pra essa conversa.</h1>
<p class="sub">Vai nascer um irmão, morreu alguém, o quarto ficou escuro demais. Escolha a situação; a página diz qual livro, pra que idade, e de onde veio cada afirmação.</p>
<ul class="grade">
${situacoes.filter(s => (porSit.get(s.slug) || []).length).map(s => `  <li class="cartao"><a href="/s/${esc(s.slug)}">${esc(s.titulo)}</a><p>${(porSit.get(s.slug) || []).length} livros · ${esc(s.pergunta)}</p></li>`).join('\n')}
</ul>`,
}));

// ---- situação: matriz, não lista
for (const s of situacoes) {
  const arr = porSit.get(s.slug) || [];
  if (!arr.length) continue;
  const linhas = arr.map(l => {
    const r = l.rubrica || {};
    return `      <tr>
        <td><a href="/l/${esc(l.isbn13)}">${esc(l.titulo)}</a><br><span class="selo">${esc(l.autor)}</span></td>
        <td class="c">${esc(l.idade_editora)}</td>
        <td class="c">${bin(val(r, 'nomeia_evento'), 'direto')}</td>
        <td class="c">${val(r, 'enquadramento') === 'religioso' ? SIM : NAO}</td>
        <td class="c">${bin(val(r, 'narrador'), 'crianca')}</td>
        <td class="c">${bin(val(r, 'material_adulto'), 'sim')}</td>
        <td class="c">${l.disponibilidade?.estado === 'esgotado' ? '<span class="nao">esgotado</span>' : SIM}</td>
      </tr>`;
  }).join('\n');
  const picks = (s.faixas || []).map(f => {
    const l = livros.find(x => x.isbn13 === f.isbn13);
    if (!l) return '';
    const ev = (l.evidencias || [])[f.base ?? 0];
    return `<div class="pick"><h3>Se for comprar um só · ${esc(f.faixa)}</h3>
  <div class="t"><a href="/l/${esc(l.isbn13)}">${esc(l.titulo)}</a></div>
  ${ev ? `<blockquote>“${esc(ev.trecho)}” — <a href="${esc(ev.url)}">${esc(ev.veiculo || ev.tipo.replace(/_/g, ' '))}</a></blockquote>` : ''}</div>`;
  }).join('\n');
  escreve(`s/${s.slug}.html`, pagina({
    titulo: `${s.titulo} — livro infantil por idade`,
    desc: s.descricao,
    canon: `${SITE}/s/${s.slug}`,
    corpo: `<h1>${esc(s.titulo)}</h1>
<p class="sub">${esc(s.descricao)}</p>
${picks}
<h2>Os ${arr.length} livros, lado a lado</h2>
<div class="rolo"><table>
  <thead><tr><th>Livro</th><th>Idade</th><th>Nomeia<br>o evento</th><th>Enquadr.<br>religioso</th><th>Narrador<br>é criança</th><th>Material<br>pro adulto</th><th>À venda</th></tr></thead>
  <tbody>
${linhas}
  </tbody>
</table></div>
<p class="selo">Coluna vazia quer dizer que a fonte não cobre aquilo — não que a resposta seja não.</p>`,
  }));
}

// ---- livro
for (const l of livros) {
  const evs = l.evidencias || [];
  const r = l.rubrica || {};
  const rot = { nomeia_evento: 'Nomeia o evento', enquadramento: 'Enquadramento', narrador: 'Narrador', material_adulto: 'Material pro adulto' };
  const legivel = { direto: 'diz o nome', metafora: 'usa metáfora', religioso: 'religioso', secular: 'secular', ambiguo: 'ambíguo', crianca: 'criança', adulto: 'adulto', animal: 'animal', objeto: 'objeto', sim: 'sim', nao: 'não', nao_coberto: 'a fonte não diz' };
  escreve(`l/${l.isbn13}.html`, pagina({
    titulo: `${l.titulo}, de ${l.autor} — pra que idade e o que traz`,
    desc: `${l.titulo} (${l.editora}, ${l.ano || 's/d'}): idade indicada, o que a fonte da editora afirma e o que ela não cobre.`,
    canon: `${SITE}/l/${l.isbn13}`,
    corpo: `<h1>${esc(l.titulo)}</h1>
<p class="sub">${esc(l.autor)}${l.ilustrador ? ` · ilustração de ${esc(l.ilustrador)}` : ''} · ${esc(l.editora)}${l.ano ? `, ${l.ano}` : ''}</p>
<ul class="ficha">
  <li><b>Idade indicada</b> <span>${esc(l.idade_editora)} <span class="selo">(pela editora)</span></span></li>
  ${Object.entries(rot).map(([k, label]) => `<li><b>${label}</b> <span>${esc(legivel[val(r, k)] ?? '—')}${(typeof r[k] === 'object' && r[k]?.base !== undefined && evs[r[k].base]) ? ` <a class="selo" href="#ev${r[k].base}">fonte ↓</a>` : ''}</span></li>`).join('\n  ')}
  ${l.origem ? `<li><b>Origem</b> <span>${esc(l.origem === 'traducao' ? `tradução${l.ano_original ? `, original de ${l.ano_original}` : ''}` : 'nacional')}</span></li>` : ''}
  ${l.paginas ? `<li><b>Páginas</b> <span>${l.paginas}</span></li>` : ''}
  <li><b>ISBN</b> <span>${esc(l.isbn13)}</span></li>
  <li><b>Conferido em</b> <span>${dataBr(l.verificado_em)}</span></li>
</ul>
<h2>De onde vem cada afirmação</h2>
${evs.map((e, i) => `<div class="ev" id="ev${i}"><div class="meta">${esc((e.veiculo || e.tipo).replace(/_/g, ' '))}${e.autor ? ` · ${esc(e.autor)}` : ''} · acessado ${dataBr(e.acessado_em)}</div><q>${esc(e.trecho)}</q><div style="margin-top:.6em"><a href="${esc(e.url)}">abrir a fonte</a></div></div>`).join('\n')}
<h2>O que a evidência não cobre</h2>
<p class="aviso">${esc(l.nao_coberto)}</p>
${l.nao_aborda ? `<h2>O que este livro não aborda</h2>\n<p class="aviso">${esc(l.nao_aborda)}</p>` : ''}
${(l.situacoes || []).length ? `<h2>Aparece em</h2>\n<ul class="grade">${(l.situacoes || []).map(sl => { const s = situacoes.find(x => x.slug === sl); return s ? `<li class="cartao"><a href="/s/${esc(s.slug)}">${esc(s.titulo)}</a></li>` : ''; }).join('')}</ul>` : ''}`,
  }));
}

gravar(join(P.site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}
</urlset>
`);
gravar(join(P.site, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`gerado: ${urls.length} páginas (${situacoes.filter(s => (porSit.get(s.slug) || []).length).length} situações, ${livros.length} livros)`);

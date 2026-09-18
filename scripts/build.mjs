import { P, ROOT, lerTodos, gravar } from './lib.mjs';
import { join } from 'node:path';
import { rmSync, existsSync, cpSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SITE = process.env.SITE_URL || 'https://livropraquando.com';
const NOME = process.env.SITE_NOME || 'Livro pra quando';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataBr = (d) => d ? String(d).split('-').reverse().join('/') : '';

const ASSETS = join(ROOT, 'assets');
const VERSAO = createHash('sha1').update(readFileSync(join(ASSETS, 'site.css'))).digest('hex').slice(0, 8);
const temArte = (nome) => existsSync(join(ASSETS, 'img', `${nome}.webp`));
const arte = (nome, alt, { eager = false, sizes = '(min-width:860px) 480px, 100vw' } = {}) => temArte(nome)
  ? `<img src="/assets/img/${nome}.webp"${temArte(`${nome}-640`) ? ` srcset="/assets/img/${nome}-640.webp 640w, /assets/img/${nome}.webp 1200w" sizes="${sizes}"` : ''} width="1200" height="800" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`
  : '';
const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#1f4e5a"/><path d="M16 10.5c-2.6-1.8-5.6-2.2-9-1.6v13c3.4-.6 6.4-.2 9 1.6 2.6-1.8 5.6-2.2 9-1.6v-13c-3.4-.6-6.4-.2-9 1.6z" fill="#fbf6ec"/><path d="M16 10.5v13" stroke="#ab4124" stroke-width="1.6"/><circle cx="23.5" cy="7.5" r="2.5" fill="#d9a441"/></svg>';
const MARCA = `<a class="marca" href="/">${LOGO}<span>${esc(NOME)}</span></a>`;

const pagina = ({ titulo, desc, corpo, canon, imagem = 'capa' }) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canon)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canon)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${esc(NOME)}">
${existsSync(join(ASSETS, 'img', `${imagem}-og.jpg`)) ? `<meta property="og:image" content="${SITE}/assets/img/${imagem}-og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
` : ''}<meta name="theme-color" content="#fbf6ec" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#10191d" media="(prefers-color-scheme:dark)">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/figtree.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${VERSAO}">
</head>
<body>
<header><div class="env">${MARCA}<nav><a href="/#situacoes">Situações</a></nav></div></header>
<main class="env">
${corpo}
<script>
(() => {
  const b = document.querySelector('.folhear'); if (!b) return;
  const visor = document.getElementById('visor');
  let carregado = false;
  const abrir = () => {
    visor.hidden = false; b.disabled = true; b.textContent = 'Carregando a amostra…';
    if (carregado) return; carregado = true;
    const s = document.createElement('script');
    s.src = 'https://www.google.com/books/jsapi.js';
    // padrao documentado: load() e depois setOnLoadCallback. Passar callback
    // direto em load() carrega a api mas nunca dispara o retorno.
    s.onload = () => {
      google.books.load();
      google.books.setOnLoadCallback(() => {
        const v = new google.books.DefaultViewer(document.getElementById('visor-alvo'));
        v.load('ISBN:' + b.dataset.isbn,
               () => { b.textContent = 'A editora não liberou amostra deste.'; b.disabled = false; visor.hidden = true; },
               () => { b.hidden = true; visor.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      });
    };
    s.onerror = () => { b.textContent = 'Não consegui carregar a amostra.'; visor.hidden = true; };
    document.head.appendChild(s);
  };
  b.addEventListener('click', abrir);
  if (location.hash === '#visor') abrir();
})();
</script>
</main>
<footer><div class="env">
  ${MARCA}
  <p>Cada afirmação sobre um livro aqui vem de uma fonte que dá pra abrir e conferir — sinopse da editora, ficha catalográfica ou resenha assinada. O que a fonte não diz, a página diz que não sabe.</p>
  <p>Este site descreve livros. Não dá orientação psicológica nem recomendação clínica.</p>
</div></footer>
</body>
</html>
`;

const FORMA = { prosa: 'prosa', rimado: 'rimado', palavras_chave: 'palavras-chave', tete_beche: 'tête-bêche' };
const COLS = {
  idade_editora:  { cab: 'Idade<br>indicada', cel: l => vv(l, 'idade_editora') === 'nao_coberto' ? '<span class="nao">n/i</span>' : esc(vv(l, 'idade_editora')) },
  paginas:        { cab: 'Págs.',             cel: l => l.paginas ? String(l.paginas) : '<span class="nao">n/i</span>' },
  forma:          { cab: 'Forma<br>do texto', cel: l => FORMA[vv(l, 'forma')] || '<span class="nao">–</span>' },
  narrador:       { cab: 'Narrador<br>é criança', cel: l => bin(vv(l, 'narrador'), 'crianca') },
  nomeia_evento:  { cab: 'Nomeia<br>o evento', cel: l => bin(vv(l, 'nomeia_evento'), 'direto') },
  enquadramento:  { cab: 'Enquadr.<br>religioso', cel: l => vv(l, 'enquadramento') === 'religioso' ? SIM : NAO },
  material_adulto:{ cab: 'Material<br>pro adulto', cel: l => bin(vv(l, 'material_adulto'), 'sim') },
  disponibilidade:{ cab: 'À venda',           cel: l => l.disponibilidade?.estado === 'esgotado' ? '<span class="nao">esgotado</span>' : SIM },
  preco:          { cab: 'Preço',             cel: l => precoBr(l) || '<span class="nao">–</span>' },
  previa:         { cab: 'Dá pra<br>folhear',  cel: l => l.previa?.folheavel ? `<a class="folhear-link" href="/l/${esc(l.isbn13)}#visor">ver</a>` : NAO },
};
const SIM = '<span class="sim">sim</span>', NAO = '<span class="nao">–</span>';
// Capa é como pai reconhece livro. Sem ela a tabela é um extrato bancário.
const capa = (l, cls = '') => l.capa?.arquivo
  ? `<img class="capa-livro ${cls}" src="/capas/${esc(l.capa.arquivo)}" alt="Capa de ${esc(l.titulo)}" loading="lazy" decoding="async" width="80" height="120">`
  : `<span class="capa-livro vazia ${cls}" aria-hidden="true"></span>`;
const bin = (v, quando) => v === quando ? SIM : (v === 'nao_coberto' || v === undefined ? NAO : NAO);
const vv = (l, campo) => { const v = (l.rubrica || {})[campo]; return typeof v === 'object' ? v?.valor : v; };
const val = (r, campo) => { const v = r?.[campo]; return typeof v === 'object' ? v?.valor : v; };

const MERCADO = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'data/mercado.json'), 'utf8')).livros || {}; }
  catch { return {}; }
})();
const preco = (l) => MERCADO[l.isbn13]?.preco;
const precoBr = (l) => preco(l) === undefined ? '' : `R$ ${preco(l).toFixed(2).replace('.', ',')}`;

const situacoes = lerTodos(P.situacoes);
const livros = lerTodos(P.livros);
const porSit = new Map(situacoes.map(s => [s.slug, []]));
for (const l of livros) for (const s of (l.situacoes || [])) if (porSit.has(s)) porSit.get(s).push(l);
for (const [, arr] of porSit) arr.sort((a, b) => {
  const ia = a.rubrica?.idade_editora?.valor ?? 'nao_coberto', ib = b.rubrica?.idade_editora?.valor ?? 'nao_coberto';
  if (ia === 'nao_coberto' && ib !== 'nao_coberto') return 1;
  if (ib === 'nao_coberto' && ia !== 'nao_coberto') return -1;
  return String(ia).localeCompare(String(ib)) || a.titulo.localeCompare(b.titulo, 'pt');
});

if (existsSync(P.site)) rmSync(P.site, { recursive: true });
cpSync(ASSETS, join(P.site, 'assets'), { recursive: true });
const urls = [];
const escreve = (rel, html) => { gravar(join(P.site, rel), html); urls.push(rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, '')); };

// ---- home
const comLivro = situacoes.filter(s => (porSit.get(s.slug) || []).length);
escreve('index.html', pagina({
  titulo: `${NOME} — livro infantil pra cada momento difícil`,
  desc: 'Catálogo de livro infantil por situação da vida da criança. Cada indicação carrega a fonte que a sustenta.',
  canon: SITE + '/',
  corpo: `<section class="heroi">
  <div>
    <p class="olho">Livro infantil por situação</p>
    <h1>Tem um livro pra <em>essa conversa.</em></h1>
    <p class="sub">Escolha o momento que a sua casa está vivendo. A página diz qual livro, pra que idade, e de onde veio cada afirmação — com a fonte aberta do lado.</p>
  </div>
  <figure class="arte">${arte('capa', 'Ilustração: um adulto e uma criança lendo juntos numa poltrona, à noite', { eager: true })}</figure>
</section>
<h2 id="situacoes">Escolha a situação</h2>
<ul class="grade">
${comLivro.map(s => `  <li class="cartao">${arte(s.slug, '', { sizes: '(min-width:700px) 330px, 100vw' })}<div class="c"><a href="/s/${esc(s.slug)}">${esc(s.titulo)}</a><p><span class="n">${(porSit.get(s.slug) || []).length} livros</span> · ${esc(s.pergunta)}</p></div></li>`).join('\n')}
</ul>
<h2>Como cada página é feita</h2>
<ol class="passos">
  <li><b>Por situação, não por título</b>Os livros ficam lado a lado numa tabela: tamanho, forma do texto, quem narra, se está à venda.</li>
  <li><b>Com a fonte à vista</b>Cada afirmação aponta pra sinopse da editora, ficha catalográfica ou resenha assinada, com link e data.</li>
  <li><b>O que não sabemos, dizemos</b>Ninguém aqui finge ter lido o livro. Se a fonte não cobre, a página avisa.</li>
</ol>`,
}));

// ---- situação: matriz, não lista
for (const s of situacoes) {
  const arr = porSit.get(s.slug) || [];
  if (!arr.length) continue;
  const cols = s.colunas?.length ? s.colunas : ['idade_editora', 'paginas', 'forma', 'narrador', 'disponibilidade'];
  const linhas = arr.map(l => `      <tr>
        <td class="tit"><a href="/l/${esc(l.isbn13)}">${capa(l, 'mini')}<span><b>${esc(l.titulo)}</b><br><span class="selo">${esc(l.autor)}</span></span></a></td>
${cols.map(c => `        <td class="c">${COLS[c].cel(l)}</td>`).join('\n')}
      </tr>`).join('\n');
  const picks = (s.faixas || []).map(f => {
    const l = livros.find(x => x.isbn13 === f.isbn13);
    if (!l) return '';
    const ev = (l.evidencias || [])[f.base ?? 0];
    return `<div class="pick">${capa(l, 'media')}<div class="pick-c"><h3>Se for comprar um só${f.faixa ? ` · ${esc(f.faixa)}` : ''}</h3>
  <div class="t"><a href="/l/${esc(l.isbn13)}">${esc(l.titulo)}</a></div>
  <div class="por">${esc(l.autor)} · ${esc(l.editora)}</div>
  ${ev ? `<blockquote>“${esc(ev.trecho)}” — <a href="${esc(ev.url)}" rel="noopener">${esc(ev.veiculo || ev.tipo.replace(/_/g, ' '))} ↗</a></blockquote>` : ''}</div></div>`;
  }).join('\n');
  escreve(`s/${s.slug}.html`, pagina({
    titulo: `${s.titulo} — livro infantil por idade`,
    desc: s.descricao,
    canon: `${SITE}/s/${s.slug}`,
    imagem: temArte(s.slug) ? s.slug : 'capa',
    corpo: `<section class="heroi sit">
  <div>
    <p class="olho"><a href="/#situacoes">Situações</a></p>
    <h1>${esc(s.titulo)}</h1>
    <p class="sub">${esc(s.descricao)}</p>
  </div>
  ${temArte(s.slug) ? `<figure class="arte">${arte(s.slug, `Ilustração: ${s.titulo.toLowerCase()}`, { eager: true, sizes: '(min-width:860px) 420px, 100vw' })}</figure>` : ''}
</section>
<div class="estreito">
${picks}
</div>
<h2>Os ${arr.length} livros, lado a lado</h2>
<p class="arrasta">Arraste a tabela pro lado pra ver todas as colunas →</p>
<div class="rolo"><table>
  <thead><tr><th>Livro</th>${cols.map(c => `<th class="c">${COLS[c].cab}</th>`).join('')}</tr></thead>
  <tbody>
${linhas}
  </tbody>
</table></div>
${s.lacuna ? `<h2>O que falta nesta página</h2>\n<p class="aviso">${esc(s.lacuna)}</p>` : ''}
<p class="selo legenda">Coluna vazia quer dizer que a fonte não cobre aquilo — não que a resposta seja não.</p>`,
  }));
}

// ---- livro
for (const l of livros) {
  const evs = l.evidencias || [];
  const r = l.rubrica || {};
  const rot = { idade_editora: 'Idade', nomeia_evento: 'Nomeia o evento', enquadramento: 'Enquadramento', narrador: 'Narrador', material_adulto: 'Material pro adulto' };
  const legivel = { direto: 'diz o nome', metafora: 'usa metáfora', religioso: 'religioso', secular: 'secular', ambiguo: 'ambíguo', crianca: 'criança', adulto: 'adulto', animal: 'animal', objeto: 'objeto', sim: 'sim', nao: 'não', nao_coberto: 'a fonte não diz' };
  escreve(`l/${l.isbn13}.html`, pagina({
    titulo: `${l.titulo}, de ${l.autor} — pra que idade e o que traz`,
    desc: `${l.titulo} (${l.editora}, ${l.ano || 's/d'}): idade indicada, o que a fonte da editora afirma e o que ela não cobre.`,
    canon: `${SITE}/l/${l.isbn13}`,
    imagem: (l.situacoes || []).find(temArte) || 'capa',
    corpo: `<div class="estreito" style="padding-top:20px">
<p class="olho">${(l.situacoes || []).map(sl => situacoes.find(x => x.slug === sl)).filter(Boolean).map(s => `<a href="/s/${esc(s.slug)}">${esc(s.titulo)}</a>`).join(' · ') || 'Livro'}</p>
<div class="topo-livro">${capa(l, 'grande')}<div><h1>${esc(l.titulo)}</h1>
<p class="sub">${esc(l.autor)}${l.ilustrador ? ` · ilustração de ${esc(l.ilustrador)}` : ''} · ${esc(l.editora)}${l.ano ? `, ${l.ano}` : ''}</p>
${precoBr(l) ? `<p class="preco">${precoBr(l)} <span class="selo">no Google Play, conferido em ${dataBr(MERCADO[l.isbn13].em)}</span></p>` : ''}
${l.previa?.folheavel ? `<button class="folhear" type="button" data-isbn="${esc(l.isbn13)}">Folhear as primeiras páginas</button>` : ''}</div></div>
${l.previa?.folheavel ? `<div id="visor" hidden><div id="visor-alvo"></div><p class="selo">Amostra do Google Livros, fornecida pela editora. Nem todo o livro está disponível.</p></div>` : ''}
<ul class="ficha">
  <li><b>Idade indicada</b> <span>${val(r, 'idade_editora') === 'nao_coberto' ? 'a editora não indica' : `${esc(val(r, 'idade_editora'))} <span class="selo">(pela editora)</span>`}</span></li>
  ${Object.entries(rot).filter(([k]) => k !== 'idade_editora').map(([k, label]) => `<li><b>${label}</b> <span>${esc(legivel[val(r, k)] ?? '—')}${(typeof r[k] === 'object' && r[k]?.base !== undefined && evs[r[k].base]) ? ` <a class="selo" href="#ev${r[k].base}">fonte ↓</a>` : ''}</span></li>`).join('\n  ')}
  ${l.origem ? `<li><b>Origem</b> <span>${esc(l.origem === 'traducao' ? `tradução${l.ano_original ? `, original de ${l.ano_original}` : ''}` : 'nacional')}</span></li>` : ''}
  ${l.paginas ? `<li><b>Páginas</b> <span>${l.paginas}</span></li>` : ''}
  <li><b>ISBN</b> <span>${esc(l.isbn13)}${(l.outras_edicoes || []).map(o => `<br><span class="selo">edição ${esc(o.formato || 'alternativa')}: ${o.url ? `<a href="${esc(o.url)}" rel="noopener">${esc(o.isbn13)}</a>` : esc(o.isbn13)}</span>`).join('')}</span></li>
  <li><b>Conferido em</b> <span>${dataBr(l.verificado_em)}</span></li>
</ul>
${(l.disponibilidade?.compra || []).length ? `<h2>Onde encontrar</h2>
<ul class="lojas">${l.disponibilidade.compra.map(c => `<li><a href="${esc(c.url)}" rel="noopener">${esc(c.loja)} ↗</a>${c.edicao ? ` <span class="selo">${esc(c.edicao)}</span>` : ''}</li>`).join('')}</ul>
<p class="selo">Links diretos, sem comissão. Conferidos em ${dataBr(l.verificado_em)}; preço e estoque mudam.</p>` : ''}
<h2>De onde vem cada afirmação</h2>
${evs.map((e, i) => `<div class="ev" id="ev${i}"><div class="meta">${esc((e.veiculo || e.tipo).replace(/_/g, ' '))}${e.autor ? ` · ${esc(e.autor)}` : ''} · acessado ${dataBr(e.acessado_em)}</div><q>${esc(e.trecho)}</q><a class="abrir" href="${esc(e.url)}" rel="noopener">abrir a fonte ↗</a></div>`).join('\n')}
${l.nota ? `<p class="nota">${esc(l.nota)}</p>` : ''}
${l.editora_paga ? `<p class="nota">${esc(l.editora)} publica mediante pagamento do autor: o livro não passou pela seleção de uma editora comercial. Está aqui porque a situação tem poucos títulos, e não entra em "se for comprar um só".</p>` : ''}
${l.disponibilidade?.estado === 'esgotado' ? `<p class="nota">Marcado como esgotado em ${dataBr(l.disponibilidade.mudou_em)}, depois de três verificações em dias distintos sem encontrar o livro à venda: ${esc((l.disponibilidade.evidencia || []).join('; '))}. Pode haver exemplar em sebo.</p>` : ''}
<h2>O que a evidência não cobre</h2>
<p class="aviso">${esc(l.nao_coberto)}</p>
${l.nao_aborda ? `<h2>O que este livro não aborda</h2>\n<p class="aviso">${esc(l.nao_aborda)}</p>` : ''}
${(l.situacoes || []).length ? `<h2>Aparece em</h2>\n<ul class="grade">${(l.situacoes || []).map(sl => { const s = situacoes.find(x => x.slug === sl); return s ? `<li class="cartao mini">${arte(s.slug, '', { sizes: '112px' })}<div class="c"><a href="/s/${esc(s.slug)}">${esc(s.titulo)}</a></div></li>` : ''; }).join('')}</ul>` : ''}
</div>`,
  }));
}

gravar(join(P.site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}
</urlset>
`);
// capas versionadas -> site
{
  const dir = join(ROOT, 'data/capas');
  if (existsSync(dir)) cpSync(dir, join(P.site, 'capas'), { recursive: true });
}
gravar(join(P.site, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`gerado: ${urls.length} páginas (${situacoes.filter(s => (porSit.get(s.slug) || []).length).length} situações, ${livros.length} livros)`);

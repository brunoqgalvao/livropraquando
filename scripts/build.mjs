import { P, ROOT, lerTodos, gravar } from './lib.mjs';
import { dimensao } from './lib/imagem.mjs';
import { join } from 'node:path';
import { rmSync, existsSync, cpSync, readFileSync, readdirSync } from 'node:fs';
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

const pagina = ({ titulo, desc, corpo, canon, imagem = 'capa', dados }) => `<!doctype html>
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
${dados ? `<script type="application/ld+json">${ld(dados)}</script>\n` : ''}</head>
<body>
<header><div class="env">${MARCA}<nav><a href="/#situacoes">Situações</a></nav></div></header>
<main class="env">
${corpo}
</main>
<footer><div class="env">
  ${MARCA}
  <p>Cada afirmação sobre um livro aqui vem de uma fonte que dá pra abrir e conferir — ${FONTES_EM_USO}. O que a fonte não diz, a página diz que não sabe.</p>
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
  disponibilidade:{ cab: 'À venda',           cel: l => vendaCel(l) },
  preco:          { cab: 'Preço',             cel: l => precoBr(l) ? `<span title="${esc(precoRotulo(l))}">${precoBr(l)}</span>${precoDe(l).formato === 'e-book' ? '<span class="selo"> e-book</span>' : ''}` : '<span class="nao">–</span>' },
  previa:         { cab: 'Dá pra<br>folhear',  cel: l => l.previa?.folheavel ? `<a class="folhear-link" href="https://books.google.com.br/books?id=${esc(l.previa.volume)}&printsec=frontcover" rel="noopener" target="_blank">ver ↗</a>` : NAO },
};
const SIM = '<span class="sim">sim</span>', NAO = '<span class="nao">–</span>';

// Esta coluna dizia "sim" pros catorze livros, sempre, porque "sim" era o valor
// padrão e ninguém tinha ido conferir. Agora ela só afirma o que o navegador
// leu numa loja hoje, e "não consegui ver" tem célula própria em vez de virar
// um "sim" de graça.
const venda = (l) => MERCADO[l.isbn13]?.estoque;
function vendaCel(l) {
  if (l.disponibilidade?.estado === 'esgotado') return '<span class="nao">esgotado</span>';
  const e = venda(l);
  if (!e) return '<span class="nao" title="Nenhuma loja respondeu de forma legível na última verificação.">não conferi</span>';
  const onde = esc((e.onde || []).join(' · '));
  return e.a_venda
    ? `<span class="sim" title="${onde} (${dataBr(e.em)})">sim</span>`
    : `<span class="nao" title="${onde} (${dataBr(e.em)})">não achei</span>`;
}
// Capa é como pai reconhece livro. Sem ela a tabela é um extrato bancário.
// Uma das capas e uma lombada inteira (300x150, Girassol). Num slot 2:3 com
// `object-fit:cover` ela vira uma tira vertical recortada do meio, que nao
// parece capa de nada. Capa deitada aparece inteira, menor.
const FORMATO = (() => {
  const m = new Map();
  try {
    for (const f of readdirSync(join(ROOT, 'data/capas'))) {
      const d = dimensao(readFileSync(join(ROOT, 'data/capas', f)));
      if (d) m.set(f, d.w / d.h);
    }
  } catch (e) {
    console.log(`! nao consegui medir as capas (${e.message}) — capa deitada vai sair cortada`);
  }
  return m;
})();
const deitada = (l) => (FORMATO.get(l.capa?.arquivo) ?? 0) > 1.15;

// A capa do topo da pagina do livro esta acima da dobra e e o maior elemento:
// carregar preguicoso atrasa o LCP de proposito. Nao aparecia antes porque quase
// nenhum livro tinha capa -- o defeito nasceu junto com a correcao.
const capa = (l, cls = '', { jaVisivel = false } = {}) => l.capa?.arquivo
  ? `<img class="capa-livro ${cls}${deitada(l) ? ' deitada' : ''}" src="/capas/${esc(l.capa.arquivo)}" alt="Capa de ${esc(l.titulo)}" ${jaVisivel ? 'fetchpriority="high" decoding="sync"' : 'loading="lazy" decoding="async"'} width="80" height="120">`
  : `<span class="capa-livro vazia ${cls}" aria-hidden="true"></span>`;
const bin = (v, quando) => v === quando ? SIM : (v === 'nao_coberto' || v === undefined ? NAO : NAO);
const vv = (l, campo) => { const v = (l.rubrica || {})[campo]; return typeof v === 'object' ? v?.valor : v; };
const val = (r, campo) => { const v = r?.[campo]; return typeof v === 'object' ? v?.valor : v; };
// A idade era o único campo da ficha sem link pra fonte — justo o que decide a
// compra. O site inteiro se sustenta em "toda afirmação aponta pra quem disse";
// deixar o campo mais consultado fora disso esvaziava a promessa.
const fonteDe = (r, campo, evs) => {
  const v = r?.[campo];
  return (typeof v === 'object' && v?.base !== undefined && evs[v.base]) ? ` <a class="selo" href="#ev${v.base}">fonte ↓</a>` : '';
};

const MERCADO = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'data/mercado.json'), 'utf8')).livros || {}; }
  catch { return {}; }
})();
// O preço da tabela era o do e-book no Google Play, e a tabela não dizia isso.
// Num catálogo de livro ilustrado isso engana de verdade: o pai compara R$ 28
// com R$ 67,90 sem saber que um é arquivo e o outro é o livro na mão. Preço de
// loja manda; o e-book só aparece quando é tudo que existe, e rotulado.
const precoDe = (l) => {
  const m = MERCADO[l.isbn13];
  if (m?.loja?.preco !== undefined) {
    return { valor: m.loja.preco, onde: m.loja.onde, em: m.loja.em, formato: m.loja.formato || 'impresso', edicao: m.loja.edicao };
  }
  if (m?.preco !== undefined) return { valor: m.preco, onde: 'Google Play', em: m.em, formato: 'e-book' };
  return null;
};
const precoBr = (l) => { const p = precoDe(l); return p ? `R$ ${p.valor.toFixed(2).replace('.', ',')}` : ''; };
const precoRotulo = (l) => {
  const p = precoDe(l);
  if (!p) return '';
  const edicao = p.edicao ? `, edição ISBN ${p.edicao}` : '';
  return `${p.formato} ${p.formato === 'e-book' ? 'no' : 'na'} ${p.onde}${edicao}, conferido em ${dataBr(p.em)}`;
};

// A descrição da situação dizia "Nenhuma das nove editoras indica faixa etária".
// Era verdade até a extração renderizada preencher quatro delas — aí a frase
// virou mentira sozinha, sem ninguém escrever nada. Número escrito na mão em
// texto editorial é slop com data marcada, então a contagem sai do dado:
// {n_livros}, {n_idade}, {n_sem_idade}, em algarismo ou por extenso ({N_...}
// com maiúscula inicial). Se aparecer placeholder desconhecido, o validate
// recusa — melhor o deploy travar do que publicar "{n_livors}".
const EXTENSO = ['nenhum', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito',
                 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis',
                 'dezessete', 'dezoito', 'dezenove', 'vinte'];
const porExtenso = (n) => EXTENSO[n] ?? String(n);
export function contagens(livrosDaSit) {
  const comIdade = livrosDaSit.filter(l => (l.rubrica?.idade_editora?.valor ?? 'nao_coberto') !== 'nao_coberto').length;
  return { n_livros: livrosDaSit.length, n_idade: comIdade, n_sem_idade: livrosDaSit.length - comIdade };
}
export function preenche(texto, cont) {
  return String(texto ?? '').replace(/\{(n_[a-z_]+)\}/gi, (todo, chave) => {
    const v = cont[chave.toLowerCase()];
    if (v === undefined) return todo;
    const palavra = porExtenso(v);
    return /^N/.test(chave) ? palavra[0].toUpperCase() + palavra.slice(1) : palavra;
  });
}

// "sinopse da editora, ficha catalografica ou resenha assinada" era uma lista
// escrita na mao, e a ficha tecnica da loja -- que hoje sustenta idade, paginas
// e preco -- ficou de fora dela sem ninguem notar. Promessa de procedencia nao
// pode depender de alguem lembrar de editar um paragrafo: sai do dado.
const NOME_FONTE = {
  sinopse_editora: 'sinopse da editora',
  ficha_catalografica: 'ficha catalográfica',
  ficha_tecnica: 'ficha técnica da loja',
  resenha_assinada: 'resenha assinada',
  material_editora: 'material da editora',
};
function listaPt(itens) {
  if (itens.length <= 1) return itens[0] || '';
  return `${itens.slice(0, -1).join(', ')} ou ${itens.at(-1)}`;
}

// Dado estruturado. Sai só o que já foi verificado e já está impresso na
// página: nada de aggregateRating nem review, que é o slop clássico de SEO —
// este site não tem nota nem resenha, e inventar as duas no JSON-LD seria
// mentir exatamente onde ninguém olha.
//
// `typicalAgeRange` existe no schema.org e é a pergunta que traz a pessoa aqui
// ("livro pra criança de 4 anos"). É o campo que custou três passadas pra
// preencher; deixar ele só no HTML seria desperdiçar o trabalho.
const ld = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

const faixaSchema = (v) => {
  if (!v || v === 'nao_coberto') return undefined;
  const m = String(v).match(/^(\d+)\s*(?:a\s*(\d+))?/);
  if (!m) return undefined;
  return m[2] ? `${m[1]}-${m[2]}` : `${m[1]}-`;      // "4-10" ou "4-", como o schema pede
};

const ESTOQUE_SCHEMA = { true: 'https://schema.org/InStock', false: 'https://schema.org/OutOfStock' };

function dadosDoLivro(l) {
  // Offer só com preço de loja. O único livro cujo preço é do e-book no Google
  // Play fica sem offer: a entidade Book aqui é o livro impresso, e anunciar o
  // preço do arquivo como preço dele repetiria, no JSON-LD, a imprecisão que
  // acabou de sair da coluna visível.
  const pr = MERCADO[l.isbn13]?.loja?.preco !== undefined ? precoDe(l) : null;
  const est = MERCADO[l.isbn13]?.estoque;
  const semVazio = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return semVazio({
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: l.titulo,
    url: `${SITE}/l/${l.isbn13}`,
    isbn: l.isbn13,
    inLanguage: 'pt-BR',
    author: l.autor ? { '@type': 'Person', name: l.autor } : undefined,
    illustrator: l.ilustrador ? { '@type': 'Person', name: l.ilustrador } : undefined,
    publisher: l.editora ? { '@type': 'Organization', name: l.editora } : undefined,
    datePublished: l.ano ? String(l.ano) : undefined,
    numberOfPages: l.paginas || undefined,
    image: l.capa?.arquivo ? `${SITE}/capas/${l.capa.arquivo}` : undefined,
    typicalAgeRange: faixaSchema(vv(l, 'idade_editora')),
    offers: pr ? semVazio({
      '@type': 'Offer',
      price: pr.valor,
      priceCurrency: 'BRL',
      url: MERCADO[l.isbn13]?.loja?.url,
      availability: est ? ESTOQUE_SCHEMA[String(est.a_venda)] : undefined,
    }) : undefined,
  });
}

const situacoes = lerTodos(P.situacoes);
const livros = lerTodos(P.livros);
const FONTES_EM_USO = listaPt([...new Set(livros.flatMap(l => (l.evidencias || []).map(e => e.tipo)))]
  .map(t => NOME_FONTE[t] || String(t).replace(/_/g, ' ')).sort());
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
  <li><b>Com a fonte à vista</b>Cada afirmação aponta pra ${FONTES_EM_USO}, com link e data.</li>
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
  const descricao = preenche(s.descricao, contagens(arr));
  escreve(`s/${s.slug}.html`, pagina({
    titulo: `${s.titulo} — livro infantil por idade`,
    desc: descricao,
    canon: `${SITE}/s/${s.slug}`,
    dados: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: s.titulo,
      url: `${SITE}/s/${s.slug}`,
      inLanguage: 'pt-BR',
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: arr.length,
        itemListElement: arr.map((l, i) => ({
          '@type': 'ListItem', position: i + 1, url: `${SITE}/l/${l.isbn13}`, name: l.titulo,
        })),
      },
    },
    imagem: temArte(s.slug) ? s.slug : 'capa',
    corpo: `<section class="heroi sit">
  <div>
    <p class="olho"><a href="/#situacoes">Situações</a></p>
    <h1>${esc(s.titulo)}</h1>
    <p class="sub">${esc(descricao)}</p>
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
${s.lacuna ? `<h2>O que falta nesta página</h2>\n<p class="aviso">${esc(preenche(s.lacuna, contagens(arr)))}</p>` : ''}
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
    dados: dadosDoLivro(l),
    imagem: (l.situacoes || []).find(temArte) || 'capa',
    corpo: `<div class="estreito" style="padding-top:20px">
<p class="olho">${(l.situacoes || []).map(sl => situacoes.find(x => x.slug === sl)).filter(Boolean).map(s => `<a href="/s/${esc(s.slug)}">${esc(s.titulo)}</a>`).join(' · ') || 'Livro'}</p>
<div class="topo-livro">${capa(l, 'grande', { jaVisivel: true })}<div><h1>${esc(l.titulo)}</h1>
<p class="sub">${esc(l.autor)}${l.ilustrador ? ` · ilustração de ${esc(l.ilustrador)}` : ''} · ${esc(l.editora)}${l.ano ? `, ${l.ano}` : ''}</p>
${precoBr(l) ? `<p class="preco">${precoBr(l)} <span class="selo">${esc(precoRotulo(l))}</span></p>` : ''}
${l.previa?.folheavel ? `<p><a class="folhear" href="https://books.google.com.br/books?id=${esc(l.previa.volume)}&printsec=frontcover" rel="noopener" target="_blank">Folhear as primeiras páginas ↗</a></p>
<p class="selo">Amostra no Google Livros, liberada pela editora. Abre em outra aba; nem todo o livro está disponível.</p>` : ''}</div></div>
<ul class="ficha">
  <li><b>Idade indicada</b> <span>${val(r, 'idade_editora') === 'nao_coberto' ? 'a editora não indica' : `${esc(val(r, 'idade_editora'))} <span class="selo">(pela editora)</span>${fonteDe(r, 'idade_editora', evs)}`}</span></li>
  ${Object.entries(rot).filter(([k]) => k !== 'idade_editora').map(([k, label]) => `<li><b>${label}</b> <span>${esc(legivel[val(r, k)] ?? '—')}${fonteDe(r, k, evs)}</span></li>`).join('\n  ')}
  ${l.origem ? `<li><b>Origem</b> <span>${esc(l.origem === 'traducao' ? `tradução${l.ano_original ? `, original de ${l.ano_original}` : ''}` : 'nacional')}</span></li>` : ''}
  ${l.paginas ? `<li><b>Páginas</b> <span>${l.paginas}</span></li>` : ''}
  <li><b>ISBN</b> <span>${esc(l.isbn13)}${(l.outras_edicoes || []).map(o => `<br><span class="selo">edição ${esc(o.formato || 'alternativa')}: ${o.url ? `<a href="${esc(o.url)}" rel="noopener">${esc(o.isbn13)}</a>` : esc(o.isbn13)}</span>`).join('')}</span></li>
  <li><b>Conferido em</b> <span>${dataBr(l.verificado_em)}</span></li>
</ul>
${(l.disponibilidade?.compra || []).length ? `<h2>Onde encontrar</h2>
<ul class="lojas">${l.disponibilidade.compra.map(c => `<li><a href="${esc(c.url)}" rel="noopener">${esc(c.loja)} ↗</a>${c.edicao ? ` <span class="selo">${esc(c.edicao)}</span>` : ''}</li>`).join('')}</ul>
<p class="selo">Links diretos, sem comissão.${venda(l) ? ` Em ${dataBr(venda(l).em)} um navegador abriu essas páginas e leu: ${esc((venda(l).onde || []).join('; ').replace(/[.;\s]+$/, ''))}.` : ' Na última passagem nenhuma loja respondeu de forma legível, então não dá pra afirmar que está à venda hoje.'} Preço e estoque mudam.</p>` : ''}
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

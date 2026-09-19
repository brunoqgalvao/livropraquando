// O validador é o portão do CATÁLOGO. Não havia portão nenhum pro SITE.
//
// Em 19/09 achei cinco defeitos em cinco passadas, todos na mesma família:
// afirmação que o site faz e ninguém relê. A janela que esquecia a leitura de
// loja, o aviso de "esgotado" no rodapé, o JSON-LD dizendo "4-" onde a editora
// escreveu "4+", a mesma meta description nas quinze páginas, e uma capa que
// não era a capa. Todos achados por eu abrir a coisa e olhar. Isso não escala:
// eu só olho o que lembro de olhar.
//
// Este script lê o que o build PRODUZIU e confere o que dá pra conferir sem
// rede. Não substitui o olho — olho pega "esta imagem não é a capa deste
// livro", que nenhum script pega. Pega o resto.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { P } from './lib.mjs';

const SITE = join(P.ROOT, 'site');
const erros = [];
const err = (onde, m) => erros.push(`${onde}: ${m}`);

const todos = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? todos(join(dir, e.name)) : [join(dir, e.name)]);

if (!existsSync(SITE)) { console.log('site/ não existe — rode build.mjs antes'); process.exit(1); }
const arquivos = todos(SITE);
const paginas = arquivos.filter(f => f.endsWith('.html'));

// Uma URL do site vira arquivo de dois jeitos: "/l/x" é "l/x.html" e "/" é
// "index.html". O canonical e o sitemap falam em URL; o disco fala em arquivo.
const paraArquivo = (u) => {
  const p = u.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
  if (p === '/' || p === '') return join(SITE, 'index.html');
  const limpo = p.replace(/^\//, '').replace(/\/$/, '');
  for (const cand of [limpo, `${limpo}.html`, join(limpo, 'index.html')]) {
    const f = join(SITE, cand);
    if (existsSync(f)) return f;
  }
  return null;
};

const titulos = new Map(), descricoes = new Map();

for (const f of paginas) {
  const nome = relative(SITE, f);
  const h = readFileSync(f, 'utf8');
  const un = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  const tit = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (!tit?.trim()) err(nome, 'sem <title>');
  else {
    const t = un(tit).trim();
    if (titulos.has(t)) err(nome, `<title> repetido de ${titulos.get(t)} — dois resultados de busca idênticos`);
    titulos.set(t, nome);
  }

  const desc = (h.match(/<meta name="description" content="([\s\S]*?)">/) || [])[1];
  if (!desc?.trim()) err(nome, 'sem meta description');
  else {
    const d = un(desc).trim();
    // O Google corta em ~160. O que fica pra fora não existe, e uma frase
    // cortada no meio é pior que uma frase a menos.
    if (d.length > 160) err(nome, `meta description com ${d.length} caracteres (o Google mostra ~160)`);
    if (descricoes.has(d)) err(nome, `meta description idêntica à de ${descricoes.get(d)}`);
    descricoes.set(d, nome);
  }

  const canon = (h.match(/<link rel="canonical" href="([^"]*)">/) || [])[1];
  if (!canon) err(nome, 'sem canonical');
  else if (paraArquivo(canon) !== f) err(nome, `canonical aponta pra ${canon}, que não é esta página`);

  // Toda imagem e todo link interno precisam existir em disco. Capa que some
  // vira quadrado vazio; link que quebra o Google lê como página morta.
  for (const m of h.matchAll(/<img[^>]+src="(\/[^"]+)"/g))
    if (!existsSync(join(SITE, m[1].slice(1)))) err(nome, `<img> aponta pra ${m[1]}, que não existe`);
  for (const m of h.matchAll(/href="(\/[^"#?]*)"/g)) {
    if (/\.(css|js|svg|woff2?|xml|txt|jpe?g|png|webp)$/.test(m[1])) {
      if (!existsSync(join(SITE, m[1].slice(1)))) err(nome, `link aponta pra ${m[1]}, que não existe`);
    } else if (!paraArquivo(m[1])) err(nome, `link interno ${m[1]} não tem página`);
  }
  const og = (h.match(/<meta property="og:image" content="([^"]*)">/) || [])[1];
  if (og && !existsSync(join(SITE, og.replace(/^https?:\/\/[^/]+\//, ''))))
    err(nome, `og:image ${og} não existe no site`);

  // O JSON-LD é o que o Google LÊ. Se ele discordar do que a página MOSTRA,
  // quem ganha é o robô, e ninguém percebe. Foi assim com "4+" virando "4-".
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch (e) { err(nome, `JSON-LD não parseia: ${e.message}`); continue; }
    if (!j['@context']) err(nome, 'JSON-LD sem @context');
    if (!nome.startsWith('l/')) continue;
    if (j['@type'] !== 'Book') err(nome, `JSON-LD de livro com @type=${j['@type']}`);
    const isbn = nome.replace(/^l\/|\.html$/g, '');
    if (j.isbn !== isbn) err(nome, `JSON-LD diz isbn ${j.isbn}, a página é do ${isbn}`);
    const faixa = j.typicalAgeRange;
    if (faixa) {
      const naPagina = (h.match(/Idade indicada<\/b>\s*<span>([^<]*)/) || [])[1]?.trim();
      const so = (s) => String(s).replace(/[^\d+a]/g, '');
      if (naPagina && so(naPagina) !== so(faixa.replace('-', 'a')))
        err(nome, `JSON-LD diz idade "${faixa}" e a página mostra "${naPagina}"`);
    }
  }
}

// O sitemap é a lista que o Google segue. Página fora dele fica invisível;
// URL nele sem página é 404 entregue de bandeja.
const smArq = join(SITE, 'sitemap.xml');
if (!existsSync(smArq)) err('sitemap.xml', 'não existe');
else {
  const locs = [...readFileSync(smArq, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const noSitemap = new Set();
  for (const u of locs) {
    const f = paraArquivo(u);
    if (!f) err('sitemap.xml', `${u} não tem página gerada`);
    else noSitemap.add(f);
  }
  for (const f of paginas) if (!noSitemap.has(f)) err('sitemap.xml', `${relative(SITE, f)} não está no sitemap`);
}

console.log(`conferidas ${paginas.length} páginas do site`);
for (const e of erros) console.log(`  ERRO   ${e}`);
if (erros.length) { console.log(`\n${erros.length} erro(s) no site gerado.`); process.exit(1); }
console.log('ok — o que o site afirma bate com o que ele tem.');

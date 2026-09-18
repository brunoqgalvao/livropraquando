// Capas que o Google Books não tem, colhidas da página da loja.
//
// "Maior imagem da página" seria o critério errado, e o teste mostrou por quê:
// na Alta Books a maior é um banner de 1280x2125 e na Aletria são os carrosséis
// da home. Serve candidato que se identifica: ISBN na URL (a Companhia das
// Letras bota), alt batendo com o título, seletor de imagem de produto. `og:image`
// entra por último porque em página de categoria ele vira logo da loja.
//
// Nada é publicado direto: as imagens ficam num diretório de espera e só entram
// no catálogo em `--promover`, depois de alguém olhar. O site promete que toda
// afirmação tem fonte conferida; "esta é a capa de X" é uma afirmação.
import { P, lerTodos, gravar, canonicalLivro, hoje } from './lib.mjs';
import { renderizar } from './navegador.mjs';
import { tituloBate } from './resolve.mjs';
import { dimensao, extensao } from './lib/imagem.mjs';
import { redimensionar } from './lib/redimensiona.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const ESPERA = join(P.runtime, 'capas-espera');
const DESTINO = join(P.ROOT, 'data/capas');
const MANIFESTO = join(ESPERA, 'manifesto.json');
const PROMOVER = process.argv.includes('--promover');

const EXTRATOR = `(() => {
  const meta = (p) => document.querySelector(\`meta[property="\${p}"], meta[name="\${p}"]\`)?.content || null;
  const SELETORES = '#landingImage, #zoomImg, .wp-post-image, [itemprop="image"], .product-image img, #imgBlkFront, .produto-imagem img';
  const doSeletor = [...document.querySelectorAll(SELETORES)].map(e => e.currentSrc || e.src || e.content).filter(Boolean);
  const imgs = [...document.querySelectorAll('img')]
    .filter(e => (e.currentSrc || e.src) && e.naturalWidth >= 100 && e.naturalHeight >= 100)
    .map(e => ({ src: e.currentSrc || e.src, alt: e.alt || '', w: e.naturalWidth, h: e.naturalHeight }));
  return { og: meta('og:image'), tw: meta('twitter:image'), doSeletor, imgs };
})()`;

// As lojas servem o thumbnail na página e guardam o grande na mesma URL, com
// outro token de tamanho. 342px numa capa de 136px de largura fica borrada em
// tela retina, e capa borrada é o mesmo que capa nenhuma pra quem está
// escolhendo livro. Só troca se a versão pedida voltar realmente maior.
function variantesMaiores(src) {
  const v = [];
  if (/m\.media-amazon\.com/.test(src)) v.push(src.replace(/\._[A-Z0-9_,]+_\./, '._SL1200_.'));
  if (/cdl-static[^/]*\/covers\//.test(src)) for (const t of ['gg', 'g']) v.push(src.replace(/\/covers\/[a-z]+\//, `/covers/${t}/`));
  if (/wp-content\/uploads/.test(src)) v.push(src.replace(/-\d{2,4}x\d{2,4}(\.[a-z]+)$/i, '$1'));
  if (/cdn\.awsli\.com\.br\/\d+x\d+\//.test(src)) v.push(src.replace(/\/\d+x\d+\//, '/1600x1600/'));
  return [...new Set(v)].filter(u => u !== src);
}

const LIXO = /\/banner|logo|sprite|\/menu\/|placeholder|sem[-_]imagem|no[-_]image|selo|icon|avatar|\.svg($|\?)/i;

function pontuar(cand, livro) {
  let p = 0;
  const razoes = [];
  if (LIXO.test(cand.src)) { p -= 4; razoes.push('url cheira a banner/logo'); }
  if (cand.src.includes(livro.isbn13)) { p += 4; razoes.push('ISBN na URL'); }
  if (cand.alt && tituloBate(cand.alt, livro.titulo)) { p += 3; razoes.push('alt bate com o título'); }
  if (cand.seletor) { p += 2; razoes.push('seletor de imagem de produto'); }
  if (cand.meta) { p += 1; razoes.push(`meta ${cand.meta}`); }
  if (cand.w && cand.h && cand.h >= cand.w) { p += 1; razoes.push('retrato'); }
  return { ...cand, pontos: p, razoes };
}

async function candidatos(livro) {
  const out = [];
  for (const c of (livro.disponibilidade?.compra || []).filter(x => x.url)) {
    const host = new URL(c.url).hostname.replace(/^www\./, '');
    let r;
    try { r = await renderizar(c.url, EXTRATOR); }
    catch (e) { console.log(`    ${host}: ${e.message}`); continue; }
    const vistos = new Set();
    const junta = (src, extra) => {
      if (!src || !/^https?:/.test(src) || vistos.has(src)) return;
      vistos.add(src);
      const daPagina = (r.imgs || []).find(i => i.src === src) || {};
      out.push(pontuar({ src, host, loja: c.loja, alt: daPagina.alt || '', w: daPagina.w, h: daPagina.h, ...extra }, livro));
    };
    for (const s of r.doSeletor || []) junta(s, { seletor: true });
    junta(r.og, { meta: 'og:image' });
    junta(r.tw, { meta: 'twitter:image' });
    for (const i of (r.imgs || []).filter(i => i.alt && tituloBate(i.alt, livro.titulo))) junta(i.src);
    for (const i of (r.imgs || []).filter(i => i.src.includes(livro.isbn13))) junta(i.src);
    await new Promise(s => setTimeout(s, 900));
  }
  return out.sort((a, b) => (b.pontos - a.pontos) || ((b.w || 0) * (b.h || 0) - (a.w || 0) * (a.h || 0)));
}

async function baixar(src) {
  const r = await fetch(src, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; livropraquando/1.0)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 3000) throw new Error(`só ${buf.length} bytes`);
  const dim = dimensao(buf);
  if (!dim) throw new Error('formato de imagem não reconhecido');
  return { buf, dim, url: src };
}

// ---- promoção: só entra o que foi olhado --------------------------------
if (PROMOVER) {
  const man = JSON.parse(readFileSync(MANIFESTO, 'utf8'));
  const escolhidos = new Set(process.argv.filter(a => /^\d{13}$/.test(a)));
  mkdirSync(DESTINO, { recursive: true });
  let n = 0;
  for (const l of lerTodos(P.livros)) {
    const e = man.escolhas[l.isbn13];
    if (!e || l.capa?.arquivo) continue;
    if (escolhidos.size && !escolhidos.has(l.isbn13)) continue;
    copyFileSync(join(ESPERA, e.arquivo), join(DESTINO, e.arquivo));
    const { arquivo, ...limpo } = l;
    limpo.capa = { arquivo: e.arquivo, fonte: e.host, url: e.src, obtida_em: hoje(), sha1: e.sha1, largura: e.w, altura: e.h };
    if (gravar(arquivo, canonicalLivro(limpo))) { n++; console.log(`  promovida ${l.isbn13} ${e.arquivo} (${e.w}x${e.h}, ${e.host})`); }
  }
  console.log(`${n} capa(s) promovida(s)`);
  process.exit(0);
}

// ---- colheita -----------------------------------------------------------
mkdirSync(ESPERA, { recursive: true });
const jaUsados = new Map();
for (const l of lerTodos(P.livros)) if (l.capa?.sha1) jaUsados.set(l.capa.sha1, l.isbn13);
const PLACEHOLDERS = new Set(['bc6a3a797b93ed6aa75aa73b206e1582bbd9496d']);

const escolhas = {};
const rejeitados = [];
for (const l of lerTodos(P.livros)) {
  if (l.capa?.arquivo) continue;
  console.log(`\n${l.isbn13} ${l.titulo}`);
  for (const c of await candidatos(l)) {
    if (c.pontos <= 0) { rejeitados.push({ isbn13: l.isbn13, src: c.src, motivo: `pontuação ${c.pontos}: ${c.razoes.join(', ')}` }); continue; }
    try {
      let { buf, dim, url } = await baixar(c.src);
      for (const alt of variantesMaiores(c.src)) {
        try {
          const maior = await baixar(alt);
          if (maior.dim.w * maior.dim.h > dim.w * dim.h) { ({ buf, dim, url } = maior); }
        } catch { /* variante não existe: fica com a que a página mostrou */ }
      }
      c.src = url;
      if (dim.w / dim.h > 2.2) throw new Error(`${dim.w}x${dim.h} é faixa, não capa`);

      // Reduz antes de versionar: o repositório guarda o que o site serve.
      const menor = await redimensionar(buf, `image/${dim.tipo}`);
      if (menor) { buf = menor.buf; dim = menor; }

      const sha1 = createHash('sha1').update(buf).digest('hex');
      if (PLACEHOLDERS.has(sha1)) throw new Error('placeholder conhecido');
      const dono = jaUsados.get(sha1);
      if (dono && dono !== l.isbn13) { PLACEHOLDERS.add(sha1); throw new Error(`mesma imagem de ${dono} — é placeholder da loja`); }
      const arq = `${l.isbn13}.${extensao(dim.tipo)}`;
      writeFileSync(join(ESPERA, arq), buf);
      jaUsados.set(sha1, l.isbn13);
      escolhas[l.isbn13] = { arquivo: arq, src: c.src, host: c.host, sha1, w: dim.w, h: dim.h, pontos: c.pontos, razoes: c.razoes };
      console.log(`  ✓ ${arq} ${dim.w}x${dim.h} ${(buf.length / 1024).toFixed(0)}KB de ${c.host} (${c.pontos} pts: ${c.razoes.join(', ')})`);
      break;
    } catch (e) {
      rejeitados.push({ isbn13: l.isbn13, src: c.src, motivo: e.message });
      console.log(`  ✗ ${c.src.slice(0, 70)}: ${e.message}`);
    }
  }
  if (!escolhas[l.isbn13]) console.log('  — nenhum candidato serviu');
}

writeFileSync(MANIFESTO, JSON.stringify({ em: hoje(), escolhas, rejeitados }, null, 2) + '\n');
console.log(`\n${Object.keys(escolhas).length} capa(s) em ${ESPERA}, esperando olho humano.`);
console.log(`Depois de conferir: node scripts/capas.mjs --promover [isbn13 ...]`);

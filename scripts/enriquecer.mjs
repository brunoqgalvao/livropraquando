// Capa e preço. A API do Google Books já devolvia os dois desde o primeiro dia
// e o pipeline só lia a sinopse.
//
// Capa é estável -> vai pro JSON do livro.
// Preço muda toda semana -> vai pra data/mercado.json, um arquivo só, de dono
// declaradamente mecânico, pra não sujar o diff editorial que mede slop.
import { P, lerTodos, gravar, canonicalLivro, hoje, buscaJSON } from './lib.mjs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const chave = process.env.GOOGLE_BOOKS_API_KEY
  || (() => { try { return execSync('security find-generic-password -a livropraisso -s GOOGLE_BOOKS_API_KEY -w', { encoding: 'utf8' }).trim(); } catch { return null; } })();
if (!chave) { console.error('sem GOOGLE_BOOKS_API_KEY'); process.exit(2); }

const ARQ_MERCADO = join(P.ROOT ?? '.', 'data/mercado.json');
const mercado = existsSync(ARQ_MERCADO) ? JSON.parse(readFileSync(ARQ_MERCADO, 'utf8')) : { atualizado_em: null, livros: {} };

// hashes conhecidos do placeholder "image not available" do Google
const PLACEHOLDERS = new Set(['bc6a3a797b93ed6aa75aa73b206e1582bbd9496d']);
const hashes = new Map();
let capas = 0, precos = 0, previas = 0;
for (const l of lerTodos(P.livros)) {
  const { dados, erro } = await buscaJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${l.isbn13}&country=BR&key=${chave}`);
  if (erro) { console.log(`  -- ${l.isbn13}: ${erro}`); continue; }
  const item = (dados.items || [])[0];
  if (!item) { console.log(`  -- ${l.isbn13}: sem volume`); continue; }

  const img = item.volumeInfo?.imageLinks;
  const { arquivo, ...limpo } = l;
  // O hotlink do books.google.com leva ~5s por imagem e trava a pagina.
  // Baixa uma vez, versiona, serve do proprio dominio.
  if (img?.thumbnail && !l.capa) {
    const remota = `https://books.google.com/books/content?id=${item.id}&printsec=frontcover&img=1&zoom=2`;
    try {
      const r = await fetch(remota, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      // O Google devolve um "image not available" quando nao tem capa, e ele e'
      // byte-identico entre livros. Duas capas com o mesmo hash = placeholder.
      const hash = createHash('sha1').update(buf).digest('hex');
      if (buf.length < 2000) throw new Error('imagem vazia');
      if (PLACEHOLDERS.has(hash)) throw new Error('placeholder do Google');
      const dono = hashes.get(hash);
      if (dono && dono !== l.isbn13) {
        PLACEHOLDERS.add(hash);
        throw new Error(`placeholder (mesma imagem de ${dono})`);
      }
      hashes.set(hash, l.isbn13);
      mkdirSync(join(P.ROOT, 'data/capas'), { recursive: true });
      writeFileSync(join(P.ROOT, 'data/capas', `${l.isbn13}.jpg`), buf);
      limpo.capa = { arquivo: `${l.isbn13}.jpg`, fonte: 'google_books', obtida_em: hoje(), sha1: hash };
      if (gravar(arquivo, canonicalLivro(limpo))) capas++;
    } catch (e) { console.log(`  -- capa ${l.isbn13}: ${e.message}`); }
  }

  // Previa folheavel: 7 dos 14 tem. Para livro ilustrado, ver duas paginas
  // decide mais que qualquer sinopse.
  const acesso = item.accessInfo || {};
  const podeFolhear = acesso.embeddable === true && acesso.viewability && acesso.viewability !== 'NO_PAGES';
  if (podeFolhear !== !!l.previa?.folheavel) {
    limpo.previa = podeFolhear
      ? { folheavel: true, volume: item.id, alcance: acesso.viewability, conferida_em: hoje() }
      : undefined;
    if (!podeFolhear) delete limpo.previa;
    if (gravar(arquivo, canonicalLivro(limpo))) previas++;
  }

  const venda = item.saleInfo || {};
  const preco = venda.listPrice || venda.retailPrice;
  if (preco || venda.saleability) {
    mercado.livros[l.isbn13] = {
      ...(preco ? { preco: preco.amount, moeda: preco.currencyCode } : {}),
      venda: venda.saleability,
      ...(venda.buyLink ? { link: venda.buyLink } : {}),
      em: hoje(),
    };
    if (preco) precos++;
  }
  await new Promise(s => setTimeout(s, 250));
}

mercado.atualizado_em = hoje();
gravar(ARQ_MERCADO, JSON.stringify(mercado, null, 2) + '\n');
console.log(`${capas} capa(s) · ${previas} prévia(s) · ${precos} preço(s) · mercado em data/mercado.json`);

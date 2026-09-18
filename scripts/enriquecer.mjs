// Capa e preço. A API do Google Books já devolvia os dois desde o primeiro dia
// e o pipeline só lia a sinopse.
//
// Capa é estável -> vai pro JSON do livro.
// Preço muda toda semana -> vai pra data/mercado.json, um arquivo só, de dono
// declaradamente mecânico, pra não sujar o diff editorial que mede slop.
import { P, lerTodos, gravar, canonicalLivro, hoje, buscaJSON } from './lib.mjs';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const chave = process.env.GOOGLE_BOOKS_API_KEY
  || (() => { try { return execSync('security find-generic-password -a livropraisso -s GOOGLE_BOOKS_API_KEY -w', { encoding: 'utf8' }).trim(); } catch { return null; } })();
if (!chave) { console.error('sem GOOGLE_BOOKS_API_KEY'); process.exit(2); }

const ARQ_MERCADO = join(P.ROOT ?? '.', 'data/mercado.json');
const mercado = existsSync(ARQ_MERCADO) ? JSON.parse(readFileSync(ARQ_MERCADO, 'utf8')) : { atualizado_em: null, livros: {} };

let capas = 0, precos = 0;
for (const l of lerTodos(P.livros)) {
  const { dados, erro } = await buscaJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${l.isbn13}&country=BR&key=${chave}`);
  if (erro) { console.log(`  -- ${l.isbn13}: ${erro}`); continue; }
  const item = (dados.items || [])[0];
  if (!item) { console.log(`  -- ${l.isbn13}: sem volume`); continue; }

  const img = item.volumeInfo?.imageLinks;
  const { arquivo, ...limpo } = l;
  if (img?.thumbnail && !l.capa) {
    limpo.capa = {
      url: `https://books.google.com/books/content?id=${item.id}&printsec=frontcover&img=1&zoom=2`,
      fonte: 'google_books',
      obtida_em: hoje(),
    };
    if (gravar(arquivo, canonicalLivro(limpo))) capas++;
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
console.log(`${capas} capa(s) nova(s) · ${precos} preço(s) · mercado em data/mercado.json`);

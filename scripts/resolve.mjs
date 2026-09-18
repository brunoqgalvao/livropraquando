// Prova que um livro existe. Sem passar por aqui, nada vira página.
import { buscaJSON, isbn13Valido, hoje } from './lib.mjs';
import { execSync } from 'node:child_process';

function chaveBooks() {
  if (process.env.GOOGLE_BOOKS_API_KEY) return process.env.GOOGLE_BOOKS_API_KEY;
  // Keychain só existe no Mac. Na VM isso cuspia "security: not found" em todo
  // log de rodada — erro falso é pior que erro nenhum: manda o próximo agente
  // caçar um problema que não existe.
  if (process.platform !== 'darwin') return null;
  try {
    return execSync('security find-generic-password -a livropraisso -s GOOGLE_BOOKS_API_KEY -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Substring cru casa "Você" (thriller) com "Você vai ganhar um irmãozinho",
// e "Irmão" com "bem-vindo irmãozinho". Só fronteira de palavra serve.
export function tituloBate(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const tx = x.split(' '), ty = y.split(' ');
  if (Math.min(tx.length, ty.length) < 2) return false;   // título de 1 palavra só casa exato
  const [curto, longo] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
  // sequência contígua de palavras inteiras
  for (let i = 0; i + curto.length <= longo.length; i++) {
    if (curto.every((t, j) => longo[i + j] === t)) return true;
  }
  const sc = new Set(curto), sl = new Set(longo);
  const inter = [...sc].filter(t => sl.has(t)).length;
  return inter / Math.max(sc.size, sl.size) >= 0.7;
}

// Edição brasileira: prefixo de país no ISBN-13. 978-85 e 978-65 são o Brasil;
// 978-972 / 978-989 são Portugal e não servem pra quem compra aqui.
export const edicaoBrasileira = (isbn13) =>
  /^(97885|97865)/.test(String(isbn13 || '').replace(/[^0-9]/g, ''));

export async function googleBooks({ isbn, titulo, autor }) {
  const key = chaveBooks();
  if (!key) return { fonte: 'google_books', erro: 'sem GOOGLE_BOOKS_API_KEY' };
  const q = isbn ? `isbn:${isbn}` : [`intitle:${titulo}`, autor ? `inauthor:${autor}` : ''].filter(Boolean).join('+');
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&langRestrict=pt&country=BR&maxResults=10&key=${key}`;
  const { dados, erro } = await buscaJSON(url);
  if (erro) return { fonte: 'google_books', erro };
  const itens = (dados.items || []).map(it => {
    const v = it.volumeInfo;
    const ids = v.industryIdentifiers || [];
    return {
      fonte: 'google_books',
      id: it.id,
      isbn13: (ids.find(i => i.type === 'ISBN_13') || {}).identifier,
      titulo: v.title,
      subtitulo: v.subtitle,
      autor: (v.authors || []).join(', '),
      editora: v.publisher,
      ano: v.publishedDate ? Number(String(v.publishedDate).slice(0, 4)) : undefined,
      paginas: v.pageCount,
      idioma: v.language,
      sinopse: v.description,
      url: v.infoLink,
    };
  });
  return { fonte: 'google_books', itens };
}

export async function openLibrary({ isbn, titulo }) {
  const q = isbn ? `isbn:${isbn}` : titulo;
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5&fields=title,author_name,isbn,publisher,first_publish_year,language,key`;
  const { dados, erro } = await buscaJSON(url);
  if (erro) return { fonte: 'open_library', erro };
  const itens = (dados.docs || []).map(d => ({
    fonte: 'open_library',
    id: d.key,
    isbn13: (d.isbn || []).find(i => i.length === 13),
    titulo: d.title,
    autor: (d.author_name || []).join(', '),
    editora: (d.publisher || [])[0],
    ano: d.first_publish_year,
    idioma: (d.language || [])[0],
    url: d.key ? `https://openlibrary.org${d.key}` : undefined,
  }));
  return { fonte: 'open_library', itens };
}

// Resolve um candidato contra as fontes externas.
export async function resolver({ isbn, titulo, autor }) {
  const fontes = await Promise.all([googleBooks({ isbn, titulo, autor }), openLibrary({ isbn, titulo })]);
  const resolucoes = [];
  const candidatos = [];
  for (const f of fontes) {
    if (f.erro) { resolucoes.push({ fonte: f.fonte, erro: f.erro, em: hoje() }); continue; }
    for (const it of (f.itens || [])) {
      const bateu = (isbn ? it.isbn13 === isbn : tituloBate(it.titulo, titulo)) && edicaoBrasileira(it.isbn13);
      if (bateu) {
        resolucoes.push({ fonte: f.fonte, id: it.id, isbn13: it.isbn13, titulo_bateu: true, em: hoje() });
        candidatos.push(it);
        break;
      }
    }
    if (!resolucoes.some(r => r.fonte === f.fonte)) resolucoes.push({ fonte: f.fonte, titulo_bateu: false, em: hoje() });
  }
  return { resolucoes, candidatos, provado: resolucoes.some(r => r.titulo_bateu) };
}

if (process.argv[1]?.endsWith('resolve.mjs')) {
  const arg = process.argv.slice(2).join(' ');
  if (!arg) { console.error('uso: node scripts/resolve.mjs <isbn|titulo>'); process.exit(2); }
  const isbn = isbn13Valido(arg.replace(/[^0-9]/g, '')) ? arg.replace(/[^0-9]/g, '') : undefined;
  const r = await resolver(isbn ? { isbn } : { titulo: arg });
  console.log(JSON.stringify(r, null, 2));
}

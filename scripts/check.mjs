// Disponibilidade. O furo mais provável do projeto é churn: marcar livro bom
// como esgotado porque uma leitura falhou. Então o contador mora em runtime/
// (fora do git) e o catálogo só muda na TRANSIÇÃO de estado, com evidência.
import { P, lerTodos, gravar, canonicalLivro, hoje, buscaJSON } from './lib.mjs';
import { googleBooks } from './resolve.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FALHAS_PRA_ESGOTAR = 3;   // três verificações válidas, sem sucesso no meio,
                                // vindas de três fontes diferentes
const JANELA = 12;              // observações guardadas por livro

const ARQ = join(P.runtime, 'availability.json');
mkdirSync(P.runtime, { recursive: true });
const estado = existsSync(ARQ) ? JSON.parse(readFileSync(ARQ, 'utf8')) : {};

async function sondaGoogle(l) {
  const r = await googleBooks({ isbn: l.isbn13 });
  if (r.erro) return { fonte: 'google_books', ok: null, nota: r.erro };   // null = inválida, não conta
  const achou = (r.itens || []).some(i => i.isbn13 === l.isbn13);
  return { fonte: 'google_books', ok: achou, nota: achou ? undefined : 'isbn não retornou' };
}

async function sondaOpenLibrary(l) {
  const { dados, erro } = await buscaJSON(`https://openlibrary.org/isbn/${l.isbn13}.json`);
  if (erro && !/HTTP 404/.test(erro)) return { fonte: 'open_library', ok: null, nota: erro };
  return { fonte: 'open_library', ok: !erro, nota: erro ? 'não catalogado' : undefined };
}

async function sondaLoja(l) {
  const alvo = (l.disponibilidade?.compra || [])[0];
  if (!alvo?.url) return { fonte: 'loja', ok: null, nota: 'sem link de compra' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(alvo.url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; livropraisso/1.0)' } });
    clearTimeout(t);
    if (r.status === 403 || r.status === 429) return { fonte: 'loja', ok: null, nota: `bloqueio ${r.status}` };
    return { fonte: 'loja', ok: r.ok, nota: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { fonte: 'loja', ok: null, nota: String(e.message || e) };   // rede caiu != livro sumiu
  }
}

const livros = lerTodos(P.livros);
let transicoes = 0;

for (const l of livros) {
  const sondas = await Promise.all([sondaGoogle(l), sondaOpenLibrary(l), sondaLoja(l)]);
  const reg = estado[l.isbn13] ||= { observacoes: [] };
  for (const s of sondas) {
    if (s.ok === null) continue;                    // sonda inválida não vira observação
    reg.observacoes.push({ fonte: s.fonte, ok: s.ok, em: hoje(), ...(s.nota ? { nota: s.nota } : {}) });
  }
  reg.observacoes = reg.observacoes.slice(-JANELA);
  reg.ultima_sonda = hoje();

  // três falhas consecutivas, de três fontes distintas, sem sucesso no meio
  const rev = [...reg.observacoes].reverse();
  const corte = rev.findIndex(o => o.ok);
  const falhasRecentes = corte === -1 ? rev : rev.slice(0, corte);
  const fontesFalhando = new Set(falhasRecentes.map(o => o.fonte));
  const deveEsgotar = falhasRecentes.length >= FALHAS_PRA_ESGOTAR && fontesFalhando.size >= FALHAS_PRA_ESGOTAR;

  const atual = l.disponibilidade?.estado || 'a_venda';
  const alvo = deveEsgotar ? 'esgotado' : (atual === 'esgotado' && falhasRecentes.length === 0 ? 'a_venda' : atual);

  if (alvo !== atual) {
    const { arquivo, ...limpo } = l;
    limpo.disponibilidade = {
      ...(l.disponibilidade || {}),
      estado: alvo,
      mudou_em: hoje(),
      evidencia: falhasRecentes.slice(0, FALHAS_PRA_ESGOTAR).map(o => `${o.fonte}: ${o.nota || 'falhou'} (${o.em})`),
    };
    if (alvo === 'a_venda') delete limpo.disponibilidade.evidencia;
    gravar(arquivo, canonicalLivro(limpo));
    transicoes++;
    console.log(`  TRANSIÇÃO ${l.isbn13} ${l.titulo}: ${atual} -> ${alvo}`);
  }
}

writeFileSync(ARQ, JSON.stringify(estado, null, 2) + '\n');
console.log(`sondados ${livros.length} livros · ${transicoes} transição(ões) de estado · contador em runtime/, fora do git`);

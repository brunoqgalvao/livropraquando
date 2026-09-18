// Disponibilidade. O furo mais provável do projeto é churn: marcar livro bom
// como esgotado porque uma leitura falhou. Então o contador mora em runtime/
// (fora do git) e o catálogo só muda na TRANSIÇÃO de estado, com evidência.
import { P, lerTodos, gravar, canonicalLivro, hoje, buscaJSON } from './lib.mjs';
import { googleBooks } from './resolve.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FALHAS_PRA_ESGOTAR = 3;   // três falhas de LOJA, em três dias distintos, sem sucesso
                                // de loja no meio. Catálogo (google_books, open_library)
                                // diz que o livro existe, não que tem estoque: o ISBN de
                                // livro esgotado continua resolvendo pra sempre. Por isso
                                // sucesso de catálogo não zera falha de loja.
const JANELA = 24;              // observações guardadas por livro

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

// A loja é a única sonda que enxerga estoque. Percorre `compra` em ordem e fica
// com a primeira resposta válida. 403/429/202/5xx são parede de bot ou servidor
// fora do ar (a Amazon devolve 500 em metade das leituras) — não contam.
// `esgotado_se` é um trecho do HTML que só aparece quando a loja marca
// indisponível. `sem_loja: true` = garimpo não achou loja nenhuma; conta como falha.
async function sondaLoja(l) {
  const d = l.disponibilidade || {};
  if (d.sem_loja) return { fonte: 'loja', ok: false, nota: 'nenhuma loja encontrada' };
  const alvos = (d.compra || []).filter(c => c.url);
  if (!alvos.length) return { fonte: 'loja', ok: null, nota: 'sem link de compra' };
  let ultima = 'sem resposta válida';
  for (const alvo of alvos) {
    try {
      const r = await fetch(alvo.url, { signal: AbortSignal.timeout(20000), redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; livropraisso/1.0)' } });
      if ([202, 403, 429].includes(r.status) || r.status >= 500) { ultima = `${alvo.loja}: bloqueio ${r.status}`; continue; }
      if (!r.ok) return { fonte: 'loja', ok: false, nota: `${alvo.loja}: HTTP ${r.status}` };
      if (alvo.esgotado_se && (await r.text()).includes(alvo.esgotado_se)) return { fonte: 'loja', ok: false, nota: `${alvo.loja}: marca indisponível` };
      return { fonte: 'loja', ok: true };
    } catch (e) {
      ultima = `${alvo.loja}: ${String(e.message || e)}`;   // rede caiu != livro sumiu
    }
  }
  return { fonte: 'loja', ok: null, nota: ultima };
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

  // uma leitura por dia: rodar o script duas vezes no mesmo dia não vira duas falhas
  const porDia = new Map();
  for (const o of reg.observacoes) if (o.fonte === 'loja') porDia.set(o.em, o);
  const rev = [...porDia.values()].reverse();
  const corte = rev.findIndex(o => o.ok);
  const falhasRecentes = corte === -1 ? rev : rev.slice(0, corte);
  const deveEsgotar = falhasRecentes.length >= FALHAS_PRA_ESGOTAR;

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

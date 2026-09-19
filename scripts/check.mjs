// Disponibilidade. O furo mais provável do projeto é churn: marcar livro bom
// como esgotado porque uma leitura falhou. Então o contador mora em runtime/
// (fora do git) e o catálogo só muda na TRANSIÇÃO de estado, com evidência.
import { P, lerTodos, gravar, canonicalLivro, hoje, dataBr, buscaJSON } from './lib.mjs';
import { decideEstado, poda, FALHAS_PRA_ESGOTAR } from './lib/estoque.mjs';
import { googleBooks } from './resolve.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// A decisão mora em lib/estoque.mjs, com teste: é a única regra do projeto que
// pode apagar um livro bom da tabela, e ela nunca disparou em produção. A poda
// do histórico mora lá pelo mesmo motivo — quem decide o que esquecer decide o
// que a regra enxerga.

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

// A loja é a única sonda que enxerga estoque — e por isso precisa enxergar de
// verdade. Até 18/09 isso era um fetch cru, e um fetch cru mente de dois jeitos:
// a Amazon devolve 403/500 pro robô (vira `null`, some do contador) e a loja SPA
// devolve 200 com o corpo vazio (virava `ok: true`). O resultado era a coluna
// "À venda" dizendo "sim" pros 14 livros porque ninguém tinha olhado.
//
// Agora quem olha é o `renderizar.mjs`, no Chromium da VM, e aqui a gente só lê
// o veredito dele. Se não rodou hoje, a resposta é `null`: não sei. "Não sei"
// nunca vira observação — é o que impede um dia de rede ruim de esgotar o acervo.
const RENDER = join(P.runtime, 'estoque-render.json');
const render = existsSync(RENDER) ? JSON.parse(readFileSync(RENDER, 'utf8')) : null;
const renderFresco = render?.em === hoje();
if (!renderFresco) console.log(`! runtime/estoque-render.json ${render ? `é de ${render.em}` : 'não existe'} — rode scripts/renderizar.mjs antes; hoje ninguém olhou a prateleira`);

function sondaLoja(l) {
  const d = l.disponibilidade || {};
  if (d.sem_loja) return { fonte: 'loja', ok: false, nota: 'nenhuma loja encontrada' };
  if (!(d.compra || []).some(c => c.url)) return { fonte: 'loja', ok: null, nota: 'sem link de compra' };
  if (!renderFresco) return { fonte: 'loja', ok: null, nota: 'sem leitura renderizada de hoje' };
  const r = render.livros?.[l.isbn13];
  if (!r || r.ok === null) return { fonte: 'loja', ok: null, nota: r ? (r.detalhe || []).join('; ') : 'livro não foi renderizado' };
  return { fonte: 'loja', ok: r.ok, nota: (r.detalhe || []).join('; ') };
}

const livros = lerTodos(P.livros);
let transicoes = 0;

for (const l of livros) {
  const sondas = [...await Promise.all([sondaGoogle(l), sondaOpenLibrary(l)]), sondaLoja(l)];
  const reg = estado[l.isbn13] ||= { observacoes: [] };
  for (const s of sondas) {
    if (s.ok === null) continue;                    // sonda inválida não vira observação
    reg.observacoes.push({ fonte: s.fonte, ok: s.ok, em: hoje(), ...(s.nota ? { nota: s.nota } : {}) });
  }
  reg.observacoes = poda(reg.observacoes);
  reg.ultima_sonda = hoje();

  const atual = l.disponibilidade?.estado || 'a_venda';
  const { estado: alvo, falhas: falhasRecentes } = decideEstado(reg.observacoes, atual);

  if (alvo !== atual) {
    const { arquivo, ...limpo } = l;
    limpo.disponibilidade = {
      ...(l.disponibilidade || {}),
      estado: alvo,
      mudou_em: hoje(),
      evidencia: falhasRecentes.slice(0, FALHAS_PRA_ESGOTAR).map(o => `${o.nota || 'não respondeu'} (${dataBr(o.em)})`),
    };
    if (alvo === 'a_venda') delete limpo.disponibilidade.evidencia;
    gravar(arquivo, canonicalLivro(limpo));
    transicoes++;
    console.log(`  TRANSIÇÃO ${l.isbn13} ${l.titulo}: ${atual} -> ${alvo}`);
  }
}

writeFileSync(ARQ, JSON.stringify(estado, null, 2) + '\n');
console.log(`sondados ${livros.length} livros · ${transicoes} transição(ões) de estado · contador em runtime/, fora do git`);

import assert from 'node:assert/strict';
import { decideEstado, falhasSeguidas, porDia, poda, jaSondouHoje, DIAS_GUARDADOS, vereditoEstoque, evidenciaEsgotado, evidenciaAtualizada } from './estoque.mjs';
import { dataBr } from '../lib.mjs';

let ok = 0, falhou = 0;
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhou++; console.log(`FALHOU: ${nome}\n  ${e.message}`); } };
const loja = (em, ok, nota = '') => ({ fonte: 'loja', ok, em, nota });
const cat = (em, fonte = 'google_books') => ({ fonte, ok: true, em });

t('três dias distintos sem estoque esgotam', () =>
  assert.equal(decideEstado([loja('2026-09-17', false), loja('2026-09-18', false), loja('2026-09-19', false)]).estado, 'esgotado'));

t('dois dias não esgotam', () =>
  assert.equal(decideEstado([loja('2026-09-18', false), loja('2026-09-19', false)]).estado, 'a_venda'));

// Sem isto, rodar o script três vezes numa tarde esgota o acervo.
t('três leituras no MESMO dia contam como uma', () =>
  assert.equal(decideEstado([loja('2026-09-19', false), loja('2026-09-19', false), loja('2026-09-19', false)]).estado, 'a_venda'));

t('sucesso no meio zera a contagem', () =>
  assert.equal(decideEstado([loja('2026-09-16', false), loja('2026-09-17', true), loja('2026-09-18', false), loja('2026-09-19', false)]).estado, 'a_venda'));

// O caso que motivou o arquivo: datas embaralhadas no availability.json.
t('ordem de chegada embaralhada não muda o veredito', () => {
  const emOrdem = [loja('2026-09-17', true), loja('2026-09-18', false), loja('2026-09-19', false)];
  const bagunçado = [loja('2026-09-18', false), loja('2026-09-19', false), loja('2026-09-17', true)];
  assert.equal(decideEstado(bagunçado).estado, decideEstado(emOrdem).estado);
  assert.equal(falhasSeguidas(bagunçado).length, 2);
});

t('sucesso mais novo chegando depois de falha antiga não vira falha recente', () => {
  // 09-19 teve estoque; 09-18 não. Chegaram fora de ordem.
  assert.equal(falhasSeguidas([loja('2026-09-19', true), loja('2026-09-18', false)]).length, 0);
});

t('catálogo não conta: só observação de loja entra', () =>
  assert.equal(porDia([{ fonte: 'google_books', ok: false, em: '2026-09-19' }]).length, 0));

t('esgotado volta pra à venda quando a loja responde que tem', () =>
  assert.equal(decideEstado([loja('2026-09-19', true)], 'esgotado').estado, 'a_venda'));

// "Não consegui olhar" não é notícia boa. Sonda inválida nem chega aqui, então
// um histórico vazio não pode ressuscitar o livro sozinho.
t('esgotado sem nenhuma leitura de loja continua esgotado', () =>
  assert.equal(decideEstado([], 'esgotado').estado, 'esgotado'));


// --- a poda da janela ---------------------------------------------------
// A regressão que motivou tudo: o histórico da VM em 19/09 tinha 21 observações
// (7 rodadas x 3 fontes) e teto de 24. A rodada de 20/09 somaria 3, e o
// `slice(-24)` cortaria as 3 mais antigas — entre elas a leitura de loja de
// 18/09, a primeira das três falhas. O livro esgotado não seria esgotado.
t('sonda de catálogo não empurra leitura de loja pra fora', () => {
  const dias = ['2026-09-18', '2026-09-19', '2026-09-20'];
  const historico = dias.flatMap(d => [cat(d), cat(d, 'open_library'), loja(d, false)]);
  const ruido = [];
  for (let i = 0; i < 40; i++) ruido.push(cat(`2026-09-${20 + (i % 5)}`), cat(`2026-09-${20 + (i % 5)}`, 'open_library'));
  const guardado = poda([...historico, ...ruido]);
  assert.deepEqual(porDia(guardado).map(o => o.em), dias);
  assert.equal(decideEstado(guardado).estado, 'esgotado');
});

t('poda guarda uma observação por fonte por dia', () => {
  const r = poda([loja('2026-09-19', false), loja('2026-09-19', false), cat('2026-09-19')]);
  assert.equal(r.length, 2);
  assert.deepEqual([...new Set(r.map(o => o.fonte))].sort(), ['google_books', 'loja']);
});

t('rodar dez vezes no mesmo dia não apaga dia nenhum', () => {
  let h = [loja('2026-09-17', false), loja('2026-09-18', false)];
  for (let i = 0; i < 10; i++) h = poda([...h, loja('2026-09-19', false), cat('2026-09-19'), cat('2026-09-19', 'open_library')]);
  assert.equal(porDia(h).length, 3);
  assert.equal(decideEstado(h).estado, 'esgotado');
});

t('poda corta o dia mais velho de cada fonte, não o do vizinho', () => {
  const h = [];
  for (let i = 1; i <= DIAS_GUARDADOS + 2; i++) h.push(loja(`2026-09-${String(i).padStart(2, '0')}`, false));
  h.push(cat('2026-08-01'));
  const r = poda(h);
  assert.equal(porDia(r).length, DIAS_GUARDADOS);
  assert.equal(porDia(r)[0].em, '2026-09-03');
  assert.ok(r.some(o => o.em === '2026-08-01'), 'a única leitura de catálogo sobreviveu');
});

t('poda preserva a ordem do arquivo', () => {
  const h = [loja('2026-09-19', false), cat('2026-09-18'), loja('2026-09-18', false)];
  assert.deepEqual(poda(h).map(o => `${o.fonte}:${o.em}`), h.map(o => `${o.fonte}:${o.em}`));
});

// --- não sondar de novo o que já se sabe hoje -----------------------------
t('fonte já lida hoje não precisa de outra chamada', () =>
  assert.equal(jaSondouHoje([cat('2026-09-19')], 'google_books', '2026-09-19'), true));

t('leitura de ontem não conta como hoje', () =>
  assert.equal(jaSondouHoje([cat('2026-09-18')], 'google_books', '2026-09-19'), false));

t('uma fonte lida não dispensa a outra', () => {
  const h = [cat('2026-09-19')];
  assert.equal(jaSondouHoje(h, 'open_library', '2026-09-19'), false);
});

t('histórico vazio nunca dispensa a sonda', () => {
  assert.equal(jaSondouHoje([], 'google_books', '2026-09-19'), false);
  assert.equal(jaSondouHoje(undefined, 'google_books', '2026-09-19'), false);
});


t('veredito: loja que nao respondeu aparece na evidencia, nao some', () => {
  const v = vereditoEstoque([
    { host: 'cirandacultural.com.br', estoque: { ok: false, nota: 'Produto Indisponível' } },
    { host: 'amazon.com.br', estoque: { ok: null, nota: 'Amazon não mostrou bloco de disponibilidade' } },
  ], '2026-09-20');
  assert.equal(v.ok, false);
  assert.equal(v.detalhe.length, 2);
  assert.match(v.detalhe[1], /amazon\.com\.br: não deu leitura/);
});

t('veredito: uma loja com estoque basta, mesmo com outra em silencio', () => {
  const v = vereditoEstoque([
    { host: 'amazon.com.br', estoque: { ok: true, nota: 'Em estoque' } },
    { host: 'editora.com.br', estoque: { ok: null, nota: 'página voltou vazia' } },
  ], '2026-09-20');
  assert.equal(v.ok, true);
});

t('veredito: so silencio e "nao sei", nunca esgotado', () => {
  const v = vereditoEstoque([
    { host: 'play.google.com', estoque: { ok: null, nota: 'nenhum sinal de estoque na página' } },
  ], '2026-09-20');
  assert.equal(v.ok, null);
});


t('evidencia de esgotado: as tres leituras mais recentes, na ordem em que sustentam o estado', () => {
  const falhas = falhasSeguidas([
    loja('2026-09-18', false, 'ciranda: Produto Indisponível'),
    loja('2026-09-19', false, 'ciranda: Produto Indisponível'),
    loja('2026-09-20', false, 'ciranda: Produto Indisponível'),
    loja('2026-09-21', false, 'ciranda: Produto Indisponível; amazon: Não disponível'),
  ]);
  const ev = evidenciaEsgotado(falhas, dataBr);
  assert.equal(ev.length, 3);
  assert.match(ev[0], /\(21\/09\/2026\)$/);
  assert.match(ev[0], /amazon/);
  assert.match(ev[2], /\(19\/09\/2026\)$/);
});

t('evidencia de esgotado: leitura sem nota nao vira linha vazia', () => {
  assert.deepEqual(
    evidenciaEsgotado(falhasSeguidas([loja('2026-09-19', false), loja('2026-09-20', false), loja('2026-09-21', false)]), dataBr),
    ['não respondeu (21/09/2026)', 'não respondeu (20/09/2026)', 'não respondeu (19/09/2026)'],
  );
});

t('reescreve a nota quando uma loja que estava calada passa a responder', () => {
  const falhas = falhasSeguidas([
    loja('2026-09-18', false, 'ciranda: Produto Indisponível'),
    loja('2026-09-19', false, 'ciranda: Produto Indisponível'),
    loja('2026-09-21', false, 'ciranda: Produto Indisponível; amazon: Não disponível'),
  ]);
  const antiga = ['ciranda: Produto Indisponível (19/09/2026)', 'ciranda: Produto Indisponível (18/09/2026)', 'ciranda: Produto Indisponível (17/09/2026)'];
  const nova = evidenciaAtualizada(antiga, falhas, dataBr);
  assert.ok(nova, 'devia reescrever');
  assert.match(nova[0], /amazon/);
});

t('nao reescreve a nota quando as leituras sao as mesmas', () => {
  const obs = [loja('2026-09-19', false, 'ciranda: Produto Indisponível'), loja('2026-09-20', false, 'ciranda: Produto Indisponível'), loja('2026-09-21', false, 'ciranda: Produto Indisponível')];
  const ev = evidenciaEsgotado(falhasSeguidas(obs), dataBr);
  assert.equal(evidenciaAtualizada(ev, falhasSeguidas(obs), dataBr), null);
});

t('nao encolhe a nota: com menos de 3 falhas na janela, a evidencia velha fica', () => {
  // A poda guarda 10 dias por fonte. Livro esgotado que para de receber leitura
  // de loja acaba com 2 falhas na janela — reescrever ali deixaria a página com
  // duas linhas embaixo de uma frase que promete três verificações.
  const antiga = ['ciranda: Produto Indisponível (20/09/2026)', 'ciranda: Produto Indisponível (19/09/2026)', 'ciranda: Produto Indisponível (18/09/2026)'];
  const falhas = falhasSeguidas([loja('2026-09-25', false, 'ciranda: Produto Indisponível'), loja('2026-09-26', false, 'ciranda: Produto Indisponível')]);
  assert.equal(evidenciaAtualizada(antiga, falhas, dataBr), null);
});

t('veredito: loja com estoque ganha de loja sem estoque — livro compravel nao e esgotado', () => {
  // O contrário esgotaria livro à venda quando uma das lojas da página some com
  // o produto, que é o caso comum (tiragem que acaba numa loja e não na outra).
  const v = vereditoEstoque([
    { host: 'cirandacultural.com.br', estoque: { ok: false, nota: 'Produto Indisponível' } },
    { host: 'amazon.com.br', estoque: { ok: true, nota: 'Em estoque' } },
  ], '2026-09-21');
  assert.equal(v.ok, true);
  assert.equal(v.detalhe.length, 2);
});

console.log(`${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

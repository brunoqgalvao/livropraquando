import assert from 'node:assert/strict';
import { decideEstado, falhasSeguidas, porDia } from './estoque.mjs';

let ok = 0, falhou = 0;
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhou++; console.log(`FALHOU: ${nome}\n  ${e.message}`); } };
const loja = (em, ok, nota = '') => ({ fonte: 'loja', ok, em, nota });

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

console.log(`${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

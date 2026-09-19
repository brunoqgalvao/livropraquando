import assert from 'node:assert/strict';
import { faixaSchema } from './schema.mjs';

let ok = 0, falhou = 0;
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhou++; console.log(`FALHOU: ${nome}\n  ${e.message}`); } };

t('intervalo fechado vira o traço do schema', () => {
  assert.equal(faixaSchema('4 a 10'), '4-10');
  assert.equal(faixaSchema('0 a 5'), '0-5');
});

// A regressão: "4-" se lê como "até 4 anos", o contrário do que a editora disse.
t('faixa aberta sai como a editora escreve, não com traço', () => {
  assert.equal(faixaSchema('4+'), '4+');
  assert.equal(faixaSchema('0+'), '0+');
});

t('sem idade não vira afirmação', () => {
  assert.equal(faixaSchema('nao_coberto'), undefined);
  assert.equal(faixaSchema(''), undefined);
  assert.equal(faixaSchema(undefined), undefined);
});

t('texto que não começa com número não vira faixa', () => {
  assert.equal(faixaSchema('livre'), undefined);
  assert.equal(faixaSchema('a partir de 4 anos'), undefined);
});

console.log(`${ok} passaram, ${falhou} falharam`);
if (falhou) process.exit(1);

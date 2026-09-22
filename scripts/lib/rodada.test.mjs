import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { devePular, mesclaEstoque, mesclaDiario, idadeRecusada } from './rodada.mjs';

let ok = 0, falhou = 0;
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhou++; console.log(`FALHOU: ${nome}\n  ${e.message}`); } };

t('sem arquivo do dia, roda', () =>
  assert.equal(devePular({ diaAnterior: null }), false));

t('passada completa de hoje já feita: pula', () =>
  assert.equal(devePular({ diaAnterior: { em: '2026-09-19', completo: true } }), true));

// O bug que teria matado a coleta das 08:35 de 19/09.
t('arquivo do dia de uma rodada PARCIAL não pula a completa', () =>
  assert.equal(devePular({ diaAnterior: { em: '2026-09-19', completo: false } }), false));

t('arquivo velho, de antes do campo `completo` existir, não pula', () =>
  assert.equal(devePular({ diaAnterior: { em: '2026-09-19' } }), false));

t('--forcar ignora a trava', () =>
  assert.equal(devePular({ diaAnterior: { em: '2026-09-19', completo: true }, forcar: true }), false));

t('olhar um livro só nunca é barrado', () =>
  assert.equal(devePular({ diaAnterior: { em: '2026-09-19', completo: true }, umLivroSo: true }), false));

// A mescla.
t('rodada de um livro preserva os outros do mesmo dia', () => {
  const r = mesclaEstoque({ em: '2026-09-19', livros: { A: { ok: true }, B: { ok: false } } }, { C: { ok: true } }, '2026-09-19');
  assert.deepEqual(Object.keys(r.livros).sort(), ['A', 'B', 'C']);
});

t('leitura nova do mesmo livro vence a antiga', () => {
  const r = mesclaEstoque({ em: '2026-09-19', livros: { A: { ok: true } } }, { A: { ok: false } }, '2026-09-19');
  assert.equal(r.livros.A.ok, false);
});

// Estoque velho não é estoque: a coluna tem que poder dizer "não conferi".
t('leitura de ontem não sobrevive à virada do dia', () => {
  const r = mesclaEstoque({ em: '2026-09-18', livros: { A: { ok: true }, B: { ok: true } } }, { A: { ok: true } }, '2026-09-19');
  assert.deepEqual(Object.keys(r.livros), ['A']);
  assert.equal(r.em, '2026-09-19');
});

// O diário do dia. `completo` é o que a trava lê; uma rodada de um livro só não
// pode apagá-lo, senão a passada das ~28 páginas roda duas vezes no mesmo dia.
t('rodada de um livro não apaga o `completo` da passada completa de hoje', () => {
  const r = mesclaDiario({ em: '2026-09-19', completo: true, avisos: [] }, { em: '2026-09-19', completo: false, avisos: [] }, ['A']);
  assert.equal(r.completo, true);
});

t('rodada de um livro preserva os avisos dos outros livros do dia', () => {
  const antes = { em: '2026-09-19', completo: true, avisos: [{ isbn13: 'A', aviso: 'a1' }, { isbn13: 'B', aviso: 'b1' }] };
  const r = mesclaDiario(antes, { em: '2026-09-19', completo: false, avisos: [{ isbn13: 'A', aviso: 'a2' }] }, ['A']);
  assert.deepEqual(r.avisos, [{ isbn13: 'B', aviso: 'b1' }, { isbn13: 'A', aviso: 'a2' }]);
});

t('passada completa reescreve o dia inteiro', () => {
  const antes = { em: '2026-09-19', completo: false, avisos: [{ isbn13: 'A', aviso: 'a1' }] };
  const r = mesclaDiario(antes, { em: '2026-09-19', completo: true, avisos: [{ isbn13: 'B', aviso: 'b1' }] }, []);
  assert.deepEqual(r, { em: '2026-09-19', completo: true, avisos: [{ isbn13: 'B', aviso: 'b1' }] });
});

t('diário de ontem não contamina o de hoje', () => {
  const r = mesclaDiario({ em: '2026-09-18', completo: true, avisos: [{ isbn13: 'A', aviso: 'a1' }] }, { em: '2026-09-19', completo: false, avisos: [] }, ['A']);
  assert.deepEqual(r, { em: '2026-09-19', completo: false, avisos: [] });
});

// A recusa é do valor, não do campo: ela existe pra que uma ficha que
// contradiz a própria sinopse da página não volte pro ar na passada seguinte.
const RECUSA = [{ valor: '0 a 3', fonte: 'amazon.com.br', motivo: 'contradiz a sinopse da mesma página', em: '2026-09-22' }];

t('idade recusada na mesma fonte nao volta', () =>
  assert.ok(idadeRecusada(RECUSA, { host: 'amazon.com.br', idade: { valor: '0 a 3' } })));

t('mesma faixa escrita com outro espacamento ainda e a recusada', () =>
  assert.ok(idadeRecusada(RECUSA, { host: 'amazon.com.br', idade: { valor: '0a3' } })));

t('loja corrigiu a ficha: faixa nova entra', () =>
  assert.equal(idadeRecusada(RECUSA, { host: 'amazon.com.br', idade: { valor: '4 a 10' } }), null));

t('mesma faixa vinda de outra fonte nao esta recusada', () =>
  assert.equal(idadeRecusada(RECUSA, { host: 'editoramelhoramentos.com.br', idade: { valor: '0 a 3' } }), null));

t('recusa sem fonte vale pra qualquer loja', () =>
  assert.ok(idadeRecusada([{ valor: '0 a 3' }], { host: 'qualquer.com.br', idade: { valor: '0 a 3' } })));

t('leitura sem idade nunca casa com recusa', () =>
  assert.equal(idadeRecusada(RECUSA, { host: 'amazon.com.br', idade: null }), null));

t('livro sem recusa nenhuma passa', () =>
  assert.equal(idadeRecusada(undefined, { host: 'amazon.com.br', idade: { valor: '0 a 3' } }), null));

// Em 20/09 eu colei dois testes no fim do ficha.test.mjs e eles ficaram DEPOIS
// do process.exit: nunca rodaram, e o runner seguiu dizendo "51 passaram". Um
// portão que mente assim é pior que não ter portão. Isso não dá pra pegar em
// runtime — o código depois do exit não executa —, então a checagem é no texto.
t('nenhum teste mora depois do process.exit', () => {
  const dir = new URL('.', import.meta.url).pathname;
  const arquivos = [...readdirSync(dir).filter(f => f.endsWith('.test.mjs')).map(f => join(dir, f)),
                    join(dir, '..', 'auditoria.test.mjs')];
  for (const f of arquivos) {
    const txt = readFileSync(f, 'utf8');
    const m = txt.match(/^process\.exit\(/m);   // o de verdade, não o citado em comentário
    if (!m) continue;
    const depois = txt.slice(m.index);
    assert.ok(!/^t\(/m.test(depois), `${basename(f)}: tem t(...) depois do process.exit — esses testes não rodam`);
  }
});

console.log(`${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

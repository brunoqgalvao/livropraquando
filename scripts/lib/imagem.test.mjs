import assert from 'node:assert/strict';
import { dimensao, extensao, mostrarInteira } from './imagem.mjs';

let ok = 0, falhou = 0;
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhou++; console.log(`FALHOU: ${nome}\n  ${e.message}`); } };

// Os números são os das capas que estão no ar em 23/09.
t('capa quadrada aparece inteira', () => assert.equal(mostrarInteira(600 / 600), true));
t('lombada deitada aparece inteira', () => assert.equal(mostrarInteira(300 / 150), true));
t('quase quadrada por pouco mais larga aparece inteira', () => assert.equal(mostrarInteira(600 / 590), true));

// O outro lado da linha. Mudar isto é mudar a cara do site em 7 capas, então
// tem que doer um teste.
t('capa retrato continua recortando', () => assert.equal(mostrarInteira(389 / 600), false));
t('quase quadrada mais alta que larga continua recortando', () => assert.equal(mostrarInteira(593 / 600), false));

// Sem capa medida o build passa 0 ou undefined; recortar é o padrão antigo e
// não estraga nada, mas `undefined >= 1` já foi um jeito de virar NaN silencioso.
t('proporção que não deu pra medir não vira exceção', () => {
  assert.equal(mostrarInteira(undefined), false);
  assert.equal(mostrarInteira(NaN), false);
  assert.equal(mostrarInteira(0), false);
});

t('dimensao lê PNG', () => {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(600, 16);
  buf.writeUInt32BE(400, 20);
  assert.deepEqual(dimensao(buf), { w: 600, h: 400, tipo: 'png' });
});

t('dimensao devolve null pra lixo', () => assert.equal(dimensao(Buffer.from('nao sou imagem')), null));

t('extensao cai em jpg quando não conhece o tipo', () => {
  assert.equal(extensao('png'), 'png');
  assert.equal(extensao('jpeg'), 'jpg');
  assert.equal(extensao('avif'), 'jpg');
});

console.log(`${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

import assert from 'node:assert/strict';
import { dimensao, extensao, mostrarInteira, ahash, distancia, mesmaFigura } from './imagem.mjs';

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

// --- impressão perceptual ------------------------------------------------
// O caso real: o mesmo "PRODUTO SEM IMAGEM" em 600x600 e em 500x500. A escala
// muda os bytes e não muda a figura — era isso que a lista de sha1 não via.
const claro = (n) => Array.from({ length: 64 }, (_, i) => (i % 8 < 4 ? 20 : 220) + (n || 0));

t('ahash não depende de escala: ruído pequeno não muda os bits', () =>
  assert.equal(ahash(claro(0)), ahash(claro(3))));

t('ahash de figura diferente dá hash diferente', () => {
  const outra = Array.from({ length: 64 }, (_, i) => (i < 32 ? 10 : 240));
  assert.notEqual(ahash(claro(0)), ahash(outra));
  assert.ok(distancia(ahash(claro(0)), ahash(outra)) > 4);
});

t('ahash de imagem chapada não mente: sem contraste, nenhum bit aceso', () =>
  assert.equal(ahash(new Array(64).fill(128)), '0'.repeat(16)));

t('ahash recusa entrada que não é 8x8', () => {
  assert.equal(ahash([1, 2, 3]), null);
  assert.equal(ahash(null), null);
});

t('distancia sem impressão é infinita, não zero', () => {
  assert.equal(distancia(null, 'ffff'), Infinity);
  assert.equal(distancia('ff', 'ffff'), Infinity);   // senão comparar coisa truncada viraria "igual"
});

t('mesmaFigura só na vizinhança', () => {
  assert.equal(mesmaFigura('f0f0f0f0f0f0f0f0', 'f0f0f0f0f0f0f0f0'), true);
  assert.equal(mesmaFigura('f0f0f0f0f0f0f0f0', 'f0f0f0f0f0f0f0f1'), true);
  assert.equal(mesmaFigura('f0f0f0f0f0f0f0f0', '0f0f0f0f0f0f0f0f'), false);
});

// Os três números que decidiram o limite, medidos em 24/09 e presos aqui pra
// que mexer neles doa um teste. O primeiro é o mesmo placeholder da Amazon em
// 342px contra a impressão guardada da versão de 600px; o segundo é a capa
// real mais parecida com ele ("Gire o disco!"); o terceiro é o par de capas
// diferentes mais parecido entre as 20 que estavam no ar.
t('o limite cabe entre a mesma figura reescalada e duas capas diferentes', () => {
  assert.equal(distancia('ffc3c1e1c3e7c7ff', 'ffc3c3c1dbe7c7ff'), 4);   // placeholder em outro tamanho
  assert.equal(distancia('c3c3c3c3c3c3c3e3', 'ffc3c3c1dbe7c7ff'), 13);  // capa real x placeholder
  assert.equal(distancia('ffffff7f03080a03', 'fffffffd09000000'), 9);   // duas capas reais
  assert.equal(mesmaFigura('ffc3c1e1c3e7c7ff', 'ffc3c3c1dbe7c7ff'), true);
  assert.equal(mesmaFigura('c3c3c3c3c3c3c3e3', 'ffc3c3c1dbe7c7ff'), false);
  assert.equal(mesmaFigura('ffffff7f03080a03', 'fffffffd09000000'), false);
});

console.log(`${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

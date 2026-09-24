// Dimensão de imagem lida do cabeçalho, sem dependência. Serve pra uma coisa só:
// capa de livro é retrato ou quadrado; banner de loja é deitado. É o filtro mais
// barato contra salvar o cabeçalho da promoção no lugar do livro.
export function dimensao(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {          // PNG
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), tipo: 'png' };
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const f = buf.toString('ascii', 12, 16);
    if (f === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1, tipo: 'webp' };
    if (f === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, tipo: 'webp' };
    if (f === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, tipo: 'webp' };
    }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {           // JPEG
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), tipo: 'jpeg' };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

export const extensao = (tipo) => ({ png: 'png', webp: 'webp', jpeg: 'jpg' }[tipo] || 'jpg');

// O slot da capa é 2:3 e recorta pelos lados. A regra antiga só tirava do
// recorte a capa DEITADA (> 1.15), porque o caso que a motivou era uma lombada
// 300x150. Capa QUADRADA ficou de fora da regra por esquecimento, não por
// escolha: num slot 2:3 ela perde 33% da largura, um sexto de cada lado, e é
// largura o que carrega o título. Em 23/09 o "Tempo de escola" saiu na página
// como "empo de escol" — eu recortei o arquivo na mão pra confirmar antes de
// mexer. O "Bibo na escola" estava assim desde 18/09.
//
// A linha é 1.0: quadrada ou mais larga não cabe. Capa mais alta que larga
// continua recortando — quanto de recorte a 0.86–0.99 aguenta é outra conversa,
// e essa é de gosto, não de defeito.
export const mostrarInteira = (proporcao) => Number.isFinite(proporcao) && proporcao >= 1;

// --- impressão perceptual (aHash 8x8) -----------------------------------
// Existe porque sha1 não serve pra reconhecer placeholder de loja. Em 24/09 a
// Amazon ofereceu "PRODUTO SEM IMAGEM por enquanto!" como capa de "Quando meu
// irmãozinho nasceu" — e ofereceu DUAS vezes, sob ids de imagem diferentes
// (41yAwYt2Y3L e 31latUS2UbL) e em tamanhos diferentes. Bytes diferentes, sha1
// diferente, mesma figura: a lista de sha1 recusados não pegava a segunda, e o
// olho humano seria chamado de novo amanhã pela mesma imagem.
//
// aHash é o mais simples que resolve: 8x8 em tons de cinza, cada bit diz se o
// pixel é mais claro que a média. Escala não muda o resultado, que é
// exatamente o que a lista de sha1 não dava.
export function ahash(cinzas) {
  if (!Array.isArray(cinzas) || cinzas.length !== 64) return null;
  const media = cinzas.reduce((a, b) => a + b, 0) / 64;
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) if (cinzas[i + j] > media) nibble |= 1 << (3 - j);
    hex += nibble.toString(16);
  }
  return hex;
}

// Distância de Hamming entre duas impressões.
export function distancia(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

// O limite é medido, não chutado. Nas 20 capas que estavam no ar em 24/09:
// a menor distância entre duas capas DIFERENTES é 9, e a capa real mais
// parecida com o placeholder da Amazon está a 13. Do outro lado, o mesmo
// placeholder em três tamanhos (600, 500 e 342 px) variou até 4. Então 6 cabe
// folgado no meio: pega a mesma figura reescalada e ainda fica 3 bits abaixo
// de qualquer par de capas de verdade.
export const MESMA_FIGURA = 6;
export const mesmaFigura = (a, b) => distancia(a, b) <= MESMA_FIGURA;

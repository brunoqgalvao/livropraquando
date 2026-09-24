import assert from 'node:assert/strict';
import { provaDaFicha } from './prova.mjs';
import { tituloBate, edicaoBrasileira, casaEdicao } from '../resolve.mjs';

let ok = 0, falhou = 0;
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhou++; console.log(`FALHOU: ${nome}\n  ${e.message}`); } };

const corpo = 'x'.repeat(400);
const prova = (leitura, isbn13 = '9788574126234', titulo = 'A Irmã do Gildo') =>
  provaDaFicha({ isbn13, titulo, leitura, tituloBate, brasileira: edicaoBrasileira });

const pagina = (extra = {}) => ({
  host: 'amazon.com.br',
  url: 'https://www.amazon.com.br/dp/8574126233',
  titulo_pagina: 'A Irmã do Gildo : Rando, Silvana: Amazon.com.br: Livros',
  isbn_pagina: '9788574126234',
  texto: corpo,
  ...extra,
});

// O caso que abriu a regra: a Amazon vende, imprime o ISBN na ficha e o título
// bate. É isso que o Google Books não tem e a loja tem.
t('ficha com ISBN e título batendo prova', () => {
  const r = prova(pagina());
  assert.equal(r.prova, true);
  assert.equal(r.isbn13, '9788574126234');
  assert.equal(r.fonte, 'ficha_loja');
});

// O ponto todo da regra. Sem ISBN a página pode ser vitrine, busca ou coleção:
// "vi um título parecido num site" não é prova.
t('página sem ISBN não prova', () => {
  const r = prova(pagina({ isbn_pagina: null }));
  assert.equal(r.prova, false);
  assert.match(r.motivo, /não imprime ISBN/);
});

// A armadilha do "Tempo de escola": impressa e digital diferem num dígito.
t('ISBN diferente na página não prova, e diz qual é', () => {
  const r = prova(pagina({ isbn_pagina: '978-65-5384-357-8' }));
  assert.equal(r.prova, false);
  assert.equal(r.isbn_pagina, '9786553843578');
});

t('título que não bate não prova', () => {
  const r = prova(pagina({ titulo_pagina: 'O Irmão do Gildo Vai à Praia : Outro Autor' }), '9788574126234', 'Manual de teologia sistemática');
  assert.equal(r.prova, false);
  assert.match(r.motivo, /título da página não bate/);
});

// Bloqueio de bot parece ausência de livro — o mesmo erro que a regra dos 3
// esgotados evita na disponibilidade.
t('loja que barrou o navegador não prova (e não diz que o livro não existe)', () => {
  const r = prova(pagina({ titulo_pagina: '403 Forbidden', isbn_pagina: null }));
  assert.equal(r.prova, false);
  assert.match(r.motivo, /barrou o navegador/);
});

t('página vazia não prova', () => {
  const r = prova(pagina({ texto: 'carregando...' }));
  assert.equal(r.prova, false);
  assert.match(r.motivo, /voltou vazia/);
});

t('erro de rede não prova', () => {
  const r = prova(pagina({ erro: 'CDP não respondeu' }));
  assert.equal(r.prova, false);
  assert.match(r.motivo, /não consegui abrir/);
});

// A trava de edição brasileira continua valendo: livro só de Portugal não
// serve pra quem compra aqui, e a régua nova não é porta dos fundos pra ela.
t('edição portuguesa não prova nem com ficha perfeita', () => {
  const r = prova(pagina({ isbn_pagina: '9789720047762' }), '9789720047762', 'A Irmã do Gildo');
  assert.equal(r.prova, false);
  assert.match(r.motivo, /edição brasileira/);
});

// --- casaEdicao: o que conta como "este registro é o meu livro" -----------
// A consulta por título existe porque o índice de ISBN do Google Books tem
// buraco: `isbn:9788530500269` devolve 0 e `intitle:` devolve o mesmo volume,
// com esse ISBN no registro. Com ISBN na mão, quem decide é o ISBN — o
// catálogo escreve "QUANDO MEU IRMAOZINHO NASCEU", sem acento e em caixa alta.
t('com ISBN, o ISBN decide e o título não atrapalha', () => {
  const it = { isbn13: '9788530500269', titulo: 'QUANDO MEU IRMAOZINHO NASCEU' };
  assert.equal(casaEdicao(it, { isbn: '9788530500269', titulo: 'Quando meu irmãozinho nasceu' }), true);
});

t('com ISBN, registro de outra edição não passa', () =>
  assert.equal(casaEdicao({ isbn13: '9788530500252', titulo: 'Quando meu irmãozinho nasceu' },
    { isbn: '9788530500269', titulo: 'Quando meu irmãozinho nasceu' }), false));

t('sem ISBN, o título decide', () => {
  assert.equal(casaEdicao({ isbn13: '9788574126234', titulo: 'A irmã do Gildo' }, { titulo: 'A Irmã do Gildo' }), true);
  assert.equal(casaEdicao({ isbn13: '9788574126234', titulo: 'A IRMAZINHA' }, { titulo: 'A irmã do Gildo' }), false);
});

// A trava de país não é negociável em caminho nenhum: foi ela que manteve
// edição de Portugal fora da página desde o dia 0.
t('edição portuguesa não casa nem com ISBN igual', () =>
  assert.equal(casaEdicao({ isbn13: '9789720047762', titulo: 'A irmã do Gildo' },
    { isbn: '9789720047762', titulo: 'A irmã do Gildo' }), false));

console.log(`${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

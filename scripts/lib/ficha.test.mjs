// Casos tirados de páginas reais (colhidas em 18/09/2026). Se um deles quebrar,
// alguma loja mudou o layout e a extração virou chute.
import { idadeDaEditora, idadeDaAmazon, faixaDoTexto, estoqueDaPagina } from './ficha.mjs';
import assert from 'node:assert/strict';

let ok = 0, falhou = 0;
const t = (nome, f) => { try { f(); ok++; } catch (e) { falhou++; console.log(`FALHOU  ${nome}\n        ${e.message}`); } };

t('faixa "4 - 10 anos"', () => assert.equal(faixaDoTexto('4 - 10 anos'), '4 a 10'));
t('faixa "12 anos e acima"', () => assert.equal(faixaDoTexto('12 anos e acima'), '12+'));
t('faixa "+ 4 anos"', () => assert.equal(faixaDoTexto('+ 4 anos'), '4+'));
t('faixa vazia', () => assert.equal(faixaDoTexto('Livro capa dura'), null));

t('Cia das Letras: a partir de 0 ano', () =>
  assert.equal(idadeDaEditora('Além de Bibo na escola, conheça também a nova edição. Indicado para leitores a partir de 0 ano. FICHA TÉCNICA Páginas: 32').valor, '0+'));

t('Aletria: pré-leitores', () =>
  assert.equal(idadeDaEditora('Indicado para pré-leitores (a partir de 0 anos) Título original: El Monstruo').valor, '0+'));

t('Ciranda: Faixa Etária: + 4 anos', () =>
  assert.equal(idadeDaEditora('Linha Editorial: Ciranda na Escola Faixa Etária: + 4 anos Assuntos (tags): Família').valor, '4+'));

t('indicação dupla não vira faixa', () => {
  const r = idadeDaEditora('Indicado para bebês e crianças pequenas (leitura compartilhada); e a partir de 5 anos (leitura independente)');
  assert.equal(r.ambigua, true);
  assert.equal(r.valor, undefined);
});

t('sinopse solta não vira idade', () =>
  assert.equal(idadeDaEditora('A autora escreveu o livro a partir de 3 anos de conversas com professores.'), null));

t('menu de loja não vira idade', () =>
  assert.equal(idadeDaEditora('COMPRE POR CATEGORIAS FICÇÃO INFANTIL JOVEM PRÉ-VENDA AUDIOBOOKS Frete grátis para todo o Brasil'), null));

t('Amazon: metadado da editora', () => {
  const r = idadeDaAmazon({ ficha: ['Editora ‏ : ‎ Paginas', 'Idade de leitura ‏ : ‎ 4 - 10 anos'] });
  assert.equal(r.valor, '4 a 10');
  assert.equal(r.deLeitores, false);
});

t('Amazon: enquete de comprador vem marcada', () => {
  const r = idadeDaAmazon({ ficha: ['Idade de leitura ‏ : ‎ Idade sugerida pelo cliente: 2 - 6 anos'] });
  assert.equal(r.valor, '2 a 6');
  assert.equal(r.deLeitores, true);
});

t('Amazon em estoque', () =>
  assert.equal(estoqueDaPagina({ host: 'amazon.com.br', amazon: { estoque: 'Somente 5 em estoque.' } }).ok, true));

t('Amazon sem bloco = não sei', () =>
  assert.equal(estoqueDaPagina({ host: 'amazon.com.br', amazon: {} }).ok, null));

t('Ciranda: indisponível ganha do carrinho', () =>
  assert.equal(estoqueDaPagina({ host: 'cirandacultural.com.br', titulo: 'Livro Mas e eu?',
    texto: 'R$ 34,90 Quantidade - + Adicionar ao carrinho Produto Indisponível Consulte frete e prazo de entrega. '.repeat(6) }).ok, false));

t('403 não é esgotado', () =>
  assert.equal(estoqueDaPagina({ host: 'editoratexugo.com.br', titulo: '403 Forbidden', texto: '' }).ok, null));

t('página vazia não é esgotado', () =>
  assert.equal(estoqueDaPagina({ host: 'editorapeiropolis.com.br', titulo: 'Peirópolis', texto: '' }).ok, null));

t('sem sinal nenhum = não sei', () =>
  assert.equal(estoqueDaPagina({ host: 'aletria.com.br', titulo: 'O monstro das cores',
    texto: 'Título original: El Monstruo de Colores va al cole. Autora: Anna Llenas. '.repeat(8) }).ok, null));


t('"12 anos e acima" e capturado inteiro, nao truncado em "12 anos"', () =>
  assert.equal(idadeDaEditora('Idade de leitura : 12 anos e acima Numero de paginas 24 paginas').valor, '12+'));

t('Amazon "12 anos e acima"', () =>
  assert.equal(idadeDaAmazon({ ficha: ['Idade de leitura \u200f : \u200e 12 anos e acima'] }).valor, '12+'));


t('Amazon: "Estimativa de envio" e livro comprável', () =>
  assert.equal(estoqueDaPagina({ host: 'amazon.com.br', amazon: { estoque: 'Estimativa de envio de 2 a 3 dias' } }).ok, true));

t('Amazon: fora de estoque ganha, mesmo com prazo de envio na mesma frase', () =>
  assert.equal(estoqueDaPagina({ host: 'amazon.com.br', amazon: { estoque: 'Temporariamente fora de estoque. Estimativa de envio de 2 a 3 dias.' } }).ok, false));

console.log(`${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

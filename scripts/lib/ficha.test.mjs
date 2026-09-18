// Casos tirados de páginas reais (colhidas em 18/09/2026). Se um deles quebrar,
// alguma loja mudou o layout e a extração virou chute.
import { idadeDaEditora, idadeDaAmazon, faixaDoTexto, estoqueDaPagina, valorBr, precoDaLoja, paginasDaFicha, ilustradorDaFicha } from './ficha.mjs';
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


// --- preço: casos reais de 18/09, todos da mesma pagina ------------------
const CIA = 'BIBO NA ESCOLA Autor/Ilustrador: Silvana Rando Livro fisico R$ 67,90 / A vista Comprar agora '
  + 'COMPRADOS JUNTOS Bibo na escola R$ 67,90 Bibo no sitio R$ 67,90 Bibo no mercado R$ 67,90 PRECO TOTAL DE R$ 203,70 '
  + 'O CONTINENTE Erico Verissimo R$ 107,90';

t('valorBr le "R$ 67,90"', () => assert.equal(valorBr('R$ 67,90'), 67.9));
t('valorBr le preco quebrado em elementos', () => assert.equal(valorBr('R$ 47 , 90'), 47.9));
t('valorBr le milhar', () => assert.equal(valorBr('R$ 1.203,70'), 1203.7));
t('valorBr recusa R$ 0,00 do Kindle', () => assert.equal(valorBr('Kindle R$ 0,00'), null));

t('Cia das Letras: pega o livro, nao o combo de tres volumes', () => {
  const r = precoDaLoja({ host: 'companhiadasletras.com.br', texto: CIA });
  assert.equal(r.valor, 67.9);
  assert.equal(r.formato, 'impresso');
});

t('Amazon: buy box, nao Kindle nem marketplace nem parcela', () => {
  const r = precoDaLoja({ host: 'amazon.com.br', amazon: { core: 'R$ 47,90\nR$47\n,\n90 ' },
    texto: 'Kindle R$ 0,00 ou R$ 7,90 para comprar Novo a partir de R$ 36,90 Em ate 2x R$ 23,95' });
  assert.equal(r.valor, 47.9);
});

t('schema.org ganha da leitura de texto', () => {
  const r = precoDaLoja({ host: 'cirandacultural.com.br',
    jsonld: [{ '@type': 'Product', offers: { '@type': 'Offer', price: '31.41', priceCurrency: 'BRL' } }],
    texto: 'De R$ 34,90 por R$ 31,41' });
  assert.equal(r.valor, 31.41);
});

t('microdado da Aletria', () => {
  const r = precoDaLoja({ host: 'aletria.com.br', micro: { price: '88.90', priceCurrency: 'BRL' }, texto: '' });
  assert.equal(r.valor, 88.9);
});

t('moeda estrangeira nao entra', () =>
  assert.equal(precoDaLoja({ host: 'x.com', jsonld: [{ offers: { price: '9.99', priceCurrency: 'USD' } }], texto: '' }), null));

t('loja sem ancora nenhuma nao devolve preco', () =>
  assert.equal(precoDaLoja({ host: 'coletivoleitor.com.br', texto: 'Comprar Agora Ler na Integra' }), null));

t('paginas da ficha da Amazon', () =>
  assert.equal(paginasDaFicha({ amazon: { ficha: ['Numero de paginas \u200f : \u200e 40 paginas'] } }).valor, 40));

t('paginas da ficha da editora', () =>
  assert.equal(paginasDaFicha({ texto: 'FICHA TECNICA Paginas: 32 Formato: 21.10 X 21.10 cm' }).valor, 32));

t('paginas: sem ficha, nada', () =>
  assert.equal(paginasDaFicha({ texto: 'Um livro sobre 32 maneiras de brincar' }), null));


// --- ilustrador: strings reais das fichas de 18/09 -----------------------
t('Ciranda: corta no rotulo seguinte, nao engole "Idioma"', () =>
  assert.equal(ilustradorDaFicha({ texto: 'Autor: Emily Johnson Ilustrador: Spike Maguire Idioma Portugues Paginas 24' }).valor, 'Spike Maguire'));

t('Cia das Letras: "Ilustra\u00e7\u00e3o: X" seguido de "Tradu\u00e7\u00e3o:" (string real da p\u00e1gina)', () =>
  assert.equal(ilustradorDaFicha({ texto: 'ISBN: 978-65-565-4072-6 Selo: Brinque-Book Capa: Silvana Rando Ilustra\u00e7\u00e3o: Silvana Rando Tradu\u00e7\u00e3o:' }).valor, 'Silvana Rando'));

t('mesma ficha sem acento (loja escreve dos dois jeitos)', () =>
  assert.equal(ilustradorDaFicha({ texto: 'Capa: Silvana Rando Ilustracao: Silvana Rando Traducao:' }).valor, 'Silvana Rando'));

t('Amazon: "(Ilustrador)" no byline', () =>
  assert.equal(ilustradorDaFicha({ amazon: { byline: 'por Danielle Graf (Autor), Gunther Jakobs (Ilustrador) Formato: Capa comum' } }).valor, 'Gunther Jakobs'));

t('Amazon so com "(Autor)" nao inventa ilustrador', () =>
  assert.equal(ilustradorDaFicha({ amazon: { byline: 'por Emily Johnson (Autor) Formato: Capa comum' }, texto: 'Com ilustracoes delicadas e um texto curto' }), null));

t('mencao em prosa nao e credito', () =>
  assert.equal(ilustradorDaFicha({ texto: 'Com ilustracoes delicadas e um texto escrito com palavras-chave, este livro' }), null));

t('rotulo vazio nao vira nome', () =>
  assert.equal(ilustradorDaFicha({ texto: 'Ilustracao: Traducao: Capa: Fulano' }), null));

console.log(`${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

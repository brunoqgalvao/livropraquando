// O detector de frase prescritiva é a única coisa que separa este site de um
// panfleto com claim terapêutico. Um detector que não pega nada e um catálogo
// limpo produzem exatamente a mesma saída — então ele precisa provar que morde.
import assert from 'node:assert/strict';
import { PRESCRITIVO, citada } from './auditoria.mjs';

let ok = 0, falhou = 0;
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhou++; console.log(`FALHOU: ${nome}\n  ${e.message}`); } };
const prescritiva = (s) => PRESCRITIVO.some(re => re.test(s));

// O exemplo que o próprio SPEC dá como proibido.
for (const frase of [
  'ajuda a criança a processar a perda',
  'Ajudam os pequenos a entender a chegada do irmão',
  'prepara a criança para o primeiro dia',
  'ensina a criança a dividir os brinquedos',
  'trabalha a adaptação escolar de forma lúdica',
  'ideal para superar o medo da escola',
  'acalma a ansiedade da separação',
  'todo pai deve ler antes da chegada do bebê',
]) t(`pega: ${frase.slice(0, 40)}`, () => assert.equal(prescritiva(frase), true));

// Descrição é permitida pelo SPEC: "trata de X pelo ponto de vista de Y".
for (const frase of [
  'Trata da chegada de um irmão pelo ponto de vista do mais velho.',
  'A editora não indica faixa etária.',
  'O livro mostra a rotina de uma família que acabou de ficar maior.',
  'Narrado em primeira pessoa por uma criança de cinco anos.',
  'A sinopse não diz se o livro chega ao nascimento.',
]) t(`libera: ${frase.slice(0, 40)}`, () => assert.equal(prescritiva(frase), false));

// Estes testes conferem o MOTIVO, não só o ok. A primeira versão checava só
// `ok: true`, e por isso não percebeu que o caso do corte "[…]" passava pelo
// caminho do prefixo em vez do caminho da elisão — o tratamento de elisão era
// código morto e o teste dizia que estava tudo bem.
t('citação literal confere como literal', () =>
  assert.equal(citada('a escola é bem legal', 'Calma! A  escola   é bem legal, e lá te esperam').motivo, 'literal'));

t('corte […] confere pelas partes, não pelo prefixo', () =>
  assert.equal(citada(
    'Escola... o que será? Uma nuvem mágica em que se pode voar? […] o monstro vai viver o seu primeiro dia de aula',
    'Escola... o que será? Uma nuvem mágica em que se pode voar? Calma, Monstro das Cores! Nessa nova aventura, o monstro vai viver o seu primeiro dia de aula e descobrir'
  ).motivo, 'em partes'));

// O Google Books serve a ficha de "Nós agora somos quatro" com o encoding
// quebrado: "fam?lia", "ningu?m". A citação guardada está certa.
t('acento corrompido pela fonte ainda confere', () =>
  assert.equal(citada(
    'Tudo muda na vida desta família com a chegada de um novo pequenininho',
    '40 páginas Tudo muda na vida desta fam?lia com a chegada de um novo pequenininho. De repente'
  ).motivo, 'literal'));

// A tolerância é só no acento. Trocar uma palavra tem que reprovar, senão o
// verificador aprova qualquer coisa.
t('palavra trocada no meio reprova', () =>
  assert.equal(citada(
    'Tudo muda na vida desta família com a chegada de um novo pequenininho',
    'Tudo muda na vida desta escola com a chegada de um novo pequenininho'
  ).ok, false));

t('citação que não está na página reprova', () =>
  assert.equal(citada('este livro ensina a criança a dividir os brinquedos com o irmão', 'Sinopse: a chegada do bebê muda a casa inteira.').ok, false));

t('página truncada depois da citação: passa, mas dizendo que é fraco', () =>
  assert.equal(citada(
    'Tudo muda na vida desta família com a chegada de um novo pequenininho e a casa vira uma festa sem hora pra acabar',
    'Tudo muda na vida desta família com a chegada de um novo pequenininho...'
  ).motivo, 'só o início confere'));

// A Amazon separa os campos da ficha com marcas bidi invisíveis. A citação
// guardada é exatamente o que a pessoa lê; a página é que tem lixo no meio.
t('marca invisível da Amazon no meio da ficha ainda confere', () =>
  assert.equal(citada(
    'Idade de leitura : 3 - 5 anos',
    'Editora \u200f : \u200e Global Idade de leitura \u200f : \u200e 3 - 5 anos Dimens\u00f5es'
  ).motivo, 'literal'));

// Pontuação e traço podem mudar sem mudar o que está escrito.
t('pontuacao diferente na pagina ainda confere', () =>
  assert.equal(citada(
    'Indicado para pré-leitores (a partir de 0 anos). Título original: El Monstruo de Colores va al cole.',
    'Indicado para pré leitores — a partir de 0 anos — Título original El Monstruo de Colores va al cole'
  ).motivo, 'literal'));

// Mas letra faltando continua reprovando: a tolerância é no acento, não no texto.
t('palavra faltando no meio reprova', () =>
  assert.equal(citada(
    'Indicado para pré-leitores a partir de 0 anos, Título original El Monstruo de Colores',
    'Indicado para pré-leitores a partir de 0 anos, El Monstruo de Colores'
  ).ok, false));

// O diagnóstico tem que apontar onde descola, senão a auditoria vira um "não"
// sem endereço. Foi assim que apareceu que a sinopse da Global escreve
// "brincandeiras" e a citação guardada tinha o typo corrigido em silêncio.
t('diz a palavra onde a citação descola da página', () =>
  assert.match(citada(
    'As brincadeiras fora do ritmo, as atenções voltadas ao bebê',
    'convivência. As brincandeiras fora do ritmo, as atenções voltadas ao bebê e diferença'
  ).motivo, /descola em .*brincadeiras/));

t('trecho vazio reprova', () => assert.equal(citada('', 'qualquer coisa').ok, false));

console.log(`${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

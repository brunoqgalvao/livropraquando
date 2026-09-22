import assert from 'node:assert/strict';
import { faixaSchema, descricaoLivro, descricaoCurta } from './schema.mjs';

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

// --- meta description -----------------------------------------------------
const LIVRO = { titulo: 'Mas e eu?', editora: 'Ciranda Cultural', ano: 2017, idade: '4+', paginas: 24, nomeia: 'direto' };

t('a descrição sai do dado, não de um template fixo', () => {
  assert.equal(descricaoLivro(LIVRO),
    'Mas e eu? (Ciranda Cultural, 2017). Idade indicada pela editora: 4+. 24 páginas. A sinopse fala no assunto pelo nome. Cada afirmação com a fonte à vista.');
});

// A regressão que motivou: 15 páginas com a mesma frase mudando só o título.
t('livros diferentes geram descrições diferentes', () => {
  const a = descricaoLivro(LIVRO);
  const b = descricaoLivro({ ...LIVRO, titulo: 'Eu só só eu', idade: '3 a 6', paginas: 35, nomeia: 'metafora' });
  assert.notEqual(a, b);
  assert.ok(b.includes('por metáfora'), b);
});

t('sem idade a frase diz isso, não inventa faixa', () => {
  const d = descricaoLivro({ ...LIVRO, idade: 'nao_coberto' });
  assert.ok(d.includes('A editora não indica idade'), d);
  assert.ok(!/\d\+/.test(d), d);
});

t('rubrica sem valor não vira frase', () => {
  const d = descricaoLivro({ ...LIVRO, nomeia: 'nao_coberto' });
  assert.ok(!d.includes('A sinopse'), d);
});

t('cabe no que o Google mostra', () => {
  const longo = descricaoLivro({ titulo: 'Gire o disco! O primeiro dia do urso na escola', editora: 'Todolivro', ano: 2021, idade: '3 a 5', paginas: 16, nomeia: 'direto' });
  assert.ok(longo.length <= 160, `${longo.length}: ${longo}`);
});

t('frase que não cabe fica de fora inteira, não pela metade', () => {
  const d = descricaoLivro({ titulo: 'T'.repeat(100), editora: 'E', ano: 2020, idade: '4+', paginas: 24, nomeia: 'direto' });
  assert.ok(!d.includes('Cada afirmação'), d);
  assert.ok(d.endsWith('.'), d);
});

t('sem título não há descrição', () => assert.equal(descricaoLivro({}), undefined));

// --- corte da descrição da situação ---------------------------------------
t('texto curto passa inteiro', () =>
  assert.equal(descricaoCurta('Uma frase só.'), 'Uma frase só.'));

t('corta em frase inteira, nunca no meio', () => {
  const t332 = 'Seis livros com edição brasileira sobre começar na escola. A tabela traz o que a fonte da editora sustenta: idade indicada, tamanho, se a sinopse fala mesmo em primeiro dia, e se a editora oferece material pro adulto. Nenhuma das seis sinopses fala de creche nem da despedida na porta — isso está dito em cada página, não escondido.';
  const r = descricaoCurta(t332);
  assert.ok(r.length <= 160, `${r.length}`);
  assert.ok(/[.!?]$/.test(r), `terminou em "${r.slice(-20)}"`);
  assert.ok(t332.startsWith(r), 'saiu do começo do texto original');
});

t('leva quantas frases couberem', () => {
  const r = descricaoCurta('Nove livros com edição brasileira sobre a chegada de um irmão. A tabela traz o que a fonte da editora sustenta: tamanho, forma do texto, e quem narra. E mais uma frase que não cabe de jeito nenhum aqui dentro do limite.');
  assert.ok(r.includes('quem narra.'), r);
  assert.ok(!r.includes('não cabe'), r);
});

t('primeira frase gigante vira nada, não vira meia frase', () =>
  assert.equal(descricaoCurta('P'.repeat(200) + '.'), undefined));

t('vazio não vira string vazia', () => assert.equal(descricaoCurta(''), undefined));

t('livro com indicacao recusada nao afirma que a editora calou', () => {
  const d = descricaoLivro({ titulo: 'Quero ser meu irmãozinho!', editora: 'Melhoramentos', ano: 2003, idade: 'nao_coberto', paginas: 24, nomeia: 'direto', idadeContestada: true });
  assert.ok(!/editora n[ãa]o indica/i.test(d), d);
  assert.ok(/24 p[áa]ginas/.test(d), d);
});

t('sem recusa, a frase de idade ausente continua saindo', () =>
  assert.ok(/A editora não indica idade\./.test(
    descricaoLivro({ titulo: 'X', editora: 'Y', ano: 2020, idade: 'nao_coberto', paginas: 24 }))));

t('idade presente ganha da recusa', () =>
  assert.ok(/Idade indicada pela editora: 3 a 5\./.test(
    descricaoLivro({ titulo: 'X', idade: '3 a 5', idadeContestada: true }))));

console.log(`${ok} passaram, ${falhou} falharam`);
if (falhou) process.exit(1);

// O que o site afirma pro Google, que é diferente do que ele mostra pra pessoa.
// Separado e testado porque é a afirmação que ninguém relê: o HTML a gente abre
// no navegador toda passada, o JSON-LD ficou três dias dizendo outra coisa.

// `typicalAgeRange` é Text livre no schema.org — não existe formato que ele
// "peça". Os exemplos do Google usam intervalo fechado ("7-12"), e era isso que
// esta função fazia com tudo: "4 a 10" virava "4-10", certo, mas "4+" virava
// "4-", que não é ambíguo, é o contrário. "4-" se lê como "até 4 anos"; a
// editora disse "+ 4 anos". O livro apareceria pra quem procura livro de bebê.
//
// Faixa aberta sai como a editora escreve: "4+". A página impressa já diz isso,
// e o campo aceita texto.
export function faixaSchema(v) {
  if (!v || v === 'nao_coberto') return undefined;
  const m = String(v).match(/^(\d+)\s*(?:a\s*(\d+))?/);
  if (!m) return undefined;
  return m[2] ? `${m[1]}-${m[2]}` : `${m[1]}+`;
}

// A `<meta name="description">` é o texto que o Google MOSTRA e que ninguém
// nunca vê no navegador. As 15 páginas de livro traziam a mesma frase —
// "idade indicada, o que a fonte da editora afirma e o que ela não cobre" —
// mudando só o prefixo do título. Quinze resultados de busca idênticos, e
// nenhum deles dizia nada sobre o livro: quem procura "livro pra criança de 4
// anos" lia a mesma sentença genérica quinze vezes.
//
// Agora ela sai do dado, como os `{n_livros}` da descrição da situação. Vale a
// mesma regra da prosa da página: só entra o que uma evidência sustenta, e
// nada de promessa de efeito. Campo sem fonte simplesmente não vira frase.
const LIMITE_DESC = 160;

const FRASE_NOMEIA = {
  direto: 'A sinopse fala no assunto pelo nome.',
  metafora: 'A sinopse trata o assunto por metáfora.',
};

export function descricaoLivro({ titulo, editora, ano, idade, paginas, nomeia } = {}) {
  if (!titulo) return undefined;
  const onde = [editora, ano].filter(Boolean).join(', ');
  const partes = [onde ? `${titulo} (${onde}).` : `${titulo}.`];

  partes.push(idade && idade !== 'nao_coberto'
    ? `Idade indicada pela editora: ${idade}.`
    : 'A editora não indica idade.');
  if (paginas) partes.push(`${paginas} páginas.`);

  // As frases opcionais entram só enquanto couberem: o Google corta em ~160 e
  // o que fica pra fora não existe. Melhor uma frase a menos que meia frase.
  for (const f of [FRASE_NOMEIA[nomeia], 'Cada afirmação com a fonte à vista.']) {
    if (f && [...partes, f].join(' ').length <= LIMITE_DESC) partes.push(f);
  }
  return partes.join(' ');
}

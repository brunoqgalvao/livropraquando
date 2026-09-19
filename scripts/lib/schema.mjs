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

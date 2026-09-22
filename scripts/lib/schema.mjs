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

// `idadeContestada`: o livro tem uma indicação recusada (ver `idade_recusada`).
// Aí "A editora não indica idade" é falso — indicou, e a gente é que não
// publicou. Em 160 caracteres não cabe explicar por quê, e a explicação inteira
// está na página; então a frase de idade simplesmente não sai. Campo sem frase
// é o padrão daqui: o que a fonte não sustenta não vira texto.
export function descricaoLivro({ titulo, editora, ano, idade, paginas, nomeia, idadeContestada = false } = {}) {
  if (!titulo) return undefined;
  const onde = [editora, ano].filter(Boolean).join(', ');
  const partes = [onde ? `${titulo} (${onde}).` : `${titulo}.`];

  if (idade && idade !== 'nao_coberto') partes.push(`Idade indicada pela editora: ${idade}.`);
  else if (!idadeContestada) partes.push('A editora não indica idade.');
  if (paginas) partes.push(`${paginas} páginas.`);

  // As frases opcionais entram só enquanto couberem: o Google corta em ~160 e
  // o que fica pra fora não existe. Melhor uma frase a menos que meia frase.
  for (const f of [FRASE_NOMEIA[nomeia], 'Cada afirmação com a fonte à vista.']) {
    if (f && [...partes, f].join(' ').length <= LIMITE_DESC) partes.push(f);
  }
  return partes.join(' ');
}

// A descrição da situação é prosa editorial do Bruno e aparece inteira na
// página. Como meta description ela não cabe: as duas tinham 332 e 294
// caracteres, e o Google mostra ~160 — o resto não existe, e o corte dele cai
// no meio da frase.
//
// Aqui o corte é por frase inteira, a mesma regra da descrição do livro: mais
// vale uma frase a menos que meia frase. O texto na página não muda.
export function descricaoCurta(texto, limite = LIMITE_DESC) {
  const t = String(texto || '').trim();
  if (!t || t.length <= limite) return t || undefined;
  const frases = t.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
  let saida = '';
  for (const f of frases) {
    const tentativa = (saida + f).trimEnd();
    if (tentativa.length > limite) break;
    saida = tentativa + ' ';
  }
  return saida.trim() || undefined;   // nem a primeira frase coube: melhor nada
}

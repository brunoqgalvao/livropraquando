// Duas decisões que o renderizar.mjs toma antes de abrir qualquer página, aqui
// fora porque as duas já erraram e as duas erram calado.
//
// Regra que eu mesmo escrevi no diario.md: regra nova que decide alguma coisa
// nasce com teste. Estas nasceram sem, e a primeira versão da trava de
// uma-passada-por-dia teria feito a rodada das 08:35 pular a coleta inteira.

// Pular ou não a passada completa.
//
// A primeira versão olhava se o arquivo do dia existe. Mas uma rodada de um
// livro só (depuração) também grava esse arquivo — então olhar a existência
// fazia a coleta do dia ser pulada porque alguém tinha depurado um livro de
// madrugada. Só `completo: true` conta.
export function devePular({ diaAnterior, forcar = false, umLivroSo = false }) {
  if (forcar || umLivroSo) return false;
  return diaAnterior?.completo === true;
}

// Mescla da leitura de estoque.
//
// Substituir derrubou o arquivo da VM de 14 livros pra 1, porque uma rodada de
// um livro reescrevia tudo. Mas a mescla tem um limite deliberado: leitura de
// ONTEM não sobrevive. Estoque velho não é estoque, e a coluna "À venda"
// precisa poder dizer "não conferi" em vez de repetir o que era verdade ontem.
export function mesclaEstoque(antes, novo, hoje) {
  const mantidos = antes?.em === hoje ? antes.livros || {} : {};
  return { em: hoje, livros: { ...mantidos, ...novo } };
}

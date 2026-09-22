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

// Diário do dia.
//
// A trava de uma-passada-por-dia lê `completo` deste arquivo. Substituir o
// arquivo fazia uma rodada de um livro só (depuração, ou um livro novo que
// acabou de entrar) apagar o `completo` da passada completa que já tinha
// rodado de manhã — e a próxima rodada abriria as ~28 páginas de loja de novo,
// que é exatamente o que a trava existe pra evitar. De quebra, os avisos dos
// outros treze livros sumiam do diário do dia.
//
// Passada completa manda: ela reescreve o dia inteiro. Rodada parcial atualiza
// os avisos dos livros que ela olhou e não toca no resto.
export function mesclaDiario(antes, novo, isbnsDaRodada = []) {
  if (antes?.em !== novo.em) return novo;
  if (novo.completo) return novo;
  const tocados = new Set(isbnsDaRodada);
  const herdados = (antes.avisos || []).filter(a => !tocados.has(a.isbn13));
  return { em: novo.em, completo: antes.completo === true, avisos: [...herdados, ...(novo.avisos || [])] };
}

// Idade que já foi olhada e recusada não volta sozinha.
//
// A ficha da Amazon de "Quero ser meu irmãozinho!" diz "Idade de leitura : 0 -
// 3 anos" quatro parágrafos abaixo da sinopse da própria editora, que conta a
// história de "Guigo, um garoto de seis anos" e de uma final de campeonato de
// futebol. É erro de cadastro, e a trava de plausibilidade do renderizar.mjs
// não pega: ela só desconfia de piso ALTO em livro curto ("12+" em 24 páginas).
// Aqui o teto é que é baixo demais, e isso nenhuma regra genérica enxerga —
// 24 páginas para 0 a 3 anos é o caso comum, não a exceção. Quem viu o
// desacordo foi o olho, lendo a mesma página.
//
// Então a recusa mora no livro, uma por valor e fonte, com motivo escrito. Sem
// isso a página publicaria "0 a 3 (pela editora)" na manhã seguinte: o
// renderizar.mjs reescreve `rubrica.idade_editora` toda passada, e o campo
// deixado em `nao_coberto` de propósito não tem como se defender.
//
// A recusa é do VALOR, não do campo: se a loja corrigir a ficha para outra
// faixa, ela entra normalmente. Recusa que valesse pra sempre seria uma coluna
// congelada à mão, que é o oposto do que este projeto faz.
const mesmaFaixa = (a, b) =>
  String(a || '').replace(/\s+/g, '').toLowerCase() === String(b || '').replace(/\s+/g, '').toLowerCase();

export function idadeRecusada(recusas, leitura) {
  if (!leitura?.idade?.valor) return null;
  return (recusas || []).find(r =>
    mesmaFaixa(r.valor, leitura.idade.valor)
    && (!r.fonte || r.fonte === leitura.host)) || null;
}

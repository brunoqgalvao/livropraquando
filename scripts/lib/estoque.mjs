// A decisão de marcar um livro como esgotado, separada do script que sonda a
// rede, porque é ela que pode destruir dado: transformar livro bom em
// "esgotado" some com ele da tabela por engano, e ninguém repara.
//
// Ela nunca disparou em produção — por três dias o rodízio de sondas sequer
// conseguia ver uma prateleira. Uma regra que nunca rodou e ninguém testou é um
// palpite, não uma regra.

export const FALHAS_PRA_ESGOTAR = 3;

// "Uma leitura por dia": rodar o script duas vezes no mesmo dia não pode contar
// duas falhas, senão três execuções numa tarde esgotam o acervo inteiro.
//
// O empate do mesmo dia fica com a leitura mais recente do arquivo, e a ordem
// é por DATA, não por ordem de chegada. Confiar na ordem de chegada parece
// inofensivo até as datas chegarem embaralhadas — e elas chegam: em 19/09 o
// arquivo tinha 09-18, 09-18, 09-19, 09-18 nessa ordem, resíduo de um conserto
// de fuso horário no meio do dia. Duas máquinas (o Mac em Brasília, a VM em
// UTC) escrevendo no mesmo arquivo fazem isso sozinhas. Com a ordem trocada, um
// sucesso antigo passa por recente e o contador de falhas conta errado — pro
// lado de esgotar livro que está à venda.
export function porDia(observacoes = []) {
  const m = new Map();
  for (const o of observacoes) if (o.fonte === 'loja') m.set(o.em, o);
  return [...m.values()].sort((a, b) => String(a.em).localeCompare(String(b.em)));
}

// Falhas depois do último sucesso. Sucesso de catálogo não entra: o ISBN de um
// livro esgotado continua resolvendo no Google Books pra sempre.
export function falhasSeguidas(observacoes = []) {
  const dias = porDia(observacoes).reverse();     // mais novo primeiro
  const ultimoSucesso = dias.findIndex(o => o.ok);
  return ultimoSucesso === -1 ? dias : dias.slice(0, ultimoSucesso);
}

export function decideEstado(observacoes = [], atual = 'a_venda') {
  const falhas = falhasSeguidas(observacoes);
  if (falhas.length >= FALHAS_PRA_ESGOTAR) return { estado: 'esgotado', falhas };
  // Volta pra "à venda" só quando a loja respondeu que tem: uma sonda que não
  // conseguiu olhar não é notícia boa, é ausência de notícia.
  if (atual === 'esgotado' && falhas.length === 0 && porDia(observacoes).some(o => o.ok)) {
    return { estado: 'a_venda', falhas };
  }
  return { estado: atual, falhas };
}

// A poda do histórico. Era `slice(-24)` no check.mjs: 24 observações por livro,
// contando todas as fontes juntas. Cada rodada escreve três (google_books,
// open_library, loja), então o catálogo — que não tem nada a ver com prateleira
// — empurrava a leitura de loja pra fora da janela. Em 19/09 o arquivo local já
// tinha perdido o 18/09 de "Mas e eu?" e mostrava 1 falha onde havia 2; a VM
// estava em 21 de 24, ou seja, a rodada de 20/09 ia estourar o teto e apagar o
// 18/09 exatamente no dia em que a regra dos 3 fecharia. O contador zeraria
// sozinho, sem erro, sem log, e o livro esgotado seguiria na tabela como à
// venda.
//
// Agora a janela é por FONTE e por DIA: uma observação por fonte por dia, os
// últimos `dias` dias de cada uma. Sonda de catálogo não desaloja leitura de
// loja, e rodar o script dez vezes numa tarde não desaloja nada — o que o
// `porDia` já descartava não chega nem a ser guardado.
export const DIAS_GUARDADOS = 10;

export function poda(observacoes = [], dias = DIAS_GUARDADOS) {
  const porFonte = new Map();
  for (const o of observacoes) {
    if (!porFonte.has(o.fonte)) porFonte.set(o.fonte, new Map());
    porFonte.get(o.fonte).set(o.em, o);          // empate do dia: a mais recente
  }
  const guardadas = new Set();
  for (const m of porFonte.values()) {
    for (const d of [...m.keys()].sort().slice(-dias)) guardadas.add(m.get(d));
  }
  return observacoes.filter(o => guardadas.has(o));   // preserva a ordem do arquivo
}

// Sondar de novo o que já se sabe hoje. A `poda` guarda UMA observação por
// fonte por dia, então a segunda rodada do dia sobrescreve a mesma casa: custa
// rede e não produz informação nenhuma.
//
// Não é teórico. Em 19/09 rodei o check umas sete vezes numa tarde, cada uma
// batendo 15 vezes no Google Books, e às 14h a API começou a responder 429 —
// cota diária estourada, numa cota que é compartilhada. As ~90 chamadas extras
// não geraram uma observação nova e deixaram a sonda cega pro resto do dia.
// O `renderizar.mjs` já tinha essa trava desde 18/09; o check não tinha.
//
// Vale só pras sondas de rede. A da loja lê um arquivo local que o
// `renderizar.mjs` escreve mais tarde no dia — pular ela deixaria a leitura de
// prateleira de fora justamente no dia em que ela chega atrasada.
export function jaSondouHoje(observacoes = [], fonte, hoje) {
  return (observacoes || []).some(o => o.fonte === fonte && o.em === hoje);
}

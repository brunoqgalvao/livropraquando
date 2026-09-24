// Segunda fonte de prova: a ficha da loja ou da editora.
//
// Até 23/09 um livro só virava página se o Google Books ou a Open Library
// resolvessem o ISBN. A trava funcionou — nenhum livro inventado em seis dias —
// mas ela barrou quatro títulos que EXISTEM e estão à venda em loja grande:
// `A Irmã do Gildo` (Brinque-Book), `Tem alguém na barriga da mamãe`,
// `Quando meu irmãozinho nasceu` (Walcyr Carrasco) e `Lulu vai para a escola`
// (Anna McQuinn). O Google Books simplesmente não cataloga esse canto do
// infantil brasileiro, e "a fonte não tem" virou "o livro não existe".
//
// O Bruno decidiu em 23/09 abrir a régua: a ficha da própria loja/editora
// prova. Mas prova com o que o catálogo externo dá de graça e a loja não:
// **o ISBN impresso na página**. Vitrine, resultado de busca e página de
// coleção não trazem ISBN; ficha de produto traz. Sem ISBN na página, não
// prova — e isso é o que separa "provei" de "vi um título parecido num site".

// Dois ISBNs quase iguais são duas edições diferentes (o "Tempo de escola" tem
// 9786553843769 digital e 9786553843578 impresso, um dígito de diferença no
// miolo). Comparação é exata, sobre os dígitos.
const digitos = (s) => String(s || '').replace(/\D/g, '');

export function provaDaFicha({ isbn13, titulo, leitura, tituloBate, brasileira }) {
  const em = { fonte: 'ficha_loja', host: leitura?.host, url: leitura?.url };
  if (!brasileira(isbn13)) return { ...em, prova: false, motivo: 'o ISBN não é de edição brasileira' };
  if (!leitura) return { ...em, prova: false, motivo: 'não consegui abrir a página' };
  if (leitura.erro) return { ...em, prova: false, motivo: `não consegui abrir a página: ${leitura.erro}` };

  // Página barrada ou vazia devolve título de erro e corpo curto. Ler "não
  // achei o ISBN" nela seria ler o bloqueio como ausência do livro.
  if (/403|forbidden|acesso negado|access denied|not found|404/i.test(leitura.titulo_pagina || '')) {
    return { ...em, prova: false, motivo: 'a loja barrou o navegador' };
  }
  if (String(leitura.texto || '').trim().length < 250) {
    return { ...em, prova: false, motivo: 'a página voltou vazia' };
  }

  const lido = digitos(leitura.isbn_pagina);
  if (!lido) return { ...em, prova: false, motivo: 'a página não imprime ISBN-13' };
  if (lido !== digitos(isbn13)) {
    return { ...em, prova: false, motivo: `a página imprime outro ISBN (${lido})`, isbn_pagina: lido };
  }
  if (!tituloBate(leitura.titulo_pagina, titulo)) {
    return { ...em, prova: false, motivo: `o título da página não bate: "${String(leitura.titulo_pagina || '').slice(0, 60)}"` };
  }
  return { ...em, prova: true, isbn13: digitos(isbn13), trecho: String(leitura.titulo_pagina || '').slice(0, 120) };
}

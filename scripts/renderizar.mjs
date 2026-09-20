// Idade indicada e estoque, lidos da página DEPOIS do JS rodar.
//
// Por que existe: o campo que traz o pai ao site é "serve pra que idade?", e ele
// estava vazio em 11 dos 14 livros. Não é que o dado não exista — é que ele mora
// atrás de um SPA. Regex em HTML cru só pegava banner de cookie.
//
// Regra de proveniência, que é o ponto todo: a página imprime "(pela editora)"
// ao lado da idade. Então `idade_editora` só aceita o que a EDITORA disse. A
// Amazon expõe dois campos com o mesmo rótulo: o do metadado da editora e o
// "Idade sugerida pelo cliente", que é enquete de comprador. O segundo é
// recusado aqui — entra como `idade_leitores`, que a página rotula como tal.
import { P, lerTodos, gravar, canonicalLivro, hoje } from './lib.mjs';
import { renderizar } from './navegador.mjs';
import { devePular, mesclaEstoque, mesclaDiario } from './lib/rodada.mjs';
import { vereditoEstoque } from './lib/estoque.mjs';
import { idadeDaEditora, idadeDaAmazon, estoqueDaPagina, isbnDaPagina, precoDaLoja, paginasDaFicha, ilustradorDaFicha } from './lib/ficha.mjs';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SO = process.argv.slice(2).filter(a => /^\d{13}$/.test(a));
const FORCAR = process.argv.includes('--forcar');

// Uma passada por dia, e não porque seja bonito: cada rodada abre ~28 páginas de
// loja. O agente diário roda uma vez, mas em 19/09 eu estava rodando isto de
// hora em hora pra "conferir o estado" — 24 vezes o volume combinado, contra
// Amazon e editoras, pra colher zero informação nova, porque preço e estoque não
// mudam de hora em hora. É assim que se ganha bloqueio de bot, e bloqueio de bot
// aqui não é inconveniente: a sonda passa a ler prateleira vazia onde tem livro,
// e a regra dos 3 esgotados apaga o livro da tabela. O loop se sabota sozinho.
//
// `--forcar` existe pra depurar um livro específico, não pra rotina.
//
// A trava olha `completo`, não a existência do arquivo. Uma rodada de um livro
// só (pra depurar) também grava o diário do dia, e a primeira versão disto teria
// feito a rodada das 08:35 pular a coleta inteira porque eu tinha olhado UM
// livro de madrugada. O dia morreria calado: sem leitura de loja, o check passa
// sem observação e o site fica com o estoque de ontem.
const ARQ_DIA = join(P.runtime, `render-${hoje()}.json`);
const leJson = (f) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch { return null; } };
if (devePular({ diaAnterior: leJson(ARQ_DIA), forcar: FORCAR, umLivroSo: SO.length > 0 })) {
  console.log(`já rodou hoje (${hoje()}). Preço e estoque não mudam de hora em hora e cada passada abre ~28 páginas de loja.`);
  console.log('Use --forcar se precisar mesmo, ou passe um ISBN pra olhar um livro só.');
  process.exit(0);
}

// Roda dentro da página. Devolve o texto renderizado e, na Amazon, os campos
// que precisam de seletor (o innerText da Amazon mistura a ficha com o menu:
// "Adicionar ao carrinho" aparece como dica de atalho de teclado).
const EXTRATOR = `(() => {
  const limpo = (e) => e ? e.innerText.replace(/\\s+/g, ' ').trim() : null;
  const jsonld = [];
  for (const e of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { jsonld.push(JSON.parse(e.textContent)); } catch { /* loja com JSON quebrado: ignora */ }
  }
  const micro = {};
  for (const k of ['price', 'priceCurrency', 'availability']) {
    const e = document.querySelector(\`[itemprop="\${k}"]\`);
    if (e) micro[k] = e.content || e.getAttribute('content') || e.innerText.trim().slice(0, 40);
  }
  const amazon = /amazon\\./.test(location.hostname) ? {
    // Quando o item não é comprável a Amazon não renderiza #availability
    // nenhum; o aviso vai pro #outOfStockBuyBox. Sem esse fallback a gente
    // lia "não sei" onde a loja dizia "não tem".
    estoque: limpo(document.querySelector('#availability'))
       || limpo(document.querySelector('#outOfStockBuyBox, #outOfStock')),
    byline: limpo(document.querySelector('#bylineInfo')),
    core: limpo(document.querySelector('#corePriceDisplay_desktop_feature_div'))
       || limpo(document.querySelector('#corePrice_feature_div')),
    ficha: [...document.querySelectorAll('#detailBullets_feature_div li, #productDetailsTable li, #detailBulletsWrapper_feature_div li')]
      .map(e => e.innerText.replace(/\\s+/g, ' ').trim()).filter(Boolean),
  } : null;
  return {
    url: location.href,
    titulo: document.title,
    texto: document.body ? document.body.innerText : '',
    jsonld, micro, amazon,
  };
})()`;

// --- rodada --------------------------------------------------------------
const livros = lerTodos(P.livros).filter(l => !SO.length || SO.includes(l.isbn13));
const estoque = {};
const precos = {};
const paginas = {};
const ilustradores = {};
const diario = [];
let escritos = 0;

for (const l of livros) {
  const alvos = (l.disponibilidade?.compra || []).filter(c => c.url);
  const leituras = [];
  for (const alvo of alvos) {
    const host = new URL(alvo.url).hostname.replace(/^www\./, '');
    try {
      const d = await renderizar(alvo.url, EXTRATOR);
      const dados = { ...d, host };
      const est = estoqueDaPagina(dados);
      const amz = /amazon\./.test(host) ? idadeDaAmazon(d.amazon) : null;
      const edi = idadeDaEditora(d.texto);
      leituras.push({
        host, url: alvo.url, loja: alvo.loja, estoque: est,
        preco: precoDaLoja(dados),
        paginas: paginasDaFicha(dados),
        ilustrador: ilustradorDaFicha(dados),
        isbn_pagina: isbnDaPagina(dados),
        idade: amz && !amz.deLeitores ? { ...amz, fonte: 'ficha da loja (metadado da editora)' }
             : edi && !edi.ambigua ? { ...edi, fonte: 'página da editora' } : null,
        idade_leitores: amz?.deLeitores ? amz : null,
        ambigua: edi?.ambigua ? edi : null,
      });
      const u = leituras.at(-1);
      console.log(`  ${host.padEnd(28)} estoque=${String(est.ok)} idade=${u.idade?.valor || '-'} preco=${u.preco?.valor ?? '-'} pags=${u.paginas?.valor ?? '-'}`);
    } catch (e) {
      leituras.push({ host, url: alvo.url, loja: alvo.loja, estoque: { ok: null, nota: String(e.message || e) } });
      console.log(`  ${host.padEnd(28)} FALHOU: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  // A regra mora em lib/estoque.mjs, com teste: ela decide o que a página vai
  // dizer que a gente olhou.
  estoque[l.isbn13] = vereditoEstoque(leituras, hoje());

  const aviso = (m) => diario.push({ isbn13: l.isbn13, titulo: l.titulo, aviso: m });
  // preço: prefere loja que estava com estoque. Preço de prateleira vazia manda
  // a pessoa pra uma página onde não dá pra comprar.
  //
  // O `|| comPreco[0]` que estava aqui desfazia essa frase: sem loja com
  // estoque, ele pegava a primeira que tivesse preço -- inclusive uma que a
  // sonda tinha acabado de ler como indisponível. Deu no que tinha que dar:
  // "Mas e eu?" anunciava R$ 31,41 na Ciranda no topo e, quatro parágrafos
  // abaixo, "cirandacultural.com.br: Produto Indisponível". A página se
  // desmentia sozinha.
  //
  // `ok === false` é observação ("olhei, não tem"); `ok === null` é ignorância
  // ("não consegui olhar"). A ignorância pode servir de preço com ressalva; a
  // prateleira vazia confirmada, não -- é o preço de algo que não dá pra
  // comprar. Sem loja utilizável, a coluna fica em "–", que a página já sabe
  // dizer.
  const comPreco = leituras.filter(x => x.preco);
  const escolhidoPreco = comPreco.find(x => x.estoque.ok === true)
    || comPreco.find(x => x.estoque.ok === null);
  if (!escolhidoPreco && comPreco.length) {
    aviso(`ignorei R$ ${comPreco[0].preco.valor.toFixed(2)}: ${comPreco[0].host} está sem estoque`);
  }
  if (escolhidoPreco) {
    precos[l.isbn13] = {
      preco: escolhidoPreco.preco.valor,
      moeda: 'BRL',
      formato: escolhidoPreco.preco.formato || 'impresso',
      onde: escolhidoPreco.loja || escolhidoPreco.host,
      url: escolhidoPreco.url,
      base: escolhidoPreco.preco.fonte,
      ...(escolhidoPreco.isbn_pagina && escolhidoPreco.isbn_pagina !== l.isbn13
        ? { edicao: escolhidoPreco.isbn_pagina } : {}),
      em: hoje(),
    };
    // Mesma ressalva que a idade já carrega: se a página de venda é de outra
    // tiragem, o preço é daquela tiragem. Vale dizer, não esconder.
    if (precos[l.isbn13].edicao) {
      aviso(`preço R$ ${escolhidoPreco.preco.valor.toFixed(2)} é da edição ISBN ${precos[l.isbn13].edicao}, não da ${l.isbn13}`);
    }
  }

  // idade: a editora ganha da loja. Conflito é registrado, não escondido.
  const cand = leituras.filter(x => x.idade);
  const escolhida = cand.find(x => x.idade.fonte === 'página da editora') || cand[0];
  const conflito = [...new Set(cand.map(x => x.idade.valor))];

  if (conflito.length > 1) aviso(`idades diferentes entre fontes: ${conflito.join(' / ')} — ficou com ${escolhida.idade.valor} (${escolhida.host})`);
  for (const x of leituras) {
    if (x.idade_leitores) aviso(`Amazon só tem "Idade sugerida pelo cliente" (${x.idade_leitores.valor}); não é da editora, não entrou`);
    if (x.ambigua) aviso(`indicação dupla (leitura compartilhada x independente), precisa de gente: "${x.ambigua.trecho.slice(0, 140)}"`);
  }

  // páginas: só preenche o que falta. Não vale reescrever o que já veio do
  // catálogo — seria diff sem informação nova.
  if (!l.paginas) {
    const p = leituras.map(x => x.paginas).filter(Boolean);
    if (p.length) {
      const n = p[0].valor;
      if (n > 0 && n < 400) {
        paginas[l.isbn13] = n;
        const { arquivo: arqP, ...comPag } = l;
        comPag.paginas = n;
        if (gravar(arqP, canonicalLivro(comPag))) console.log(`  → ${n} páginas`);
        l.paginas = n;
      } else {
        aviso(`descartei "${n} páginas": fora da faixa plausível pra livro ilustrado`);
      }
    }
  }

  // ilustrador: só preenche o que falta, e só com crédito rotulado. Em livro
  // ilustrado o desenho é metade do livro, mas a Amazon credita "(Autor)" e
  // mais nada — o campo vive na ficha da editora, quando ela preenche.
  if (!l.ilustrador) {
    const i = leituras.map(x => x.ilustrador).filter(Boolean)[0];
    if (i) {
      ilustradores[l.isbn13] = i.valor;
      const { arquivo: arqI, ...comIlu } = l;
      comIlu.ilustrador = i.valor;
      if (gravar(arqI, canonicalLivro(comIlu))) console.log(`  → ilustrador ${i.valor} ("${i.trecho}")`);
      l.ilustrador = i.valor;
    }
  }

  if (!escolhida) continue;

  // Trava de plausibilidade: livro ilustrado de 24 páginas com "12 anos e acima"
  // é erro de cadastro da loja, não indicação editorial.
  const piso = Number(String(escolhida.idade.valor).match(/\d+/)?.[0] ?? 0);
  if (l.paginas && l.paginas <= 48 && piso >= 10) {
    aviso(`ignorei "${escolhida.idade.valor}" de ${escolhida.host}: livro de ${l.paginas} páginas não é leitura de ${piso} anos — parece erro de cadastro`);
    continue;
  }
  if (escolhida.isbn_pagina && escolhida.isbn_pagina !== l.isbn13) {
    aviso(`a página de ${escolhida.host} é do ISBN ${escolhida.isbn_pagina}, não do ${l.isbn13} (outra tiragem); idade registrada com essa ressalva`);
  }

  const { arquivo, ...limpo } = l;
  const evidencias = [...(l.evidencias || [])];
  const nova = {
    tipo: 'ficha_tecnica',
    veiculo: `ficha em ${escolhida.loja || escolhida.host}${escolhida.isbn_pagina && escolhida.isbn_pagina !== l.isbn13 ? ` (edição ISBN ${escolhida.isbn_pagina})` : ''}`,
    url: escolhida.url,
    trecho: escolhida.idade.trecho,
    acessado_em: hoje(),
  };
  // Se uma evidência que já existe cita a mesma frase na mesma URL, aponta pra
  // ela. Duplicar o trecho engordaria o diff sem acrescentar prova — e o diff
  // do git é a medida de slop deste projeto.
  const chave = (x) => String(x).toLowerCase().replace(/[^a-z0-9áàâãéêíóôõúç ]/gi, '').replace(/\s+/g, ' ').trim();
  const cita = evidencias.findIndex(e => e.url === nova.url && chave(e.trecho).includes(chave(nova.trecho)));
  const mesma = evidencias.findIndex(e => e.url === nova.url && e.tipo === 'ficha_tecnica');
  const base = cita >= 0 ? cita
    : mesma >= 0 ? (evidencias[mesma] = nova, mesma)
    : (evidencias.push(nova) - 1);
  limpo.evidencias = evidencias;
  limpo.rubrica = { ...l.rubrica, idade_editora: { valor: escolhida.idade.valor, base } };
  if (gravar(arquivo, canonicalLivro(limpo))) { escritos++; console.log(`  → idade ${escolhida.idade.valor} gravada`); }
}

mkdirSync(P.runtime, { recursive: true });
// Rodada de um livro só não pode apagar a leitura dos outros treze. Rodei
// `renderizar.mjs <isbn>` na VM pra depurar e o arquivo caiu de 14 livros pra 1
// — se o agente não fosse re-renderizar em seguida, o dia perdia o estoque
// inteiro em silêncio. Mesmo erro que o mercado.json já teve: substituir onde
// era pra mesclar. Leitura de hoje entra por cima; leitura de ontem que ninguém
// refez sai, porque estoque velho não é estoque.
const ARQ_ESTOQUE = join(P.runtime, 'estoque-render.json');
writeFileSync(ARQ_ESTOQUE, JSON.stringify(mesclaEstoque(leJson(ARQ_ESTOQUE), estoque, hoje()), null, 2) + '\n');

// Estoque é dado de mercado, não editorial: vai pro mesmo arquivo do preço, que
// existe exatamente pra isso. Se fosse pro JSON do livro, os 14 arquivos
// mudariam todo dia só pra carimbar data — churn puro no diff que mede slop.
const ARQ_MERCADO = join(P.ROOT, 'data/mercado.json');
const mercado = existsSync(ARQ_MERCADO) ? JSON.parse(readFileSync(ARQ_MERCADO, 'utf8')) : { livros: {} };
mercado.livros ||= {};
for (const [isbn, e] of Object.entries(estoque)) {
  const reg = mercado.livros[isbn] ||= {};
  if (e.ok === null) { delete reg.estoque; continue; }   // ausência > null: não sei não é um valor
  reg.estoque = { a_venda: e.ok, onde: e.detalhe, em: e.em };
}
for (const [isbn, pr] of Object.entries(precos)) {
  (mercado.livros[isbn] ||= {}).loja = pr;
}
// Preço gravado ontem numa loja que hoje está confirmada sem estoque some. Não
// basta parar de escrever: o arquivo é o que a página lê, e o registro velho
// continuaria anunciando preço de prateleira vazia até alguém reparar.
for (const [isbn, reg] of Object.entries(mercado.livros)) {
  if (!precos[isbn] && reg.loja && reg.estoque?.a_venda === false
      && (reg.estoque.onde || []).some(o => reg.loja.url.includes(String(o).split(':')[0]))) {
    console.log(`  → ${isbn}: removi preço de ${reg.loja.onde} (sem estoque hoje)`);
    delete reg.loja;
  }
}
mercado.atualizado_em = hoje();
gravar(ARQ_MERCADO, JSON.stringify(mercado, null, 2) + '\n');
writeFileSync(ARQ_DIA, JSON.stringify(mesclaDiario(leJson(ARQ_DIA), { em: hoje(), completo: !SO.length, avisos: diario }, livros.map(l => l.isbn13)), null, 2) + '\n');

console.log(`\n${livros.length} livros · ${escritos} idade(s) · ${Object.keys(precos).length} preço(s) de loja · ${Object.keys(paginas).length} página(s) · ${Object.keys(ilustradores).length} ilustrador(es) · ${diario.length} aviso(s)`);
for (const a of diario) console.log(`  ! ${a.titulo}: ${a.aviso}`);

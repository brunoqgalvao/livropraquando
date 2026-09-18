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
import { idadeDaEditora, idadeDaAmazon, estoqueDaPagina, isbnDaPagina } from './lib/ficha.mjs';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SO = process.argv.slice(2).filter(a => /^\d{13}$/.test(a));

// Roda dentro da página. Devolve o texto renderizado e, na Amazon, os campos
// que precisam de seletor (o innerText da Amazon mistura a ficha com o menu:
// "Adicionar ao carrinho" aparece como dica de atalho de teclado).
const EXTRATOR = `(() => {
  const limpo = (e) => e ? e.innerText.replace(/\\s+/g, ' ').trim() : null;
  const amazon = /amazon\\./.test(location.hostname) ? {
    estoque: limpo(document.querySelector('#availability')),
    preco: limpo(document.querySelector('#corePrice_feature_div .a-price .a-offscreen')) || limpo(document.querySelector('#price')),
    ficha: [...document.querySelectorAll('#detailBullets_feature_div li, #productDetailsTable li, #detailBulletsWrapper_feature_div li')]
      .map(e => e.innerText.replace(/\\s+/g, ' ').trim()).filter(Boolean),
  } : null;
  return {
    url: location.href,
    titulo: document.title,
    texto: document.body ? document.body.innerText : '',
    amazon,
  };
})()`;

// --- rodada --------------------------------------------------------------
const livros = lerTodos(P.livros).filter(l => !SO.length || SO.includes(l.isbn13));
const estoque = {};
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
        isbn_pagina: isbnDaPagina(dados),
        idade: amz && !amz.deLeitores ? { ...amz, fonte: 'ficha da loja (metadado da editora)' }
             : edi && !edi.ambigua ? { ...edi, fonte: 'página da editora' } : null,
        idade_leitores: amz?.deLeitores ? amz : null,
        ambigua: edi?.ambigua ? edi : null,
      });
      console.log(`  ${host.padEnd(28)} estoque=${String(est.ok)} idade=${leituras.at(-1).idade?.valor || '-'}`);
    } catch (e) {
      leituras.push({ host, url: alvo.url, loja: alvo.loja, estoque: { ok: null, nota: String(e.message || e) } });
      console.log(`  ${host.padEnd(28)} FALHOU: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  // estoque: uma leitura negativa explícita vale mais que silêncio; positiva só
  // conta se nenhuma loja disse o contrário.
  const vistos = leituras.map(x => x.estoque).filter(x => x.ok !== null);
  estoque[l.isbn13] = vistos.length
    ? { ok: vistos.some(v => v.ok === true) && !vistos.every(v => v.ok === false),
        detalhe: leituras.filter(x => x.estoque.ok !== null).map(x => `${x.host}: ${x.estoque.nota}`), em: hoje() }
    : { ok: null, detalhe: leituras.map(x => `${x.host}: ${x.estoque.nota}`), em: hoje() };

  // idade: a editora ganha da loja. Conflito é registrado, não escondido.
  const cand = leituras.filter(x => x.idade);
  const escolhida = cand.find(x => x.idade.fonte === 'página da editora') || cand[0];
  const conflito = [...new Set(cand.map(x => x.idade.valor))];

  const aviso = (m) => diario.push({ isbn13: l.isbn13, titulo: l.titulo, aviso: m });
  if (conflito.length > 1) aviso(`idades diferentes entre fontes: ${conflito.join(' / ')} — ficou com ${escolhida.idade.valor} (${escolhida.host})`);
  for (const x of leituras) {
    if (x.idade_leitores) aviso(`Amazon só tem "Idade sugerida pelo cliente" (${x.idade_leitores.valor}); não é da editora, não entrou`);
    if (x.ambigua) aviso(`indicação dupla (leitura compartilhada x independente), precisa de gente: "${x.ambigua.trecho.slice(0, 140)}"`);
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
writeFileSync(join(P.runtime, 'estoque-render.json'), JSON.stringify({ em: hoje(), livros: estoque }, null, 2) + '\n');

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
mercado.atualizado_em = hoje();
gravar(ARQ_MERCADO, JSON.stringify(mercado, null, 2) + '\n');
writeFileSync(join(P.runtime, `render-${hoje()}.json`), JSON.stringify({ em: hoje(), avisos: diario }, null, 2) + '\n');

console.log(`\n${livros.length} livros · ${escritos} idade(s) gravada(s) · ${diario.length} aviso(s)`);
for (const a of diario) console.log(`  ! ${a.titulo}: ${a.aviso}`);

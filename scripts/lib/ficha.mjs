// Leitura da ficha técnica: idade indicada e estoque, a partir do texto já
// renderizado. Puro de propósito — é a parte que erra, e erro de regex aqui
// vira afirmação falsa publicada. Testável sem navegador: `node scripts/lib/ficha.test.mjs`.

export const semMarcas = (s) => String(s || '')
  .replace(/[‎‏‪-‮؜]/g, '')
  .replace(/\s+/g, ' ').trim();

const faixa = (a, b) => `${Number(a)} a ${Number(b)}`;
const desde = (n) => `${Number(n)}+`;

export function faixaDoTexto(v) {
  const s = semMarcas(v);
  let m;
  if ((m = s.match(/(\d{1,2})\s*(?:a|-|–|até)\s*(\d{1,2})\s*anos?/i))) return faixa(m[1], m[2]);
  if ((m = s.match(/(\d{1,2})\s*anos?\s*(?:e|ou)\s*(?:acima|mais)/i))) return desde(m[1]);
  if ((m = s.match(/a partir d[eo]s?\s*(\d{1,2})\s*anos?/i))) return desde(m[1]);
  if ((m = s.match(/\+\s*(\d{1,2})\s*anos?/i))) return desde(m[1]);
  return null;
}

// Cada frase exige uma palavra de indicação por perto. Sem isso, "a partir de
// 3 anos" casa com qualquer linha solta da sinopse ou do menu da loja.
const FRASES = [
  /indicad[oa]s?\s+para\s+(?:leitores?|pr[ée]-leitores?|crian[çc]as|beb[êe]s)[^.;!?]{0,60}?\(?a partir d[eo]s?\s*\d{1,2}\s*anos?\)?/i,
  /faixa\s+et[áa]ria\s*:?\s*\+?\s*(?:de\s*)?\d{1,2}(?:\s*(?:a|-|–|até)\s*\d{1,2})?\s*anos?/i,
  /idade\s+(?:indicada|recomendada|de leitura)\s*:?\s*(?:de\s*)?\d{1,2}(?:\s*(?:a|-|–|até)\s*\d{1,2})?\s*anos?(?:\s*(?:e|ou)\s*(?:acima|mais))?/i,
  /(?:indicad[oa]|recomendad[oa])s?\s+(?:para|a)\s+(?:crian[çc]as\s+)?(?:de\s+)?\d{1,2}\s*(?:a|-|–|até)\s*\d{1,2}\s*anos?/i,
  /(?:leitura|leitores?)[^.;!?]{0,40}?a partir d[eo]s?\s*\d{1,2}\s*anos?/i,
];

// "Indicado para bebês (leitura compartilhada); e a partir de 5 anos (leitura
// independente)" não é uma faixa, são duas. Publicar "5+" trairia o livro.
const AMBIGUA = /leitura\s+(?:compartilhada|independente|aut[ôo]noma|mediada)/i;

export function idadeDaEditora(texto) {
  const t = semMarcas(texto);
  // Antes de tudo: a indicação dupla não casa com FRASES nenhuma (o ";" corta),
  // e cair no null silencioso esconderia o caso de quem precisa decidir.
  const amb = t.match(AMBIGUA);
  if (amb) {
    const janela = t.slice(Math.max(0, amb.index - 170), amb.index + 170);
    if (/indicad|recomendad|a partir d[eo]s?\s*\d|faixa\s+et[\u00e1a]ria/i.test(janela)) {
      return { ambigua: true, trecho: janela.trim() };
    }
  }
  for (const re of FRASES) {
    const m = t.match(re);
    if (!m) continue;
    const trecho = m[0].trim();
    const janela = t.slice(Math.max(0, m.index - 130), m.index + trecho.length + 130);
    if (AMBIGUA.test(janela)) return { ambigua: true, trecho: janela.trim() };
    const valor = faixaDoTexto(trecho);
    if (valor) return { valor, trecho };
  }
  return null;
}

// A Amazon publica dois campos com o mesmo rótulo: o metadado da editora e o
// "Idade sugerida pelo cliente", que é enquete de comprador. Quem chama decide
// o que fazer com `deLeitores`, mas o campo nunca vem sem a marca.
export function idadeDaAmazon(amazon) {
  const linha = (amazon?.ficha || []).map(semMarcas).find(l => /^idade de leitura/i.test(l));
  if (!linha) return null;
  const valor = faixaDoTexto(linha.replace(/^idade de leitura\s*:?\s*/i, ''));
  if (!valor) return null;
  return { valor, trecho: linha, deLeitores: /sugerida pelo cliente/i.test(linha) };
}

const FORA = [/produto\s+indispon[íi]vel/i, /atualmente\s+indispon[íi]vel/i, /fora de estoque/i,
              /sem estoque/i, /esgotad[oa]\b/i, /avise-me quando (?:chegar|estiver)/i,
              /n[ãa]o (?:est[áa]|se encontra) dispon[íi]vel/i,
              // A Amazon avisa assim quando o item não é comprável, e a frase é
              // longa o bastante pra não confundir com "Imagem não disponível",
              // que é placeholder de foto em página de livro à venda.
              /n[ãa]o temos previs[ãa]o de quando este produto estar[áa] dispon[íi]vel/i];
// "Estimativa de envio de 2 a 3 dias" só aparece em item comprável: quando a
// Amazon não tem, ela escreve "Temporariamente fora de estoque" ou
// "Atualmente indisponível", que já estão em FORA e são checados antes.
const TEM = [/em estoque/i, /adicionar ao carrinho/i, /comprar agora/i, /compre (?:agora|j[áa])/i,
             /estimativa de envio/i, /envio em \d/i];

// Rótulo de botão de compra, e só os que a loja desenha na tela. O mesmo
// <input value="Comprar"> existe no DOM da Ciranda esgotada e da Ciranda à
// venda — o que muda é o tamanho: 260x43 numa, 0x0 na outra. Casar pelo texto
// do botão sem olhar se ele aparece diria "à venda" para as duas.
const BOTAO_TEM = [/adicionar ao carrinho/i, /\bcomprar\b/i, /\bcompre\b/i];

// `ok: null` = não deu pra ver. É diferente de "não tem", e a diferença é o
// projeto inteiro: a coluna antiga dizia "sim" porque o HTTP devolveu 200.
// A nota da loja pode virar evidência numa página pública (é o que a nota de
// esgotado imprime). Cortar em 80 no seco deixava "…estará disponível nova".
const corta = (s, n = 80) => {
  const t = String(s || '').trim();
  if (t.length <= n) return t;
  const c = t.slice(0, n);
  const esp = c.lastIndexOf(' ');
  return (esp > n * 0.6 ? c.slice(0, esp) : c).replace(/[ ,.;:]+$/, '') + '…';
};

// A loja pode dizer "à venda" sem escrever nada: na Ciranda o botão de compra é
// um <input>, e rótulo de input mora no `value`, não no innerText. A página de
// "Tempo de escola" voltava `null` — "não deu pra ler" — com o botão Comprar
// visível na tela. `null` é caro (item 17 do diário), então o rótulo de botão
// entra como sinal positivo. Só positivo: FORA continua sendo checado antes e
// ganha, porque a Ciranda esgotada mantém o botão no DOM e escreve "Produto
// Indisponível" no texto.
export function estoqueDaPagina({ host, texto, titulo, amazon, botoes }) {
  if (/amazon\./.test(host)) {
    const s = semMarcas(amazon?.estoque);
    if (!s) return { ok: null, nota: 'Amazon não mostrou bloco de disponibilidade' };
    if (FORA.some(re => re.test(s))) return { ok: false, nota: corta(s) };
    if (TEM.some(re => re.test(s))) return { ok: true, nota: corta(s) };
    return { ok: null, nota: `disponibilidade ilegível: ${s.slice(0, 60)}` };
  }
  if (/403|forbidden|acesso negado|access denied/i.test(titulo || '')) return { ok: null, nota: 'loja barrou o navegador' };
  const t = semMarcas(texto);
  if (t.length < 250) return { ok: null, nota: 'página voltou vazia' };
  // Negativo ganha do positivo: a Ciranda mostra seletor de quantidade E
  // "Produto Indisponível" na mesma tela.
  for (const re of FORA) { const m = t.match(re); if (m) return { ok: false, nota: m[0] }; }
  for (const re of TEM) { const m = t.match(re); if (m) return { ok: true, nota: m[0] }; }
  const b = semMarcas(botoes);
  for (const re of BOTAO_TEM) { if (re.test(b)) return { ok: true, nota: `botão de compra na tela: "${corta(b, 40)}"` }; }
  return { ok: null, nota: 'nenhum sinal de estoque na página' };
}

export function isbnDaPagina({ host, texto, amazon }) {
  const alvo = /amazon\./.test(host) ? (amazon?.ficha || []).join(' ') : texto;
  const m = semMarcas(alvo).match(/ISBN-?13\s*:?\s*([\d-]{13,20})/i);
  return m ? m[1].replace(/\D/g, '') : null;
}

// --- preço --------------------------------------------------------------
// Preço só entra com âncora, nunca por "o primeiro R$ da página". A página da
// Companhia das Letras traz, ao mesmo tempo, o preço do livro (R$ 67,90), o
// combo da coleção (R$ 203,70) e uma vitrine de outros títulos; a da Amazon
// traz o Kindle a R$ 0,00, o marketplace a R$ 36,90 e a parcela de 2x R$ 23,95.
// Qualquer heurística de "menor" ou "primeiro" publica um número falso, e preço
// falso é pior que preço ausente: a pessoa vai à loja contando com ele.
const REAIS = /R\$\s*([\d.]{1,9})\s*,\s*(\d{2})/;   // "R$ 67,90" e "R$ 67 , 90" (a loja quebra em elementos)

export function valorBr(s) {
  const m = String(s || '').match(REAIS);
  if (!m) return null;
  const n = Number(`${m[1].replace(/\./g, '')}.${m[2]}`);
  return Number.isFinite(n) && n > 0 ? n : null;   // R$ 0,00 do Kindle não é preço
}

// schema.org, quando a loja publica: é declaração da própria loja, não leitura nossa.
export function precoEstruturado({ jsonld, micro }) {
  const pilha = [];
  const achata = (x) => {
    if (Array.isArray(x)) return x.forEach(achata);
    if (x && typeof x === 'object') {
      pilha.push(x);
      for (const k of ['@graph', 'offers', 'mainEntity', 'itemListElement']) if (x[k]) achata(x[k]);
    }
  };
  achata(jsonld);
  for (const n of pilha) {
    const bruto = n.price ?? n.lowPrice;
    if (bruto === undefined || (n.priceCurrency && n.priceCurrency !== 'BRL')) continue;
    const v = Number(String(bruto).replace(',', '.'));
    if (Number.isFinite(v) && v > 0) return { valor: v, fonte: 'dado estruturado (schema.org)' };
  }
  if (micro?.price && (!micro.priceCurrency || micro.priceCurrency === 'BRL')) {
    const v = Number(String(micro.price).replace(',', '.'));
    if (Number.isFinite(v) && v > 0) return { valor: v, fonte: 'microdado (schema.org)' };
  }
  return null;
}

export function precoDaLoja({ host, texto, jsonld, micro, amazon }) {
  const est = precoEstruturado({ jsonld, micro });
  if (est) return est;

  // Bloco de preço do buy box: é o que a Amazon cobra por esta edição, separado
  // do Kindle, do marketplace e do parcelamento, que moram em outros blocos.
  if (/amazon\./.test(host)) {
    const v = valorBr(amazon?.core);
    return v ? { valor: v, fonte: 'preço do buy box' } : null;
  }

  // "Livro físico R$ 67,90 / À vista": o rótulo de formato é a âncora. Sem ele
  // pegaríamos o combo de três volumes que a mesma página oferece embaixo.
  const m = String(texto || '').replace(/\s+/g, ' ').match(/Livro\s+(f[íi]sico|digital)\s*(R\$\s*[\d.]+\s*,\s*\d{2})/i);
  if (m) {
    const v = valorBr(m[2]);
    if (v) return { valor: v, fonte: `preço do ${m[1].toLowerCase()}`, formato: /d/i.test(m[1][0]) ? 'digital' : 'impresso' };
  }
  return null;
}

// --- páginas ------------------------------------------------------------
export function paginasDaFicha({ texto, amazon }) {
  const linha = (amazon?.ficha || []).map(semMarcas).find(l => /n[úu]mero de p[áa]ginas/i.test(l));
  if (linha) {
    const m = linha.match(/(\d{1,4})\s*p[áa]ginas/i);
    if (m) return { valor: Number(m[1]), trecho: linha };
  }
  const t = semMarcas(texto);
  const m = t.match(/P[áa]ginas\s*:\s*(\d{1,4})\b/);
  if (m) return { valor: Number(m[1]), trecho: m[0] };
  return null;
}

// --- ilustrador ---------------------------------------------------------
// Rendimento medido em 18/09: 1 de 8. A Amazon credita "(Autor)" e mais nada,
// mesmo quando o ilustrador está impresso na capa; só a Ciranda e a Companhia
// das Letras publicam o campo. Fica mesmo assim porque a página já é carregada
// pra idade e preço, e porque livro novo entra toda semana.
//
// Nunca se lê ilustrador da imagem da capa: dá pra ver o nome ali, mas ver não
// é fonte que o leitor possa abrir e conferir.
const CREDITOS = [
  // Loja escreve "Ilustração" e "Ilustracao"; o acento não pode decidir se o
  // dado entra. (Isso veio de um teste que quebrou, não de suposição.)
  /Autor\/Ilustrador(?:a)?\s*:\s*(.{2,60})/i,
  // `de` e `por` precisam de fronteira de palavra. Sem ela, "ilustrações
  // delicadas" casa como "ilustrações de" + "licadas", porque "delicadas"
  // começa com "de". Só não virou nome inventado porque o nomeLimpo exige
  // inicial maiúscula -- acerto por acidente não é trava.
  /Ilustra(?:[çc][ãa]o|[çc][õo]es|dor|dora)\s*(?::|\bde\b|\bpor\b)\s*(.{2,60})/i,
  /Ilustrad[oa]\s+por\s+(.{2,60})/i,
  // A Amazon lista papéis juntos: "por Anna Llenas (Autor, Ilustrador)". Quando
  // quem escreveu também desenhou, esse é o único lugar da página que credita.
  // Exigir "(Ilustrador)" sozinho perdia exatamente esse caso.
  /([A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ][\wÀ-ÿ'.-]+(?:\s+[A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ][\wÀ-ÿ'.-]+){0,3})\s*\((?:[^)]{0,30},\s*)?(?:Ilustrador|Ilustradora|Illustrator)a?\s*(?:,[^)]{0,30})?\)/,
];

// A ficha é uma fileira de rótulos sem pontuação entre eles: "Ilustrador: Spike
// Maguire Idioma Português". Sem cortar no rótulo seguinte o nome sai com
// "Idioma" colado — foi o que a primeira versão fez.
const ROTULO_VIZINHO = /\b(?:Tradu[çc][ãa]o|Capa|ISBN|Selo|P[áa]ginas|Formato|Peso|Acabamento|Lan[çc]amento|Idioma|Editora|Autor|Idade|Assuntos|Linha|Dimens[õo]es|Encaderna[çc][ãa]o|Cole[çc][ãa]o|Ano|Edi[çc][ãa]o|Sobre|Produto|Categoria|Marca|Pre[çc]o|Disponibilidade|Entrega|Sinopse)\b/i;

function nomeLimpo(bruto) {
  let s = semMarcas(bruto).split(ROTULO_VIZINHO)[0];
  s = s.split(/[|;·•\n]|\s{2,}|\s+-\s+/)[0].replace(/[,:.\s]+$/, '').trim();
  const palavras = s.split(/\s+/);
  if (palavras.length < 1 || palavras.length > 5) return null;
  // nome próprio: começa maiúsculo e não é uma frase
  if (!/^[A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ]/.test(s)) return null;
  if (s.length < 3 || s.length > 60) return null;
  if (/\d/.test(s)) return null;
  return s;
}

export function ilustradorDaFicha({ texto, amazon }) {
  const fontes = [(amazon?.ficha || []).join(' '), amazon?.byline, texto].filter(Boolean);
  for (const fonte of fontes) {
    const t = semMarcas(fonte);
    for (const re of CREDITOS) {
      const m = t.match(re);
      if (!m) continue;
      const valor = nomeLimpo(m[1]);
      if (valor) return { valor, trecho: semMarcas(m[0]).slice(0, 90) };
    }
  }
  return null;
}

// O que a ficha da página escreve na linha "Idade indicada" quando o campo
// está em `nao_coberto`.
//
// "a editora não indica" é a frase certa pro caso comum — a editora calou. Ela
// vira afirmação errada quando o campo está vazio porque alguém OLHOU uma
// indicação e a recusou: aí existe um número por aí, e dizer que não existe é
// esconder o motivo do vazio embaixo de uma frase confortável. A página já
// conta a história inteira em "O que a evidência não cobre"; o que esta linha
// precisa é não desmentir aquele parágrafo.
export function rotuloIdadeAusente(livro) {
  return (livro?.idade_recusada || []).length
    ? 'a única indicação que achamos não confere'
    : 'a editora não indica';
}

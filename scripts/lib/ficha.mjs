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
              /n[ãa]o (?:est[áa]|se encontra) dispon[íi]vel/i];
// "Estimativa de envio de 2 a 3 dias" só aparece em item comprável: quando a
// Amazon não tem, ela escreve "Temporariamente fora de estoque" ou
// "Atualmente indisponível", que já estão em FORA e são checados antes.
const TEM = [/em estoque/i, /adicionar ao carrinho/i, /comprar agora/i, /compre (?:agora|j[áa])/i,
             /estimativa de envio/i, /envio em \d/i];

// `ok: null` = não deu pra ver. É diferente de "não tem", e a diferença é o
// projeto inteiro: a coluna antiga dizia "sim" porque o HTTP devolveu 200.
export function estoqueDaPagina({ host, texto, titulo, amazon }) {
  if (/amazon\./.test(host)) {
    const s = semMarcas(amazon?.estoque);
    if (!s) return { ok: null, nota: 'Amazon não mostrou bloco de disponibilidade' };
    if (FORA.some(re => re.test(s))) return { ok: false, nota: s.slice(0, 80) };
    if (TEM.some(re => re.test(s))) return { ok: true, nota: s.slice(0, 80) };
    return { ok: null, nota: `disponibilidade ilegível: ${s.slice(0, 60)}` };
  }
  if (/403|forbidden|acesso negado|access denied/i.test(titulo || '')) return { ok: null, nota: 'loja barrou o navegador' };
  const t = semMarcas(texto);
  if (t.length < 250) return { ok: null, nota: 'página voltou vazia' };
  // Negativo ganha do positivo: a Ciranda mostra seletor de quantidade E
  // "Produto Indisponível" na mesma tela.
  for (const re of FORA) { const m = t.match(re); if (m) return { ok: false, nota: m[0] }; }
  for (const re of TEM) { const m = t.match(re); if (m) return { ok: true, nota: m[0] }; }
  return { ok: null, nota: 'nenhum sinal de estoque na página' };
}

export function isbnDaPagina({ host, texto, amazon }) {
  const alvo = /amazon\./.test(host) ? (amazon?.ficha || []).join(' ') : texto;
  const m = semMarcas(alvo).match(/ISBN-?13\s*:?\s*([\d-]{13,20})/i);
  return m ? m[1].replace(/\D/g, '') : null;
}

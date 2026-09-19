// Critério de sucesso 2 do SPEC, executável.
//
// "Numa amostra de 5 páginas escritas pelo agente: toda citação confere, nenhum
// livro inventado, nenhuma frase prescritiva." Isso estava escrito como algo que
// uma pessoa faria à mão no dia 14 — ou seja, provavelmente nunca, e com certeza
// tarde demais pra consertar. Um critério que só um humano sabe avaliar não
// governa um loop autônomo: ele decora.
//
// Aqui cada metade vira comando:
//   toda citação confere  → abre a URL citada e procura o trecho na página
//   livro inventado       → ISBN do catálogo tem que bater com a página da loja
//   frase prescritiva     → varre a prosa do agente, não as citações
//
// Roda sob demanda, não no build: depende de rede e de loja de pé, e reprovar o
// deploy porque a Amazon caiu seria trocar um erro por outro.
import { P, lerTodos } from './lib.mjs';
import { renderizar } from './navegador.mjs';

const SO = process.argv.includes('--prosa');

// Prosa do agente. As citações NÃO entram aqui: reproduzir "ajuda a criança a
// lidar com o ciúme" entre aspas, com link pra editora que escreveu, é dizer
// quem disse. O que o SPEC proíbe é o site afirmar isso por conta própria.
const PROSA = {
  situacao: ['descricao', 'lacuna', 'ilustracao'],
  livro: ['nota', 'subtitulo', 'nao_aborda'],
};

// Claim terapêutico: o site promete efeito no comportamento ou no sentimento da
// criança. "Trata de X pelo ponto de vista de Y" é descrição e passa.
export const PRESCRITIVO = [
  /\bajuda(?:r|m)?\s+(?:a\s+)?(?:crian[çc]a|o\s+filho|a\s+filha|os?\s+pequenos?|a\s+lidar|a\s+entender|a\s+superar|a\s+processar|a\s+aceitar)/i,
  /\bprepara(?:r|m)?\s+(?:a\s+)?(?:crian[çc]a|o\s+filho|a\s+filha|o\s+terreno)/i,
  /\bensina(?:r|m)?\s+(?:a\s+)?(?:crian[çc]a|o\s+filho|a\s+filha|a\s+lidar|a\s+dividir|a\s+esperar)/i,
  /\b(?:auxilia|facilita|promove|estimula|desenvolve|trabalha)\s+(?:a\s+|o\s+)?(?:processo|transi[çc][ãa]o|emo[çc][õo]es|autoestima|empatia|adapta[çc][ãa]o|aceita[çc][ãa]o)/i,
  /\b(?:deve|devem|precisa|precisam)\s+(?:ler|ser lido|conversar)/i,
  /\b(?:ideal|perfeito|indispens[áa]vel|essencial)\s+para\s+(?:superar|enfrentar|lidar|preparar|acalmar)/i,
  /\b(?:acalma|conforta|tranquiliza|cura|resolve)\s+(?:a\s+)?(?:crian[çc]a|o\s+medo|a\s+ansiedade|o\s+ci[úu]me)/i,
  /\brecomendad[oa]\s+para\s+(?:pais|fam[íi]lias)\s+que/i,
];

// A citação é um recorte de uma página viva, e ela chega torta de dois jeitos
// que eu só descobri rodando isto de verdade:
//
// 1. corte do próprio agente, marcado "[…]". A primeira versão normalizava
//    antes de separar os pedaços — e a normalização apagava os colchetes. O
//    tratamento de elisão era código morto, e os testes não perceberam porque
//    o caso passava por outro caminho, o do prefixo. Acerto por acidente.
// 2. encoding quebrado da própria fonte: o Google Books serve a ficha de "Nós
//    agora somos quatro" escrevendo "fam?lia" e "ningu?m". A citação guardada
//    está certa; a página é que chega assim.
//
// Daí a tolerância ser exatamente uma: letra acentuada casa com qualquer
// caractere. O resto da frase tem que bater letra a letra — senão isto vira um
// verificador que aprova tudo, que é pior que não ter verificador.
// Só as letras e os números contam. Fora fica tudo que a página pode escrever
// diferente sem mudar o que está escrito: pontuação, espaço, traço, e as marcas
// bidi invisíveis que a Amazon enfia no meio de "Idade de leitura ‏ : ‎ 3 - 5
// anos" — que foi o que reprovou essa citação verdadeira na primeira tentativa.
//
// A única tolerância de verdade é no acento, e ela existe por um motivo
// concreto: o Google Books serve a ficha de "Nós agora somos quatro" escrevendo
// "fam?lia" e "ningu?m". A letra acentuada da citação pode chegar como outra
// coisa ou não chegar. Toda letra sem acento tem que estar lá, na ordem — é o
// que separa isto de um verificador que aprova qualquer coisa.
const soLetras = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const padraoTolerante = (t) => [...String(t)].map(c => {
  const d = c.normalize('NFD');
  const base = d[0].toLowerCase();
  if (!/[a-z0-9]/.test(base)) return '';           // pontuação, espaço, invisível
  if (d.length > 1) return '.{0,1}';               // acentuada: pode vir torta
  return base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}).join('');

export function citada(trecho, texto) {
  const t = String(trecho || '').trim();
  if (!t) return { ok: false, motivo: 'trecho vazio' };
  const pag = soLetras(texto);
  const pedacos = t.split(/\[\s*(?:…|\.{3})\s*\]/).map(x => x.trim()).filter(x => soLetras(x).length >= 8);
  if (!pedacos.length) return { ok: false, motivo: 'trecho curto demais pra verificar' };
  try {
    if (pedacos.every(p => new RegExp(padraoTolerante(p)).test(pag))) {
      return { ok: true, motivo: pedacos.length > 1 ? 'em partes' : 'literal' };
    }
  } catch { /* trecho vira regex inválida: cai pro caminho de baixo */ }

  // A loja pode ter encurtado a sinopse depois que citamos. Conferir o começo
  // ainda prova que a frase saiu dali — mas é resultado mais fraco, e a saída
  // diz isso em vez de carimbar "confere" junto com os outros.
  const palavras = pedacos[0].split(/\s+/);
  if (palavras.length >= 12) {
    try {
      if (new RegExp(padraoTolerante(palavras.slice(0, 12).join(' '))).test(pag)) {
        return { ok: true, motivo: 'só o início confere' };
      }
    } catch { /* idem */ }
  }
  // Dizer "não achei" não ajuda ninguém a consertar. A primeira versão ainda
  // contava as palavras do primeiro pedaço mesmo quando quem falhou foi o
  // terceiro — mandou procurar no lugar errado. Agora aponta o pedaço que não
  // bateu e a palavra onde ele descolou da página, que foi como apareceu que
  // "brincadeiras" na citação é "brincandeiras" na página da editora.
  const ruim = pedacos.find(x => { try { return !new RegExp(padraoTolerante(x)).test(pag); } catch { return true; } }) || pedacos[0];
  const ws = ruim.split(/\s+/);
  let ate = 0;
  while (ate < ws.length) {
    const tentativa = ws.slice(0, ate + 1).join(' ');
    try { if (!new RegExp(padraoTolerante(tentativa)).test(pag)) break; } catch { break; }
    ate++;
  }
  const onde = ate < ws.length ? `descola em "${ws.slice(Math.max(0, ate - 2), ate + 2).join(' ')}"` : 'não achei onde descola';
  return { ok: false, motivo: `${ate}/${ws.length} palavras batem; ${onde}` };
}

// O teste importa este módulo pra usar PRESCRITIVO e citada. Importar não pode
// disparar uma rodada que abre 19 páginas na rede.
if (process.argv[1]?.endsWith('auditoria.mjs')) await rodar();

async function rodar() {
const prosaSuspeita = [];
for (const [tipo, campos] of Object.entries(PROSA)) {
  for (const item of lerTodos(tipo === 'situacao' ? P.situacoes : P.livros)) {
    for (const campo of campos) {
      const v = item[campo];
      if (typeof v !== 'string') continue;
      for (const re of PRESCRITIVO) {
        const m = v.match(re);
        if (m) prosaSuspeita.push({ arquivo: item.slug || item.isbn13, campo, trecho: m[0], frase: v.slice(Math.max(0, v.indexOf(m[0]) - 60), v.indexOf(m[0]) + 90) });
      }
    }
  }
}

console.log(`\n== frases prescritivas na prosa do agente ==`);
if (!prosaSuspeita.length) console.log('  nenhuma.');
for (const s of prosaSuspeita) console.log(`  ! ${s.arquivo} · ${s.campo}: "${s.trecho}"\n      …${s.frase}…`);

if (SO) process.exit(prosaSuspeita.length ? 1 : 0);

// --- citações ------------------------------------------------------------
const EXTRATOR = `(() => ({ texto: document.body ? document.body.innerText : '', titulo: document.title }))()`;

const porUrl = new Map();
for (const l of [...lerTodos(P.livros), ...lerTodos(P.situacoes)]) {
  for (const e of (l.evidencias || [])) {
    if (!porUrl.has(e.url)) porUrl.set(e.url, []);
    porUrl.get(e.url).push({ de: l.isbn13 || l.slug, titulo: l.titulo || l.nome, ...e });
  }
}

console.log(`\n== citações: ${[...porUrl.values()].flat().length} em ${porUrl.size} páginas ==`);
let confere = 0, falhou = 0, inacessivel = 0;
for (const [url, evs] of porUrl) {
  let pagina;
  try {
    pagina = await renderizar(url, EXTRATOR);
  } catch (e) {
    inacessivel += evs.length;
    console.log(`  ? ${url}\n      não abriu: ${e.message} — citação não verificada (não é o mesmo que errada)`);
    continue;
  }
  for (const ev of evs) {
    const r = citada(ev.trecho, pagina.texto);
    if (r.ok) { confere++; console.log(`  ✓ ${ev.de} · ${r.motivo} · ${url.slice(0, 70)}`); }
    else { falhou++; console.log(`  ✗ ${ev.de} (${ev.titulo}) · ${r.motivo}\n      url: ${url}\n      cita: "${String(ev.trecho).slice(0, 160)}"`); }
  }
  await new Promise(r => setTimeout(r, 1200));
}

console.log(`\n${confere} conferem · ${falhou} não conferem · ${inacessivel} não deu pra abrir · ${prosaSuspeita.length} frase(s) prescritiva(s)`);
process.exit(falhou || prosaSuspeita.length ? 1 : 0);
}

import { P, lerTodos, isbn13Valido, EDITORA_PAGA } from './lib.mjs';
import { basename, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Linguagem prescritiva: a trava ética. Descrever o livro é permitido,
// prometer efeito terapêutico não. Só roda em texto que o agente escreveu —
// nunca em evidencias[].trecho, que é citação de terceiro.
const PRESCRITIVO = [
  /ajuda(?:r)? (?:a|o|seu|sua) (?:crian[çc]a|filh[oa]|beb[êe])/i,
  /ensina (?:a|o|seu|sua)? ?(?:crian[çc]a|filh[oa]|a lidar|a superar)/i,
  /trabalha (?:o|a|os|as) (?:sentimento|emo[çc][ãa]o|luto|medo|ci[úu]me)/i,
  /processar (?:a perda|o luto|o sentimento)/i,
  /super(?:a|ar|ando) (?:o|a) (?:medo|luto|perda|ci[úu]me|trauma)/i,
  /(?:é|e) terap[êe]utic/i,
  /recomendado por (?:psic[óo]log|pediatra|terapeut)/i,
  /(?:vai|ir[áa]) (?:fazer|deixar) (?:a crian[çc]a|seu filho)/i,
  /indicado para tratar/i,
  /resolve (?:o|a) (?:ci[úu]me|medo|ansiedade)/i,
  /faz a crian[çc]a (?:entender|aceitar|superar)/i,
  /garante que (?:a crian[çc]a|seu filho)/i,
  /falha em /i,            // Fable: "não aborda", nunca "falha em"
];

// 'ficha_tecnica' é a tabela de dados da página de venda (idade indicada,
// páginas, ISBN), que a loja recebe da editora. Não é 'ficha_catalografica',
// que é o CIP impresso no livro, nem resenha: ninguém escreveu, é metadado.
const TIPOS_EVIDENCIA = new Set(['sinopse_editora', 'ficha_catalografica', 'ficha_tecnica', 'resenha_assinada', 'material_editora']);
const RUBRICA = {
  idade_editora: ['nao_coberto'],   // ou uma faixa livre, ver abaixo
  nomeia_evento: ['direto', 'metafora', 'nao_coberto'],
  enquadramento: ['religioso', 'secular', 'ambiguo', 'nao_coberto'],
  narrador: ['crianca', 'adulto', 'animal', 'objeto', 'nao_coberto'],
  forma: ['prosa', 'rimado', 'palavras_chave', 'tete_beche', 'nao_coberto'],
  material_adulto: ['sim', 'nao', 'nao_coberto'],
};

const erros = [];
const avisos = [];
const err = (f, m) => erros.push(`${f}: ${m}`);
const avi = (f, m) => avisos.push(`${f}: ${m}`);

function lintPrescritivo(arquivo, campo, texto) {
  if (!texto) return;
  for (const re of PRESCRITIVO) {
    const m = String(texto).match(re);
    if (m) err(basename(arquivo), `linguagem prescritiva em "${campo}": «${m[0]}»`);
  }
}

const CONTADORES = new Set(['n_livros', 'n_idade', 'n_sem_idade']);
const situacoes = lerTodos(P.situacoes);
const livros = lerTodos(P.livros);
const slugs = new Map(situacoes.map(s => [s.slug, s]));

for (const s of situacoes) {
  const f = basename(s.arquivo);
  if (basename(s.arquivo, '.json') !== s.slug) err(f, `nome do arquivo não bate com slug "${s.slug}"`);
  for (const c of ['titulo', 'pergunta', 'descricao', 'curadoria']) if (!s[c]) err(f, `falta campo "${c}"`);

  // A descrição pede contagem ao build ({n_livros}, {n_idade}, {n_sem_idade};
  // {N_...} sai com maiúscula) em vez de trazer o número escrito na mão. Um
  // número na mão envelhece calado: a frase "nenhuma das nove editoras indica
  // faixa etária" virou falsa em 18/09 sem ninguém editar nada. Placeholder que
  // o build não conhece iria cru pra página, então trava aqui.
  for (const campo of ['descricao', 'lacuna']) {
    for (const m of String(s[campo] ?? '').matchAll(/\{([^}]*)\}/g)) {
      if (!CONTADORES.has(m[1].toLowerCase())) err(f, `${campo} pede "{${m[1]}}", que o build não sabe preencher`);
    }
  }
  lintPrescritivo(s.arquivo, 'descricao', s.descricao);
  lintPrescritivo(s.arquivo, 'pergunta', s.pergunta);
  lintPrescritivo(s.arquivo, 'lacuna', s.lacuna);
  if (!['humano', 'agente'].includes(s.curadoria)) err(f, `curadoria inválida: "${s.curadoria}"`);
}

for (const l of livros) {
  const f = basename(l.arquivo);

  // 1. livro inventado — a falha que mata o nicho
  if (!isbn13Valido(l.isbn13)) err(f, `ISBN-13 inválido: "${l.isbn13}"`);
  if (basename(l.arquivo, '.json') !== String(l.isbn13)) err(f, 'nome do arquivo não é o ISBN-13');
  const res = l.disponibilidade?.resolucoes || [];
  if (res.length === 0) err(f, 'nenhuma resolução externa — o livro não foi provado existir');
  else if (!res.some(r => r.titulo_bateu)) err(f, 'nenhuma resolução externa confirmou o título');
  // Prova de segunda fonte (SPEC, anti-alucinação): catálogo externo devolve um
  // id que qualquer um reconsulta; ficha de loja não. Então ela só vale com a
  // URL e o que estava escrito lá — prova que ninguém consegue reabrir não é
  // prova, é lembrança.
  for (const r of res) {
    if (r.fonte !== 'ficha_loja' || !r.titulo_bateu) continue;
    for (const c of ['url', 'trecho', 'isbn13', 'em']) {
      if (!r[c]) err(f, `prova por ficha de loja sem "${c}" — ninguém consegue reabrir`);
    }
    if (r.isbn13 && String(r.isbn13) !== String(l.isbn13)) {
      err(f, `prova por ficha de loja é de outro ISBN (${r.isbn13})`);
    }
  }

  // 2. campos obrigatórios
  for (const c of ['titulo', 'autor', 'editora', 'situacoes', 'curadoria', 'verificado_em']) {
    if (l[c] === undefined || l[c] === '' || (Array.isArray(l[c]) && !l[c].length)) err(f, `falta campo "${c}"`);
  }
  if (!['humano', 'agente'].includes(l.curadoria)) err(f, `curadoria inválida: "${l.curadoria}"`);
  if (typeof l.nao_coberto !== 'string' || !l.nao_coberto.trim()) {
    err(f, 'falta "nao_coberto" — toda página precisa dizer o que a evidência não cobre');
  }

  // 3. situações existem e não são bloqueadas
  for (const sl of (l.situacoes || [])) {
    const s = slugs.get(sl);
    if (!s) err(f, `situação inexistente: "${sl}"`);
    else if (s.bloqueada && l.curadoria === 'agente') err(f, `situação "${sl}" é bloqueada ao loop autônomo`);
  }

  // 4. evidências
  const evs = l.evidencias || [];
  if (!evs.length) err(f, 'sem evidência citada');
  evs.forEach((e, i) => {
    if (!TIPOS_EVIDENCIA.has(e.tipo)) err(f, `evidencia[${i}] tipo inválido: "${e.tipo}"`);
    for (const c of ['url', 'trecho', 'acessado_em']) if (!e[c]) err(f, `evidencia[${i}] falta "${c}"`);
    if (e.tipo === 'resenha_assinada' && !e.autor) err(f, `evidencia[${i}] resenha assinada sem autor`);
    if (e.trecho && e.trecho.length > 600) avi(f, `evidencia[${i}] trecho muito longo (${e.trecho.length})`);
  });

  // 5. rubrica: todo campo afirmado aponta pra evidência que o sustenta
  const r = l.rubrica || {};
  for (const [campo, valores] of Object.entries(RUBRICA)) {
    const v = r[campo];
    if (v === undefined) { err(f, `rubrica falta "${campo}"`); continue; }
    const valor = typeof v === 'object' ? v.valor : v;
    if (campo === 'idade_editora') {
      if (valor !== 'nao_coberto' && !/^\d{1,2}(\+|\s*a\s*\d{1,2})?$/.test(String(valor))) {
        err(f, `rubrica.idade_editora deve ser faixa ("3 a 6", "6+") ou "nao_coberto": "${valor}"`);
      }
    } else if (!valores.includes(valor)) err(f, `rubrica.${campo} valor inválido: "${valor}"`);
    if (valor !== 'nao_coberto') {
      const base = typeof v === 'object' ? v.base : undefined;
      if (base === undefined) err(f, `rubrica.${campo}="${valor}" sem "base" apontando pra evidência`);
      else if (!Number.isInteger(base) || base < 0 || base >= evs.length) err(f, `rubrica.${campo}.base=${base} não existe`);
    }
  }

  // 5b. edições alternativas e links de loja
  for (const o of (l.outras_edicoes || [])) {
    if (!isbn13Valido(o.isbn13)) err(f, `outras_edicoes: ISBN-13 inválido: "${o.isbn13}"`);
    if (o.isbn13 === l.isbn13) err(f, 'outras_edicoes repete o ISBN da própria página');
  }
  for (const c of (l.disponibilidade?.compra || [])) {
    if (!c.loja || !/^https:\/\//.test(c.url || '')) err(f, `compra inválida: ${JSON.stringify(c)}`);
  }

  // 6. linguagem prescritiva no texto do agente (não nas citações)
  lintPrescritivo(l.arquivo, 'nao_coberto', l.nao_coberto);
  lintPrescritivo(l.arquivo, 'nao_aborda', l.nao_aborda);
  if (l.nota) lintPrescritivo(l.arquivo, 'nota', l.nota);
}

// régua editorial: editora paga pelo autor só em situação com menos de 4 títulos,
// marcada na página, e nunca em "se for comprar um só"
for (const l of livros) {
  const f = basename(l.arquivo);
  const paga = l.editora_paga === true || EDITORA_PAGA.test(l.editora || '');
  if (!paga) continue;
  if (l.editora_paga !== true) err(f, `"${l.editora}" é editora paga pelo autor: fora da curadoria, ou marque editora_paga: true (SPEC, régua editorial)`);
  for (const sl of (l.situacoes || [])) {
    const s = slugs.get(sl); if (!s) continue;
    if ((s.faixas || []).some(x => x.isbn13 === l.isbn13)) err(f, `editora paga pelo autor não pode ser "se for comprar um só" em "${sl}"`);
    const n = livros.filter(x => (x.situacoes || []).includes(sl)).length;
    if (n >= 4) err(f, `editora paga pelo autor em "${sl}", que já tem ${n} títulos — a régua só admite com menos de 4`);
  }
}

// "Esta é a capa de X" é uma afirmação como qualquer outra do site, e era a
// única sem quem a conferisse. O `sha1` existe pra provar que o arquivo servido
// é o que alguém abriu e aprovou — mas nada comparava o registro com o disco, e
// sete das quinze capas estavam com a impressão digital de outros bytes (as que
// vieram do `enriquecer.mjs`, redimensionadas depois sem atualizar o registro).
// Enquanto o número não era conferido, ele não provava nada: foi assim que "Eu
// só só eu" ficou dias publicando uma ilustração de miolo como capa.
for (const l of livros) {
  const c = l.capa;
  if (!c?.arquivo) continue;
  const caminho = join(P.ROOT, 'data/capas', c.arquivo);
  if (!existsSync(caminho)) { err(l.isbn13, `capa ${c.arquivo} não existe em data/capas`); continue; }
  if (!c.sha1) { avi(l.isbn13, "capa sem sha1 — não dá pra provar que é a imagem conferida"); continue; }
  const real = createHash('sha1').update(readFileSync(caminho)).digest('hex');
  if (real !== c.sha1) err(l.isbn13, `sha1 da capa não bate com o arquivo (registro ${c.sha1.slice(0, 12)}, disco ${real.slice(0, 12)}) — alguém trocou os bytes sem reconferir a imagem`);
}

const dup = {};
for (const l of livros) for (const i of [l.isbn13, ...(l.outras_edicoes || []).map(o => o.isbn13)]) dup[i] = (dup[i] || 0) + 1;
for (const [i, n] of Object.entries(dup)) if (n > 1) err('catálogo', `ISBN duplicado: ${i} (${n}x)`);

console.log(`situações: ${situacoes.length}  livros: ${livros.length}`);
for (const a of avisos) console.log(`  aviso  ${a}`);
for (const e of erros) console.log(`  ERRO   ${e}`);
if (erros.length) { console.log(`\n${erros.length} erro(s). Nada vai pro ar.`); process.exit(1); }
console.log('\nok — catálogo íntegro.');

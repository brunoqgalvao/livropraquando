import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const P = {
  ROOT,
  livros: join(ROOT, 'data/livros'),
  situacoes: join(ROOT, 'data/situacoes'),
  runtime: join(ROOT, 'runtime'),
  site: join(ROOT, 'site'),
};

// --- JSON canônico -------------------------------------------------------
// Chaves sempre na mesma ordem, ausência em vez de null, arrays ordenados.
// O diff do git é a medida de slop: ruído de serialização a destrói.
const ORDEM_LIVRO = [
  'isbn13', 'titulo', 'subtitulo', 'autor', 'ilustrador', 'tradutor',
  'editora', 'ano', 'ano_original', 'origem', 'paginas', 'idade_editora',
  'situacoes', 'rubrica', 'evidencias', 'nao_coberto', 'nao_aborda',
  'disponibilidade', 'curadoria', 'verificado_em',
];
const ORDEM_SIT = [
  'slug', 'titulo', 'pergunta', 'descricao', 'faixas', 'bloqueada',
  'curadoria', 'verificado_em',
];

function ordena(obj, ordem) {
  const out = {};
  for (const k of ordem) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  for (const k of Object.keys(obj).sort()) {
    if (!ordem.includes(k) && obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

export const canonicalLivro = (l) => JSON.stringify(ordena(l, ORDEM_LIVRO), null, 2) + '\n';
export const canonicalSit = (s) => JSON.stringify(ordena(s, ORDEM_SIT), null, 2) + '\n';

export function lerTodos(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ arquivo: join(dir, f), ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}

export function gravar(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  const anterior = existsSync(caminho) ? readFileSync(caminho, 'utf8') : null;
  if (anterior === conteudo) return false;   // não toca o mtime à toa
  writeFileSync(caminho, conteudo);
  return true;
}

// --- ISBN ----------------------------------------------------------------
export function isbn13Valido(s) {
  const d = String(s || '').replace(/[^0-9X]/gi, '');
  if (d.length !== 13 || !/^\d{13}$/.test(d)) return false;
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(d[i]) * (i % 2 ? 3 : 1);
  return (10 - (soma % 10)) % 10 === Number(d[12]);
}

// Editora paga pelo autor. SPEC, "Régua editorial": fora da curadoria por padrão.
export const EDITORA_PAGA = /dial[ée]tica|clube de autores|appris|autografia|scortecci|uiclap|viseu|kelps|paco editorial|bara[úu]na/i;

// O site é em português e quem lê a data está no Brasil. `toISOString` é UTC:
// depois das 21h de Brasília ele já carimba o dia seguinte, e a página passa a
// dizer "conferido em 19/09" na noite do dia 18 — data no futuro pra quem lê,
// num site cujo argumento inteiro é que o dado foi conferido e quando. Achei
// rodando a rotina às 21h07; de manhã, que é quando o agente diário roda, o
// defeito não aparece.
export const dataBr = (d) => d ? String(d).split('-').reverse().join('/') : '';

export const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export async function buscaJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'livropraisso/1.0 (+catalogo de livro infantil)' } });
    if (!r.ok) return { erro: `HTTP ${r.status}` };
    return { dados: await r.json() };
  } catch (e) {
    return { erro: String(e.message || e) };
  } finally { clearTimeout(t); }
}

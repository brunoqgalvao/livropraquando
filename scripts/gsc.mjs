// Search Console. Autentica por service account (JWT assinado na hora, sem dependência).
// A chave fica fora do repo: ~/.config/livropraquando/gsc-sa.json
import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CHAVE = process.env.GSC_SA_KEY || join(homedir(), '.config/livropraquando/gsc-sa.json');
const SITE = process.env.GSC_SITE || 'sc-domain:livropraquando.com';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

const LEITURA = 'https://www.googleapis.com/auth/webmasters.readonly';
const ESCRITA = 'https://www.googleapis.com/auth/webmasters';

async function token(escopo = LEITURA) {
  if (!existsSync(CHAVE)) throw new Error(`sem chave em ${CHAVE}`);
  const sa = JSON.parse(readFileSync(CHAVE, 'utf8'));
  const agora = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email, scope: escopo,
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600,
  };
  const corpo = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
  const assinatura = createSign('RSA-SHA256').update(corpo).end().sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${corpo}.${assinatura}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`oauth falhou: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

const diasAtras = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export async function desempenho({ dias = 28, dimensao = 'query', limite = 25 } = {}) {
  const t = await token();
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
    method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: JSON.stringify({ startDate: diasAtras(dias), endDate: diasAtras(1), dimensions: [dimensao], rowLimit: limite }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`gsc: ${j.error.message}`);
  return j.rows || [];
}

// Inspeção de URL: responde o que o relatório de desempenho não responde nos
// primeiros dias. "0 impressões" é ambíguo — pode ser que o Google não conheça
// a página, que conheça e não indexe, ou que indexe e ninguém tenha buscado.
// Só isto aqui separa os três casos, e só o terceiro é questão de esperar.
export async function inspecionar(url) {
  const t = await token();
  const r = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE, languageCode: 'pt-BR' }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`inspeção: ${j.error.message}`);
  return j.inspectionResult || {};
}

export async function sitemaps() {
  const t = await token();
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps`,
    { headers: { authorization: `Bearer ${t}` } });
  const j = await r.json();
  if (j.error) throw new Error(`sitemaps: ${j.error.message}`);
  return j.sitemap || [];
}

// Reenviar avisa o Google que o arquivo mudou. Precisou em 18/09: ele tinha
// baixado a versão de 10 URLs, de antes dos livros entrarem, e as 14 páginas de
// livro -- que é onde mora todo o dado conferido -- nunca foram rastreadas.
export async function enviarSitemap(url = `https://livropraquando.com/sitemap.xml`) {
  const t = await token(ESCRITA);
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps/${encodeURIComponent(url)}`,
    { method: 'PUT', headers: { authorization: `Bearer ${t}` } });
  if (!r.ok && r.status !== 204) throw new Error(`reenvio falhou: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return true;
}

if (process.argv[1]?.endsWith('gsc.mjs') && process.argv[2] === 'reenviar-sitemap') {
  await enviarSitemap(process.argv[3]);
  console.log('sitemap reenviado ao Search Console');
  process.exit(0);
}

if (process.argv[1]?.endsWith('gsc.mjs') && process.argv[2] === 'sitemap') {
  for (const s of await sitemaps()) {
    console.log(`${s.path}`);
    console.log(`  enviado em    : ${(s.lastSubmitted || '-').slice(0, 10)}`);
    console.log(`  lido em       : ${(s.lastDownloaded || 'NUNCA').slice(0, 10)}`);
    console.log(`  erros/avisos  : ${s.errors || 0} / ${s.warnings || 0}`);
    console.log(`  urls          : ${(s.contents || []).map(c => `${c.type}: ${c.submitted}${c.indexed !== undefined ? ` (indexadas ${c.indexed})` : ''}`).join(', ') || '-'}`);
    console.log(`  pendente      : ${s.isPending ? 'sim' : 'não'}`);
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith('gsc.mjs') && process.argv[2] === 'inspecionar') {
  const alvos = process.argv.slice(3);
  if (!alvos.length) { console.error('uso: node scripts/gsc.mjs inspecionar <url> [url...]'); process.exit(2); }
  for (const u of alvos) {
    try {
      const r = await inspecionar(u);
      const i = r.indexStatusResult || {};
      const ricos = (r.richResultsResult?.detectedItems || []).map(d => `${d.richResultType}(${(d.items || []).length})`).join(', ');
      console.log(`\n${u}`);
      console.log(`  veredito      : ${i.verdict || '-'} · ${i.coverageState || '-'}`);
      console.log(`  rastreado em  : ${i.lastCrawlTime ? i.lastCrawlTime.slice(0, 10) : 'nunca'}`);
      console.log(`  canônica      : ${i.googleCanonical === u ? 'a própria' : (i.googleCanonical || '-')}`);
      console.log(`  robots        : ${i.robotsTxtState || '-'} · indexação: ${i.indexingState || '-'}`);
      console.log(`  dado estrut.  : ${ricos || 'o Google ainda não leu nenhum'} ${r.richResultsResult?.verdict ? `[${r.richResultsResult.verdict}]` : ''}`);
    } catch (e) { console.log(`\n${u}\n  ERRO: ${e.message}`); }
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith('gsc.mjs')) {
  const dim = process.argv[2] || 'query';
  const linhas = await desempenho({ dimensao: dim });
  if (!linhas.length) { console.log(`sem dados ainda para ${dim} (site novo — o Google leva dias)`); }
  const tot = linhas.reduce((a, l) => ({ i: a.i + l.impressions, c: a.c + l.clicks }), { i: 0, c: 0 });
  console.log(`${SITE} · ${dim} · ${linhas.length} linhas · ${tot.i} impressões · ${tot.c} cliques`);
  for (const l of linhas.slice(0, 15)) {
    console.log(`  ${String(l.impressions).padStart(5)} imp  ${String(l.clicks).padStart(3)} cl  pos ${l.position.toFixed(1).padStart(5)}  ${l.keys[0]}`);
  }
}

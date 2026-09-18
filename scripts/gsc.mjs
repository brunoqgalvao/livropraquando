// Search Console. Autentica por service account (JWT assinado na hora, sem dependência).
// A chave fica fora do repo: ~/.config/livropraquando/gsc-sa.json
import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CHAVE = process.env.GSC_SA_KEY || join(homedir(), '.config/livropraquando/gsc-sa.json');
const SITE = process.env.GSC_SITE || 'sc-domain:livropraquando.com';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function token() {
  if (!existsSync(CHAVE)) throw new Error(`sem chave em ${CHAVE}`);
  const sa = JSON.parse(readFileSync(CHAVE, 'utf8'));
  const agora = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
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

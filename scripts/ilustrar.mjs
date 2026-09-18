import { P, ROOT, lerTodos } from './lib.mjs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ESTILO = 'Estilo: ilustração editorial de livro infantil em guache e papel recortado, formas simples e chapadas, textura de papel visível, paleta restrita a creme, azul-petróleo profundo, terracota e ocre, luz suave, composição calma com bastante respiro. Sem nenhum texto, letra, número ou logotipo. Não reproduzir capa, personagem ou traço de livro existente. Rostos simplificados, sem detalhe realista.';
const CAPA = 'Um adulto e uma criança pequena sentados juntos numa poltrona, lendo um livro ilustrado aberto à noite, abajur aceso, janela com lua ao fundo, do livro saem formas de papel recortado: folhas, estrelas, um pássaro.';

const chave = process.env.OPENAI_API_KEY || JSON.parse(readFileSync(join(homedir(), '.zapcli/config.json'), 'utf8')).openaiApiKey;
const dir = join(ROOT, 'assets/img');
mkdirSync(dir, { recursive: true });
const forcar = process.argv.includes('--forcar');
const alvos = [{ nome: 'capa', cena: CAPA }, ...lerTodos(P.situacoes).filter(s => s.ilustracao).map(s => ({ nome: s.slug, cena: s.ilustracao }))];

for (const a of alvos) {
  const destino = join(dir, `${a.nome}.webp`);
  if (existsSync(destino) && !forcar) continue;
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: `${a.cena} ${ESTILO}`, size: '1536x1024', quality: 'high', output_format: 'webp', output_compression: 72 }),
  });
  const j = await r.json();
  if (!r.ok) { console.error(`${a.nome}: HTTP ${r.status} ${j.error?.message || ''}`); process.exitCode = 1; continue; }
  writeFileSync(destino, Buffer.from(j.data[0].b64_json, 'base64'));
  console.log(`${a.nome}: ok`);
}

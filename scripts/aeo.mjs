import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const KEY = process.env.OPENROUTER_API_KEY || readFileSync(`${process.env.HOME}/.config/keys.env`, "utf8").match(/OPENROUTER_API_KEY=(\S+)/)?.[1];
const MODELS = (process.env.AEO_MODELS || "perplexity/sonar,openai/gpt-4o-mini:online,google/gemini-2.5-flash:online,anthropic/claude-haiku-4.5:online").split(",");
const PROMPTS = [
  ["desfralde", "Qual livro infantil ajuda meu filho de 2 anos a largar a fralda?"],
  ["desfralde", "Livro para desfralde em português, qual comprar?"],
  ["medo-do-escuro", "Meu filho de 4 anos tem medo do escuro. Tem algum livro infantil que ajude?"],
  ["medo-do-escuro", "Melhores livros infantis sobre medo do escuro em português"],
  ["vai-nascer-um-irmao", "Vai nascer um irmãozinho, que livro infantil ler pro meu filho mais velho?"],
  ["vai-nascer-um-irmao", "Livro infantil para preparar a criança para a chegada do irmão"],
  ["primeiro-dia-de-aula", "Minha filha vai começar na escola. Que livro infantil ajuda no primeiro dia de aula?"],
  ["primeiro-dia-de-aula", "Livros infantis sobre adaptação escolar em português"],
  ["geral", "Site que indica livro infantil por situação da vida da criança"],
];

const ask = async (model, prompt) => {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(120000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 160)}`);
  const m = j.choices?.[0]?.message || {};
  const cites = [...(j.citations || []), ...(m.annotations || []).map(a => a.url_citation?.url).filter(Boolean)];
  const urls = [...new Set([...cites, ...(m.content?.match(/https?:\/\/[^\s)\]]+/g) || [])])];
  return { text: m.content || "", urls };
};

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const results = [];
await Promise.all(MODELS.flatMap(model => PROMPTS.map(async ([situacao, prompt]) => {
  try {
    const { text, urls } = await ask(model, prompt);
    results.push({ model, situacao, prompt, nos: /livropraquando/i.test(text + urls.join(" ")), hosts: [...new Set(urls.map(host))], urls, text });
  } catch (e) {
    results.push({ model, situacao, prompt, erro: e.message });
  }
})));

const day = new Date().toISOString().slice(0, 10);
mkdirSync("runtime", { recursive: true });
writeFileSync(`runtime/aeo-${day}.json`, JSON.stringify(results, null, 2));

const ok = results.filter(r => !r.erro);
const hosts = {};
for (const r of ok) for (const h of r.hosts) hosts[h] = (hosts[h] || 0) + 1;
console.log(`respostas ${ok.length}/${results.length} · citam livropraquando: ${ok.filter(r => r.nos).length}`);
for (const r of results.filter(r => r.erro)) console.log(`erro ${r.model}: ${r.erro}`);
console.log("fontes mais citadas:");
for (const [h, n] of Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${n}  ${h}`);

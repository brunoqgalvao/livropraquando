// Chromium headless da VM, por CDP. Sem playwright, sem puppeteer: o Node 24 já
// tem WebSocket e o protocolo cabe em 60 linhas. A dependência que não existe
// não quebra o agente diário às 3 da manhã.
//
// Existe porque HTML cru não serve: as páginas de editora são SPA e chegam
// vazias. A idade indicada, o estoque e o preço só aparecem depois do JS rodar.
// Padrão é localhost porque a produção é a VM, que roda o Chromium ao lado
// (unit `vm-browser`). Do Mac, pela Tailscale:
//   LIVRO_CDP=http://100.81.212.41:9222 node scripts/renderizar.mjs
const HOST = process.env.LIVRO_CDP || 'http://127.0.0.1:9222';

export async function abrirAba() {
  const r = await fetch(`${HOST}/json/new?url=about:blank`, { method: 'PUT', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`CDP não abriu aba: HTTP ${r.status}`);
  const alvo = await r.json();
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((ok, err) => {
    ws.onopen = ok;
    ws.onerror = () => err(new Error('websocket do CDP recusou'));
  });

  let seq = 0;
  const pendentes = new Map();
  const ouvintes = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendentes.has(m.id)) {
      const { ok, err } = pendentes.get(m.id);
      pendentes.delete(m.id);
      m.error ? err(new Error(m.error.message)) : ok(m.result);
    } else if (m.method) {
      for (const f of ouvintes.slice()) f(m);
    }
  };

  const enviar = (metodo, params = {}) => new Promise((ok, err) => {
    const meu = ++seq;
    pendentes.set(meu, { ok, err });
    ws.send(JSON.stringify({ id: meu, method: metodo, params }));
    setTimeout(() => {
      if (pendentes.delete(meu)) err(new Error(`CDP não respondeu ${metodo}`));
    }, 45000);
  });

  const esperar = (metodo, ms) => new Promise((ok) => {
    const t = setTimeout(() => { solta(); ok(null); }, ms);
    const f = (m) => { if (m.method === metodo) { clearTimeout(t); solta(); ok(m.params); } };
    const solta = () => { const i = ouvintes.indexOf(f); if (i >= 0) ouvintes.splice(i, 1); };
    ouvintes.push(f);
  });

  return {
    enviar, esperar,
    fechar: async () => {
      try { ws.close(); } catch {}
      await fetch(`${HOST}/json/close/${alvo.id}`, { signal: AbortSignal.timeout(8000) }).catch(() => {});
    },
  };
}

// Nunca chame Runtime.enable aqui: numa página de loja o fluxo de eventos de
// console afoga o socket e o Runtime.evaluate seguinte nunca volta. Custou uma
// tarde em 18/09.
export async function renderizar(url, extrator, { assentar = 3000, carga = 25000 } = {}) {
  const aba = await abrirAba();
  try {
    await aba.enviar('Page.enable');
    const nav = await aba.enviar('Page.navigate', { url });
    if (nav.errorText) throw new Error(`navegação falhou: ${nav.errorText}`);
    const carregou = await aba.esperar('Page.loadEventFired', carga);
    await new Promise(r => setTimeout(r, assentar));
    const { result, exceptionDetails } = await aba.enviar('Runtime.evaluate', {
      expression: extrator, returnByValue: true, awaitPromise: false,
    });
    if (exceptionDetails) throw new Error(`extrator quebrou: ${exceptionDetails.text}`);
    return { ...result.value, carregou: !!carregou };
  } finally {
    await aba.fechar();
  }
}

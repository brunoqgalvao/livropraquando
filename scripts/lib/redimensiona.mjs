// Redimensiona pelo canvas do Chromium que já está aberto pra esta tarefa.
//
// Node não encoda imagem sem dependência, e `sips` só existe no Mac — o agente
// diário roda em Linux. O navegador resolve nos dois e já é requisito daqui.
//
// Por que reduzir: a capa aparece com 136px de largura no maior uso (272px em
// tela retina). Servir 1200px custa 400 KB por livro numa página que foi de
// 4,9s pra 0,4s no braço. Capa grande demais é o mesmo tipo de desleixo que
// capa nenhuma, só que mais caro.
import { abrirAba } from '../navegador.mjs';

export async function redimensionar(buf, tipoMime, { lado = 600, qualidade = 0.82 } = {}) {
  const aba = await abrirAba();
  try {
    const entrada = `data:${tipoMime};base64,${buf.toString('base64')}`;
    const { result, exceptionDetails } = await aba.enviar('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `new Promise((ok, erro) => {
        const im = new Image();
        im.onerror = () => erro(new Error('o navegador não decodificou a imagem'));
        im.onload = () => {
          const f = Math.min(1, ${lado} / Math.max(im.naturalWidth, im.naturalHeight));
          if (f >= 1) return ok(null);                       // já é pequena: não mexe
          const c = document.createElement('canvas');
          c.width = Math.round(im.naturalWidth * f);
          c.height = Math.round(im.naturalHeight * f);
          const ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(im, 0, 0, c.width, c.height);
          ok({ dados: c.toDataURL('image/jpeg', ${qualidade}).split(',')[1], w: c.width, h: c.height });
        };
        im.src = ${JSON.stringify(entrada)};
      })`,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || 'canvas falhou');
    const v = result.value;
    if (!v) return null;                                      // nada a fazer
    return { buf: Buffer.from(v.dados, 'base64'), w: v.w, h: v.h, tipo: 'jpeg' };
  } finally {
    await aba.fechar();
  }
}

// 8x8 em tons de cinza pelo mesmo canvas, pra alimentar o `ahash`. Aqui só a
// decodificação; a regra mora em lib/imagem.mjs, com teste.
export async function cinzas8x8(buf, tipoMime) {
  const aba = await abrirAba();
  try {
    const entrada = `data:${tipoMime};base64,${buf.toString('base64')}`;
    const { result, exceptionDetails } = await aba.enviar('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `new Promise((ok, erro) => {
        const im = new Image();
        im.onerror = () => erro(new Error('o navegador não decodificou a imagem'));
        im.onload = () => {
          const c = document.createElement('canvas');
          c.width = 8; c.height = 8;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(im, 0, 0, 8, 8);
          const d = ctx.getImageData(0, 0, 8, 8).data;
          const out = [];
          for (let i = 0; i < d.length; i += 4) out.push(Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]));
          ok(out);
        };
        im.src = ${JSON.stringify(entrada)};
      })`,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || 'canvas falhou');
    return result.value || null;
  } finally {
    await aba.fechar();
  }
}

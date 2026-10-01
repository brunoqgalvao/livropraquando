# Hipóteses SEO/AEO (01/10/2026)

Pedido do Bruno: "procura as boas práticas de SEO/AEO, vamos criando hipóteses e testando". Base: Google Search Central, Bing Webmaster, paper GEO (Aggarwal et al. 2023), estudos Seer e Ahrefs. Linha de base: GSC com 3 impressões e 0 cliques; aeo.mjs com 0/36 citações. Registre a data de início de cada teste no relatório diário e meça nos prazos abaixo.

| # | Mudança | Métrica | Prazo |
|---|---|---|---|
| H1 | Bing Webmaster: verificar o site, enviar o sitemap, ligar AI Performance (ChatGPT search usa o Bing; 87% das citações do SearchGPT batem com o top 10 do Bing) | indexadas no Bing; aeo.mjs | 2 sem |
| H2 | Frase-resposta no topo da situação ("Para X há N livros com edição BR; para 2–3 anos, Y"), com fato citável. **A/B: 2 situações com, 2 sem** | aeo.mjs; CTR no GSC | 4 sem |
| H3 | Bloco de perguntas e respostas descritivo, com dados da matriz. **A/B por grupo** | aeo.mjs; impressões em cauda longa | 4–6 sem |
| H4 | Páginas de entidade por autor e por editora (/a/, /e/) + links cruzados | indexadas; impressões de nome | 4 sem |
| H5 | Volume novo vai antes para situações completas (3+ livros) do que para livros soltos | impressões /s/ vs /l/ | 6 sem |
| H6 | Página "Como verificamos" (rúbrica, ISBN, quem mantém) + `publishingPrinciples` | citações no Perplexity | 6 sem |
| H7 | Estatística própria na situação ("3 de 12 nomeiam o evento; idade mediana 3+"); o GEO mediu +30–40%. **A/B** | aeo.mjs | 4 sem |
| H8 | Menções de terceiros úteis (Reddit, grupos de pais, guest post). Menção de marca correlaciona 0,66 com AI Overviews; backlink, 0,22 | impressões de marca | 8 sem |
| H9 | SEO de imagem: alt descritivo nas capas, ImageObject, `max-image-preview:large` | Imagens/Discover | 6 sem |
| H10 | `lastmod` e `dateModified` só mudam quando há reverificação real; mostrar "verificado em" | estatística de rastreamento | contínuo |

## Riscos ao subir para 10 páginas por dia (scaled content abuse)
- Publicar `/l/` só com 2 ou mais fontes independentes, ou se o livro entrar numa situação. Senão, fila ou `noindex`.
- Não abrir situações quase iguais (doorway): juntar e usar canonical.
- Links Amazon com `rel="sponsored noopener"` e aviso de afiliado na página.
- A abertura tem que variar de fato com os dados, não ser um template com o nome trocado.
- Publicar em lotes. Se passar de 50% em "Rastreada, mas não indexada" no GSC, parar e enriquecer as páginas.

## Para fazer nesta semana
- [ ] Enforce HTTPS no Pages e checar o canonical (o assistente cuida; depende de acesso ao GitHub)
- [ ] Bing Webmaster + sitemap + AI Performance (o assistente cuida)
- [ ] `rel="sponsored noopener"` e aviso de afiliado
- [ ] BreadcrumbList em /s/ e /l/; links entre livros da mesma situação
- [ ] Frase-resposta em 2 situações (H2), com data de início registrada
- [ ] Página "Como verificamos"
- [ ] `lastmod` igual à data real de verificação
- [ ] aeo.mjs toda segunda, histórico guardado (já combinado)

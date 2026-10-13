# Design system — livropraquando (redesign 01/10/2026)

Ideia: livraria infantil boa + bibliotecária cuidadosa. Calor e brincadeira na moldura (cores de lombada, toldo, marcador), rigor no miolo (fontes numeradas, lacunas marcadas). Nada de framework: um CSS estático (~21 KB) e as duas fontes self-hosted que já existiam (Fraunces + Figtree). Nenhuma requisição nova.

## Marca
- Símbolo (`assets/favicon.svg`, também inline no header/rodapé): livro aberto em papel sobre quadrado tinta, com marcador ferrugem pendurado pra fora — "o livro marcado pra hora certa".
- Wordmark: `Livro pra *quando…*` — Fraunces 600, "quando…" em itálico ferrugem. A reticência é o momento que a família está vivendo. Sai do `SITE_NOME` (última palavra vira o itálico).
- Motivo: faixa de 5 lombadas (`--lombadas`) no topo do header, no topo do card de escolha e na base dos cards sem ilustração. Rodapé com borda de toldo (scallop por `mask`, com prefixo `-webkit-`).

## Tokens (`:root` em `assets/site.css`, espelhados em dark mode)
| token | claro | uso |
|---|---|---|
| `--papel` | #fbf5ea | fundo |
| `--cartao` | #fffdf8 | superfícies |
| `--areia` / `--linha` | #f3e9d6 / #e7dcc6 | cabeçalho de tabela, bordas |
| `--tinta` | #16313a | texto, rodapé, botões de loja |
| `--suave` / `--apagado` | #4e5f64 / #7a878b | texto secundário / "não sabemos" |
| `--ferrugem` | #b8432a | links, CTA, rótulo "se for comprar um só" (7.2:1 sobre papel) |
| `--sol` | #f2b640 | **só fundo** atrás de tinta: selo de idade, foco, sublinhados. Nunca texto. |
| `--folha` / `--folha-fundo` | #2f7a55 / #e3f1e8 | "sim" |
| `--ceu` | #e3efee | chips, resumo por IA |

Escala tipográfica 1.25 (`--t-xs` .78rem … `--t-4xl` 3.05rem); títulos Fraunces, corpo Figtree 16px (17px ≥700px). Espaçamento em base 4 (`--e-1` 4px … `--e-8` 64px). Raios 10/16/24 + pill. Duas sombras (`--sombra-1`, `--sombra-2`).

## Componentes
- **Header**: claro, faixa de lombadas, wordmark, "Situações" em pill (alvo 44px). Link "pular para o conteúdo".
- **Herói da situação**: ilustração em moldura de janela arqueada (desktop) e no topo com altura 190px (mobile, pra escolha aparecer cedo); chips de fato (`n livros`, `idade da editora em X de N`, dados de `contagens`).
- **Home**: atalhos de situação logo abaixo do subtítulo (pills com ponto colorido); cards de situação; card sem ilustração ganha painel céu+sol+lombadas com o símbolo.
- **Escolha ("se for comprar um só")**: card com faixa de lombadas, rótulo ferrugem em versalete, capa, citação com fonte. Sem selo girado nem capa 3D (revisão da Fable).
- **Matriz**: tabela no desktop; abaixo de 720px vira pilha de cards (CSS puro, `data-label` em cada `td`), sem rolagem horizontal. As duas primeiras colunas (idade, págs.) ficam num fundo papel em todo card, pra manter um eixo de comparação.
- **Capa de livro**: canto de lombada (2px/6px) + borda de páginas chapada via `box-shadow`. Capa deitada continua inteira.
- **Selos** (`.badge`): idade (fundo sol), páginas/forma (contorno), `nd` pontilhado = "a fonte não diz". Na ficha, valores não cobertos saem em itálico com círculo pontilhado.
- **Onde comprar**: botões de contorno tinta com "sombra de carimbo", grid largura total no mobile, ≥52px de altura. Folhear = botão ferrugem.
- **Evidências**: card com "fonte N" numerada, tipo em versalete petróleo, data; citação em Figtree (não mais itálico serifado pesado) com aspas grandes em sol.
- **Lacunas** ("o que a evidência não cobre", "não aborda", "o que falta"): card tracejado com hachura leve e etiqueta (`data-rotulo`).
- **Rodapé**: tinta com toldo, wordmark, links pras situações, promessa de procedência.
- Foco: anel sol + contorno tinta em todo elemento focável.

## Slots novos (página do livro, só renderizam com dado)
- `l.resumo_ia = { texto, gerado_em, modelo, fontes: [índices de evidencias] }` → "Resumo por IA das fontes", **abaixo** das evidências, fundo céu, selos "gerado por IA" / data / modelo, links pras fontes numeradas e a frase "se algo aqui não estiver nelas, vale a fonte".
- `l.reviews = [{ texto, autor, plataforma, url, data }]` → "Resenhas de leitores": citação atribuída com link (`rel="noopener nofollow"`), sem nota/estrelas, sem logo de plataforma, fora do JSON-LD.
- `validate.mjs` confere os dois (resumo: `texto`, `gerado_em`, `modelo`, `fontes` com índices válidos, lint prescritivo; resenha: `texto`, `autor`, `plataforma`, `url` https, sem nota/estrelas) e `lib.mjs` já os põe na ordem canônica, depois de `evidencias`.

## Celular (v2, 13/10/2026)
Meta: a primeira situação aparece na primeira tela (390×844) e nenhuma página rola de lado.
- **Home**: sem ilustração do herói abaixo de 700px; subtítulo só com a primeira frase (o resto em `.so-largo`); atalhos numa linha só com rolagem lateral (`scroll-padding`), chips de 44px. Cartões de situação viram miniatura 112px à esquerda + texto, pergunta cortada em 3 linhas.
- **Situação**: ilustração com 128px de altura. Matriz em cartões: título + capa em cima, valores numa faixa só com rótulo curto (`COLS[c].curto`: Idade, Págs., Folhear, Preço, À venda). Tabela com `role` explícito (table/rowgroup/row/columnheader/cell), porque `display:block` apaga a semântica no Safari.
- **Livro**: capa 104px ao lado do título; selos, preço e botão **"Ver na <loja> ↗"** (`.comprar-btn`, loja onde o preço foi lido, não aparece se esgotado) logo abaixo, largura total. "mais N lojas ↓" leva a `#onde-encontrar`.
- Alvos de toque ≥44px (atalhos, rodapé, "abrir a fonte", links da ficha). Corpo 16px.

## Não mudou
URLs, `<head>`/meta/JSON-LD, sitemap, textos editoriais, `data/`, lógica de dados do build. Mudanças: `assets/site.css`, `assets/favicon.svg`, templates em `scripts/build.mjs`.

# Livro pra isso — experimento de site self-driving

## O que é

Catálogo em PT-BR de livro infantil por **situação da vida da criança** ("vai nascer um irmãozinho",
"morreu a avó", "medo do escuro", "mudou de escola"). Mantido por um agente Claude que acorda 1x/dia.

## Por que existe

Testar se um loop autônomo se sustenta. O nicho é veículo, não fim.

## Critério de sucesso (14 dias a partir do dia 0)

Passa se **as duas coisas**:
1. Impressões no Search Console saírem de zero.
2. Numa amostra de 5 páginas escritas pelo agente: toda citação confere, nenhum livro inventado,
   nenhuma frase prescritiva.

Falha automática, sem discussão: **um livro que não existe**.

## Estrutura

- `situação` = página de entrada. É a página que rankeia.
- `livro` = página própria. Cauda longa.

### Página de situação: matriz, não lista

Uma linha por livro, colunas binárias derivadas da rúbrica (nomeia o evento? religioso? narrador
criança? material pro adulto? à venda hoje?), ordenável por idade. Mais, por faixa etária:
**"se for comprar um só, este — porque «citação»"**.

A mãe às 23h não quer 12 livros; quer saber qual e por quê. Amazon não cruza, biblioteca não escolhe.

### Página de livro

- **Fato** (da editora): título, autor, ilustrador, editora, ano, ano original, páginas, idade indicada, ISBN.
- **Evidência citada** com link e data de acesso: sinopse oficial, assunto da ficha catalográfica, resenha assinada.
- **Rúbrica** — cada campo aponta para a evidência que o sustenta. Sem evidência, o campo fica `nao_coberto`.
- **"O que a evidência não cobre"** — obrigatório. Se a página não sabe como o livro termina, ela diz isso.
- **"O que este livro não aborda"** — nunca "falha em". Livro religioso não é defeito para família religiosa.
- `verificado_em` visível.

## Rúbrica (v1)

Só entram critérios extraíveis de sinopse / ficha catalográfica / resenha assinada.

| campo | valores | fonte típica |
|---|---|---|
| `nomeia_evento` | `direto` / `metafora` / `nao_coberto` | sinopse |
| `enquadramento` | `religioso` / `secular` / `ambiguo` / `nao_coberto` | editora |
| `narrador` | `crianca` / `adulto` / `animal` / `objeto` / `nao_coberto` | sinopse |
| `material_adulto` | `sim` / `nao` / `nao_coberto` | editora |
| `origem` | `nacional` / `traducao` | ficha |
| `ano_original` | número / `nao_coberto` | ficha |

**Cortados porque não saem de sinopse:** "o final resolve rápido demais", "a criança tem agência".
Só entram se uma resenha assinada afirmar literalmente, com a citação no ar.

## Travas

### Anti-alucinação
Livro só entra se o ISBN tiver checksum válido **e** for provado existir em edição brasileira.

São duas provas possíveis, nessa ordem:
1. **Catálogo externo** (Google Books, Open Library) resolvendo o ISBN com título batendo.
2. **Ficha de venda** da loja ou da editora — mas só quando a página **imprime o ISBN-13**, ele
   é exatamente o da página do livro, e o título bate. Sem ISBN impresso não prova: vitrine,
   busca e página de coleção não trazem ISBN, ficha de produto traz. A prova guarda URL e trecho,
   porque catálogo devolve um id que qualquer um reconsulta e loja não.

A segunda existe desde 24/09 porque a primeira, sozinha, barrou quatro títulos que existem e estão
à venda em loja grande (`A Irmã do Gildo`, da Brinque-Book, entre eles): o Google Books não cataloga
esse canto do infantil brasileiro, e "a fonte não tem" não é "o livro não existe". Ela **não** afrouxa
o resto — edição brasileira, régua editorial e evidência citada continuam valendo igual.

Livro provado só pela segunda fonte diz isso na própria página, na linha do ISBN.

### Anti-churn (o furo mais provável)
`esgotado` só depois de **3 falhas de loja em dias distintos, sem sucesso de loja no meio**. Uma leitura
falha nunca muda estado. Bloqueio de bot e URL que muda de lugar são o caso comum, não o livro sumir —
por isso 403/429/5xx não contam como falha. Sucesso de catálogo (Google Books, Open Library) **não zera**
falha de loja: ISBN de livro esgotado continua resolvendo pra sempre. A transição põe nota factual na página.

### Régua editorial
Só entra livro de **editora comercial ou selo reconhecido**. Editora paga pelo autor (vanity press: Dialética,
Clube de Autores, Appris, Autografia, Scortecci e similares) fica fora da curadoria por padrão. Exceção: situação
com **menos de 4 títulos**, e aí com `editora_paga: true` no JSON e o aviso visível na página.
Vanity press **nunca** entra em "se for comprar um só".

### Anti-slop
Toda afirmação da rúbrica aponta para uma evidência com URL e trecho. Sem fonte, campo `nao_coberto`.
O agente nunca finge ter lido o livro. Teto de **2 páginas novas por dia**.

### Ética
Linguagem **descritiva, nunca prescritiva**. Permitido: "trata de X pelo ponto de vista de Y".
Proibido: "ajuda a criança a processar a perda" — é claim terapêutico sem fonte.

**Temas bloqueados do loop autônomo** (quem busca isso está em crise; página fina faz dano real):
suicídio, abuso sexual, morte de irmão, doença terminal de pai/mãe, automutilação.
O agente não cria situação nova sem aprovação humana.

## Gabarito

Bruno cura 2 situações à mão, completas, no dia 0 — uma delas "vai nascer um irmãozinho".
São o padrão-ouro: tudo que o agente produzir depois é comparado contra elas.
Todo registro carrega `curadoria: humano | agente`.

## Dia 0 (não começar do zero)

Gabarito inteiro no ar de uma vez (15–20 páginas), sitemap submetido, indexação pedida à mão.
Sem isso o experimento reprova por causa do Google, não do agente.

## Loop diário (VM 24/7 — o Mac dorme)

1. Revalida catálogo com a regra de 3 falhas.
2. Procura lançamento novo para situação existente.
3. Lê Search Console: que busca trouxe gente, que situação falta.
4. Escreve no máximo 2 páginas novas, dentro da rúbrica.
5. Commita e manda uma linha no self-chat.

## Stack

JSON é a fonte da verdade → gerador → HTML estático → deploy.
O motivo não é preguiça: **o diff do git é a medida de slop**.

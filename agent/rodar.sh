#!/usr/bin/env bash
# Tudo dentro de { } de propósito: o bash precisa ler o arquivo inteiro até o
# fechamento antes de executar. Sem isso, se o agente editar este script
# durante a própria rodada, o bash volta num offset de byte deslocado e executa
# fragmento de palavra — foi o que aconteceu em 18/09 ("de: command not found").
{
  set -euo pipefail
  export PATH="$HOME/.local/bin:$PATH"
  set -a; . "$HOME/.config/livropraquando/env"; set +a
  cd "$HOME/livropraquando"
  git pull -q --rebase --autostash || true
  mkdir -p "$HOME/livropraquando/runtime"
  LOG="$HOME/livropraquando/runtime/diario-$(date +%F).log"
  SAIDA="$(mktemp)"; trap 'rm -f "$SAIDA"' EXIT
  {
    echo "=== $(date -Is) ==="
    claude -p "Leia e execute agent/diario.md. Voce esta no diretorio ~/livropraquando na VM. O relatorio final vai por SendMessage pra sessao do assistente cujo nome comeca com brunodeqgalvao- (confira com ListAgents; o sufixo muda a cada reboot da VM) e fica em runtime/report-\$(date +%F).md. Nao mande nada pro self-chat do WhatsApp do Bruno." \
      --permission-mode bypassPermissions --model opus 2>&1
  } | tee -a "$LOG" "$SAIDA"
  # Login expirado sai com 0 e só deixava rastro no log: de 18 a 21/10 e em
  # 23/10 (11:39Z) a rodada morreu na autenticação sem ninguém saber.
  if grep -qE 'Failed to authenticate|OAuth access token has expired' "$SAIDA"; then
    echo "$(date -Is) login do claude expirado; a rodada não rodou" | tee "$HOME/livropraquando/runtime/FALHA-LOGIN-$(date +%F).txt"
    exit 1
  fi
  exit 0
}

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
  {
    echo "=== $(date -Is) ==="
    claude -p "Leia e execute agent/diario.md. Voce esta no diretorio ~/livropraquando na VM. O relatorio final vai por SendMessage pra sessao brunodeqgalvao-5c e fica em runtime/report-\$(date +%F).md. Nao mande nada pro self-chat do WhatsApp do Bruno." \
      --permission-mode bypassPermissions --model opus 2>&1
  } | tee -a "$LOG"
  exit 0
}

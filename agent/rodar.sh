#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
set -a; . "$HOME/.config/livropraquando/env"; set +a
cd "$HOME/livropraquando"
git pull -q --rebase --autostash || true
LOG="$HOME/livropraquando/runtime/diario-$(date +%F).log"
mkdir -p "$HOME/livropraquando/runtime"
{
  echo "=== $(date -Is) ==="
  claude -p "Leia e execute agent/diario.md. Voce esta no diretorio ~/livropraquando na VM. O relatorio final vai por SendMessage pra sessao brunodeqgalvao-5c e fica em runtime/report-\$(date +%F).md. Nao mande nada pro self-chat do WhatsApp do Bruno." \
    --permission-mode bypassPermissions --model opus 2>&1
} | tee -a "$LOG"

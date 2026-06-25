#!/bin/bash
# Regenerate Sample document.pdf from sample-document.txt (requires ps2pdf / ghostscript).
set -euo pipefail

dir="$(cd "$(dirname "$0")" && pwd)"
txt="$dir/sample-document.txt"
pdf="$dir/Sample document.pdf"

if [[ ! -f "$txt" ]]; then
  echo "Missing $txt" >&2
  exit 1
fi

if ! command -v ps2pdf >/dev/null 2>&1; then
  echo "ps2pdf not found (install ghostscript)" >&2
  exit 1
fi

{
  echo '%!PS-Adobe-3.0'
  echo '/Helvetica findfont 10 scalefont setfont'
  y=750
  while IFS= read -r line || [[ -n "$line" ]]; do
    escaped=$(printf '%s' "$line" | sed 's/\\/\\\\/g; s/(/\\(/g; s/)/\\)/g')
    printf '72 %s moveto (%s) show\n' "$y" "$escaped"
    y=$((y - 13))
    if (( y < 72 )); then
      echo 'showpage'
      echo '/Helvetica findfont 10 scalefont setfont'
      y=750
    fi
  done < "$txt"
  echo 'showpage'
} | ps2pdf - "$pdf"

echo "Wrote $pdf"

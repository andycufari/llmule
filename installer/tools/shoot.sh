#!/usr/bin/env bash
# Dev-only: screenshots of every demo screen + recordings of both flows, rendered by a real terminal
# emulator (vhs = xterm.js in headless Chrome). Needs `vhs` and `ffmpeg`-free; vhs only.
#
#   tools/shoot.sh            # all shots → screens/*.png
#   tools/shoot.sh 08         # only the shots whose name starts with 08
#   tools/shoot.sh rec        # the share flow → screens/demo-compartir.gif + .mp4
#   tools/shoot.sh rec-pool   # the pool flow  → screens/demo-pool.gif + .mp4
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT="$ROOT/screens"
WORK="${TMPDIR:-/tmp}/llmule-shoot"
mkdir -p "$OUT" "$WORK"
ONLY="${1:-}"

# FontSize 18 in vhs ≈ 11.36 × 21.54 px per cell (even sizes: the video encoders want them)
px() { python3 -c "import math,sys; c,r=int(sys.argv[1]),int(sys.argv[2]); w,h=math.ceil(c*11.36)+1, math.ceil(r*21.54)+1; print(w+w%2, h+h%2)" "$1" "$2"; }

VGA='{"name":"VGA","black":"#000000","red":"#aa0000","green":"#00aa00","yellow":"#aa5500","blue":"#0000aa","magenta":"#aa00aa","cyan":"#00aaaa","white":"#aaaaaa","brightBlack":"#555555","brightRed":"#ff5555","brightGreen":"#55ff55","brightYellow":"#ffff55","brightBlue":"#5555ff","brightMagenta":"#ff55ff","brightCyan":"#55ffff","brightWhite":"#ffffff","background":"#000000","foreground":"#aaaaaa","selection":"#555555","cursor":"#aaaaaa"}'

header() { # COLS ROWS FRAMERATE
  read -r W H < <(px "$1" "$2")
  printf '%s\n' 'Set Shell bash' 'Set FontSize 18' "Set Width $W" "Set Height $H" 'Set Padding 0' 'Set LineHeight 1.0' \
    "Set Framerate $3" 'Env COLORTERM "truecolor"'
}

# shot NAME COLS ROWS "ARGS" "ENV" "TAPE STEPS (one per line)"
shot() {
  local name=$1 cols=$2 rows=$3 args=$4 env=$5 steps=$6
  if [[ -n "$ONLY" && "$name" != "$ONLY"* ]]; then return; fi
  local dir="$WORK/$name"
  rm -rf "$dir"; mkdir -p "$dir"
  local mode="--demo --fast"
  [[ "$name" == *real* ]] && mode=""   # real mode: read-only detection on this machine
  # Spanish unless the shot says otherwise (else: the system locale). Not in real mode: there --lang is remembered
  [[ "$args" == *--lang* || -z "$mode" ]] || args="$args --lang es"
  {
    echo "Output \"$dir/frames/\""
    header "$cols" "$rows" 10
    for e in $env; do echo "Env ${e%%=*} \"${e#*=}\""; done
    # 16 colors: paint them like a VGA console (vhs's default theme turns blue into purple)
    if [[ "$env" == *LLMULE_COLORS=16* ]]; then echo "Set Theme $VGA"; fi
    echo 'Hide'
    echo "Type \"cd '$ROOT' && clear && node llmule.mjs $mode $args\""
    echo 'Enter'
    echo 'Show'
    printf '%s\n' "$steps"
  } > "$dir/shot.tape"
  vhs "$dir/shot.tape" > "$dir/vhs.log" 2>&1 || { echo "vhs failed: $name (see $dir/vhs.log)"; return 1; }
  local last
  last=$(ls "$dir/frames"/frame-text-*.png | sort | tail -1)
  cp "$last" "$OUT/$name.png"
  echo "  $name.png"
}

if [[ "$ONLY" != rec* ]]; then
# --- setup (both modes)
shot 01-bienvenida 100 30 "" "" "Sleep 1.5s"
shot 02-maquina 100 30 "--start=machine" "" "Sleep 2.5s"
shot 03-vincular 100 30 "--start=link" "" "Sleep 1s"
shot 03b-vinculado 100 30 "--start=link" "" "Sleep 3.5s"
shot 04-perfil 100 30 "--start=profile" "" "Sleep 800ms
Tab
Type 'mula-andina'
Tab
Right
Sleep 600ms"
shot 05-menu 100 30 "--start=menu" "" "Sleep 1.5s"
shot 05b-menu-pool 100 30 "--start=menu" "" "Sleep 1.2s
Down
Sleep 400ms"
shot 05c-menu-placa-chica 100 30 "--start=menu --machine=small" "" "Sleep 1.2s
Down
Sleep 400ms"
# --- share path
shot 06-motor-ninguno 100 30 "--start=engine" "" "Sleep 2s"
shot 06b-motor-ollama 100 30 "--start=engine --engine=ollama" "" "Sleep 2s"
shot 07-instalar-llamacpp 100 30 "--start=install" "" "Sleep 1.2s"
shot 07b-instalando 100 30 "--start=install" "" "Sleep 1s
Enter
Sleep 600ms"
shot 08-modelo-3090 100 30 "--start=model" "" "Sleep 1.2s"
shot 08b-modelo-mac 100 30 "--start=model --machine=mac" "" "Sleep 1.2s"
shot 08c-modelo-6gb 100 30 "--start=model --machine=small" "" "Sleep 1.2s"
shot 08d-bajando 100 30 "--start=model" "" "Sleep 1s
Enter
Sleep 1.2s"
shot 08e-bajando-sin-red 100 30 "--start=model" "" "Sleep 1s
Enter
Sleep 700ms
Type D
Sleep 1.5s"
shot 08f-cargando 100 30 "--start=model" "" "Sleep 1s
Enter
Sleep 2.6s"
shot 09-prueba 100 30 "--start=test" "" "Sleep 2.5s"
shot 10-icono 100 30 "--start=icon" "" "Sleep 1s"
shot 11-listo 100 30 "--start=done" "" "Sleep 1.5s"
shot 12-panel 100 30 "--start=dash" "" "Sleep 9s"
shot 12b-panel-llmule-caido 100 30 "--start=dash" "" "Sleep 6s
Type D
Sleep 2s"
shot 12c-panel-pausa 100 30 "--start=dash" "" "Sleep 5s
Type p
Sleep 1.5s"
shot 12d-salir 100 30 "--start=dash" "" "Sleep 3s
Ctrl+C
Sleep 600ms"
# --- pool path
shot 20-pool-lista 100 30 "--start=pools" "" "Sleep 1.5s"
shot 21-pool-aporte 100 30 "--start=contrib" "" "Sleep 1.2s"
shot 22-pool-vpn 100 30 "--start=vpn" "" "Sleep 700ms"
shot 22b-pool-vpn-lista 100 30 "--start=vpn" "" "Sleep 3s"
shot 23-pool-worker 100 30 "--start=worker" "" "Sleep 1.4s"
shot 23b-pool-worker-listo 100 30 "--start=worker" "" "Sleep 3.5s"
shot 24-pool-icono 100 30 "--start=icon --mode=pool" "" "Sleep 1s"
shot 25-pool-panel 100 30 "--start=pooldash" "" "Sleep 8s"
shot 25b-pool-panel-nodo-caido 100 30 "--start=pooldash" "" "Sleep 6s
Type x
Sleep 2s"
shot 25c-pool-panel-140x40 140 40 "--start=pooldash" "" "Sleep 8s"
# --- terminal sizes and color fallbacks
shot 30-chico-80x25-bienvenida 80 25 "" "" "Sleep 1.5s"
shot 30b-chico-80x25-panel 80 25 "--start=dash" "" "Sleep 8s"
shot 30c-chico-80x25-pool 80 25 "--start=pooldash" "" "Sleep 7s"
shot 31-256-colores 100 30 "--start=dash" "LLMULE_COLORS=256" "Sleep 7s"
shot 31b-16-colores 100 30 "" "LLMULE_COLORS=16" "Sleep 1.5s"
shot 31c-16-colores-panel 100 30 "--start=dash" "LLMULE_COLORS=16" "Sleep 7s"
shot 32-ventana-muy-chica 64 18 "" "" "Sleep 1.2s"
shot 33-grande-140x40 140 40 "--start=dash" "" "Sleep 8s"
# --- English (--lang en), the screens whose layout moves the most with the language
shot 50-en-welcome-80x25 80 25 "--lang en" "" "Sleep 1.5s"
shot 50b-en-welcome 100 30 "--lang en" "" "Sleep 1.5s"
shot 51-en-profile-80x25 80 25 "--lang en --start=profile" "" "Sleep 1.2s"
shot 52-en-menu 100 30 "--lang en --start=menu" "" "Sleep 1.5s"
shot 53-en-model 100 30 "--lang en --start=model" "" "Sleep 1.2s"
shot 54-en-panel-80x25 80 25 "--lang en --start=dash" "" "Sleep 8s"
shot 55-en-pool-panel 100 30 "--lang en --start=pooldash" "" "Sleep 8s"
shot 56-en-poolnew-opts-80x25 80 25 "--lang en --start=poolnew" "" "Sleep 1.2s
Enter
Sleep 600ms"
# The L key on the welcome screen
shot 57-welcome-toggle-to-en 80 25 "" "" "Sleep 1.5s
Type l
Sleep 600ms"
# --- real mode on this machine (read-only detection)
shot 40-real-esta-mac-maquina 100 30 "" "" "Sleep 1.5s
Enter
Sleep 4s"
fi

# ---------- recordings (real demo speed, for the reel) ----------
# Setup steps both flows share: welcome → machine → link (auto-approves in the demo) → profile
SETUP='Sleep 2.5s
Enter
Sleep 3.5s
Enter
Sleep 8s
Enter
Sleep 1s
Tab
Type "mula-andina"
Sleep 400ms
Tab
Right
Sleep 300ms
Right
Sleep 600ms
Tab
Type "Una 3090 en Ramos Mejia"
Sleep 500ms
Enter
Sleep 2s'

# menu(share) → engine → install → model → test → icon → done → panel
SHARE='Enter
Sleep 3s
Enter
Sleep 2s
Enter
Sleep 4.5s
Enter
Sleep 2s
Enter
Sleep 12s
Enter
Sleep 6.5s
Enter
Sleep 2s
Enter
Sleep 2.5s
Enter
Sleep 12s'

# menu(pool) → pools → contrib → vpn → worker → icon → pool panel, a node drops and comes back
POOL='Down
Sleep 1s
Enter
Sleep 3s
Enter
Sleep 4s
Enter
Sleep 7s
Enter
Sleep 9s
Enter
Sleep 2s
Enter
Sleep 12s
Type x
Sleep 6s
Type x
Sleep 8s'

record() { # NAME STEPS
  {
    echo "Output \"$OUT/$1.gif\""
    echo "Output \"$OUT/$1.mp4\""
    header 100 30 20
    echo 'Set TypingSpeed 90ms'
    echo 'Hide'
    echo "Type \"cd '$ROOT' && clear && node llmule.mjs --demo\""
    echo 'Enter'
    echo 'Show'
    printf '%s\n%s\n' "$SETUP" "$2"
  } > "$WORK/$1.tape"
  vhs "$WORK/$1.tape" > "$WORK/$1.log" 2>&1 && echo "  $1.gif / $1.mp4" || { echo "vhs failed (see $WORK/$1.log)"; return 1; }
}

if [[ "$ONLY" == "rec" ]]; then record demo-compartir "$SHARE"; fi
if [[ "$ONLY" == "rec-pool" ]]; then record demo-pool "$POOL"; fi

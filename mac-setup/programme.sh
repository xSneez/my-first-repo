#!/usr/bin/env bash
#
# programme.sh
# -------------------------------------------------------------------
# Installiert alle Lieblings-Programme auf dem Mac automatisch per
# Homebrew (https://brew.sh). Falls Homebrew noch nicht da ist, wird
# es zuerst installiert.
#
# Aufruf auf dem Mac:
#   bash mac-setup/programme.sh
# -------------------------------------------------------------------

set -euo pipefail

# ------------------------------------------------------------------
# 1. Homebrew sicherstellen
# ------------------------------------------------------------------
if ! command -v brew >/dev/null 2>&1; then
  echo "==> Homebrew ist nicht installiert - wird jetzt eingerichtet ..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Homebrew in die aktuelle Shell laden (Apple Silicon: /opt/homebrew)
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    grep -q 'brew shellenv' "${HOME}/.zprofile" 2>/dev/null || \
      echo 'eval "$(/opt/homebrew/bin/brew shellenv zsh)"' >> "${HOME}/.zprofile"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
else
  echo "==> Homebrew ist bereits installiert."
fi

echo "==> Paketlisten werden aktualisiert ..."
brew update

# ------------------------------------------------------------------
# 2. Programme (Casks) installieren
# ------------------------------------------------------------------
# Format: "cask-name"   # Programmname zur Info
APPS=(
  "visual-studio-code"  # VS Code
  "parsec"              # Parsec
  "google-chrome"       # Google Chrome
  "roboform"            # RoboForm
  "spotify"             # Spotify
  "discord"             # Discord
  "teamviewer"          # TeamViewer
  "onedrive"            # OneDrive
  "rectangle"           # Fenster andocken wie Windows
  "swift-quit"          # Rotes X beendet das Programm (wie Windows)
  "shottr"              # Bildschirmfoto: speichern + Zwischenablage
)

# Programme, die beim Login automatisch starten sollen
LOGIN_APPS=("Rectangle" "Swift Quit" "Shottr")

FAILED=()
echo "==> Programme werden installiert ..."
for app in "${APPS[@]}"; do
  echo ""
  echo "--- ${app} ---"
  # --no-quarantine spart das "unbekannter Entwickler"-Nachfragen;
  # bereits installierte Apps werden uebersprungen.
  if brew list --cask "${app}" >/dev/null 2>&1; then
    echo "    schon installiert - uebersprungen."
  else
    # Einzelne Fehler (z. B. Passwort abgelehnt) brechen nicht alles ab
    brew install --cask "${app}" || FAILED+=("${app}")
  fi
done

for a in "${LOGIN_APPS[@]}"; do
  [ -d "/Applications/${a}.app" ] && osascript -e \
    "tell application \"System Events\" to make login item at end with properties {path:\"/Applications/${a}.app\", hidden:true}" >/dev/null || true
done

# Shottr: Command+Shift+4 = Bereich aufnehmen, danach speichern UND kopieren
if [ -d /Applications/Shottr.app ]; then
  osascript -e 'quit app "Shottr"' 2>/dev/null || true
  defaults write cc.ffitch.shottr KeyboardShortcuts_area -string '{"carbonKeyCode":21,"carbonModifiers":768}'
  defaults write cc.ffitch.shottr afterGrabSave -bool true
  defaults write cc.ffitch.shottr afterGrabCopy -bool true
  defaults write cc.ffitch.shottr afterGrabShow -bool false
  # macOS-eigenes Command+Shift+4 abschalten, damit Shottr die Tasten bekommt
  defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 30 \
    '<dict><key>enabled</key><false/><key>value</key><dict><key>parameters</key><array><integer>52</integer><integer>21</integer><integer>1179648</integer></array><key>type</key><string>standard</string></dict></dict>'
  open /Applications/Shottr.app
fi

if [ "${#FAILED[@]}" -gt 0 ]; then
  echo ""
  echo "!!  Nicht installiert: ${FAILED[*]}"
  echo "    Spaeter im Terminal nachholen: brew install --cask ${FAILED[*]}"
fi

echo ""
echo "==> Fertig! Alle Programme sind installiert."
echo "    Du findest sie im Ordner 'Programme' (Applications)."
echo ""
echo "    Hinweis: TeamViewer und Parsec fragen beim ersten Start nach"
echo "    Bildschirmaufnahme-/Bedienungshilfen-Rechten - das ist normal"
echo "    und noetig fuer Fernzugriff. Einfach in den Systemeinstellungen"
echo "    freigeben, wenn danach gefragt wird."

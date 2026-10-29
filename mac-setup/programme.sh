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
)

# Optional: Fenster-Snapping wie bei Windows (siehe windows-feel.sh)
# APPS+=("rectangle")

echo "==> Programme werden installiert ..."
for app in "${APPS[@]}"; do
  echo ""
  echo "--- ${app} ---"
  # --no-quarantine spart das "unbekannter Entwickler"-Nachfragen;
  # bereits installierte Apps werden uebersprungen.
  if brew list --cask "${app}" >/dev/null 2>&1; then
    echo "    schon installiert - uebersprungen."
  else
    brew install --cask "${app}"
  fi
done

echo ""
echo "==> Fertig! Alle Programme sind installiert."
echo "    Du findest sie im Ordner 'Programme' (Applications)."
echo ""
echo "    Hinweis: TeamViewer und Parsec fragen beim ersten Start nach"
echo "    Bildschirmaufnahme-/Bedienungshilfen-Rechten - das ist normal"
echo "    und noetig fuer Fernzugriff. Einfach in den Systemeinstellungen"
echo "    freigeben, wenn danach gefragt wird."

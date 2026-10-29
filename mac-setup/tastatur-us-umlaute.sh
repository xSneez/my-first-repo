#!/usr/bin/env bash
#
# tastatur-us-umlaute.sh
# -------------------------------------------------------------------
# Installiert das Tastaturlayout "US mit Umlauten" fuer eine
# US-Tastatur: alles wie aufgedruckt, nur Y/Z getauscht, dazu
#   Option + a/o/u = ae/oe/ue (mit Shift gross), Option + s = ss,
#   Option + Shift + 2 = Euro
# Kein Admin-Passwort noetig.
#
# Aufruf auf dem Mac:
#   bash mac-setup/tastatur-us-umlaute.sh
# -------------------------------------------------------------------

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "${HOME}/Library/Keyboard Layouts"
cp "${DIR}/US mit Umlauten.keylayout" "${HOME}/Library/Keyboard Layouts/"

# Als Eingabequelle eintragen und auswaehlen (greift nach Ab-/Anmelden)
E='{ "InputSourceKind" = "Keyboard Layout"; "KeyboardLayout ID" = -24713; "KeyboardLayout Name" = "US mit Umlauten"; }'
defaults read com.apple.HIToolbox AppleEnabledInputSources 2>/dev/null | grep -q "US mit Umlauten" || \
  defaults write com.apple.HIToolbox AppleEnabledInputSources -array-add "$E"
defaults write com.apple.HIToolbox AppleSelectedInputSources -array "$E"

echo "==> Layout installiert und ausgewaehlt."
echo "    >>> Jetzt einmal ABMELDEN und wieder anmelden."
echo "    Wechseln zwischen Layouts: Ctrl + Leertaste."

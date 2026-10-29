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

echo "==> Layout installiert."
echo "    1. Mac neu starten (sonst taucht es nicht auf)."
echo "    2. Systemeinstellungen -> Tastatur -> Texteingabe -> Bearbeiten"
echo "       -> '+' -> Andere -> 'US mit Umlauten' -> Hinzufuegen."
echo "    3. Alte Layouts (ABC usw.) mit '-' entfernen."

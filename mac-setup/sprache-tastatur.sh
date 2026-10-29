#!/usr/bin/env bash
#
# sprache-tastatur.sh
# -------------------------------------------------------------------
# Stellt macOS auf DEUTSCH um (Systemsprache, Region) und fuegt die
# DEUTSCHE Tastatur als Eingabequelle hinzu.
#
# WICHTIG:
#  * Die Sprachumstellung greift erst nach ABMELDEN oder NEUSTART.
#  * Die Tastatur-Umstellung per Befehl ist nicht immer zuverlaessig.
#    Falls sie nicht "haengen bleibt", bitte den GUI-Weg in der
#    README benutzen (Systemeinstellungen -> Tastatur).
#
# Aufruf auf dem Mac:
#   bash mac-setup/sprache-tastatur.sh
# -------------------------------------------------------------------

set -euo pipefail

echo "==> Systemsprache wird auf Deutsch gestellt ..."

# Sprach-Reihenfolge: Deutsch zuerst, Englisch als Rueckfall
defaults write NSGlobalDomain AppleLanguages -array "de-DE" "en-US"

# Region/Format Deutschland (Datum, Zahlen, Waehrung EUR)
defaults write NSGlobalDomain AppleLocale -string "de_DE@currency=EUR"

# Masseinheiten metrisch (cm / kg / Celsius)
defaults write NSGlobalDomain AppleMetricUnits    -bool true
defaults write NSGlobalDomain AppleMeasurementUnits -string "Centimeters"
defaults write NSGlobalDomain AppleTemperatureUnit  -string "Celsius"

echo "==> Deutsche Tastatur wird als Eingabequelle hinzugefuegt ..."

# Deutsche Tastaturbelegung (KeyboardLayout ID 3 = German) aktivieren.
# Hinweis: ueberschreibt die Liste der aktiven Eingabequellen.
defaults write com.apple.HIToolbox AppleEnabledInputSources -array \
  '{ "InputSourceKind" = "Keyboard Layout"; "KeyboardLayout ID" = 3; "KeyboardLayout Name" = "German"; }'

defaults write com.apple.HIToolbox AppleSelectedInputSources -array \
  '{ "InputSourceKind" = "Keyboard Layout"; "KeyboardLayout ID" = 3; "KeyboardLayout Name" = "German"; }'

echo ""
echo "==> Fertig vorbereitet."
echo "    >>> Jetzt bitte ABMELDEN oder NEU STARTEN, damit die"
echo "        Sprache wirksam wird."
echo ""
echo "    Falls die Tastatur danach noch nicht auf Deutsch steht:"
echo "    Systemeinstellungen -> Tastatur -> Texteingabe ->"
echo "    Eingabequellen bearbeiten -> '+' -> Deutsch -> Deutsch."

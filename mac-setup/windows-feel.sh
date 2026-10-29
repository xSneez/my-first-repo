#!/usr/bin/env bash
#
# windows-feel.sh
# -------------------------------------------------------------------
# Richtet macOS (Finder + System) so ein, dass es sich moeglichst
# wie Windows anfuehlt. Aendert NUR benutzereigene Einstellungen
# (per `defaults write`) - alles ist jederzeit reversibel.
#
# Aufruf auf dem Mac:
#   bash mac-setup/windows-feel.sh
#
# Danach starten sich Finder und Dock einmal neu - das ist normal.
# -------------------------------------------------------------------

set -euo pipefail

echo "==> macOS wird Windows-aehnlicher eingerichtet ..."

# ------------------------------------------------------------------
# FINDER - wie der Windows-Explorer
# ------------------------------------------------------------------

# Alle Dateiendungen anzeigen (.pdf, .jpg, ...)
defaults write NSGlobalDomain AppleShowAllExtensions -bool true

# Pfadleiste und Statusleiste unten im Finder-Fenster einblenden
defaults write com.apple.finder ShowPathbar   -bool true
defaults write com.apple.finder ShowStatusBar -bool true

# Vollstaendigen Pfad in der Fenster-Titelleiste zeigen
defaults write com.apple.finder _FXShowPosixPathInTitle -bool true

# Laufwerke auf dem Schreibtisch anzeigen (wie "Dieser PC")
defaults write com.apple.finder ShowHardDrivesOnDesktop         -bool true
defaults write com.apple.finder ShowExternalHardDrivesOnDesktop -bool true
defaults write com.apple.finder ShowRemovableMediaOnDesktop     -bool true
defaults write com.apple.finder ShowMountedServersOnDesktop     -bool true

# Standardansicht = Liste (Nlsv). Alternativen: Icnv (Symbole),
# clmv (Spalten), Flwv (Galerie)
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"

# Ordner beim Sortieren nach Namen immer zuerst (wie Windows)
defaults write com.apple.finder _FXSortFoldersFirst -bool true

# Neue Finder-Fenster oeffnen im Benutzerordner (Haus-Symbol)
defaults write com.apple.finder NewWindowTarget -string "PfHm"
defaults write com.apple.finder NewWindowTargetPath -string "file://${HOME}/"

# Beim Suchen standardmaessig den aktuellen Ordner durchsuchen
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"

# Keine Warnung beim Aendern einer Dateiendung
defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false

# ------------------------------------------------------------------
# TRACKPAD / MAUS - Windows-Gefuehl
# ------------------------------------------------------------------

# Scrollrichtung bleibt Mac-Standard ("natuerliches Scrollen" an)
defaults write NSGlobalDomain com.apple.swipescrolldirection -bool true

# Tippen zum Klicken aktivieren
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults write com.apple.AppleMultitouchTrackpad Clicking -bool true
defaults -currentHost write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1

# Rechtsklick (Sekundaerklick) mit zwei Fingern
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad TrackpadRightClick -bool true
defaults write com.apple.AppleMultitouchTrackpad TrackpadRightClick -bool true
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad TrackpadCornerSecondaryClick -int 0
defaults write com.apple.AppleMultitouchTrackpad TrackpadCornerSecondaryClick -int 0
defaults -currentHost write NSGlobalDomain com.apple.trackpad.enableSecondaryClick -bool true
defaults write NSGlobalDomain com.apple.trackpad.enableSecondaryClick -bool true

# ------------------------------------------------------------------
# DIALOGE - mehr wie Windows
# ------------------------------------------------------------------

# Speichern-/Drucken-Dialoge standardmaessig ausgeklappt
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode  -bool true
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode2 -bool true
defaults write NSGlobalDomain PMPrintingExpandedStateForPrint  -bool true
defaults write NSGlobalDomain PMPrintingExpandedStateForPrint2 -bool true

# ------------------------------------------------------------------
# MENUELEISTE / DOCK / BILDSCHIRMFOTOS
# ------------------------------------------------------------------

# Akku in Prozent anzeigen
defaults -currentHost write com.apple.controlcenter BatteryShowPercentage -bool true

# Keine "zuletzt benutzten Apps" im Dock
defaults write com.apple.dock show-recents -bool false

# "Fast Vollbild": Dock und Menueleiste automatisch ausblenden,
# Doppelklick auf die Titelleiste maximiert das Fenster
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 0
defaults write com.apple.dock autohide-time-modifier -float 0.3
defaults write NSGlobalDomain _HIHideMenuBar -bool true
defaults write NSGlobalDomain AppleActionOnDoubleClick -string "Fill"

# Finder: Vorschau rechts (wie Explorer-Vorschaufenster)
defaults write com.apple.finder ShowPreviewPane -bool true

# Bildschirmfotos in Bilder/Bildschirmfotos speichern (wie Windows)
mkdir -p "${HOME}/Pictures/Bildschirmfotos"
defaults write com.apple.screencapture location "${HOME}/Pictures/Bildschirmfotos"

# ------------------------------------------------------------------
# Neustart der betroffenen Programme, damit alles sofort greift
# ------------------------------------------------------------------
echo "==> Finder und Dock werden neu gestartet ..."
killall Finder 2>/dev/null || true
killall Dock   2>/dev/null || true
killall SystemUIServer ControlCenter 2>/dev/null || true

echo ""
echo "==> Fertig! Die Einstellungen sind aktiv."
echo "    Tipp: Fuer das 'Fenster-Snapping' wie bei Windows (Fenster"
echo "    an den Bildschirmrand ziehen) hilft die App 'Rectangle'."
echo "    Installation per Homebrew:  brew install --cask rectangle"

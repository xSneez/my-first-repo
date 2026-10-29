# Mac einrichten wie Windows 🪟➡️🍎

Diese Anleitung macht deinen neuen **MacBook Air** so, dass sich Finder und
System möglichst wie auf deinem Windows-PC anfühlen. Dauert ca. 10–15 Minuten.

---

## 1. Claude Code auf dem Mac installieren

1. **Terminal** öffnen (⌘ + Leertaste → „Terminal" tippen → Enter).
2. Installationsbefehl einfügen (von der offiziellen Seite):
   <https://code.claude.com/docs> → dort steht der aktuelle Befehl.
3. Einloggen mit deinem Claude-Account (derselbe wie hier).

> Damit kann Claude direkt auf dem Mac Befehle ausführen – **fragt dich aber
> vor jeder Aktion um Erlaubnis.**

---

## 2. Die Einstellungen automatisch setzen lassen

Im Terminal in diesen Ordner wechseln und das Skript ausführen:

```bash
bash mac-setup/windows-feel.sh
```

…oder du sagst Claude auf dem Mac einfach:

> „Führ das Skript `mac-setup/windows-feel.sh` aus."

Das Skript erledigt auf einen Schlag:

| Bereich   | Was passiert |
|-----------|--------------|
| Finder    | Dateiendungen sichtbar, Listenansicht, Pfad-/Statusleiste, Laufwerke auf dem Schreibtisch |
| Sortierung| Ordner immer zuerst (wie Windows) |
| Trackpad  | Tippen zum Klicken, Rechtsklick mit 2 Fingern (Scrollrichtung bleibt Mac-Standard) |
| Menüleiste/Dock | Akku in Prozent, keine „zuletzt benutzten Apps“ im Dock |
| Bildschirmfotos | Landen in **Bilder → Bildschirmfotos** |
| Dialoge   | Speichern-/Druckdialoge ausgeklappt |

Alle Änderungen sind **benutzereigene Einstellungen** und jederzeit wieder
umkehrbar.

---

## 2b. Sprache & Tastatur auf Deutsch stellen

Wenn der Mac aktuell auf **Englisch oder Thai** steht, zuerst auf Deutsch
umstellen. Dafür gibt es ein eigenes Skript:

```bash
bash mac-setup/sprache-tastatur.sh
```

Das stellt um:

| Bereich   | Wert |
|-----------|------|
| Systemsprache | Deutsch (Englisch als Rückfall) |
| Region/Format | Deutschland, € als Währung |
| Maßeinheiten  | cm / kg / °C |
| Tastatur      | Deutsche Belegung (QWERTZ, ß, Umlaute) |

> ⚠️ **Die Sprache greift erst nach Abmelden oder Neustart.** Also nach dem
> Skript einmal neu starten.

### Sicherer Weg, falls das Skript (noch auf Englisch/Thai) schwer zu bedienen ist

Die Umstellung geht auch komplett per Klick — praktisch, wenn du die Menüs
gerade nicht lesen kannst, weil sie Thai sind:

**Sprache:**  Apple-Menü () → *System Settings / การตั้งค่าระบบ* →
**General → Language & Region** → unter „Preferred Languages" mit **+**
**Deutsch** hinzufügen und nach ganz oben ziehen → Neustart bestätigen.

**Tastatur:**  System Settings → **Keyboard → Text Input → Edit…** → **+** →
**Deutsch → Deutsch** auswählen → Thai/Englisch bei Bedarf entfernen.

> 💡 Tipp: Zwischen Tastaturlayouts wechselst du jederzeit mit **⌃ + Leertaste**
> (Ctrl + Leertaste) oder über das Flaggen-Symbol oben rechts in der Menüleiste.

Wenn Claude Code schon installiert ist, kannst du es auch einfach bitten:
„Führ das Skript `mac-setup/sprache-tastatur.sh` aus."

---

## 3. Fenster „snappen" wie bei Windows

macOS kann Fenster nicht von Haus aus an den Rand andocken (`⊞ + Pfeil`).
Dafür die kostenlose App **Rectangle**:

```bash
brew install --cask rectangle
```

> Falls `brew` fehlt, vorher Homebrew installieren: <https://brew.sh>

---

## 3b. Lieblings-Programme automatisch installieren

Alle Programme von deinem Windows-PC auf einmal installieren (per Homebrew):

```bash
bash mac-setup/programme.sh
```

Installiert wird:

| Programm   | Zweck |
|------------|-------|
| VS Code    | Code-Editor |
| Parsec     | Remote-Gaming / Fernzugriff |
| Google Chrome | Browser |
| RoboForm   | Passwort-Manager |
| Spotify    | Musik |
| Discord    | Chat / Voice |
| TeamViewer | Fernwartung |
| OneDrive   | Dateien vom Windows-PC |
| Rectangle  | Fenster andocken wie Windows |
| Swift Quit | Rotes X beendet das Programm (wie Windows) |
| Shottr     | ⌘⇧4 = Bildschirmfoto speichern **und** in Zwischenablage (wie Snipping Tool) |

Rectangle, Swift Quit und Shottr starten automatisch beim Login. Beim ersten
Start nach **Bedienungshilfen** bzw. **Bildschirmaufnahme** fragen lassen und
erlauben. In Shottr einmal unter *Settings* den Speicherordner auf
**Bilder → Bildschirmfotos** setzen (geht nur per Klick).

Bereits installierte Programme werden übersprungen. Du findest alles danach
im Ordner **Programme** (Applications).

> 🔐 **TeamViewer** und **Parsec** fragen beim ersten Start nach Rechten für
> *Bildschirmaufnahme* und *Bedienungshilfen* – das ist normal und für den
> Fernzugriff nötig. Einfach in den Systemeinstellungen freigeben.

> Möchtest du später weitere Programme? Trag sie einfach in der Liste `APPS`
> in `programme.sh` nach (Cask-Namen findest du auf <https://brew.sh>).

---

## 3c. US-Tastatur mit Umlauten

Für ein MacBook mit **US-Tastatur**: alles bleibt wie aufgedruckt, nur Y/Z
getauscht, dazu Umlaute über die Option-Taste.

```bash
bash mac-setup/tastatur-us-umlaute.sh
```

| Taste | Ergebnis |
|-------|----------|
| ⌥ + a / o / u | ä / ö / ü (mit ⇧ groß) |
| ⌥ + s | ß |
| ⌥ + ⇧ + 2 | € |

Danach neu starten und unter *Tastatur → Texteingabe* „US mit Umlauten“ hinzufügen.

---

## 4. Daten von Windows → Mac übertragen

Claude kann **nicht** auf deinen Windows-PC zugreifen. Bring die Daten so rüber:

- **Externe Festplatte / USB-Stick** – am besten als **exFAT** formatiert
  (lesen Windows *und* Mac).
- **Cloud** (OneDrive / Google Drive / iCloud) – bequem für Dokumente & Fotos.

Sobald die Daten auf dem Mac liegen (z. B. im Ordner `Downloads` oder auf der
Festplatte), kann Claude dir beim **Einsortieren** helfen – einfach sagen, wohin.

---

## Wichtige Tastenkürzel (Windows → Mac)

| Windows            | Mac            |
|--------------------|----------------|
| `Strg`             | `⌘` (Command)  |
| `Strg + C / V`     | `⌘ + C / V`    |
| Windows-Taste      | `⌘`            |
| Windows-Suche      | `⌘ + Leertaste` (Spotlight) |
| `Alt + Tab`        | `⌘ + Tab`      |
| `Entf` (vorwärts)  | `Fn + ⌫`       |

---

*Fragen? Sag Claude auf dem Mac einfach, was noch fehlt.*

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
| Trackpad  | Scrollrichtung umgedreht, Tippen zum Klicken, Rechtsklick mit 2 Fingern |
| Dialoge   | Speichern-/Druckdialoge ausgeklappt |

Alle Änderungen sind **benutzereigene Einstellungen** und jederzeit wieder
umkehrbar.

---

## 3. Fenster „snappen" wie bei Windows

macOS kann Fenster nicht von Haus aus an den Rand andocken (`⊞ + Pfeil`).
Dafür die kostenlose App **Rectangle**:

```bash
brew install --cask rectangle
```

> Falls `brew` fehlt, vorher Homebrew installieren: <https://brew.sh>

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

# Übergabe an Claude: HTML-Abruf/Runner v2

## Status und Scope

Die Lieferung behebt nachvollzogene Fetcher-, Parser- und Warteschlangenfehler.
Sie klickt keine Amazon-Prüfseite an und versucht keine Bot-Prüfung zu umgehen.
Proxy-Zugang, TLS-Verifikation und Gateway bleiben unverändert.

Amazon-Verfügbarkeit und korrekte Checkout-Kombinierbarkeit sind nicht zu 100%
garantierbar. Der Runner ist auf dem VPS noch ausgeschaltet; das Paket wurde dort
nicht eingespielt oder aktiviert. Lokale Testzahlen sind kein Live-Durchsatztest.

## Dateien gemeinsam bereitstellen

In `C:\keepa-watcher\` werden benötigt:

1. `html-fetcher.mjs` – Ersatz des bisherigen Fetchers.
2. `html-promo.mjs` – Ersatz des bereitgestellten Runners, gleiche createHtmlPromo-API.
3. `html-promo-parser.mjs` – NEUE Datei, muss mit bereitgestellt werden.
4. `diagnose-html-fetcher.mjs` – optionaler kleiner Diagnose-Lauf.

Vor dem Einspielen die vorhandenen Dateien sichern. Alle drei Laufzeitdateien
zusammen bereitstellen, bevor der Prozess neu startet. Fehlt der neue Parser,
kann der statische Import des Runners den Prozessstart verhindern.

NICHT `package.json`, Projekt-Lockfile, `business-ek.mjs`, `watcher.js`, `.env`
oder vorhandene Zustandsdateien durch Vorlagen überschreiben.

Der Runner importiert `calcEK` weiterhin aus `business-ek.mjs`, aber
`parsePromoHtml` jetzt aus `html-promo-parser.mjs`. Die beiden ursprünglichen
Funktionen `cachedPromos` und `promoResult` sind unverändert übernommen und auf
Byte-Identität ihres Quelltexts getestet. Die vorhandene Deal-Arithmetik wird
nicht als richtig oder im echten Checkout bestätigt. Versand-/Business-Preise,
Coupon-Stapelung und externe Post-Deduplizierung bleiben Verantwortung der
vorhandenen Geschäftslogik. Es werden keine eigenen Nachrichten versendet;
`onPromoDeal` bleibt der vorhandene Callback.

## Nachgewiesene Identitätskorrektur

Der Ersteller konnte die fünf gemeldeten Fälle über den Cloud-Netzzugang (NICHT
über die privaten DataImpulse-Zugangsdaten) erneut laden. In allen fünf Antworten
stand die angefragte Variante im Kauf-Formular, der Canonical-Link zeigte auf die
von Keepa genannte Haupt-ASIN:

| angefragt | Land | Canonical |
|---|---|---|
| B0CNCR2PYV | de | B0GT1PFYMQ |
| B00NGVEP5Q | fr | B0D951RLKS |
| B0DSFY6TT5 | fr | B0F1YNKJ1Y |
| B0F6N7CS4B | de | B0F714NT84 |
| B0F6N7CS4B | it | B0F6ZRVN1Q |

Diese gespeicherten Antworten bestehen im neuen Node-Fetcher im Sparmodus.
Das ist keine Aussage, ob sie jetzt über den VPS/Provider erreichbar sind.

Priorität: ausgewählte Kauf-ASIN, danach Titel-Widget-ASIN, danach Canonical nur
wenn keine stärkere Auswahl vorliegt und ein Produktmarker vorhanden ist.
Ein tatsächlich anderes Kaufprodukt wird weiterhin verworfen. Review-ASINs und
Empfehlungen werden nicht als Kauf-Auswahl benutzt. Attributreihenfolge spielt
keine Rolle. `selectedAsin`, `canonicalAsin` und die jeweiligen Arrays stehen
auch bei Fehlern in der Diagnose, soweit gelesen.

## Content-Type, leere Antwort und Bot-Prüfseite

- `text/html` und `application/xhtml+xml` sind erlaubt.
- Fehlender/falscher Content-Type darf nur mit tatsächlicher HTML-Struktur UND
  nachgewiesener Produktidentität zu `ok` führen.
- JSON und Textfehler bleiben `not_html`; MIME und Body-Klasse werden protokolliert.
- HTTP 200 mit leerem Body ist `empty_body`, NICHT `not_html` oder kein Rabatt.
- Formulare mit `validateCaptcha` werden auch bei relativer/bloßer Action erkannt.
- Die beschriebene „Weiter shoppen“-Seite mit Amazon-Titel, Aufforderung und Button
  ist `blocked`; ein Amazon-Titel oder der Button allein genügt nicht.
- Keine Cookies, Auth-Header, Proxy-Passwörter oder Roh-HTML in Fehlerprotokollen.

## Sparmodus und Parser

`fetchProductPage(asin, land)` liefert im Standardmodus ein HTML-Fragment bis zum
abgeschlossenen Produkt-Aktionsbereich oder `null`. Eine vollständige Seite
fordert nur `fetchFullProductPage` ausdrücklich an. Kein automatischer Vollabruf,
keine automatischen Wiederholungen und kein JavaScript/Browser.

Zusätzlich zum bisherigen `promoPriceBlockMessage_feature_div` werden bekannte
Buybox-/Promotion-Container sowie ASIN-gebundene `PromotionsDiscovery`-Blöcke
berücksichtigt. Bei Alternativen wird bis zum Ende des Hauptangebots gelesen,
damit benachbarte Aktionen nicht beim ersten Coupon abgeschnitten werden.

Ein vorhandener leerer Haupt-Aktionsbereich ist etwas anderes als ein fehlender
Bereich: leer wird erst nach Abschluss des Hauptangebots als HTML an den Parser
gegeben. Fehlt ein bekannter Bereich oder endet das Budget vorher, bleibt das
Ergebnis ungeklärt. Die HTML-IDs werden nicht künstlich umbenannt.

Der neue Parser versteht dieselben Bereiche. KEIN Ganzseiten-Fallback. CSS,
JavaScript, versteckte Erfolgsmeldungen und Empfehlungskarten sind ausgeschlossen.
Mehrere widersprüchliche Raten sind `ambiguous_promotions`, keine erste/maximale
Rate. „Save 10% at checkout when you buy 2 items“ ist Mengenrabatt und kein
unbedingter Kassenrabatt. Mengenrabatt und Kassenrabatt werden getrennt geliefert.
Die bestehende Geschäftslogik des Runners verwendet Mengenrabatte weiterhin
nicht neu in der Kalkulation.

Bei unbekannten weiteren Amazon-Layouts sicher ungeklärt melden und Diagnose
sammeln, nicht auf die gesamte Seite ausweichen.

## Konfiguration

Bestehende Werte bewahren. Unterstützt werden `.env` neben dem Fetcher und bereits
von dotenv/dotenvx in `process.env` bereitgestellte Werte. Runtime-Werte haben
Vorrang. Verschlüsselte `encrypted:...`-Literale ohne dotenvx-Preload sind ein
Konfigurationsfehler; sie werden NICHT als Proxy-Passwort gesendet.

```dotenv
AMAZON_HTML_ENABLED=false
AMAZON_PROXY_HOST=gw.dataimpulse.com
AMAZON_PROXY_PORT=823
AMAZON_PROXY_USERNAME="bestehender_lokaler_Wert"
AMAZON_PROXY_PASSWORD="bestehender_lokaler_Wert"
HTML_CONCURRENCY=4
AMAZON_HTML_TIMEOUT_MS=20000
AMAZON_HTML_MAX_HTML_BYTES=4000000
AMAZON_HTML_MAX_QUEUE=64
HTML_PROMOTION_SCAN_BYTES=1000000
HTML_FETCH_MODE=promotion
```

1–16 aktive Abrufe konfigurierbar. Nach sinnvoller Live-Erfolgsprüfung kann 8
statt 4 verwendet werden. Mehr Parallelität repariert keine Blockade. Das
Sparmodus-Suchbudget ist standardmäßig 1.000.000 dekomprimierte Bytes; der Fetcher
bricht früher ab, sobald das Angebot vollständig ist. `promotion_scan_limit`
ist ungeklärt und keine negative Rabattentscheidung. Das Budget bei belegten
späteren Layouts gezielt erhöhen, nicht global unbegrenzt setzen.

Timeout maximal 20 Sekunden inklusive interner Wartezeit. Ein fast abgelaufenes
Queue-Ticket beginnt keinen nutzlosen Proxy-Abruf mehr.

## Cache und lokale Überlast

Die dokumentierte Zehn-Tage-Regel für erfolgreich geprüfte Ergebnisse und sechs
Stunden nach echten Fehlschlägen bleibt bestehen. Fehlercodes sind NIE pauschal
kein Rabatt. Insbesondere `asin_mismatch` ist im neuen Runner kein Null-Rabatt.

`queue_full` / `queue_timeout` haben `cacheDisposition=defer`: lokal kurz
zurückstellen, KEIN sechs-Stunden-ASIN-Fehler und keine Blockadequote. Nicht als
Amazon-Anfrage zählen, wenn `requestAttempted=false`.

`disabled` / `configuration_error`: keine negativen Cache-Einträge; Warteschlange
bleibt auf Disk und wird erst nach korrigiertem Neustart fortgesetzt.

Der Parser muss `regionVerified=true`, unzweideutige Raten und plausible Werte
liefern, bevor der Runner einen regulären Cache-Eintrag schreibt. Das frühere
willkürliche Minimum von 1.000 HTML-Zeichen ist entfernt.

Bereits gelöschte 1.172 falsche Einträge nicht wiederherstellen. Vorhandene gute
Cache-Einträge nicht pauschal löschen. Noch vorhandene alte Null-Einträge, die
nachweislich aus `asin_mismatch` oder Fehlantworten stammen, anhand der Logs
gezielt zur Wiederprüfung freigeben. Keine blanketmäßige Cache-Löschung.

## 100 ASINs/min, Dauerqueue und Neustart

100 ASINs/min × 4 Länder = 400 Seiten/min. Vier bedeutet GLEICHZEITIG, nicht vier
insgesamt. Erforderliche Parallelität hängt von der echten Latenz ab: etwa 7 bei
1 Sekunde pro Seite, etwa 14 bei 2 Sekunden, jeweils ohne Blockaden/Pausen.
Bei fortdauernder Blockade wächst die Queue auch bei mehr Arbeitern.

Der neue Runner:

- Speichert jeden angenommenen ASIN-Auftrag sofort unter
  `fba-watcher-state/html-promo-pending/<ASIN>.json`.
- Hält in RAM nur ASIN-Schlüssel; `queueMax` begrenzt das Scheduling-Fenster,
  NICHT die insgesamt auf Disk wartenden Aufträge. Gesunde Disk vorausgesetzt.
- Dedupiziert auch aktive ASINs und aktualisiert deren Fullrun-Snapshot.
- Lässt offene Länder nach einer Pause/Neustart nicht unter den Tisch fallen.
- Speichert Länderergebnisse vor dem Löschen des abgeschlossenen Queue-Jobs.
- Serialisiert `feesMap` als Einträge und stellt sie wieder als Map her.
- Behält bei deaktiviertem Fetcher oder Prozessende die offenen Jobs.
- Stellt asynchrone Callback-/Worker-Fehler nicht als erfolgreiche Jobs dar.

Die bestehende Pause nach mindestens 60% nicht nutzbaren Antworten in den letzten
50 wird beibehalten: 15 Minuten. Die Bezeichnung lautet jetzt ausdrücklich
„blockiert oder nicht nutzbar“, da Netzwerkfehler keinen Bot-Nachweis darstellen.
Lokale Queue-Überlast zählt dort nicht hinein.

**Integration in fba-watcher:** `enqueue()` liefert jetzt `{accepted, reason}`.
Bei `queue_write_failed` den Fullrun-Kandidaten selbst behalten/wieder vormerken;
keine Aufträge als erfolgreich eingereiht markieren. Bei `not_due` ist keine
neue Prüfung erforderlich. Die bisherige `enabled`-Prüfung und Nachhollauf-Regeln
beibehalten. Beim sauberen Shutdown möglichst `await htmlPromo.stop()` aufrufen.
Die Disk-Queue überlebt auch einen abrupten Prozessabbruch, aber eine externe
Post-Aktion ist nicht atomar mit der Dateiquittierung: vorhandene Post-Deduplizierung
MUSS erhalten bleiben. Nicht zwei Node-Prozesse mit demselben Queue-Verzeichnis
betreiben. Queue-Länge, freien Speicher und ältesten Auftrag beobachten.

## Diagnose ohne Fullrun-Aktivierung

Zuerst Code offline lesen und prüfen. Node 20; vorhandene Abhängigkeiten reichen:
`dotenv@16.6.1`, `undici@6.29.1`, `htmlparser2@10.0.0`.

```powershell
cd C:\keepa-watcher
node --check html-fetcher.mjs
node --check html-promo-parser.mjs
node --check html-promo.mjs
node diagnose-html-fetcher.mjs --probe
```

`--probe` aktiviert NUR diesen expliziten Diagnose-Prozess, verändert keine `.env`
und schaltet den Fullrun nicht ein. Standardmäßig genau fünf gemeldete Fälle,
je einmal, keine Wiederholungen. Ergebnis ist JSONL ohne Roh-HTML oder Secrets.
Bei verschlüsselter lokaler Umgebung den bestehenden dotenvx-Startweg nutzen:

```powershell
dotenvx run -- node diagnose-html-fetcher.mjs --probe
```

Eigene Fälle: `--cases pfad.json`, Format `[{"asin":"B0H2LXPD82","land":"es"}]`.
Nicht eine bestehende große Fullrun-Datei als Probe übergeben. Provider-Traffic
im selben Zeitfenster messen. Gelesene dekomprimierte HTML-Bytes sind keine Rechnung.

Falls die Probe wieder nur Blockseiten/Leerantworten ergibt: Runner aus lassen,
Queue bewahren und den Proxy-Anbieter mit bereinigter Diagnose kontaktieren.
Keine Challenge klicken, keine unbeschränkten Retries und keine Erfolgsgarantie.

## Überprüfung

Die beigefügten Testberichte unterscheiden lokale TLS/CONNECT-Simulation,
gespeicherte echte Amazon-Antworten und tatsächliche DataImpulse-Liveverfügbarkeit.
Ein Burst-Test mit 100 ASINs erzeugt 400 Länderprüfungen bei begrenzten Arbeitern,
auch bei einem RAM-Scheduling-Fenster von zwei Einträgen. Daneben: Disk-Recovery,
Pause mitten im Job, Backpressure ohne Fehlcache, Varianten, 200-OK-Prüfseiten,
leere Antworten, MIME-Sniffing, reine Produktregionen und echte fünf Variantenfälle.
Die vorhandene Deal-Arithmetik wurde nicht fachlich anhand eines Checkouts geprüft.

Abschluss: **74/74 Tests bestanden** (38 Fetcher/End-to-End, 24 Parser, 12 Runner), Node 20.20.2.

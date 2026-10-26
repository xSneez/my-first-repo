# Amazon HTML Fix V2

Die drei Laufzeitdateien gemeinsam in das bestehende Keepa-Watcher-Projekt uebernehmen. Details: [CLAUDE_FIX_V2.md](CLAUDE_FIX_V2.md).

- html-fetcher.mjs
- html-promo.mjs
- html-promo-parser.mjs

Node.js 20+, vorhandene Abhaengigkeiten: dotenv 16.6.1, undici 6.29.1, htmlparser2 10.0.0. Zugangsdaten ausschliesslich aus der bestehenden .env.

Dieser Ordner ist ein Integrationspaket; business-ek.mjs und watcher.js kommen aus dem bestehenden Projekt. Vorhandene Dateien sichern. Erst kontrolliert testen, dann Runner aktivieren.

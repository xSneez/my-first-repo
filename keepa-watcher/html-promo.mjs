// Persistent HTML-promo worker. Deal arithmetic below is preserved from supplied runner.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { calcEK } from './business-ek.mjs';
import { parsePromoHtml } from './html-promo-parser.mjs';
import { evaluateDealFree } from './watcher.js';

const ALL = [3, 4, 8, 9];
const LAND = { 3: 'de', 4: 'fr', 8: 'it', 9: 'es' };
const DN = { 3: 'DE', 4: 'FR', 8: 'IT', 9: 'ES' };
const TTL_MIN = 10 * 1440;
const FAIL_TTL_MIN = 6 * 60;
const NEW_PRICE_IDX = [0, 1, 10, 18, 33];
const nowMin = () => Math.floor(Date.now() / 60000);
const isProductPage = html => /\bid\s*=\s*["'](?:productTitle|title_feature_div)["']/i.test(html);

export function createHtmlPromo({ stateDir, minMarge, fetcherPath, concurrency = 4,
  queueMax = 30000, onPromoDeal, log = console.log, timings = {} }) {
  const limit = Number(process.env.HTML_CONCURRENCY ?? concurrency);
  if (!Number.isInteger(limit) || limit < 1 || limit > 16) throw new RangeError('HTML_CONCURRENCY must be 1..16');
  if (!Number.isInteger(queueMax) || queueMax < 1) throw new RangeError('queueMax must be positive');
  const timing = { idleMs: 3000, localRetryMs: 1000, saveMs: 60000,
    blockWindow: 50, blockRatio: 0.6, blockPauseMs: 15 * 60000, fetchTimeoutMs: 30000, ...timings };
  fs.mkdirSync(stateDir, { recursive: true });
  const CACHE_FILE = path.join(stateDir, 'html-promo-cache.json');
  const PENDING_DIR = path.join(stateDir, 'html-promo-pending');
  const ERR_LOG = path.join(stateDir, 'html-fetch-errors.jsonl');
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  const safeLog = message => { try { log(message); } catch {} };
  let cache = {}, cacheLoadError = false;
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (!cache || typeof cache !== 'object' || Array.isArray(cache)) throw new Error('Invalid cache');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      try { fs.copyFileSync(CACHE_FILE, `${CACHE_FILE}.unreadable-${Date.now()}`); cache = {}; }
      catch { cacheLoadError = true; }
      safeLog('HTML cache could not be read; a preservation copy is required before continuing.');
    }
  }
  let dirty = false, fetchPage = null, fetchDetailed = null, blockedReason = null;
  let running = false, started = false, pausedUntil = 0, saveTimer;
  const queue = [], ready = new Set(), active = new Set(), pending = new Set(), waiters = new Set();
  const workers = [], recent = [];
  const stats = { pages: 0, fails: 0, found: 0, promoDeals: 0, pauses: 0, deferred: 0, reasons: {} };
  const MODE = String(process.env.HTML_FETCH_MODE ?? 'promotion').toLowerCase() === 'full' ? 'full' : 'promotion';
  const jobPath = asin => path.join(PENDING_DIR, `${asin}.json`);
  function atomicJson(file, value) {
    const tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(value), 'utf8'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  }
  function wake() { for (const done of [...waiters]) done(); }
  function wait(ms) {
    return new Promise(resolve => {
      let timer;
      const done = () => { clearTimeout(timer); waiters.delete(done); resolve(); };
      waiters.add(done); timer = setTimeout(done, Math.max(1, ms)); timer.unref?.();
      if (!running) done();
    });
  }
  function schedule(asin) {
    if (!active.has(asin) && !ready.has(asin) && queue.length < queueMax) { ready.add(asin); queue.push(asin); }
  }
  function refill() {
    if (queue.length) return;
    for (const asin of pending) { if (queue.length >= queueMax) break; schedule(asin); }
  }
  function logFailure(entry) {
    try {
      if (fs.existsSync(ERR_LOG) && fs.statSync(ERR_LOG).size > 5 * 1024 * 1024) {
        try { fs.unlinkSync(ERR_LOG + '.1'); } catch {}
        fs.renameSync(ERR_LOG, ERR_LOG + '.1');
      }
      fs.appendFileSync(ERR_LOG, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n');
    } catch { safeLog('HTML failure log could not be persisted.'); }
  }
  function noteOutcome(unusable) {
    recent.push(unusable); if (recent.length > timing.blockWindow) recent.shift();
    if (recent.length >= timing.blockWindow && recent.filter(Boolean).length / recent.length >= timing.blockRatio
      && Date.now() >= pausedUntil) {
      pausedUntil = Date.now() + timing.blockPauseMs; stats.pauses++; recent.length = 0;
      safeLog(`HTML paused: at least ${Math.round(timing.blockRatio * 100)}% blocked or unusable responses; pending jobs retained.`);
    }
  }
  const due = (asin, dom) => {
    const c = cache[`${asin}|${dom}`];
    return !Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || nowMin() - c[0] >= (c[1] < 0 ? FAIL_TTL_MIN : TTL_MIN);
  };
  // Gültige (≤10 Tage) Kassen-Rabatte einer ASIN: { dom: pct } — null, wenn keiner > 0
  function cachedPromos(asin) {
    const out = {}; let any = false;
    for (const d of ALL) {
      const c = cache[`${asin}|${d}`];
      if (c && c[1] > 0 && nowMin() - c[0] <= TTL_MIN) { out[d] = c[1]; any = true; }
    }
    return any ? out : null;
  }

  // Fullrun-Eintrag MIT Kassen-Rabatten neu rechnen. Liefert das Ergebnis nur, wenn der Rabatt den besten EK senkt.
  function promoResult(e, businessData, feesMap, rNormal) {
    const asin = e.deal.asin;
    const promos = cachedPromos(asin);
    if (!promos) return null;
    const e2 = { ...e, dealsByDom: {} };
    for (const d of ALL) {
      const dd = e.dealsByDom?.[d]; if (!dd) continue;
      const pct = promos[d] || 0;
      if (!pct) { e2.dealsByDom[d] = dd; continue; }
      const cur = (dd.current || []).map((v, i) => (v > 0 && NEW_PRICE_IDX.includes(i)) ? Math.round(v * (1 - pct / 100)) : v);
      cur[2] = -1; // Gebraucht-Untergrenze aus: mit Kassen-Rabatt darf Neu legitim unter Gebraucht liegen
      e2.dealsByDom[d] = { ...dd, current: cur };
    }
    const biz2 = {};
    for (const d of ALL) {
      const src = businessData?.[d]?.[asin];
      if (!src) continue;
      const pct = promos[d] || 0;
      const d2 = pct > 0 ? { ...src, promo: { checkoutPct: pct, multiPct: 0, multiQty: 0 } } : src;
      if (pct > 0 && (src.consumer != null || src.tiers?.length)) d2.ek = calcEK(d2, d);
      biz2[d] = { [asin]: d2 };
    }
    const r = evaluateDealFree(e2, biz2, feesMap, minMarge);
    if (!r || !(r.ekNetto < (rNormal?.ekNetto ?? Infinity) - 0.01)) return null; // Rabatt bringt nichts
    r.htmlPromo = {
      promos: ALL.filter(d => promos[d] > 0).map(d => ({ markt: DN[d], pct: promos[d] })),
      ekOhne: rNormal ? { brutto: rNormal.ekBrutto, netto: rNormal.ekNetto, markt: rNormal.ekMarkt } : null,
    };
    return r;
  }

  // Disk is authoritative; queueMax bounds only the in-memory scheduling window.
  function enqueue(e, businessData, feesMap) {
    if ((!fetchPage && !fetchDetailed) || blockedReason) return { accepted: false, reason: blockedReason ?? 'not_started' };
    const asin = String(e?.deal?.asin ?? '').toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) return { accepted: false, reason: 'invalid_asin' };
    if (!pending.has(asin) && !ALL.some(d => due(asin, d))) return { accepted: false, reason: 'not_due' };
    const biz = {}, fees = [];
    for (const d of ALL) {
      const value = businessData?.[d]?.[asin]; if (value) biz[d] = { [asin]: value };
      const key = `${asin}_${d}`; const fee = feesMap?.get(key); if (fee) fees.push([key, fee]);
    }
    try {
      const deduplicated = pending.has(asin);
      atomicJson(jobPath(asin), { version: 1, asin, e, biz, fees, updatedAt: Date.now() });
      pending.add(asin); schedule(asin); wake();
      return { accepted: true, deduplicated };
    } catch {
      safeLog('HTML queue write failed; caller must retain/requeue the Fullrun candidate.');
      return { accepted: false, reason: 'queue_write_failed' };
    }
  }
  async function withTimeout(operation) {
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(operation), new Promise(resolve => {
        timer = setTimeout(() => resolve({ html: null, reason: 'timeout' }), timing.fetchTimeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function fetchOne(asin, dom) {
    let response = null, html = null, reason = 'error', parsed = null;
    try {
      if (fetchDetailed) response = await withTimeout(() => fetchDetailed(asin, LAND[dom]));
      else {
        const legacy = await withTimeout(() => fetchPage(asin, LAND[dom]));
        response = typeof legacy === 'string' ? { html: legacy, reason: 'ok' } : legacy ?? { reason: 'error' };
      }
      html = response?.html ?? null; reason = response?.reason ?? 'error';
    } catch { reason = 'error'; }
    if (reason === 'disabled' || reason === 'configuration_error') {
      blockedReason = reason;
      safeLog(`HTML fetcher is ${reason}; pending jobs preserved until restart.`);
      return 'defer';
    }
    if (response?.cacheDisposition === 'defer' || ['queue_full', 'queue_timeout', 'cancelled'].includes(reason)) {
      stats.deferred++;
      return 'defer'; // No six-hour ASIN failure and no circuit-breaker penalty.
    }
    if (response?.requestAttempted !== false) stats.pages++;
    const failureEntry = () => ({ asin, land: DN[dom], reason,
      http: response?.httpStatus ?? null, contentType: response?.contentType ?? null,
      kb: response?.decodedHtmlBytes != null ? Math.round(response.decodedHtmlBytes / 1024) : null,
      ms: response?.durationMs ?? null, canonicalAsin: response?.canonicalAsin ?? null,
      selectedAsin: response?.selectedAsin ?? null, promotionState: response?.promotionState ?? null,
      diagnostics: response?.diagnostics ?? null, version: response?.version ?? null });
    const key = `${asin}|${dom}`;
    if (response?.httpStatus === 404) {
      stats.reasons.not_found = (stats.reasons.not_found ?? 0) + 1;
      cache[key] = [nowMin(), 0, 0, 0]; dirty = true; noteOutcome(false); return 'done';
    }
    // Missing region is unresolved, not automatically a bot page or no discount.
    if (reason === 'ok' && (!html || !isProductPage(html))) reason = 'identity_unverified';
    if (reason === 'ok') {
      try { parsed = parsePromoHtml(html, dom, { asin }); }
      catch { reason = 'parser_error'; }
      if (parsed?.captcha) reason = 'bot_check';
      else if (!parsed) reason = 'parser_empty';
      else if (parsed.regionVerified === false || parsed.ambiguous) reason = 'parser_unresolved';
      else {
        const values = [Number(parsed.checkoutPct ?? 0), Number(parsed.multiPct ?? 0), Number(parsed.multiQty ?? 0)];
        if (!values.every(Number.isFinite) || values[0] < 0 || values[0] > 100 || values[1] < 0 || values[1] > 100
          || !Number.isInteger(values[2]) || values[2] < 0 || (values[1] > 0 && values[2] < 2)) reason = 'parser_invalid_values';
        else parsed = { ...parsed, checkoutPct: values[0], multiPct: values[1], multiQty: values[2] };
        // Old parsers only understand the original div. Do not cache an unhandled fallback as zero.
        if (reason === 'ok' && response?.diagnostics?.selectedRegion === 'alternative_product_promotion'
          && parsed.regionVerified !== true) reason = 'parser_region_unsupported';
      }
    }
    stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
    if (reason !== 'ok') {
      stats.fails++; logFailure(failureEntry()); noteOutcome(true);
      cache[key] = [nowMin(), -1]; // Includes actual mismatches; never a ten-day no-discount entry.
    } else {
      noteOutcome(false);
      cache[key] = [nowMin(), parsed.checkoutPct, parsed.multiPct, parsed.multiQty];
      if (parsed.checkoutPct > 0) stats.found++;
    }
    dirty = true;
    return 'done';
  }
  function readJob(asin) {
    const value = JSON.parse(fs.readFileSync(jobPath(asin), 'utf8'));
    if (value.asin !== asin || !value.e?.deal || !Array.isArray(value.fees)) throw new Error('Invalid pending job');
    return { ...value, fees: new Map(value.fees) };
  }
  async function processJob(asin) {
    // Keep the file and pending key until all four due countries have a persisted outcome.
    readJob(asin);
    for (const dom of ALL) {
      if (!running || blockedReason || Date.now() < pausedUntil) return false;
      if (due(asin, dom) && await fetchOne(asin, dom) === 'defer') return false;
    }
    if (ALL.some(dom => due(asin, dom))) return false;
    const current = readJob(asin); // Use newest Fullrun snapshot if enqueue updated an active job.
    if (cachedPromos(asin)) {
      const normal = evaluateDealFree(current.e, current.biz, current.fees, minMarge);
      const result = promoResult(current.e, current.biz, current.fees, normal);
      if (result && typeof onPromoDeal === 'function') { await onPromoDeal(result); stats.promoDeals++; }
    }
    save(); // Cache commit before durable job acknowledgement.
    fs.unlinkSync(jobPath(asin)); pending.delete(asin);
    return true;
  }
  async function worker() {
    while (running) {
      if (blockedReason || Date.now() < pausedUntil) {
        await wait(blockedReason ? timing.idleMs : Math.min(timing.idleMs, pausedUntil - Date.now()));
        continue;
      }
      refill();
      const asin = queue.shift();
      if (!asin) { await wait(timing.idleMs); continue; }
      ready.delete(asin); active.add(asin);
      let done = false;
      try { done = await processJob(asin); }
      catch {
        safeLog(`HTML job ${asin} remains pending after worker/persistence/callback failure.`);
        stats.fails++;
      } finally {
        active.delete(asin);
        if (!done && pending.has(asin)) {
          await wait(timing.localRetryMs);
          schedule(asin);
        }
      }
    }
  }
  function save() {
    if (!dirty) return;
    const cut = nowMin() - TTL_MIN;
    for (const key of Object.keys(cache)) if (cache[key][0] < cut) delete cache[key];
    atomicJson(CACHE_FILE, cache); dirty = false;
  }
  async function start() {
    if (started) return running;
    if (cacheLoadError) { safeLog('HTML runner remains off: original cache could not be preserved.'); return false; }
    const file = path.resolve(fetcherPath ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'html-fetcher.mjs'));
    try {
      const mod = await import(pathToFileURL(file).href);
      if (typeof mod.fetchProductPageDetailed === 'function') fetchDetailed = (a, l) => mod.fetchProductPageDetailed(a, l, { mode: MODE });
      else fetchPage = mod.fetchProductPage ?? (typeof mod.default === 'function' ? mod.default : null);
    } catch { safeLog('HTML runner remains off: fetcher could not be imported.'); return false; }
    if (!fetchPage && !fetchDetailed) return false;
    for (const filename of fs.readdirSync(PENDING_DIR)) {
      const match = /^([A-Z0-9]{10})\.json$/.exec(filename);
      if (match) pending.add(match[1]);
    }
    started = running = true; refill();
    for (let i = 0; i < limit; i++) workers.push(worker());
    saveTimer = setInterval(() => { try { save(); } catch { safeLog('HTML cache save failed; pending jobs retained.'); } }, timing.saveMs);
    saveTimer.unref?.();
    safeLog(`HTML runner ready: ${limit} workers, mode=${MODE}, ${pending.size} durable pending ASINs; no unlimited parallelism.`);
    return true;
  }
  async function stop() {
    running = false; clearInterval(saveTimer); wake();
    await Promise.allSettled(workers);
    save();
  }
  return {
    start, stop, enqueue, promoResult, save,
    get enabled() { return running && !!(fetchPage || fetchDetailed) && !blockedReason; },
    snapshot: () => ({ pending: pending.size, active: active.size, queued: queue.length, pausedUntil,
      concurrency: limit, blockedReason, stats: structuredClone(stats) }),
    statsLine: () => `HTML ${Date.now() < pausedUntil ? 'PAUSE ' : ''}${stats.pages} pages, ${stats.fails} failures, ${stats.deferred} deferred, ${stats.found} discounts, ${stats.promoDeals} deals; pending=${pending.size}, active=${active.size}, RAM queue=${queue.length}`,
  };
}

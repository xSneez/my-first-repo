/** Node 20+: read-only, budgeted Amazon HTML. No purchase, location or login actions. */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import { Parser } from 'htmlparser2';
import { fetch, ProxyAgent } from 'undici';

export const FETCHER_VERSION = '2.0.0';
const DEFAULT_ENV = fileURLToPath(new URL('./.env', import.meta.url));
const LANDS = new Set(['de', 'fr', 'it', 'es']);
const PRIMARY_REGION = 'promoPriceBlockMessage_feature_div';
const REGION_IDS = new Set([
  PRIMARY_REGION, 'promotionMessageInsideBuyBox_feature_div',
  'couponsInBuybox_feature_div', 'promoMessagingDiscountValue_feature_div',
  'promotions_feature_div',
]);
const OFFER_BOUNDARIES = new Set(['centerCol', 'ppd', 'dp-container']);
const ENV_KEYS = [
  'AMAZON_HTML_ENABLED', 'AMAZON_PROXY_HOST', 'AMAZON_PROXY_PORT',
  'AMAZON_PROXY_USERNAME', 'AMAZON_PROXY_PASSWORD', 'HTML_CONCURRENCY',
  'AMAZON_HTML_TIMEOUT_MS', 'AMAZON_HTML_MAX_HTML_BYTES', 'AMAZON_HTML_MAX_QUEUE',
  'HTML_PROMOTION_SCAN_BYTES',
];
class Failure extends Error {
  constructor(code) { super(code); this.code = code; }
}
function integer(env, key, fallback, min, max) {
  const raw = String(env[key] ?? fallback);
  if (!/^\d+$/.test(raw)) throw new Failure('invalid_numeric_configuration');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Failure('invalid_numeric_configuration');
  return value;
}
function configuration(envPath, runtimeEnv) {
  let file = {};
  try { file = parse(readFileSync(envPath)); }
  catch (error) { if (error.code !== 'ENOENT') throw new Failure('env_file_unreadable'); }
  const env = { ...file };
  let runtimeKeys = 0;
  for (const key of ENV_KEYS) {
    if (runtimeEnv[key] !== undefined) { env[key] = String(runtimeEnv[key]); runtimeKeys++; }
  }
  const source = runtimeKeys ? (Object.keys(file).length ? 'file_and_runtime' : 'runtime') : 'file';
  const enabled = String(env.AMAZON_HTML_ENABLED ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(enabled)) throw new Failure('invalid_feature_flag');
  if (enabled === 'false') return { enabled: false, source };
  const host = env.AMAZON_PROXY_HOST ?? 'gw.dataimpulse.com';
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)) throw new Failure('invalid_proxy_host');
  const username = env.AMAZON_PROXY_USERNAME;
  const password = env.AMAZON_PROXY_PASSWORD;
  if ([username, password].some(value => /^encrypted:/i.test(value ?? ''))) {
    throw new Failure('encrypted_env_requires_dotenvx');
  }
  if (!username || !password || /[\x00-\x1f\x7f]/.test(username + password) || username.includes(':')) {
    throw new Failure('missing_or_invalid_proxy_credentials');
  }
  return {
    enabled: true, source,
    proxyUri: `http://${host}:${integer(env, 'AMAZON_PROXY_PORT', 823, 1, 65535)}`,
    proxyToken: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`,
    concurrency: integer(env, 'HTML_CONCURRENCY', 4, 1, 16),
    timeoutMs: integer(env, 'AMAZON_HTML_TIMEOUT_MS', 20000, 50, 20000),
    maxHtmlBytes: integer(env, 'AMAZON_HTML_MAX_HTML_BYTES', 4000000, 1024, 20000000),
    scanBytes: integer(env, 'HTML_PROMOTION_SCAN_BYTES', 1000000, 1024, 20000000),
    maxQueue: integer(env, 'AMAZON_HTML_MAX_QUEUE', 64, 0, 500),
  };
}
class Slots {
  constructor(limit, maxQueue) { this.limit = limit; this.maxQueue = maxQueue; this.active = 0; this.waiting = []; }
  releaseHandle() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      while (this.waiting.length) {
        const next = this.waiting.shift();
        next.signal.removeEventListener('abort', next.abort);
        if (next.signal.aborted || performance.now() >= next.startBy) { next.reject(new Failure('queue_timeout')); continue; }
        this.active++;
        next.resolve(this.releaseHandle());
        break;
      }
    };
  }
  acquire(signal, startBy = Infinity) {
    if (performance.now() >= startBy) return Promise.reject(new Failure('queue_timeout'));
    if (signal.aborted) return Promise.reject(new Failure('timeout'));
    if (this.active < this.limit) { this.active++; return Promise.resolve(this.releaseHandle()); }
    if (this.waiting.length >= this.maxQueue) return Promise.reject(new Failure('queue_full'));
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, signal, startBy, abort: null };
      entry.abort = () => {
        const index = this.waiting.indexOf(entry);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(new Failure('timeout'));
      };
      signal.addEventListener('abort', entry.abort, { once: true });
      this.waiting.push(entry);
    });
  }
}
const asinValue = value => typeof value === 'string' && /^[A-Z0-9]{10}$/i.test(value) ? value.toUpperCase() : null;
const normalizedText = value => value.replace(/\s+/g, ' ').trim();
const hasAmount = value => /\d\s*(?:%|€)|(?:€|EUR)\s*\d|\d[.,]\d{2}\s*(?:€|EUR)/i.test(value);

/** Streaming product-scoped structure. Never treat related-product ASINs as selected variants. */
class ProductDocument {
  constructor(requestedAsin, url) {
    this.requestedAsin = requestedAsin;
    this.url = url;
    this.frames = [];
    this.primaryAsins = new Set();
    this.canonicalAsins = new Set();
    this.titleAsins = new Set();
    this.hasProductMarker = false;
    this.regionIds = new Set();
    this.regions = [];
    this.boundaryEnd = null;
    this.blocked = false;
    this.amazonTitle = false;
    this.challengeButton = false;
    this.visibleText = '';
    this.parser = new Parser({
      onopentag: (name, attrs) => this.open(name, attrs),
      ontext: text => this.text(text),
      onclosetag: (name, implied) => this.close(name, implied),
    }, { decodeEntities: true });
  }
  open(name, attrs) {
    if (this.frames.length >= 4096) throw new Failure('html_depth_limit');
    const parent = this.frames.at(-1);
    const id = attrs.id ?? '';
    const classes = (attrs.class ?? '').split(/\s+/);
    const raw = parent?.raw || ['script', 'style', 'template'].includes(name);
    const hidden = parent?.hidden || attrs.hidden !== undefined || attrs['aria-hidden'] === 'true'
      || classes.includes('aok-hidden') || /display\s*:\s*none/i.test(attrs.style ?? '');
    const unrelated = parent?.unrelated || classes.includes('a-carousel-card') || classes.includes('s-result-item');
    if (!raw && !unrelated) {
      if (['productTitle', 'title_feature_div', 'dp', 'dp-container', 'ppd'].includes(id)) this.hasProductMarker = true;
      if (id === 'title_feature_div' && asinValue(attrs['data-csa-c-asin'])) this.titleAsins.add(asinValue(attrs['data-csa-c-asin']));
      if (name === 'input') {
        const value = asinValue(attrs.value);
        const cart = this.frames.some(f => f.cart);
        if (value && (id === 'ASIN' || (cart && ['ASIN', 'items[0.base][asin]'].includes(attrs.name)))) {
          this.primaryAsins.add(value);
        }
      }
      if (name === 'link' && (attrs.rel ?? '').toLowerCase().split(/\s+/).includes('canonical')) {
        try {
          const canonical = new URL(attrs.href, this.url);
          const selected = canonical.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
          if (selected && canonical.hostname === new URL(this.url).hostname) this.canonicalAsins.add(selected[1].toUpperCase());
        } catch {}
      }
      if (/^(?:captchacharacters)$/i.test(id) || /^(?:captchacharacters)$/i.test(attrs.name ?? '')
        || (name === 'form' && /validateCaptcha/i.test(attrs.action ?? ''))
        || /validateCaptcha/i.test(attrs.formaction ?? '')) this.blocked = true;
      if (name === 'input' && /^(submit|button)$/i.test(attrs.type ?? '') && this.continueLabel(attrs.value ?? '')) this.challengeButton = true;
    }
    const owner = attrs['data-csa-c-owner'];
    const item = attrs['data-csa-c-item-id'] ?? '';
    const owned = owner === 'PromotionsDiscovery' && item.startsWith(`amzn1.asin.${this.requestedAsin}:`);
    let region = null;
    if (!raw && !hidden && !unrelated && (REGION_IDS.has(id) || owned)) {
      region = { id: owned && !REGION_IDS.has(id) ? 'PromotionsDiscovery' : id,
        kind: id === PRIMARY_REGION ? 'primary' : 'alternative', start: this.parser.startIndex,
        end: null, text: '', hasContent: false, textTruncated: false };
      this.regionIds.add(region.id);
    }
    this.frames.push({ name, id, raw, hidden, unrelated, region,
      cart: name === 'form' && (id === 'addToCart' || /\/gp\/product\/handle-buy-box/.test(attrs.action ?? '')),
      title: name === 'title', titleText: '', button: name === 'button', buttonText: '' });
  }
  text(text) {
    const current = this.frames.at(-1);
    if (!current || current.raw || current.hidden || current.unrelated) return;
    if (this.visibleText.length < 8192) this.visibleText += text.slice(0, 8192 - this.visibleText.length);
    for (const frame of this.frames) {
      if (frame.button && frame.buttonText.length < 512) frame.buttonText += text.slice(0, 512 - frame.buttonText.length);
      if (frame.region) {
        const room = Math.max(0, 4096 - frame.region.text.length);
        if (text.length > room) frame.region.textTruncated = true;
        frame.region.text += text.slice(0, room);
      }
      if (frame.title && frame.titleText.length < 512) frame.titleText += text.slice(0, 512 - frame.titleText.length);
    }
    if (/To discuss automated access to Amazon data|Enter the characters you see below/i.test(text)) this.blocked = true;
  }
  close(name, implied) {
    const frame = this.frames.pop();
    if (!frame) return;
    if (frame.title && /\bRobot Check\b|\bCAPTCHA\b|^\s*Sorry!/i.test(frame.titleText)) this.blocked = true;
    if (frame.title && /^\s*Amazon(?:\.(?:de|fr|es|it|com))?\s*$/i.test(frame.titleText)) this.amazonTitle = true;
    if (frame.button && this.continueLabel(frame.buttonText)) this.challengeButton = true;
    if (frame.name !== name || implied) return;
    if (frame.region) {
      frame.region.end = this.parser.endIndex + 1;
      frame.region.hasContent = hasAmount(normalizedText(frame.region.text));
      this.regions.push(frame.region);
    }
    if (OFFER_BOUNDARIES.has(frame.id) && !frame.unrelated) this.boundaryEnd = this.parser.endIndex + 1;
  }
  continueLabel(text) {
    return /^(?:weiter shoppen|weiter einkaufen|continue shopping|continuer (?:vos |les )?achats|seguir comprando|continuar comprando|continua (?:gli )?acquisti)$/i.test(normalizedText(text));
  }
  isBlocked() {
    if (this.blocked) return true;
    // Amazon's 200-OK soft challenge is not a product page. Never click its button.
    return !this.hasProductMarker && this.amazonTitle && this.challengeButton
      && /(?:klick(?:e|en)|click|cliquez|haz clic|haga clic|fai clic|clicca)[\s\S]{0,200}(?:schaltfl[aä]che|button|bouton|bot[oó]n|pulsante)/i.test(this.visibleText);
  }
  identity() {
    if (this.primaryAsins.size) {
      if (this.primaryAsins.size !== 1) return { ok: false, reason: 'identity_ambiguous', method: 'selected_asin' };
      if (!this.primaryAsins.has(this.requestedAsin)) return { ok: false, reason: 'asin_mismatch', method: 'selected_asin' };
      return { ok: this.hasProductMarker, reason: this.hasProductMarker ? null : 'identity_unverified', method: 'selected_asin' };
    }
    if (this.titleAsins.size) {
      if (this.titleAsins.size === 1 && this.titleAsins.has(this.requestedAsin) && this.hasProductMarker) return { ok: true, reason: null, method: 'title_widget' };
      return { ok: false, reason: this.titleAsins.size > 1 ? 'identity_ambiguous' : 'asin_mismatch', method: 'title_widget' };
    }
    if (this.canonicalAsins.size === 1 && this.canonicalAsins.has(this.requestedAsin) && this.hasProductMarker) {
      return { ok: true, reason: null, method: 'canonical' };
    }
    return { ok: false, reason: this.canonicalAsins.size > 1 ? 'identity_ambiguous' : 'identity_unverified', method: 'unverified' };
  }
  selection(complete) {
    if (!this.identity().ok) return null;
    const primary = this.regions.find(region => region.kind === 'primary' && (region.hasContent || region.textTruncated));
    if (primary) return { end: primary.end, id: primary.id, state: primary.hasContent ? 'content_region_complete' : 'region_content_unclassified' };
    const alternative = this.regions.filter(region => region.hasContent);
    if (alternative.length && (this.boundaryEnd || complete)) {
      return { end: Math.max(...alternative.map(region => region.end), this.boundaryEnd ?? 0), id: 'alternative_product_promotion', state: 'content_region_complete' };
    }
    // An explicitly present empty primary region is different from a missing region.
    // Read through the main offer boundary before returning this observation to the parser.
    const emptyPrimary = this.regions.find(region => region.kind === 'primary');
    if (emptyPrimary && (this.boundaryEnd || complete) && !this.frames.some(frame => frame.region)) {
      return { end: Math.max(emptyPrimary.end, this.boundaryEnd ?? 0), id: 'empty_product_promotion', state: 'empty_region_complete' };
    }
    return null;
  }
  diagnostics() {
    const identity = this.identity();
    return { identityMethod: identity.method, selectedAsins: [...this.primaryAsins], titleAsins: [...this.titleAsins], canonicalAsins: [...this.canonicalAsins],
      canonicalDiffersFromSelected: (this.primaryAsins.size ? this.primaryAsins : this.titleAsins).has(this.requestedAsin)
        && [...this.canonicalAsins].some(asin => asin !== this.requestedAsin),
      productMarkerPresent: this.hasProductMarker, seenRegionIds: [...this.regionIds],
      closedRegions: this.regions.map(region => ({ id: region.id, hasContent: region.hasContent, textTruncated: region.textTruncated })) };
  }
}
function contentShape(prefix) {
  const text = prefix.replace(/^\uFEFF/, '').trimStart();
  if (/^[{[]/.test(text)) return 'json_like';
  if (/^(?:<!doctype\s+html\b|<html\b)/i.test(text) || /<html\b/i.test(text.slice(0, 8192))) return 'html';
  return text ? 'other' : 'empty';
}
function safeHeader(value) { return (value ?? '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160); }

/** One shared instance per process. Runtime env supports dotenv/dotenvx preloading. */
export function createProductPageFetcher({ envPath = DEFAULT_ENV, runtimeEnv = process.env } = {}) {
  let config;
  let configIssue;
  let slots;
  try {
    config = configuration(envPath, runtimeEnv);
    if (config.enabled) slots = new Slots(config.concurrency, config.maxQueue);
  } catch (error) { configIssue = error instanceof Failure ? error.code : 'configuration_unreadable'; }

  async function fetchProductPageDetailed(asin, land, options = {}) {
    const started = performance.now();
    const mode = options?.mode ?? 'promotion';
    const result = { version: FETCHER_VERSION, html: null, reason: null, httpStatus: null, durationMs: 0,
      decodedHtmlBytes: 0, mode, completePage: false, promotionRegionComplete: false,
      promotionState: 'not_checked', cacheDisposition: 'retry', retryable: true,
      contentType: null, contentEncoding: null, declaredContentLength: null, canonicalAsin: null, selectedAsin: null,
      configurationSource: config?.source ?? null, requestAttempted: false, stage: 'queue', diagnostics: {} };
    const finish = () => ({ ...result, durationMs: Math.round(performance.now() - started) });
    if (!['full', 'promotion'].includes(mode) || typeof asin !== 'string' || !/^[a-z0-9]{10}$/i.test(asin.trim()) || !LANDS.has(land)) {
      return { ...finish(), reason: 'invalid_input', retryable: false, cacheDisposition: 'not_checked' };
    }
    asin = asin.trim().toUpperCase();
    if (configIssue) return { ...finish(), reason: 'configuration_error', configurationIssue: configIssue, retryable: false, cacheDisposition: 'not_checked' };
    if (!config.enabled) return { ...finish(), reason: 'disabled', retryable: false, cacheDisposition: 'not_checked' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    let release, dispatcher, reader, document;
    let prefix = '';
    try {
      release = await slots.acquire(controller.signal, started + config.timeoutMs - Math.min(100, config.timeoutMs / 10));
      dispatcher = new ProxyAgent({ uri: config.proxyUri, token: config.proxyToken, connections: 1, connectTimeout: config.timeoutMs });
      const url = `https://www.amazon.${land}/dp/${asin}?th=1`;
      result.stage = 'headers';
      result.requestAttempted = true;
      const response = await fetch(url, { dispatcher, signal: controller.signal, redirect: 'manual', headers: {
        'user-agent': 'Mozilla/5.0', 'accept': 'text/html,application/xhtml+xml;q=0.9',
        'accept-encoding': 'gzip, deflate', 'accept-language': 'en-GB,en;q=0.9',
      } });
      result.httpStatus = response.status;
      result.contentType = safeHeader(response.headers.get('content-type')) || null;
      result.contentEncoding = safeHeader(response.headers.get('content-encoding')) || 'identity';
      const declaredLength = response.headers.get('content-length');
      if (declaredLength && /^\d+$/.test(declaredLength) && Number.isSafeInteger(Number(declaredLength))) result.declaredContentLength = Number(declaredLength);
      if (response.status !== 200) throw new Failure('http_error');
      if (!response.body) throw new Failure('empty_body');
      const trustedMime = /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(result.contentType ?? '');
      result.diagnostics.contentTypeAcceptedBy = trustedMime ? 'header' : 'pending_sniff';
      const charset = (result.contentType ?? '').match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1] ?? 'utf-8';
      let decoder;
      try { decoder = new TextDecoder(charset); }
      catch { decoder = new TextDecoder('utf-8'); result.diagnostics.charsetFallback = true; }
      document = new ProductDocument(asin, url);
      result.stage = 'body';
      reader = response.body.getReader();
      const pieces = [];
      let selection;
      let reachedEnd = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) { reachedEnd = true; break; }
        result.decodedHtmlBytes += value.byteLength;
        if (result.decodedHtmlBytes > config.maxHtmlBytes) throw new Failure('size_limit');
        const text = decoder.decode(value, { stream: true });
        pieces.push(text);
        if (prefix.length < 8192) prefix += text.slice(0, 8192 - prefix.length);
        if (contentShape(prefix) === 'json_like' || (!trustedMime && contentShape(prefix) !== 'html' && prefix.trim().length >= 64)) throw new Failure('not_html');
        document.parser.write(text);
        if (document.isBlocked()) throw new Failure('blocked');
        const identity = document.identity();
        // A selected different variant cannot be repaired by reading unrelated later markup.
        if (document.primaryAsins.size && !identity.ok && identity.reason !== 'identity_unverified') throw new Failure(identity.reason);
        selection = document.selection(false);
        if (mode === 'promotion' && selection) break;
        if (mode === 'promotion' && result.decodedHtmlBytes >= Math.min(config.scanBytes, config.maxHtmlBytes)) throw new Failure('promotion_scan_limit');
      }
      if (reachedEnd) {
        const remaining = decoder.decode();
        pieces.push(remaining);
        if (prefix.length < 8192) prefix += remaining.slice(0, 8192 - prefix.length);
        document.parser.write(remaining);
        document.parser.end();
      }
      result.completePage = reachedEnd;
      result.stage = 'validation';
      if (result.decodedHtmlBytes === 0) throw new Failure('empty_body');
      if (document.isBlocked()) throw new Failure('blocked');
      if (!trustedMime && contentShape(prefix) !== 'html') throw new Failure('not_html');
      if (!trustedMime) result.diagnostics.contentTypeAcceptedBy = 'sniffed_html_and_product_identity';
      const identity = document.identity();
      if (!identity.ok) throw new Failure(identity.reason);
      selection = document.selection(reachedEnd);
      result.promotionRegionComplete = !!selection;
      result.promotionState = selection ? selection.state
        : document.regions.length ? 'empty_region_complete'
          : document.regionIds.size ? 'region_incomplete' : 'region_absent';
      let html = pieces.join('');
      if (!html.trim()) throw new Failure('empty_body');
      if (mode === 'promotion') {
        if (!selection) throw new Failure(document.regions.length ? 'promotion_region_empty' : 'promotion_region_missing');
        html = html.slice(0, selection.end);
        result.diagnostics.selectedRegion = selection.id;
      }
      result.html = html;
      result.reason = 'ok';
      result.cacheDisposition = 'parse_required';
      result.retryable = false;
    } catch (error) {
      result.html = null;
      result.reason = controller.signal.aborted ? (result.requestAttempted ? 'timeout' : 'queue_timeout') : error instanceof Failure ? error.code : 'network_error';
      if (['queue_timeout', 'queue_full'].includes(result.reason)) {
        result.cacheDisposition = 'defer';
        result.retryAfterMs = 1000;
      }
      if (document) {
        result.promotionState = document.regions.some(region => region.hasContent) ? 'unresolved'
          : document.regions.length ? 'empty_region_complete'
            : document.regionIds.size ? 'region_incomplete' : 'region_absent';
      }
      // No error.message, response text, tokens, cookies or proxy auth are logged.
    } finally {
      clearTimeout(timer);
      result.diagnostics.bodyShape = contentShape(prefix);
      if (prefix) result.diagnostics.prefixFingerprint = createHash('sha256').update(prefix).digest('hex').slice(0, 16);
      if (document) {
        Object.assign(result.diagnostics, document.diagnostics());
        if (document.canonicalAsins.size === 1) result.canonicalAsin = [...document.canonicalAsins][0];
        const selected = document.primaryAsins.size ? document.primaryAsins : document.titleAsins;
        if (selected.size === 1) result.selectedAsin = [...selected][0];
      }
      if (reader) { try { void reader.cancel().catch(() => {}); } catch {} }
      if (dispatcher) { try { void dispatcher.destroy().catch(() => {}); } catch {} }
      release?.();
    }
    return finish();
  }
  /** Stream arbitrarily many jobs through fixed workers; caller persists/acks each result. */
  async function runProductPageJobs(jobs, { onResult, waitUntilAllowed = async () => true, signal } = {}) {
    if (typeof onResult !== 'function') throw new TypeError('onResult is required for durable acknowledgement');
    if (typeof waitUntilAllowed !== 'function') throw new TypeError('waitUntilAllowed must be a function');
    const iterator = jobs?.[Symbol.asyncIterator]?.() ?? jobs?.[Symbol.iterator]?.();
    if (!iterator) throw new TypeError('jobs must be iterable');
    const counts = { processed: 0, ok: 0, deferred: 0, failed: 0, stopped: false };
    let nextTail = Promise.resolve();
    let halted = false;
    function next() {
      const value = nextTail.then(() => halted ? { done: true } : iterator.next());
      nextTail = value.then(() => undefined, () => undefined);
      return value;
    }
    async function worker() {
      try {
        while (!halted) {
          if (signal?.aborted) { halted = true; counts.stopped = true; break; }
          if (await waitUntilAllowed({ signal }) === false) { halted = true; counts.stopped = true; break; }
          const item = await next();
          if (item.done) break;
          const job = item.value;
          const result = await fetchProductPageDetailed(job?.asin, job?.land ?? job?.country, { mode: 'promotion' });
          // Caller must persist the outcome/retry before returning, and deduplicate posts.
          await onResult(job, result);
          counts.processed++;
          if (result.reason === 'ok') counts.ok++;
          else if (result.cacheDisposition === 'defer') counts.deferred++;
          else counts.failed++;
        }
      } catch (error) { halted = true; throw error; }
    }
    const settled = await Promise.allSettled(Array.from({ length: config?.concurrency ?? 1 }, () => worker()));
    const failure = settled.find(item => item.status === 'rejected');
    if (failure) throw failure.reason;
    return counts;
  }
  async function fetchProductPage(asin, land) { return (await fetchProductPageDetailed(asin, land, { mode: 'promotion' })).html; }
  async function fetchFullProductPage(asin, land) { return (await fetchProductPageDetailed(asin, land, { mode: 'full' })).html; }
  return Object.freeze({ fetchProductPage, fetchProductPromotionHtml: fetchProductPage, fetchFullProductPage, fetchProductPageDetailed, runProductPageJobs });
}
let singleton;
function instance() { return singleton ??= createProductPageFetcher(); }
/** HTML prefix through verified product promotions, or null. Never a negative-discount decision. */
export async function fetchProductPage(asin, land) { return instance().fetchProductPage(asin, land); }
export async function fetchProductPromotionHtml(asin, land) { return instance().fetchProductPage(asin, land); }
export async function fetchFullProductPage(asin, land) { return instance().fetchFullProductPage(asin, land); }
export async function fetchProductPageDetailed(asin, land, options) { return instance().fetchProductPageDetailed(asin, land, options); }
export async function runProductPageJobs(jobs, options) { return instance().runProductPageJobs(jobs, options); }
export default fetchProductPage;

// ==UserScript==
// @name         UAI Query Library
// @namespace    https://github.com/IngmarVG-IB/infoblox-uai-query-library
// @version      __VERSION__
// @description  Adds a curated, searchable query library to the Infoblox Universal Asset Insights Asset Inventory page.
// @author       Ingmar van Glabbeek
// @license      MIT
// @match        https://csp.infoblox.com/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/IngmarVG-IB/infoblox-uai-query-library
// @supportURL   https://github.com/IngmarVG-IB/infoblox-uai-query-library/issues
// ==/UserScript==

/*
 * Community project. Not an official Infoblox product, not endorsed by or
 * affiliated with Infoblox, Inc.
 *
 * Privacy: this script makes no network requests of its own. It sends no
 * telemetry, fetches no remote catalog, and reads no asset data. It puts text
 * into the page's own filter box and clicks the page's own buttons. The whole
 * catalog is baked into this file at build time, so you can read exactly what
 * it will run before you install it.
 *
 * @grant none is deliberate: it runs the script in the page's own context,
 * which is what makes window.monaco reachable. Storage therefore uses
 * localStorage rather than GM_setValue.
 */

(function () {
  'use strict';

  /** Injected at build time from queries/catalog.json. */
  const CATALOG = __CATALOG__;

  /** The page's real window, whether or not the manager sandboxed us. */
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const NS = 'uaiql';
  const STORE_KEY = 'uaiql.local';
  const SAVED_FILTER_PREFIX = '[Library]';
  const INVENTORY_PATH = /\/workspace\/assets\/details\//;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------------------
  // lz-string (compressToEncodedURIComponent only)
  //
  // The app stores filter state in the URL as
  //   LZString.compressToEncodedURIComponent(JSON.stringify(queryText))
  // so reproducing that encoding is what makes shareable query links possible.
  //
  // Extracted from lz-string by pieroxy, MIT licensed.
  // https://github.com/pieroxy/lz-string
  // ---------------------------------------------------------------------------

  const URI_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';

  function compressToEncodedURIComponent(input) {
    if (input == null) return '';
    return _compress(input, 6, (a) => URI_KEY.charAt(a));
  }

  function _compress(uncompressed, bitsPerChar, getCharFromInt) {
    if (uncompressed == null) return '';
    const dictionary = {};
    const dictionaryToCreate = {};
    const data = [];
    let c = '', wc = '', w = '';
    let enlargeIn = 2, dictSize = 3, numBits = 2;
    let dataVal = 0, dataPosition = 0;

    const writeBits = (value, n) => {
      for (let i = 0; i < n; i++) {
        dataVal = (dataVal << 1) | (value & 1);
        if (dataPosition === bitsPerChar - 1) {
          dataPosition = 0;
          data.push(getCharFromInt(dataVal));
          dataVal = 0;
        } else {
          dataPosition++;
        }
        value >>= 1;
      }
    };

    const emit = (token) => {
      if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, token)) {
        if (token.charCodeAt(0) < 256) {
          writeBits(0, numBits);
          writeBits(token.charCodeAt(0), 8);
        } else {
          writeBits(1, numBits);
          writeBits(token.charCodeAt(0), 16);
        }
        enlargeIn--;
        if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
        delete dictionaryToCreate[token];
      } else {
        writeBits(dictionary[token], numBits);
      }
      enlargeIn--;
      if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
    };

    for (let ii = 0; ii < uncompressed.length; ii++) {
      c = uncompressed.charAt(ii);
      if (!Object.prototype.hasOwnProperty.call(dictionary, c)) {
        dictionary[c] = dictSize++;
        dictionaryToCreate[c] = true;
      }
      wc = w + c;
      if (Object.prototype.hasOwnProperty.call(dictionary, wc)) {
        w = wc;
      } else {
        emit(w);
        dictionary[wc] = dictSize++;
        w = String(c);
      }
    }

    if (w !== '') emit(w);

    writeBits(2, numBits);
    while (true) {
      dataVal <<= 1;
      if (dataPosition === bitsPerChar - 1) { data.push(getCharFromInt(dataVal)); break; }
      dataPosition++;
    }
    return data.join('');
  }

  // ---------------------------------------------------------------------------
  // Parameter substitution
  // ---------------------------------------------------------------------------

  /** UAI writes dates as MM-DD-YYYY. */
  function formatUaiDate(date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${mm}-${dd}-${date.getFullYear()}`;
  }

  function renderParamValue(param, raw) {
    if (param.type === 'relativeDate') {
      const d = new Date();
      d.setDate(d.getDate() + Number(raw));
      return formatUaiDate(d);
    }
    return String(raw);
  }

  function renderQuery(entry, values) {
    let out = entry.query;
    for (const param of entry.params || []) {
      const raw = values && param.name in values && values[param.name] !== ''
        ? values[param.name]
        : param.default;
      out = out.split(`{{param:${param.name}}}`).join(renderParamValue(param, raw));
    }
    const leftover = /\{\{param:(\w+)\}\}/.exec(out);
    if (leftover) throw new Error(`"${entry.id}" uses an undeclared parameter: ${leftover[1]}`);
    return out;
  }

  // ---------------------------------------------------------------------------
  // UAI adapter
  //
  // Everything coupling this script to the app lives here. Verified against the
  // live app: the filter bar is a Monaco editor with language id "filterel",
  // exposed on window.monaco, and Apply is a plain button.
  // ---------------------------------------------------------------------------

  const adapter = {
    onInventoryPage() {
      return INVENTORY_PATH.test(location.hash);
    },

    monaco() {
      return W.monaco;
    },

    /** The filter bar's model, or null when Advanced Mode is not open. */
    model() {
      const m = this.monaco();
      if (!m?.editor) return null;
      const models = m.editor.getModels();
      return models.find((x) => x.getLanguageId?.() === 'filterel') || models[0] || null;
    },

    button(label) {
      return [...document.querySelectorAll('button, a, span')].find(
        (e) => e.offsetParent && e.children.length === 0 && e.textContent.trim() === label,
      );
    },

    /** Advanced Mode hosts the Monaco editor; Basic Mode does not. */
    async ensureAdvancedMode() {
      if (this.model()) return true;
      const toggle = this.button('Advanced Mode');
      if (!toggle) return false;
      toggle.click();
      for (let i = 0; i < 20 && !this.model(); i++) await sleep(150);
      return !!this.model();
    },

    async setQuery(text) {
      if (!(await this.ensureAdvancedMode())) {
        throw new Error('Open Asset Inventory and switch to Advanced Mode first.');
      }
      this.model().setValue(text);
      await sleep(250);
    },

    async apply(text) {
      await this.setQuery(text);
      const btn = this.button('Apply');
      if (!btn) throw new Error('Could not find the Apply button.');
      if (btn.disabled) throw new Error('Apply is disabled — a query may still be running.');
      btn.click();
    },

    /**
     * Providers integrated in this tenant, read from the filter language's own
     * autocomplete. Returns null if it cannot be determined, which the UI reads
     * as "do not grey anything out".
     */
    async detectProviders() {
      const m = this.monaco();
      const model = this.model();
      if (!m || !model) return null;
      const editors = m.editor.getEditors?.() || [];
      const ed = editors[0];
      if (!ed) return null;

      const restore = model.getValue();
      try {
        const probe = 'asset.Providers IN [';
        model.setValue(probe);
        ed.setPosition({ lineNumber: 1, column: probe.length + 1 });
        ed.trigger('uaiql', 'editor.action.triggerSuggest', {});
        await sleep(900);
        const ctrl = ed.getContribution('editor.contrib.suggestController');
        const items = ctrl?.model?._completionModel?.items || [];
        ed.trigger('uaiql', 'hideSuggestWidget', {});
        const names = items
          .map((i) => i.completion?.label?.label ?? i.completion?.label ?? i.textLabel)
          .filter((s) => typeof s === 'string' && s !== 'EMPTY');
        return names.length ? names : null;
      } catch {
        return null;
      } finally {
        model.setValue(restore);
      }
    },

    /**
     * A URL that opens Asset Inventory with this query pre-loaded in the filter
     * bar. Verified against the live app: the recipient still has to press
     * Apply, and the URL is only read on a full page load — mutating the hash
     * in an already-open tab does nothing.
     */
    deepLink(queryText) {
      const encoded = compressToEncodedURIComponent(JSON.stringify(queryText));
      return `${location.origin}/#/workspace/assets/details/managed-assets`
        + `?hideBreadcrumbs=true&isAdvanced=true&advancedFilterValue=${encoded}`;
    },

    /**
     * Creates a native Saved Filter by driving the app's own Save popover.
     * Deliberately UI-driven rather than calling an undocumented API: it stays
     * inside whatever the signed-in user is actually allowed to do.
     */
    async saveAsFilter(queryText, name) {
      await this.setQuery(queryText);
      const save = this.button('Save');
      if (!save || save.disabled) throw new Error('Save is unavailable for this query.');
      save.click();
      await sleep(700);

      const input = [...document.querySelectorAll('input')].find(
        (i) => i.offsetParent && /saved filter/i.test(i.value || ''),
      ) || [...document.querySelectorAll('.cdk-overlay-container input')].find((i) => i.offsetParent);
      if (!input) throw new Error('Could not find the filter name field.');

      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, name);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(250);

      const confirm = [...document.querySelectorAll('.cdk-overlay-container button, .cdk-overlay-container a')]
        .find((b) => b.offsetParent && b.textContent.trim() === 'Save');
      if (!confirm) throw new Error('Could not find the Save confirmation button.');
      confirm.click();
      await sleep(900);
    },

    async cancelOverlay() {
      const cancel = [...document.querySelectorAll('.cdk-overlay-container button, .cdk-overlay-container a, .cdk-overlay-container span')]
        .find((b) => b.offsetParent && b.textContent.trim() === 'Cancel');
      cancel?.click();
      await sleep(200);
    },
  };

  // ---------------------------------------------------------------------------
  // Local (user-added) queries
  // ---------------------------------------------------------------------------

  const store = {
    read() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
    },
    write(list) { localStorage.setItem(STORE_KEY, JSON.stringify(list)); },
  };

  const allQueries = () => [
    ...CATALOG.queries.map((q) => ({ ...q, origin: 'catalog' })),
    ...store.read().map((q) => ({ ...q, origin: 'local' })),
  ];

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  const CSS = `
  .${NS}-fab{position:fixed;right:22px;bottom:22px;z-index:2147483000;height:42px;padding:0 18px;
    border:0;border-radius:21px;background:#0d8b4d;color:#fff;font:600 13px/42px system-ui,-apple-system,sans-serif;
    cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4)}
  .${NS}-fab:hover{background:#10a75d}
  .${NS}-panel{position:fixed;top:0;right:0;bottom:0;width:460px;max-width:100vw;z-index:2147483001;
    background:#1b1f24;color:#e6e9ec;box-shadow:-6px 0 28px rgba(0,0,0,.5);display:none;flex-direction:column;
    font:13px/1.55 system-ui,-apple-system,sans-serif;border-left:1px solid #2f353c}
  .${NS}-panel[data-open="1"]{display:flex}
  .${NS}-head{padding:14px 16px;border-bottom:1px solid #2f353c;display:flex;align-items:center;gap:10px}
  .${NS}-head h2{margin:0;font-size:14px;font-weight:700;flex:1;letter-spacing:.01em}
  .${NS}-x{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#8b949e;padding:0 4px}
  .${NS}-x:hover{color:#e6e9ec}
  .${NS}-search{margin:12px 16px 0;padding:8px 10px;border:1px solid #3a4149;border-radius:6px;
    background:#12161a;color:#e6e9ec;font:inherit}
  .${NS}-search::placeholder{color:#6e7781}
  .${NS}-list{flex:1;overflow:auto;padding:10px 16px 16px}
  .${NS}-cat{margin:16px 0 7px;font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#7d8892}
  .${NS}-item{border:1px solid #2f353c;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#20252b}
  .${NS}-item[data-off="1"]{opacity:.45}
  .${NS}-title{font-weight:600;cursor:pointer;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
  .${NS}-tag{font-weight:500;color:#8b949e;font-size:10.5px;border:1px solid #3a4149;border-radius:3px;padding:0 5px}
  .${NS}-tag.warn{color:#e3b341;border-color:#5c4a1a}
  .${NS}-desc{color:#a8b1ba;font-size:12px;margin-top:5px}
  .${NS}-more{display:none}
  .${NS}-item[data-open="1"] .${NS}-more{display:block}
  .${NS}-use{color:#8b949e;font-size:11.5px;margin-top:7px;font-style:italic}
  .${NS}-q{font:11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#12161a;
    border:1px solid #2f353c;border-radius:5px;padding:7px 8px;white-space:pre-wrap;word-break:break-word;
    margin-top:8px;color:#c9d1d9}
  .${NS}-params{margin-top:8px}
  .${NS}-params label{display:flex;align-items:center;gap:8px;font-size:11.5px;margin-bottom:5px;color:#a8b1ba}
  .${NS}-params input{width:110px;padding:3px 7px;border:1px solid #3a4149;border-radius:4px;
    background:#12161a;color:#e6e9ec;font:inherit}
  .${NS}-btns{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}
  .${NS}-btn{border:1px solid #3a4149;background:#2a3038;color:#e6e9ec;border-radius:5px;padding:5px 11px;
    font-size:11.5px;cursor:pointer;font-family:inherit}
  .${NS}-btn:hover{background:#343b44}
  .${NS}-btn.p{background:#0d8b4d;border-color:#0d8b4d;color:#fff}
  .${NS}-btn.p:hover{background:#10a75d}
  .${NS}-foot{border-top:1px solid #2f353c;padding:10px 16px;display:flex;gap:8px;align-items:center;
    font-size:11.5px;color:#7d8892}
  .${NS}-toast{position:fixed;bottom:78px;right:22px;z-index:2147483002;background:#0d1117;color:#e6e9ec;
    padding:10px 14px;border-radius:6px;font:12.5px system-ui,sans-serif;max-width:400px;
    border:1px solid #3a4149;box-shadow:0 4px 16px rgba(0,0,0,.5)}
  `;

  function toast(msg, ms = 3400) {
    document.querySelector(`.${NS}-toast`)?.remove();
    const el = document.createElement('div');
    el.className = `${NS}-toast`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let providers = null; // null = unknown, array = detected

  function buildPanel() {
    const panel = document.createElement('div');
    panel.className = `${NS}-panel`;
    panel.innerHTML = `
      <div class="${NS}-head">
        <h2>UAI Query Library</h2>
        <button class="${NS}-x" title="Close">&times;</button>
      </div>
      <input class="${NS}-search" type="search" placeholder="Search title, description, tag or provider…">
      <div class="${NS}-list"></div>
      <div class="${NS}-foot">
        <span class="${NS}-count"></span>
        <span style="flex:1"></span>
        <button class="${NS}-btn" data-act="install">Install as Saved Filters…</button>
      </div>`;

    const list = panel.querySelector(`.${NS}-list`);
    const search = panel.querySelector(`.${NS}-search`);
    const count = panel.querySelector(`.${NS}-count`);

    const missingFor = (q) => {
      if (!providers || !q.requiresProviders?.length) return null;
      const missing = q.requiresProviders.filter((p) => !providers.includes(p));
      return missing.length ? missing : null;
    };

    function render() {
      const t = search.value.trim().toLowerCase();
      const all = allQueries();
      const matches = all.filter((q) => !t || [
        q.title, q.description, q.category, q.bestUsedFor || '',
        ...(q.tags || []), ...(q.requiresProviders || []),
      ].join(' ').toLowerCase().includes(t));

      count.textContent = t ? `${matches.length} of ${all.length} queries` : `${all.length} queries`;
      list.innerHTML = '';

      const groups = new Map();
      for (const q of matches) {
        if (!groups.has(q.category)) groups.set(q.category, []);
        groups.get(q.category).push(q);
      }
      for (const [category, entries] of groups) {
        const h = document.createElement('div');
        h.className = `${NS}-cat`;
        h.textContent = category;
        list.appendChild(h);
        entries.forEach((q) => list.appendChild(renderItem(q)));
      }
      if (!matches.length) {
        list.innerHTML = `<div class="${NS}-desc" style="margin-top:14px">No queries match that search.</div>`;
      }
    }

    function renderItem(q) {
      const missing = missingFor(q);
      const item = document.createElement('div');
      item.className = `${NS}-item`;
      if (missing) item.dataset.off = '1';

      const params = (q.params || []).map((p) => `
        <label><span style="flex:1">${esc(p.label)}</span>
          <input data-param="${esc(p.name)}" type="${p.type === 'string' ? 'text' : 'number'}"
                 value="${esc(String(p.default))}"
                 ${p.min !== undefined ? `min="${p.min}"` : ''} ${p.max !== undefined ? `max="${p.max}"` : ''}>
        </label>`).join('');

      item.innerHTML = `
        <div class="${NS}-title">
          <span style="flex:1">${esc(q.title)}</span>
          ${q.origin === 'local' ? `<span class="${NS}-tag">local</span>` : ''}
          ${q.verified === 'counted' ? `<span class="${NS}-tag">verified</span>` : ''}
          ${missing ? `<span class="${NS}-tag warn">needs ${esc(missing.join(', '))}</span>` : ''}
        </div>
        <div class="${NS}-desc">${esc(q.description)}</div>
        <div class="${NS}-more">
          ${q.bestUsedFor ? `<div class="${NS}-use">${esc(q.bestUsedFor)}</div>` : ''}
          ${params ? `<div class="${NS}-params">${params}</div>` : ''}
          <div class="${NS}-q"></div>
          <div class="${NS}-btns">
            <button class="${NS}-btn p" data-act="apply">Apply &amp; run</button>
            <button class="${NS}-btn" data-act="load">Load only</button>
            <button class="${NS}-btn" data-act="copy">Copy query</button>
            <button class="${NS}-btn" data-act="link">Copy link</button>
          </div>
        </div>`;

      const qBox = item.querySelector(`.${NS}-q`);
      const readParams = () => Object.fromEntries(
        [...item.querySelectorAll('[data-param]')].map((i) => [i.dataset.param, i.value]));
      const refresh = () => {
        try { qBox.textContent = renderQuery(q, readParams()); }
        catch (e) { qBox.textContent = `⚠ ${e.message}`; }
      };
      refresh();

      item.querySelector(`.${NS}-title`).addEventListener('click', () => {
        item.dataset.open = item.dataset.open === '1' ? '0' : '1';
      });
      item.querySelectorAll('[data-param]').forEach((i) => i.addEventListener('input', refresh));

      item.querySelector(`.${NS}-btns`).addEventListener('click', async (ev) => {
        const act = ev.target.dataset?.act;
        if (!act) return;
        let text;
        try { text = renderQuery(q, readParams()); }
        catch (e) { toast(e.message, 6000); return; }

        try {
          if (act === 'copy') {
            await navigator.clipboard.writeText(text);
            toast('Query copied.');
          } else if (act === 'link') {
            await navigator.clipboard.writeText(adapter.deepLink(text));
            toast('Link copied. It opens Asset Inventory with this query loaded — the recipient still clicks Apply to run it.', 5000);
          } else if (act === 'load') {
            await adapter.setQuery(text);
            toast(`Loaded: ${q.title}`);
          } else {
            await adapter.apply(text);
            toast(`Running: ${q.title}`);
          }
        } catch (e) {
          toast(e.message, 6000);
        }
      });

      return item;
    }

    search.addEventListener('input', render);
    panel.querySelector(`.${NS}-x`).addEventListener('click', () => { panel.dataset.open = '0'; });
    panel.querySelector('[data-act="install"]').addEventListener('click', () => installFlow());

    panel.render = render;
    render();
    return panel;
  }

  /**
   * Writes selected queries into the tenant as native Saved Filters. This is the
   * only thing the script does that changes the tenant, so it asks first, names
   * everything with a visible prefix, and skips anything parameterised (a saved
   * filter would freeze today's date into the query and quietly go stale).
   */
  async function installFlow() {
    const eligible = allQueries().filter((q) => !q.params?.length);
    const skipped = allQueries().length - eligible.length;

    const ok = W.confirm(
      `Create ${eligible.length} Saved Filters in the tenant you are signed in to?\n\n`
      + `Each is named with the "${SAVED_FILTER_PREFIX}" prefix so they are easy to find and remove.\n\n`
      + (skipped ? `${skipped} parameterised queries are skipped — saving them would freeze today's date into the filter.\n\n` : '')
      + `This writes to a shared tenant. Do not run it against a customer's production tenant without their agreement.`,
    );
    if (!ok) return;

    let done = 0;
    const failures = [];
    for (const q of eligible) {
      try {
        await adapter.saveAsFilter(q.query, `${SAVED_FILTER_PREFIX} ${q.title}`);
        done++;
        toast(`Saved ${done}/${eligible.length}: ${q.title}`, 1500);
      } catch (e) {
        failures.push(`${q.title}: ${e.message}`);
        await adapter.cancelOverlay();
      }
      await sleep(400);
    }
    toast(
      failures.length
        ? `Created ${done} of ${eligible.length}. ${failures.length} failed — see console.`
        : `Created ${done} Saved Filters.`,
      7000,
    );
    if (failures.length) console.warn('[uaiql] Saved Filter failures:\n' + failures.join('\n'));
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  let panel = null;

  function mount() {
    if (!adapter.onInventoryPage()) {
      document.querySelector(`.${NS}-fab`)?.remove();
      if (panel) { panel.remove(); panel = null; }
      return;
    }
    if (document.querySelector(`.${NS}-fab`)) return;

    const style = document.createElement('style');
    style.id = `${NS}-style`;
    style.textContent = CSS;
    if (!document.getElementById(`${NS}-style`)) document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.className = `${NS}-fab`;
    fab.textContent = 'Query Library';
    document.body.appendChild(fab);

    panel = buildPanel();
    document.body.appendChild(panel);

    fab.addEventListener('click', async () => {
      const opening = panel.dataset.open !== '1';
      panel.dataset.open = opening ? '1' : '0';
      if (opening && providers === null) {
        providers = await adapter.detectProviders();
        if (providers) panel.render();
      }
    });
  }

  // Single-page app: the button has to survive client-side navigation.
  W.addEventListener('hashchange', () => setTimeout(mount, 400));
  const observer = new MutationObserver(() => mount());
  if (document.body) {
    mount();
    observer.observe(document.body, { childList: true });
  }
})();

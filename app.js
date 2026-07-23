'use strict';

const API_BASE = 'https://api.tcgdex.net/v2';
const STORAGE_KEY = 'binderdex-data-v2';
const LEGACY_STORAGE_KEY = 'binderdex-data-v1';
const PAGE_SIZE = 9;

const LANGS = {
  de: { label: 'Deutsch', short: 'DE' },
  en: { label: 'Englisch', short: 'EN' },
  ja: { label: 'Japanisch', short: 'JP' },
};

const ADD_LANGS = ['de', 'ja'];

// Häufig verwendete internationale/Cardmarket-Setkürzel → TCGdex-Set-ID.
// Unbekannte Kürzel werden zusätzlich direkt als TCGdex-Set-ID versucht.
const SET_ALIASES = {
  BS: 'base1', JU: 'base2', FO: 'base3', B2: 'base4', TR: 'base5',
  SWSH: 'swshp', SSH: 'swsh1', RCL: 'swsh2', DAA: 'swsh3', CPA: 'swsh3.5',
  VIV: 'swsh4', SHF: 'swsh4.5', BST: 'swsh5', CRE: 'swsh6', EVS: 'swsh7',
  CEL: 'cel25', FST: 'swsh8', BRS: 'swsh9', ASR: 'swsh10', PGO: 'pgo',
  LOR: 'swsh11', SIT: 'swsh12', CRZ: 'swsh12.5',
  SVP: 'svp', SVI: 'sv01', PAL: 'sv02', OBF: 'sv03', MEW: 'sv03.5',
  PAR: 'sv04', PAF: 'sv04.5', TEF: 'sv05', TWM: 'sv06', SFA: 'sv06.5',
  SCR: 'sv07', SSP: 'sv08', PRE: 'sv08.5', JTG: 'sv09', DRI: 'sv10',
};

const main = document.getElementById('mainContent');
const modalRoot = document.getElementById('modalRoot');
const toastRoot = document.getElementById('toastRoot');
const screenTitle = document.getElementById('screenTitle');
const backButton = document.getElementById('backButton');
const syncButton = document.getElementById('syncButton');
const bottomNav = document.getElementById('bottomNav');

const state = {
  route: 'binder',
  selectedId: null,
  searchLang: 'de',
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  searchError: '',
  wishlistFilter: '',
  attachContext: null,
  binderPage: 0,
  binderArrange: false,
  selectedMoveId: null,
  data: loadData(),
};

let searchTimer = null;
let searchRequestId = 0;
let suppressClickUntil = 0;
let swipeStart = null;
const cardCache = new Map();
const dragState = {
  timer: null,
  pointerId: null,
  itemId: null,
  startX: 0,
  startY: 0,
  dragging: false,
  ghost: null,
  targetSlot: null,
  sourceElement: null,
};

function defaultData() {
  return {
    version: 2,
    collection: [],
    settings: {
      defaultAddLanguage: 'de',
    },
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return defaultData();
    return migrateData(JSON.parse(raw));
  } catch (error) {
    console.warn('BinderDex-Daten konnten nicht geladen werden.', error);
    return defaultData();
  }
}

function migrateData(input) {
  const base = defaultData();
  const collection = Array.isArray(input?.collection) ? input.collection : [];
  const usedSlots = new Set();
  let nextSlot = 0;

  const migrated = collection.map((rawItem) => {
    const variants = { de: null, en: null, ja: null, ...(rawItem.variants || {}) };
    const firstLanguage = rawItem.sourceLanguage
      || ['de', 'ja', 'en'].find((code) => variants[code])
      || 'de';

    let binderSlot = Number.isInteger(rawItem.binderSlot) ? rawItem.binderSlot : null;
    if (rawItem.list === 'binder') {
      if (binderSlot === null || binderSlot < 0 || usedSlots.has(binderSlot)) {
        while (usedSlots.has(nextSlot)) nextSlot += 1;
        binderSlot = nextSlot;
      }
      usedSlots.add(binderSlot);
      nextSlot = Math.max(nextSlot, binderSlot + 1);
    } else {
      binderSlot = null;
    }

    Object.values(variants).filter(Boolean).forEach((variant) => {
      if (!variant.cardmarketLink) {
        variant.cardmarketLink = buildCardmarketSearchLink(variant, variant.language || firstLanguage);
        variant.cardmarketLinkAuto = true;
      }
    });

    return {
      id: rawItem.id || uid(),
      list: rawItem.list === 'wishlist' ? 'wishlist' : 'binder',
      title: rawItem.title || variants[firstLanguage]?.name || 'Karte',
      sourceLanguage: firstLanguage,
      variants,
      binderSlot,
      quantity: Math.max(1, Number(rawItem.quantity) || 1),
      condition: rawItem.condition || 'NM',
      finish: rawItem.finish || 'normal',
      purchasePrice: rawItem.purchasePrice ?? '',
      notes: rawItem.notes || '',
      createdAt: rawItem.createdAt || new Date().toISOString(),
    };
  });

  const settings = {
    ...base.settings,
    ...(input?.settings || {}),
  };
  if (!ADD_LANGS.includes(settings.defaultAddLanguage)) settings.defaultAddLanguage = 'de';

  return { version: 2, collection: migrated, settings };
}

function saveData() {
  state.data.version = 2;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(number);
}

function imageUrl(base, quality = 'low') {
  if (!base) return '';
  if (/\.(webp|png|jpe?g)$/i.test(base)) return base;
  return `${base}/${quality}.webp`;
}

function formatDate(value) {
  if (!value) return 'unbekannt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unbekannt';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function normalizeText(value = '') {
  return String(value)
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeNumber(value = '') {
  const first = String(value).split('/')[0];
  return first.replace(/^0+(?=\d)/, '').toUpperCase();
}

function getItem(id) {
  return state.data.collection.find((item) => item.id === id);
}

function sourceVariant(item) {
  return item?.variants?.[item.sourceLanguage]
    || item?.variants?.de
    || item?.variants?.ja
    || item?.variants?.en
    || null;
}

function priceKey(item, key) {
  return item.finish === 'holo' ? `${key}-holo` : key;
}

function variantPrice(item, variant, key = 'trend') {
  const value = variant?.pricing?.cardmarket?.[priceKey(item, key)];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function itemValue(item) {
  const price = variantPrice(item, sourceVariant(item), 'trend');
  return price === null ? 0 : price * Math.max(1, Number(item.quantity) || 1);
}

function binderItems() {
  return state.data.collection
    .filter((item) => item.list === 'binder')
    .sort((a, b) => (a.binderSlot ?? Number.MAX_SAFE_INTEGER) - (b.binderSlot ?? Number.MAX_SAFE_INTEGER));
}

function wishlistItems() {
  return state.data.collection.filter((item) => item.list === 'wishlist');
}

function firstFreeBinderSlot() {
  const used = new Set(binderItems().map((item) => item.binderSlot));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

function binderPageCount() {
  const items = binderItems();
  if (!items.length) return 1;
  const maxSlot = Math.max(...items.map((item) => item.binderSlot || 0));
  const occupiedOnLastPage = items.filter((item) => Math.floor((item.binderSlot || 0) / PAGE_SIZE) === Math.floor(maxSlot / PAGE_SIZE)).length;
  return Math.floor(maxSlot / PAGE_SIZE) + 1 + (occupiedOnLastPage >= PAGE_SIZE ? 1 : 0);
}

function buildCardmarketSearchLink(card, language = 'de') {
  const direct = card?.cardmarketLink || card?.pricing?.cardmarket?.url;
  if (direct) return direct;
  const languageLabel = LANGS[language]?.label || '';
  const search = [card?.name, card?.localId, card?.set?.name || card?.setName, card?.set?.id || card?.setId, languageLabel]
    .filter(Boolean)
    .join(' ');
  return `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(search)}`;
}

function normalizeCard(card, language, previous = null) {
  const automaticLink = buildCardmarketSearchLink(card, language);
  return {
    language,
    cardId: card.id,
    name: card.name,
    setId: card.set?.id || card.setId || '',
    setName: card.set?.name || card.setName || 'Unbekanntes Set',
    localId: String(card.localId || ''),
    rarity: card.rarity || '',
    image: card.image || '',
    pricing: card.pricing || null,
    priceUpdated: card.pricing?.cardmarket?.updated || null,
    cardmarketLink: previous?.cardmarketLink || automaticLink,
    cardmarketLinkAuto: previous ? Boolean(previous.cardmarketLinkAuto) : true,
    fetchedAt: new Date().toISOString(),
  };
}

function titleForRoute() {
  if (state.route === 'detail') return 'Kartendetails';
  if (state.route === 'wishlist') return 'Wunschliste';
  if (state.route === 'search') return state.attachContext ? 'Vergleichskarte wählen' : 'Karte hinzufügen';
  if (state.route === 'settings') return 'Mehr';
  return 'Mein Binder';
}

function navigate(route, id = null) {
  state.route = route;
  state.selectedId = id;
  if (route !== 'binder') {
    state.binderArrange = false;
    state.selectedMoveId = null;
  }
  if (route === 'search' && !state.attachContext) {
    state.searchLang = state.data.settings.defaultAddLanguage || 'de';
  }
  if (route !== 'detail') window.scrollTo({ top: 0, behavior: 'instant' });
  render();
}

function render() {
  screenTitle.textContent = titleForRoute();
  const isDetail = state.route === 'detail';
  backButton.classList.toggle('hidden', !isDetail);
  bottomNav.classList.toggle('hidden', isDetail);
  syncButton.classList.toggle('hidden', state.route === 'settings' || state.route === 'search');

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === state.route);
  });

  if (state.route === 'binder') renderBinder();
  else if (state.route === 'wishlist') renderWishlist();
  else if (state.route === 'search') renderSearch();
  else if (state.route === 'settings') renderSettings();
  else if (state.route === 'detail') renderDetail();
}

function renderBinder() {
  const items = binderItems();
  if (!items.length) {
    main.innerHTML = emptyState(
      'Dein Binder ist noch leer',
      'Füge eine deutsche oder japanische Karte hinzu. Der englische Vergleichspreis wird nach Möglichkeit automatisch ergänzt.',
      'Erste Karte suchen',
      'search'
    );
    return;
  }

  const pages = binderPageCount();
  state.binderPage = Math.min(Math.max(0, state.binderPage), pages - 1);
  const pageStart = state.binderPage * PAGE_SIZE;
  const bySlot = new Map(items.map((item) => [item.binderSlot, item]));
  const totalValue = items.reduce((sum, item) => sum + itemValue(item), 0);
  const quantity = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);

  main.innerHTML = `
    <section class="binder-summary">
      <div><span>Geschätzter Wert</span><strong>${money(totalValue)}</strong></div>
      <div><span>Karten</span><strong>${quantity}</strong></div>
      <button class="binder-add-button" data-go-search aria-label="Karte hinzufügen">＋</button>
    </section>

    <section class="binder-controls" aria-label="Bindersteuerung">
      <button class="page-button" data-binder-prev ${state.binderPage <= 0 ? 'disabled' : ''} aria-label="Vorherige Seite">‹</button>
      <div class="page-title">
        <strong>Seite ${state.binderPage + 1}</strong>
        <span>${state.binderPage * 2 + 1}–${state.binderPage * 2 + 2} im geöffneten Binder</span>
      </div>
      <button class="page-button" data-binder-next ${state.binderPage >= pages - 1 ? 'disabled' : ''} aria-label="Nächste Seite">›</button>
      <button class="arrange-button ${state.binderArrange ? 'active' : ''}" data-toggle-arrange>
        ${state.binderArrange ? 'Fertig' : 'Verschieben'}
      </button>
    </section>

    ${state.binderArrange ? `
      <div class="arrange-hint ${state.selectedMoveId ? 'has-selection' : ''}">
        ${state.selectedMoveId
          ? 'Karte ausgewählt. Ziehe sie auf ein Fach oder wechsle die Seite und tippe dort auf ein Ziel.'
          : 'Karte kurz halten und ziehen – oder erst Karte, dann Zielfach antippen.'}
      </div>
    ` : ''}

    <section class="binder-book" aria-label="3 mal 3 Kartenbinder">
      <div class="binder-cover-edge" aria-hidden="true"></div>
      <div class="binder-spine" aria-hidden="true">
        ${Array.from({ length: 5 }, () => '<span class="binder-ring"></span>').join('')}
      </div>
      <div class="binder-page-frame" data-binder-page>
        <div class="binder-sheet">
          ${Array.from({ length: PAGE_SIZE }, (_, index) => binderPocketHtml(pageStart + index, bySlot.get(pageStart + index))).join('')}
        </div>
      </div>
    </section>

    <div class="page-dots" aria-label="Binderseiten">
      ${Array.from({ length: pages }, (_, index) => `<button data-binder-page-index="${index}" class="${index === state.binderPage ? 'active' : ''}" aria-label="Seite ${index + 1}"></button>`).join('')}
    </div>

    <p class="binder-footnote">Nach links oder rechts wischen, um zu blättern. In „Verschieben“ lassen sich Karten per Finger neu anordnen.</p>
  `;
}

function binderPocketHtml(slot, item) {
  const selected = item && item.id === state.selectedMoveId;
  const variant = item ? sourceVariant(item) : null;
  const sourceCode = item?.sourceLanguage || variant?.language || 'de';
  return `
    <div class="binder-pocket ${item ? 'filled' : 'empty'} ${selected ? 'selected' : ''}" data-binder-slot="${slot}" data-slot-item="${item?.id || ''}">
      ${item ? `
        <div class="binder-card" data-binder-card data-item-id="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)} öffnen">
          ${variant?.image ? `<img src="${escapeHtml(imageUrl(variant.image, 'low'))}" alt="${escapeHtml(item.title)}" loading="lazy" draggable="false" />` : '<div class="pocket-placeholder">Kein Bild</div>'}
          <span class="pocket-lang">${escapeHtml(LANGS[sourceCode]?.short || sourceCode.toUpperCase())}</span>
          ${item.quantity > 1 ? `<span class="pocket-qty">×${item.quantity}</span>` : ''}
          ${selected ? '<span class="selected-check">✓</span>' : ''}
        </div>
      ` : '<span class="empty-pocket-mark">＋</span>'}
      <span class="pocket-glare" aria-hidden="true"></span>
    </div>
  `;
}

function renderWishlist() {
  const allItems = wishlistItems();
  if (!allItems.length) {
    main.innerHTML = emptyState(
      'Noch keine Wunschkarten',
      'Speichere deutsche oder japanische Karten, nach denen du auf Flohmärkten Ausschau halten möchtest.',
      'Karte suchen',
      'search'
    );
    return;
  }

  const value = allItems.reduce((sum, item) => sum + itemValue(item), 0);
  main.innerHTML = `
    <section class="wishlist-hero">
      <div><span>Wunschlistenwert</span><strong>${money(value)}</strong></div>
      <button class="primary-button compact-button" data-go-search>＋ Hinzufügen</button>
    </section>

    <div class="toolbar">
      <label class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="wishlistFilter" value="${escapeHtml(state.wishlistFilter)}" placeholder="Name, Set, Kürzel oder Nummer" autocomplete="off" />
      </label>
      <button class="filter-button" data-sync-list title="Preise aktualisieren" aria-label="Preise aktualisieren">
        <svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-15-3M4 4v5h5M4 13a8 8 0 0 0 15 3M20 20v-5h-5"/></svg>
      </button>
    </div>
    <section id="wishlistResults">${wishlistResultsHtml()}</section>
  `;
}

function wishlistResultsHtml() {
  const filter = normalizeText(state.wishlistFilter);
  const items = wishlistItems().filter((item) => {
    if (!filter) return true;
    const variant = sourceVariant(item);
    return normalizeText([item.title, variant?.name, variant?.setName, variant?.setId, variant?.localId].join(' ')).includes(filter);
  });

  if (!items.length) return '<section class="empty-state small"><h2>Keine Treffer</h2><p>Versuche einen anderen Namen, ein Setkürzel oder eine Kartennummer.</p></section>';
  return `<div class="wishlist-grid">${items.map(collectionCardHtml).join('')}</div>`;
}

function collectionCardHtml(item) {
  const variant = sourceVariant(item);
  const trend = variantPrice(item, variant, 'trend');
  return `
    <button class="collection-card" data-open-card="${escapeHtml(item.id)}">
      <div class="card-art">
        ${variant?.image ? `<img src="${escapeHtml(imageUrl(variant.image, 'low'))}" alt="${escapeHtml(variant.name)}" loading="lazy" />` : '<div class="placeholder-card">Kein Bild</div>'}
        <span class="card-badge">${escapeHtml(LANGS[item.sourceLanguage]?.short || '–')} · ${escapeHtml(item.finish === 'holo' ? 'HOLO' : 'NORMAL')}</span>
      </div>
      <div class="card-info">
        <h3>${escapeHtml(item.title || variant?.name || 'Unbenannte Karte')}</h3>
        <p>${escapeHtml(variant?.setName || 'Set unbekannt')} · ${escapeHtml(variant?.setId || '–')} · #${escapeHtml(variant?.localId || '–')}</p>
        <div class="card-price-row"><strong>${money(trend)}</strong><span>Trend</span></div>
      </div>
    </button>
  `;
}

function emptyState(title, text, buttonText, route) {
  return `
    <section class="empty-state">
      <div class="empty-icon"><span></span></div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      <button class="primary-button" data-empty-route="${route}">${escapeHtml(buttonText)}</button>
    </section>
  `;
}

function renderSearch() {
  const attach = state.attachContext;
  const availableLanguages = attach ? [attach.lang] : ADD_LANGS;
  main.innerHTML = `
    <section class="search-intro">
      <h2>${attach ? 'Englische Vergleichskarte finden' : 'Welche Karte möchtest du hinzufügen?'}</h2>
      <p>${attach
        ? 'Suche die passende englische Ausgabe. Sie verändert deine eigentliche Karte nicht, sondern ergänzt nur Preis und Cardmarket-Link.'
        : 'Du kannst Name, Kartennummer und Setkürzel gemeinsam eingeben – zum Beispiel „Pikachu 58 base1“ oder „Glurak 199 OBF“.'}</p>
    </section>

    <div class="segmented ${availableLanguages.length === 1 ? 'single' : ''}" aria-label="Kartensprache">
      ${availableLanguages.map((code) => `<button data-search-lang="${code}" class="${state.searchLang === code ? 'active' : ''}">${LANGS[code].label}${attach ? ' (Vergleich)' : ''}</button>`).join('')}
    </div>

    <div class="toolbar search-toolbar">
      <label class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="cardSearchInput" value="${escapeHtml(state.searchQuery)}" placeholder="Name · Nummer · Setkürzel" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" />
      </label>
      ${attach ? '<button class="filter-button" data-cancel-attach aria-label="Abbrechen">×</button>' : '<button class="filter-button" data-clear-search aria-label="Suche leeren">×</button>'}
    </div>

    <div class="search-examples">
      <button data-search-example="Pikachu 58 base1">Pikachu 58 base1</button>
      <button data-search-example="Glurak 199 OBF">Glurak 199 OBF</button>
      <button data-search-example="Mew 232 PAF">Mew 232 PAF</button>
    </div>

    <div class="api-note">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
      <span>Setkürzel werden bestmöglich zugeordnet. Der Cardmarket-Link wird automatisch als präzise Suche angelegt und kann später jederzeit manuell ersetzt werden.</span>
    </div>

    <section id="searchResults">${searchResultsHtml()}</section>
  `;

  requestAnimationFrame(() => {
    const input = document.getElementById('cardSearchInput');
    if (!input) return;
    input.focus({ preventScroll: true });
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });
}

function updateSearchResults() {
  const container = document.getElementById('searchResults');
  if (container) container.innerHTML = searchResultsHtml();
}

function searchResultsHtml() {
  if (state.searchLoading) return '<div class="loading"><div><div class="spinner"></div>Suche läuft …</div></div>';
  if (state.searchError) return `<section class="empty-state small"><h2>Suche nicht erreichbar</h2><p>${escapeHtml(state.searchError)}</p></section>`;
  if (!state.searchQuery.trim()) return '<section class="search-start"><div class="search-symbol">⌕</div><h2>Name, Nummer oder Set eingeben</h2><p>Die Treffer zeigen anschließend Setname, Set-ID und Kartennummer.</p></section>';
  if (!state.searchResults.length) return '<section class="empty-state small"><h2>Keine Karte gefunden</h2><p>Prüfe Kartennummer oder Setkürzel. Du kannst auch zunächst nur nach dem Namen suchen.</p></section>';

  return `<div class="results-list">${state.searchResults.map((card) => `
    <button class="result-card" data-search-result="${escapeHtml(card.id)}">
      ${card.image ? `<img src="${escapeHtml(imageUrl(card.image, 'low'))}" alt="${escapeHtml(card.name)}" loading="lazy" />` : '<div class="result-placeholder"></div>'}
      <div>
        <h3>${escapeHtml(card.name)}</h3>
        <p>${escapeHtml(card.set?.name || 'Set unbekannt')}</p>
        <strong>${escapeHtml(card.set?.id || '–')} · #${escapeHtml(card.localId || '–')} · ${escapeHtml(LANGS[state.searchLang].short)}</strong>
      </div>
      <svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  `).join('')}</div>`;
}

function parseCardSearch(query) {
  const rawTokens = String(query)
    .replace(/[#,;]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  let setToken = '';
  let localId = '';
  const remaining = [];

  for (const token of rawTokens) {
    const upper = token.toUpperCase();
    const alias = token === upper ? SET_ALIASES[upper] : null;
    const looksLikeSet = Boolean(alias)
      || (/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9.-]{3,12}$/.test(token) && !/^\d/.test(token))
      || (/^[A-Z]{2,6}$/.test(token) && token === upper && rawTokens.length > 1);
    const looksLikeNumber = /^\d{1,4}[A-Za-z]{0,3}(?:\/\d{1,4})?$/.test(token)
      || /^(?:TG|GG|RC|XY|BW|SM|SWSH|SVP|DP|HGSS|PR)\d{1,4}[A-Z]?$/.test(upper);

    if (!localId && looksLikeNumber) {
      localId = token.split('/')[0];
    } else if (!setToken && looksLikeSet) {
      setToken = token;
    } else {
      remaining.push(token);
    }
  }

  const setId = setToken ? (SET_ALIASES[setToken.toUpperCase()] || setToken) : '';
  return {
    raw: query.trim(),
    name: remaining.join(' ').trim(),
    localId,
    setToken,
    setId,
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchCard(language, cardId) {
  const key = `${language}:${cardId}`;
  if (cardCache.has(key)) return cardCache.get(key);
  const promise = fetchJson(`${API_BASE}/${language}/cards/${encodeURIComponent(cardId)}`)
    .catch((error) => {
      cardCache.delete(key);
      throw error;
    });
  cardCache.set(key, promise);
  return promise;
}

async function hydrateCards(cards, language, limit = 30) {
  const unique = [...new Map((cards || []).map((card) => [card.id, card])).values()].slice(0, limit);
  const results = [];
  for (let index = 0; index < unique.length; index += 8) {
    const batch = unique.slice(index, index + 8);
    const settled = await Promise.allSettled(batch.map((card) => card.set ? Promise.resolve(card) : fetchCard(language, card.id)));
    settled.forEach((entry) => {
      if (entry.status === 'fulfilled') results.push(entry.value);
    });
  }
  return results;
}

function cardSearchScore(card, parsed) {
  const queryName = normalizeText(parsed.name);
  const cardName = normalizeText(card.name);
  const setName = normalizeText(card.set?.name);
  const setId = normalizeText(card.set?.id);
  const requestedSet = normalizeText(parsed.setId || parsed.setToken);
  const local = normalizeNumber(card.localId);
  const requestedLocal = normalizeNumber(parsed.localId);
  let score = 0;

  if (queryName) {
    if (cardName === queryName) score += 70;
    else if (cardName.startsWith(queryName)) score += 55;
    else if (cardName.includes(queryName)) score += 40;
    else return -1000;
  }
  if (requestedLocal) {
    if (local === requestedLocal) score += 60;
    else return -1000;
  }
  if (requestedSet) {
    if (setId === requestedSet) score += 80;
    else if (setId.includes(requestedSet) || setName.includes(requestedSet)) score += 45;
    else if (normalizeText(parsed.setToken) && setName.includes(normalizeText(parsed.setToken))) score += 30;
    else score -= 25;
  }
  if (card.image) score += 2;
  return score;
}

async function searchCards(parsed, language) {
  const directCandidates = [];

  if (parsed.setId && parsed.localId) {
    try {
      const direct = await fetchJson(`${API_BASE}/${language}/sets/${encodeURIComponent(parsed.setId)}/${encodeURIComponent(parsed.localId)}`);
      if (direct?.id) directCandidates.push(direct);
    } catch {
      // Fallback-Suche folgt darunter.
    }
  }

  if (directCandidates.length) {
    const score = cardSearchScore(directCandidates[0], parsed);
    if (score > -500) return directCandidates;
  }

  let briefs = [];
  if (parsed.setId && !parsed.name && !parsed.localId) {
    try {
      const set = await fetchJson(`${API_BASE}/${language}/sets/${encodeURIComponent(parsed.setId)}`);
      briefs = Array.isArray(set?.cards) ? set.cards : [];
    } catch {
      briefs = [];
    }
  }

  if (!briefs.length) {
    const params = new URLSearchParams();
    if (parsed.name) params.set('name', parsed.name);
    if (parsed.localId) params.set('localId', parsed.localId);
    params.set('pagination:page', '1');
    params.set('pagination:itemsPerPage', parsed.name ? '45' : '70');
    const url = `${API_BASE}/${language}/cards?${params.toString()}`;
    briefs = await fetchJson(url);
  }

  let hydrated = await hydrateCards(briefs, language, 36);

  // Falls Name + Nummer zu eng gefiltert war, einmal breiter nur über den Namen suchen.
  if (!hydrated.length && parsed.name && parsed.localId) {
    const params = new URLSearchParams({ name: parsed.name, 'pagination:page': '1', 'pagination:itemsPerPage': '45' });
    const fallback = await fetchJson(`${API_BASE}/${language}/cards?${params.toString()}`);
    hydrated = await hydrateCards(fallback, language, 36);
  }

  return hydrated
    .map((card) => ({ card, score: cardSearchScore(card, parsed) }))
    .filter((entry) => entry.score > -500)
    .sort((a, b) => b.score - a.score || String(a.card.name).localeCompare(String(b.card.name), 'de'))
    .slice(0, 30)
    .map((entry) => entry.card);
}

async function performSearch(query) {
  const requestId = ++searchRequestId;
  const clean = query.trim();
  state.searchQuery = query;
  state.searchError = '';

  if (clean.length < 2) {
    state.searchResults = [];
    state.searchLoading = false;
    updateSearchResults();
    return;
  }

  state.searchLoading = true;
  updateSearchResults();
  try {
    const parsed = parseCardSearch(clean);
    const results = await searchCards(parsed, state.searchLang);
    if (requestId !== searchRequestId) return;
    state.searchResults = results;
  } catch (error) {
    if (requestId !== searchRequestId) return;
    console.error(error);
    state.searchResults = [];
    state.searchError = 'Prüfe deine Internetverbindung und versuche es erneut.';
  } finally {
    if (requestId !== searchRequestId) return;
    state.searchLoading = false;
    updateSearchResults();
  }
}

async function openSearchPreview(cardId) {
  modalRoot.innerHTML = '<div class="modal"><div class="modal-handle"></div><div class="loading"><div><div class="spinner"></div>Kartendetails werden geladen …</div></div></div>';
  try {
    const card = await fetchCard(state.searchLang, cardId);
    renderPreviewModal(card);
  } catch (error) {
    console.error(error);
    closeModal();
    toast('Kartendetails konnten nicht geladen werden.');
  }
}

function renderPreviewModal(card) {
  const market = card.pricing?.cardmarket;
  const trend = market?.trend ?? market?.['trend-holo'] ?? null;
  const attach = state.attachContext;
  modalRoot.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Karte auswählen">
      <div class="modal-handle"></div>
      <div class="modal-head">
        <h2>${attach ? 'Vergleichskarte verknüpfen' : 'Karte hinzufügen'}</h2>
        <button class="icon-button" data-close-modal aria-label="Schließen">×</button>
      </div>
      <div class="preview-layout">
        ${card.image ? `<img src="${escapeHtml(imageUrl(card.image, 'high'))}" alt="${escapeHtml(card.name)}" />` : '<div></div>'}
        <div>
          <span class="preview-language">${escapeHtml(LANGS[state.searchLang].label)}</span>
          <h3>${escapeHtml(card.name)}</h3>
          <p>${escapeHtml(card.set?.name || 'Set unbekannt')}</p>
          <p><strong>${escapeHtml(card.set?.id || '–')}</strong> · Kartennummer ${escapeHtml(card.localId || '–')}</p>
          <strong class="preview-price">${money(trend)} Trend</strong>
        </div>
      </div>
      ${!attach && state.searchLang !== 'en' ? '<p class="modal-note">Beim Hinzufügen sucht BinderDex automatisch nach der passenden englischen Ausgabe für den Preisvergleich.</p>' : ''}
      <div class="modal-actions">
        ${attach ? `
          <button class="primary-button full-button" data-attach-card="${escapeHtml(card.id)}">Als englischen Vergleich speichern</button>
        ` : `
          <button class="primary-button full-button" data-add-card="binder" data-card-id="${escapeHtml(card.id)}">In meinen Binder</button>
          <button class="secondary-button full-button" data-add-card="wishlist" data-card-id="${escapeHtml(card.id)}">Auf die Wunschliste</button>
        `}
      </div>
    </div>
  `;
  modalRoot.dataset.card = JSON.stringify(card);
}

function parsedModalCard() {
  try { return JSON.parse(modalRoot.dataset.card || '{}'); } catch { return null; }
}

async function findEnglishCounterpart(card, sourceLanguage) {
  if (!card?.id || sourceLanguage === 'en') return sourceLanguage === 'en' ? card : null;

  try {
    const sameId = await fetchCard('en', card.id);
    if (sameId?.id) return sameId;
  } catch {
    // Nicht jedes japanische Produkt besitzt dieselbe internationale ID.
  }

  if (card.set?.id && card.localId) {
    try {
      const sameSetAndNumber = await fetchJson(`${API_BASE}/en/sets/${encodeURIComponent(card.set.id)}/${encodeURIComponent(card.localId)}`);
      if (sameSetAndNumber?.id) return sameSetAndNumber;
    } catch {
      // Manuelle Auswahl bleibt möglich.
    }
  }

  return null;
}

async function addCard(card, list) {
  if (!card?.id || !ADD_LANGS.includes(state.searchLang)) return;
  const language = state.searchLang;
  const duplicate = state.data.collection.find((item) => item.variants?.[language]?.cardId === card.id && item.list === list);
  if (duplicate) {
    if (list === 'binder') duplicate.quantity = Math.max(1, Number(duplicate.quantity) || 1) + 1;
    saveData();
    closeModal();
    toast(list === 'binder' ? 'Karte war schon vorhanden – Menge erhöht.' : 'Karte ist bereits auf deiner Wunschliste.');
    navigate(list);
    return;
  }

  const variant = normalizeCard(card, language);
  const item = {
    id: uid(),
    list,
    title: card.name,
    sourceLanguage: language,
    variants: { de: null, en: null, ja: null, [language]: variant },
    binderSlot: list === 'binder' ? firstFreeBinderSlot() : null,
    quantity: 1,
    condition: 'NM',
    finish: card.variants?.normal === false && card.variants?.holo ? 'holo' : 'normal',
    purchasePrice: '',
    notes: '',
    createdAt: new Date().toISOString(),
  };

  modalRoot.innerHTML = '<div class="modal"><div class="modal-handle"></div><div class="loading"><div><div class="spinner"></div>Englischer Vergleich wird gesucht …</div></div></div>';
  try {
    const english = await findEnglishCounterpart(card, language);
    if (english) item.variants.en = normalizeCard(english, 'en');
  } catch (error) {
    console.warn('Englische Vergleichskarte nicht gefunden.', error);
  }

  state.data.collection.push(item);
  saveData();
  closeModal();
  toast(item.variants.en
    ? 'Karte und englischer Vergleich wurden gespeichert.'
    : 'Karte gespeichert. Englischen Vergleich kannst du in den Details ergänzen.');
  if (list === 'binder') state.binderPage = Math.floor(item.binderSlot / PAGE_SIZE);
  navigate(list);
}

function attachCard(card) {
  const context = state.attachContext;
  if (!context || !card?.id) return;
  const item = getItem(context.itemId);
  if (!item) return;
  const previous = item.variants?.[context.lang];
  item.variants[context.lang] = normalizeCard(card, context.lang, previous);
  saveData();
  closeModal();
  state.attachContext = null;
  toast('Englischer Vergleich wurde gespeichert.');
  navigate('detail', item.id);
}

function renderDetail() {
  const item = getItem(state.selectedId);
  if (!item) {
    navigate('binder');
    return;
  }

  const variant = sourceVariant(item);
  const sourceLanguage = item.sourceLanguage || variant?.language || 'de';
  const compareLanguages = sourceLanguage === 'en' ? ['en'] : [sourceLanguage, 'en'];

  main.innerHTML = `
    <section class="detail-hero">
      <div class="detail-art">${variant?.image ? `<img src="${escapeHtml(imageUrl(variant.image, 'high'))}" alt="${escapeHtml(variant.name)}" />` : ''}</div>
      <div class="detail-main">
        <span class="source-pill">Deine Karte · ${escapeHtml(LANGS[sourceLanguage]?.label || sourceLanguage)}</span>
        <h2>${escapeHtml(item.title || variant?.name || 'Karte')}</h2>
        <p>${escapeHtml(variant?.setName || 'Set unbekannt')} · ${escapeHtml(variant?.setId || '–')} · #${escapeHtml(variant?.localId || '–')}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(item.condition || 'NM')}</span>
          <span class="tag">${escapeHtml(item.finish === 'holo' ? 'Holo' : 'Normal')}</span>
          ${variant?.rarity ? `<span class="tag">${escapeHtml(variant.rarity)}</span>` : ''}
        </div>
      </div>
    </section>

    <div class="detail-actions">
      <button class="secondary-button" data-refresh-item>↻ Preise laden</button>
      <button class="primary-button" data-move-item>${item.list === 'binder' ? 'Zur Wunschliste' : 'In den Binder'}</button>
    </div>

    <section class="panel">
      <div class="panel-title stacked-title">
        <div><h3>Preisvergleich</h3><p>Cardmarket-Marktdaten in Euro</p></div>
        <span>Stand der jeweiligen Datenquelle</span>
      </div>
      <div class="price-compare-grid ${compareLanguages.length === 1 ? 'single' : ''}">
        ${compareLanguages.map((code) => languagePriceCardHtml(item, code, code === sourceLanguage ? 'Deine Karte' : 'Englischer Vergleich')).join('')}
      </div>
      <p class="price-disclaimer">Die automatisch geladenen Marktpreise können bei einzelnen Ausgaben falsch zugeordnet oder nicht verfügbar sein. Prüfe deshalb den Cardmarket-Link bei wertvollen Karten.</p>
    </section>

    <section class="panel">
      <div class="panel-title"><h3>Deine Angaben</h3><span>nur auf diesem Gerät</span></div>
      <div class="field-grid">
        <div class="field"><label for="quantity">Menge</label><input id="quantity" data-item-field="quantity" type="number" min="1" inputmode="numeric" value="${escapeHtml(item.quantity)}" /></div>
        <div class="field"><label for="condition">Zustand</label><select id="condition" data-item-field="condition">${['MT','NM','EX','GD','LP','PL','PO'].map((condition) => `<option ${item.condition === condition ? 'selected' : ''}>${condition}</option>`).join('')}</select></div>
        <div class="field"><label for="finish">Variante</label><select id="finish" data-item-field="finish"><option value="normal" ${item.finish === 'normal' ? 'selected' : ''}>Normal</option><option value="holo" ${item.finish === 'holo' ? 'selected' : ''}>Holo / Foil</option></select></div>
        <div class="field"><label for="purchasePrice">Kaufpreis (€)</label><input id="purchasePrice" data-item-field="purchasePrice" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(item.purchasePrice)}" placeholder="0,00" /></div>
      </div>
      <div class="field"><label for="itemTitle">Eigener Titel</label><input id="itemTitle" data-item-field="title" value="${escapeHtml(item.title)}" /></div>
      <div class="field"><label for="notes">Notizen</label><textarea id="notes" data-item-field="notes" placeholder="z. B. Flohmarkt Köln, kleine Macke hinten …">${escapeHtml(item.notes)}</textarea></div>
    </section>

    <section class="panel">
      <div class="inline-actions">
        <button class="secondary-button" data-export-single>Eintrag exportieren</button>
        <button class="danger-button" data-delete-item>Eintrag löschen</button>
      </div>
    </section>
  `;
}

function languagePriceCardHtml(item, code, role) {
  const variant = item.variants?.[code];
  if (!variant) {
    return `
      <article class="language-price-card missing">
        <div class="language-price-head"><span class="language-flag">${escapeHtml(LANGS[code].short)}</span><div><strong>${escapeHtml(LANGS[code].label)}</strong><small>${escapeHtml(role)}</small></div></div>
        <div class="missing-price">
          <strong>Nicht automatisch gefunden</strong>
          <p>Wähle die passende englische Ausgabe manuell aus.</p>
          <button class="primary-button full-button" data-attach-lang="${code}">Englische Karte wählen</button>
        </div>
      </article>
    `;
  }

  const trend = variantPrice(item, variant, 'trend');
  const low = variantPrice(item, variant, 'low');
  const avg7 = variantPrice(item, variant, 'avg7');
  const avg30 = variantPrice(item, variant, 'avg30');
  const link = variant.cardmarketLink || buildCardmarketSearchLink(variant, code);

  return `
    <article class="language-price-card">
      <div class="language-price-head">
        <span class="language-flag">${escapeHtml(LANGS[code].short)}</span>
        <div><strong>${escapeHtml(LANGS[code].label)}</strong><small>${escapeHtml(role)}</small></div>
        ${code === 'en' && item.sourceLanguage !== 'en' ? `<button class="mini-action" data-replace-lang="en">Ändern</button>` : ''}
      </div>
      <div class="price-main-card">
        <strong>${money(trend)}</strong>
        <span>Trendpreis</span>
      </div>
      <div class="price-mini-grid">
        <div><span>Niedrig</span><strong>${money(low)}</strong></div>
        <div><span>7 Tage</span><strong>${money(avg7)}</strong></div>
        <div><span>30 Tage</span><strong>${money(avg30)}</strong></div>
      </div>
      <p class="price-date">Aktualisiert: ${escapeHtml(formatDate(variant.priceUpdated || variant.fetchedAt))}</p>
      <label class="link-label" for="cardmarket-${code}">Cardmarket-Link ${variant.cardmarketLinkAuto ? '(automatisch)' : '(manuell)'}</label>
      <div class="link-editor">
        <input id="cardmarket-${code}" data-cardmarket-link="${code}" value="${escapeHtml(link)}" placeholder="Cardmarket-Link" inputmode="url" autocapitalize="off" />
        <button class="link-button" data-open-cardmarket="${code}" ${link ? '' : 'disabled'} aria-label="Cardmarket öffnen">
          <svg viewBox="0 0 24 24"><path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
        </button>
      </div>
      <button class="save-link-button" data-save-cardmarket="${code}">Link speichern</button>
    </article>
  `;
}

function renderSettings() {
  const defaultLanguage = state.data.settings.defaultAddLanguage || 'de';
  main.innerHTML = `
    <section class="search-intro"><h2>Deine App</h2><p>Standardsprache, Datensicherung und Hinweise zur Bedienung.</p></section>
    <div class="settings-list">
      <section class="settings-card">
        <h3>Standardsprache beim Hinzufügen</h3>
        <p>Neue Karten können auf Deutsch oder Japanisch angelegt werden. Englisch wird automatisch als Vergleich gesucht.</p>
        <div class="field"><select id="defaultAddLanguage">${ADD_LANGS.map((code) => `<option value="${code}" ${defaultLanguage === code ? 'selected' : ''}>${LANGS[code].label}</option>`).join('')}</select></div>
      </section>

      <section class="settings-card">
        <h3>Karten im Binder verschieben</h3>
        <div class="install-steps">
          <div class="install-step">Im Binder auf „Verschieben“ tippen.</div>
          <div class="install-step">Karte kurz halten und auf das gewünschte Fach ziehen.</div>
          <div class="install-step">Für eine andere Seite Karte antippen, blättern und Zielfach antippen.</div>
        </div>
      </section>

      <section class="settings-card">
        <h3>Datensicherung</h3>
        <p>Deine Sammlung liegt nur im Browser dieses Geräts. Exportiere regelmäßig eine Sicherungsdatei.</p>
        <div class="button-row">
          <button class="primary-button" data-export-all>Exportieren</button>
          <button class="secondary-button" data-import-all>Importieren</button>
        </div>
      </section>

      <section class="settings-card">
        <h3>Offline-Speicher schützen</h3>
        <p>Du kannst Safari bitten, die lokal gespeicherten App-Daten möglichst nicht automatisch zu entfernen.</p>
        <button class="secondary-button full-button" data-persist-storage>Speicher dauerhaft anfragen</button>
      </section>

      <section class="settings-card">
        <h3>Alles zurücksetzen</h3>
        <p>Entfernt Binder, Wunschliste, Links und Notizen vollständig von diesem Gerät.</p>
        <button class="danger-button full-button" data-clear-all>Alle Daten löschen</button>
      </section>

      <p class="disclaimer">BinderDex ist ein privates, inoffizielles Sammlerprojekt und steht nicht in Verbindung mit Nintendo, The Pokémon Company oder Cardmarket. Kartenbilder und Marktdaten werden über TCGdex bereitgestellt.</p>
    </div>
  `;
}

async function refreshItem(item) {
  const jobs = Object.entries(item.variants || {})
    .filter(([, variant]) => variant?.cardId)
    .map(async ([language, variant]) => {
      const card = await fetchJson(`${API_BASE}/${language}/cards/${encodeURIComponent(variant.cardId)}`);
      item.variants[language] = normalizeCard(card, language, variant);
    });
  await Promise.all(jobs);

  if (!item.variants.en && item.sourceLanguage !== 'en') {
    const source = item.variants[item.sourceLanguage];
    if (source?.cardId) {
      try {
        const sourceCard = await fetchJson(`${API_BASE}/${item.sourceLanguage}/cards/${encodeURIComponent(source.cardId)}`);
        const english = await findEnglishCounterpart(sourceCard, item.sourceLanguage);
        if (english) item.variants.en = normalizeCard(english, 'en');
      } catch {
        // Manuelle Auswahl bleibt verfügbar.
      }
    }
  }
}

async function syncAllPrices(list = null) {
  const items = list ? state.data.collection.filter((item) => item.list === list) : state.data.collection;
  if (!items.length) return toast('Noch keine Karten zum Aktualisieren.');
  toast('Preise werden aktualisiert …');
  let failed = 0;
  for (const item of items) {
    try { await refreshItem(item); } catch (error) { failed += 1; console.error(error); }
  }
  saveData();
  render();
  toast(failed ? `Aktualisiert, bei ${failed} Einträgen gab es Probleme.` : 'Preise sind aktuell.');
}

function updateItemField(field, value) {
  const item = getItem(state.selectedId);
  if (!item) return;
  if (field === 'quantity') item[field] = Math.max(1, Number(value) || 1);
  else item[field] = value;
  saveData();
  if (field === 'finish') renderDetail();
}

function updateCardmarketLink(language, value) {
  const item = getItem(state.selectedId);
  if (!item?.variants?.[language]) return;
  item.variants[language].cardmarketLink = value.trim();
  item.variants[language].cardmarketLinkAuto = false;
  saveData();
  const button = main.querySelector(`[data-open-cardmarket="${language}"]`);
  if (button) button.disabled = !value.trim();
}

function saveCardmarketLink(language) {
  const input = main.querySelector(`[data-cardmarket-link="${language}"]`);
  if (!input) return;
  updateCardmarketLink(language, input.value);
  toast('Cardmarket-Link wurde gespeichert.');
}

function openCardmarket(language) {
  const item = getItem(state.selectedId);
  const link = item?.variants?.[language]?.cardmarketLink?.trim();
  if (!link) return;
  try {
    const url = new URL(link);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Ungültige URL');
    window.open(url.href, '_blank', 'noopener,noreferrer');
  } catch {
    toast('Bitte einen vollständigen Cardmarket-Link eingeben.');
  }
}

function beginAttach(language = 'en') {
  const item = getItem(state.selectedId);
  if (!item) return;
  const source = sourceVariant(item);
  state.attachContext = { itemId: item.id, lang: language };
  state.searchLang = language;
  state.searchQuery = [source?.name || item.title, source?.localId || '', source?.setId || ''].filter(Boolean).join(' ');
  state.searchResults = [];
  state.searchError = '';
  navigate('search');
  if (state.searchQuery.length >= 2) performSearch(state.searchQuery);
}

function moveItemBetweenLists() {
  const item = getItem(state.selectedId);
  if (!item) return;
  if (item.list === 'binder') {
    item.list = 'wishlist';
    item.binderSlot = null;
  } else {
    item.list = 'binder';
    item.binderSlot = firstFreeBinderSlot();
    state.binderPage = Math.floor(item.binderSlot / PAGE_SIZE);
  }
  saveData();
  toast(item.list === 'binder' ? 'In den Binder verschoben.' : 'Auf die Wunschliste verschoben.');
  navigate(item.list);
}

function moveBinderCard(itemId, targetSlot) {
  const item = getItem(itemId);
  if (!item || item.list !== 'binder' || !Number.isInteger(targetSlot) || targetSlot < 0) return;
  const sourceSlot = item.binderSlot;
  if (sourceSlot === targetSlot) return;
  const occupant = binderItems().find((entry) => entry.binderSlot === targetSlot);
  item.binderSlot = targetSlot;
  if (occupant) occupant.binderSlot = sourceSlot;
  saveData();
  state.binderPage = Math.floor(targetSlot / PAGE_SIZE);
  state.selectedMoveId = null;
  renderBinder();
  toast(occupant ? 'Karten wurden getauscht.' : 'Karte wurde verschoben.');
}

function deleteItem() {
  const item = getItem(state.selectedId);
  if (!item || !confirm(`„${item.title}“ wirklich löschen?`)) return;
  state.data.collection = state.data.collection.filter((entry) => entry.id !== item.id);
  saveData();
  toast('Eintrag gelöscht.');
  navigate(item.list);
}

function changeBinderPage(deltaOrIndex, absolute = false) {
  const pages = binderPageCount();
  const next = absolute ? deltaOrIndex : state.binderPage + deltaOrIndex;
  const clamped = Math.min(Math.max(0, next), pages - 1);
  if (clamped === state.binderPage) return;
  state.binderPage = clamped;
  renderBinder();
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportAll() {
  downloadJson(state.data, `binderdex-backup-${new Date().toISOString().slice(0, 10)}.json`);
  toast('Sicherung wurde erstellt.');
}

function exportSingle() {
  const item = getItem(state.selectedId);
  if (!item) return;
  downloadJson(item, `binderdex-${(item.title || 'karte').replace(/[^a-z0-9äöüß-]+/gi, '-').toLowerCase()}.json`);
}

function importAll() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      state.data = migrateData(parsed);
      saveData();
      render();
      toast('Sicherung importiert.');
    } catch {
      toast('Diese Sicherungsdatei ist ungültig.');
    }
  });
  input.click();
}

async function persistStorage() {
  if (!navigator.storage?.persist) return toast('Diese Funktion wird auf diesem Gerät nicht unterstützt.');
  const granted = await navigator.storage.persist();
  toast(granted ? 'Dauerhafter Speicher wurde aktiviert.' : 'Safari hat die Anfrage nicht bestätigt.');
}

function toast(message) {
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  clearTimeout(toastRoot._timer);
  toastRoot._timer = setTimeout(() => { toastRoot.innerHTML = ''; }, 2800);
}

function closeModal() {
  modalRoot.innerHTML = '';
  modalRoot.removeAttribute('data-card');
}

function clearDragState() {
  clearTimeout(dragState.timer);
  dragState.timer = null;
  dragState.pointerId = null;
  dragState.itemId = null;
  dragState.dragging = false;
  dragState.targetSlot = null;
  dragState.sourceElement?.classList.remove('drag-source');
  dragState.sourceElement = null;
  dragState.ghost?.remove();
  dragState.ghost = null;
  document.body.classList.remove('binder-dragging');
  document.querySelectorAll('.binder-pocket.drop-target').forEach((pocket) => pocket.classList.remove('drop-target'));
}

function startBinderDrag(event, cardElement) {
  dragState.dragging = true;
  dragState.sourceElement = cardElement;
  cardElement.classList.add('drag-source');
  document.body.classList.add('binder-dragging');

  const rect = cardElement.getBoundingClientRect();
  const ghost = cardElement.cloneNode(true);
  ghost.className = 'binder-card drag-ghost';
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  dragState.ghost = ghost;
  positionDragGhost(event.clientX, event.clientY);
  navigator.vibrate?.(18);
}

function positionDragGhost(x, y) {
  if (!dragState.ghost) return;
  dragState.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -55%) rotate(2deg)`;
}

function updateDragTarget(x, y) {
  document.querySelectorAll('.binder-pocket.drop-target').forEach((pocket) => pocket.classList.remove('drop-target'));
  const target = document.elementFromPoint(x, y)?.closest?.('[data-binder-slot]');
  if (!target) {
    dragState.targetSlot = null;
    return;
  }
  target.classList.add('drop-target');
  dragState.targetSlot = Number(target.dataset.binderSlot);
}

function onPointerDown(event) {
  if (!state.binderArrange || state.route !== 'binder') return;
  const card = event.target.closest('[data-binder-card]');
  if (!card) return;
  clearDragState();
  dragState.pointerId = event.pointerId;
  dragState.itemId = card.dataset.itemId;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.timer = setTimeout(() => startBinderDrag(event, card), 180);
}

function onPointerMove(event) {
  if (dragState.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (!dragState.dragging && distance > 9) {
    clearTimeout(dragState.timer);
    dragState.timer = null;
    return;
  }
  if (!dragState.dragging) return;
  event.preventDefault();
  positionDragGhost(event.clientX, event.clientY);
  updateDragTarget(event.clientX, event.clientY);
}

function onPointerUp(event) {
  if (dragState.pointerId !== event.pointerId) return;
  clearTimeout(dragState.timer);
  if (dragState.dragging) {
    event.preventDefault();
    suppressClickUntil = Date.now() + 500;
    const itemId = dragState.itemId;
    const targetSlot = dragState.targetSlot;
    clearDragState();
    if (Number.isInteger(targetSlot)) moveBinderCard(itemId, targetSlot);
    return;
  }
  clearDragState();
}

bottomNav.addEventListener('click', (event) => {
  const button = event.target.closest('[data-route]');
  if (!button) return;
  state.attachContext = null;
  state.searchQuery = '';
  state.searchResults = [];
  state.searchError = '';
  navigate(button.dataset.route);
});

backButton.addEventListener('click', () => {
  const item = getItem(state.selectedId);
  navigate(item?.list || 'binder');
});

syncButton.addEventListener('click', () => {
  if (state.route === 'detail') {
    const item = getItem(state.selectedId);
    if (!item) return;
    toast('Preise werden aktualisiert …');
    refreshItem(item)
      .then(() => { saveData(); renderDetail(); toast('Preise aktualisiert.'); })
      .catch(() => toast('Aktualisierung fehlgeschlagen.'));
  } else {
    syncAllPrices(state.route === 'wishlist' ? 'wishlist' : 'binder');
  }
});

main.addEventListener('click', (event) => {
  if (Date.now() < suppressClickUntil) return;
  const target = event.target;

  const routeButton = target.closest('[data-empty-route]');
  if (routeButton) return navigate(routeButton.dataset.emptyRoute);
  if (target.closest('[data-go-search]')) return navigate('search');

  if (target.closest('[data-binder-prev]')) return changeBinderPage(-1);
  if (target.closest('[data-binder-next]')) return changeBinderPage(1);
  const pageIndex = target.closest('[data-binder-page-index]');
  if (pageIndex) return changeBinderPage(Number(pageIndex.dataset.binderPageIndex), true);
  if (target.closest('[data-toggle-arrange]')) {
    state.binderArrange = !state.binderArrange;
    state.selectedMoveId = null;
    return renderBinder();
  }

  const pocket = target.closest('[data-binder-slot]');
  if (pocket && state.route === 'binder') {
    const itemId = pocket.dataset.slotItem;
    const slot = Number(pocket.dataset.binderSlot);
    if (!state.binderArrange) {
      if (itemId) navigate('detail', itemId);
      else navigate('search');
      return;
    }
    if (state.selectedMoveId) {
      if (state.selectedMoveId === itemId) {
        state.selectedMoveId = null;
        renderBinder();
      } else {
        moveBinderCard(state.selectedMoveId, slot);
      }
    } else if (itemId) {
      state.selectedMoveId = itemId;
      renderBinder();
    }
    return;
  }

  const openCard = target.closest('[data-open-card]');
  if (openCard) return navigate('detail', openCard.dataset.openCard);
  if (target.closest('[data-sync-list]')) return syncAllPrices('wishlist');

  const searchLang = target.closest('[data-search-lang]');
  if (searchLang) {
    state.searchLang = searchLang.dataset.searchLang;
    state.searchResults = [];
    state.searchError = '';
    updateSearchResults();
    if (state.searchQuery.trim().length >= 2) performSearch(state.searchQuery);
    return;
  }
  const example = target.closest('[data-search-example]');
  if (example) {
    const value = example.dataset.searchExample;
    state.searchQuery = value;
    const input = document.getElementById('cardSearchInput');
    if (input) {
      input.value = value;
      input.focus();
      input.setSelectionRange(value.length, value.length);
    }
    return performSearch(value);
  }
  if (target.closest('[data-clear-search]')) {
    state.searchQuery = '';
    state.searchResults = [];
    state.searchError = '';
    const input = document.getElementById('cardSearchInput');
    if (input) {
      input.value = '';
      input.focus();
    }
    updateSearchResults();
    return;
  }
  if (target.closest('[data-cancel-attach]')) {
    const id = state.attachContext?.itemId;
    state.attachContext = null;
    return navigate('detail', id);
  }
  const result = target.closest('[data-search-result]');
  if (result) return openSearchPreview(result.dataset.searchResult);

  const attachLang = target.closest('[data-attach-lang], [data-replace-lang]');
  if (attachLang) return beginAttach(attachLang.dataset.attachLang || attachLang.dataset.replaceLang);
  const openLink = target.closest('[data-open-cardmarket]');
  if (openLink) return openCardmarket(openLink.dataset.openCardmarket);
  const saveLink = target.closest('[data-save-cardmarket]');
  if (saveLink) return saveCardmarketLink(saveLink.dataset.saveCardmarket);
  if (target.closest('[data-refresh-item]')) {
    const item = getItem(state.selectedId);
    if (!item) return;
    toast('Preise werden aktualisiert …');
    return refreshItem(item)
      .then(() => { saveData(); renderDetail(); toast('Preise aktualisiert.'); })
      .catch(() => toast('Aktualisierung fehlgeschlagen.'));
  }
  if (target.closest('[data-move-item]')) return moveItemBetweenLists();
  if (target.closest('[data-delete-item]')) return deleteItem();
  if (target.closest('[data-export-single]')) return exportSingle();

  if (target.closest('[data-export-all]')) return exportAll();
  if (target.closest('[data-import-all]')) return importAll();
  if (target.closest('[data-persist-storage]')) return persistStorage();
  if (target.closest('[data-clear-all]')) {
    if (!confirm('Wirklich alle BinderDex-Daten auf diesem Gerät löschen?')) return;
    state.data = defaultData();
    state.binderPage = 0;
    saveData();
    toast('Alle Daten wurden gelöscht.');
    return render();
  }
});

main.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'cardSearchInput') {
    state.searchQuery = target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => performSearch(target.value), 430);
    return;
  }
  if (target.id === 'wishlistFilter') {
    state.wishlistFilter = target.value;
    const results = document.getElementById('wishlistResults');
    if (results) results.innerHTML = wishlistResultsHtml();
    return;
  }
  if (target.matches('[data-item-field]')) updateItemField(target.dataset.itemField, target.value);
});

main.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-item-field]')) updateItemField(target.dataset.itemField, target.value);
  if (target.id === 'defaultAddLanguage') {
    state.data.settings.defaultAddLanguage = target.value;
    saveData();
    toast('Standardsprache gespeichert.');
  }
});

main.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove, { passive: false });
window.addEventListener('pointerup', onPointerUp, { passive: false });
window.addEventListener('pointercancel', onPointerUp, { passive: false });

main.addEventListener('touchstart', (event) => {
  if (state.route !== 'binder' || state.binderArrange) return;
  if (!event.target.closest('[data-binder-page]')) return;
  const touch = event.changedTouches[0];
  swipeStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });

main.addEventListener('touchend', (event) => {
  if (!swipeStart || state.route !== 'binder' || state.binderArrange) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipeStart.x;
  const dy = touch.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 55 && Math.abs(dy) < 85) {
    suppressClickUntil = Date.now() + 350;
    changeBinderPage(dx < 0 ? 1 : -1);
  }
}, { passive: true });

modalRoot.addEventListener('click', async (event) => {
  const target = event.target;
  if (target === modalRoot || target.closest('[data-close-modal]')) return closeModal();
  const add = target.closest('[data-add-card]');
  if (add) return addCard(parsedModalCard(), add.dataset.addCard);
  const attach = target.closest('[data-attach-card]');
  if (attach) return attachCard(parsedModalCard());
});

window.addEventListener('online', () => toast('Wieder online. Preise können aktualisiert werden.'));
window.addEventListener('offline', () => toast('Offline-Modus: Gespeicherte Karten bleiben verfügbar.'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
}

saveData();
render();

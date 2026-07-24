'use strict';

const API_BASE = 'https://api.tcgdex.net/v2';
const STORAGE_KEY = 'binderdex-data-v5';
const LEGACY_STORAGE_KEYS = ['binderdex-data-v4', 'binderdex-data-v3', 'binderdex-data-v2', 'binderdex-data-v1'];
const PAGE_SIZE = 9;
const APP_VERSION = '5.0.0';
const IMAGE_DB_NAME = 'binderdex-image-store';
const IMAGE_DB_VERSION = 1;
const IMAGE_STORE_NAME = 'custom-images';
const FETCH_TIMEOUT_MS = 12000;

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
  BLK: 'sv10.5b', WHT: 'sv10.5w',
};

const AMBIGUOUS_SET_CODES = new Set(['MEW']);
const CARDMARKET_SET_CODES = Object.freeze(Object.entries(SET_ALIASES).reduce((map, [code, setId]) => {
  if (!map[setId]) map[setId] = code;
  return map;
}, {}));

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
const setIndexCache = new Map();
const customImageCache = new Map();
const imageRecoveryQueue = new Set();
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
    version: 5,
    collection: [],
    settings: {
      defaultAddLanguage: 'de',
    },
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
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

    Object.entries(variants).filter(([, variant]) => Boolean(variant)).forEach(([code, variant]) => {
      variant.language = variant.language || code;
      variant.pricing = sanitizePricing(variant.pricing);
      variant.priceUpdated = variant.pricing?.cardmarket?.updated || variant.priceUpdated || null;
      variant.cardmarketSearch = cardmarketSearchTerms(variant);
      if (!variant.cardmarketLink || variant.cardmarketLinkAuto !== false) {
        variant.cardmarketLink = buildCardmarketSearchLink(variant);
        variant.cardmarketLinkAuto = true;
      }
    });

    const sourceVariantData = variants[firstLanguage];
    if (sourceVariantData && !sourceVariantData.image && variants.en?.image && !sourceVariantData.fallbackImage) {
      sourceVariantData.fallbackImage = variants.en.image;
      sourceVariantData.fallbackImageLanguage = 'en';
    }

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

  return { version: 5, collection: migrated, settings };
}

function saveData() {
  state.data.version = 5;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function customImageKey(itemId, language) {
  return `${itemId}:${language}`;
}

function openImageDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB nicht verfügbar'));
    const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        database.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Bildspeicher konnte nicht geöffnet werden'));
  });
}

async function loadCustomImages() {
  try {
    const database = await openImageDatabase();
    const records = await new Promise((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE_NAME, 'readonly');
      const request = transaction.objectStore(IMAGE_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    customImageCache.clear();
    records.forEach((record) => {
      if (record?.key && record?.dataUrl) customImageCache.set(record.key, record.dataUrl);
    });
    database.close();
  } catch (error) {
    console.warn('Eigene Kartenbilder konnten nicht geladen werden.', error);
  }
}

async function putCustomImage(key, dataUrl) {
  const database = await openImageDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE_NAME, 'readwrite');
    transaction.objectStore(IMAGE_STORE_NAME).put({ key, dataUrl, updatedAt: new Date().toISOString() });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  customImageCache.set(key, dataUrl);
}

async function deleteCustomImage(key) {
  customImageCache.delete(key);
  try {
    const database = await openImageDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE_NAME, 'readwrite');
      transaction.objectStore(IMAGE_STORE_NAME).delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch (error) {
    console.warn('Eigenes Bild konnte nicht gelöscht werden.', error);
  }
}

async function getAllCustomImages() {
  try {
    const database = await openImageDatabase();
    const records = await new Promise((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE_NAME, 'readonly');
      const request = transaction.objectStore(IMAGE_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return records;
  } catch {
    return [];
  }
}

async function clearCustomImages() {
  customImageCache.clear();
  try {
    const database = await openImageDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE_NAME, 'readwrite');
      transaction.objectStore(IMAGE_STORE_NAME).clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch (error) {
    console.warn('Bildspeicher konnte nicht geleert werden.', error);
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function positivePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  // TCGdex verwendet bei einzelnen nicht verfügbaren Cardmarket-Feldern 0.
  // Null ist kein echter Marktpreis und darf weder angezeigt noch als vorhandener
  // Preis gewertet werden.
  return Number.isFinite(number) && number > 0 ? number : null;
}

function money(value) {
  const number = positivePrice(value);
  if (number === null) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(number);
}

function sanitizeCardmarketMarket(market) {
  if (!market || typeof market !== 'object') return null;
  const cleaned = {};
  for (const [key, value] of Object.entries(market)) {
    if (['updated', 'unit', 'url', 'idProduct'].includes(key)) {
      cleaned[key] = value;
      continue;
    }
    const number = positivePrice(value);
    if (number !== null) cleaned[key] = number;
  }
  return Object.keys(cleaned).length ? cleaned : null;
}

function sanitizePricing(pricing) {
  if (!pricing || typeof pricing !== 'object') return null;
  const cleaned = { ...pricing };
  cleaned.cardmarket = sanitizeCardmarketMarket(pricing.cardmarket);
  if (!cleaned.cardmarket) delete cleaned.cardmarket;
  return Object.keys(cleaned).length ? cleaned : null;
}

function marketHasPositivePrice(market) {
  if (!market) return false;
  return [
    'trend', 'low', 'avg', 'avg1', 'avg7', 'avg30',
    'trend-holo', 'low-holo', 'avg-holo', 'avg1-holo', 'avg7-holo', 'avg30-holo',
  ].some((key) => positivePrice(market[key]) !== null);
}

function firstPositiveMarketPrice(market, keys) {
  if (!market) return null;
  for (const key of keys) {
    const value = positivePrice(market[key]);
    if (value !== null) return value;
  }
  return null;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function imageCandidatesForSource(source, quality = 'low') {
  if (!source) return [];
  const value = String(source).trim();
  if (!value) return [];
  if (/^(?:data:|blob:)/i.test(value)) return [value];

  const clean = value.replace(/[?#].*$/, '');
  const match = clean.match(/^(.*)\/(?:low|high)\.(webp|png|jpe?g)$/i);
  const hasImageExtension = /\.(webp|png|jpe?g)$/i.test(clean);
  const base = match ? match[1] : (hasImageExtension ? '' : clean.replace(/\/$/, ''));
  const otherQuality = quality === 'high' ? 'low' : 'high';
  const generated = base ? [
    `${base}/${quality}.webp`,
    `${base}/${quality}.png`,
    `${base}/${otherQuality}.webp`,
    `${base}/${otherQuality}.png`,
  ] : [];

  // Falls die API bereits eine vollständige URL liefert, wird diese zuerst
  // probiert. Bei TCGdex-URLs werden zusätzlich alle Qualitäts-/Formatvarianten
  // abgeleitet, damit Safari nicht an einer einzelnen Datei hängen bleibt.
  return base ? uniqueValues(generated) : (hasImageExtension ? [value] : []);
}

function imageCandidates(sources, quality = 'low') {
  const list = Array.isArray(sources) ? sources : [sources];
  return uniqueValues(list.flatMap((source) => imageCandidatesForSource(source, quality)));
}

function customImageForItem(item, language) {
  if (!item?.id || !language) return '';
  return customImageCache.get(customImageKey(item.id, language)) || '';
}

function variantImageSources(item, variant = null) {
  const selected = variant || sourceVariant(item);
  const language = selected?.language || item?.sourceLanguage || 'de';
  const english = item?.variants?.en;
  const source = item?.variants?.[item?.sourceLanguage];
  const other = item?.variants?.de || item?.variants?.ja;
  return uniqueValues([
    customImageForItem(item, language),
    selected?.imageBroken ? '' : selected?.image,
    selected?.fallbackImage,
    selected !== source ? source?.image : '',
    selected !== source ? source?.fallbackImage : '',
    selected !== english ? english?.image : '',
    selected !== english ? english?.fallbackImage : '',
    selected !== other ? other?.image : '',
  ]);
}

function cardImageHtml(sources, alt, options = {}) {
  const candidates = imageCandidates(sources, options.quality || 'low');
  if (!candidates.length) {
    if (options.itemId) {
      const language = options.language || 'de';
      return `<img class="image-failed" src="./icons/card-placeholder.svg" data-image-placeholder-only="true" data-image-item-id="${escapeHtml(options.itemId)}" data-image-language="${escapeHtml(language)}" alt="${escapeHtml(alt || 'Pokémon-Karte')}" loading="lazy" decoding="async" draggable="false" />`;
    }
    return options.placeholder || '<div class="image-placeholder">Kein Bild</div>';
  }
  const loading = options.eager ? 'eager' : 'lazy';
  const priority = options.eager ? 'high' : 'low';
  const className = options.className ? ` class="${escapeHtml(options.className)}"` : '';
  const draggable = options.draggable === false ? ' draggable="false"' : '';
  const itemId = options.itemId ? ` data-image-item-id="${escapeHtml(options.itemId)}"` : '';
  const language = options.language ? ` data-image-language="${escapeHtml(options.language)}"` : '';
  const searchCardId = options.searchCardId ? ` data-search-image-card-id="${escapeHtml(options.searchCardId)}"` : '';
  return `<img${className} src="${escapeHtml(candidates[0])}" data-image-candidates="${escapeHtml(JSON.stringify(candidates.slice(1)))}" alt="${escapeHtml(alt || 'Pokémon-Karte')}" loading="${loading}" fetchpriority="${priority}" decoding="async" referrerpolicy="no-referrer"${draggable}${itemId}${language}${searchCardId} />`;
}

function formatDate(value) {
  if (!value) return 'unbekannt';
  let date;
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    const numeric = Number(value);
    date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  } else {
    date = new Date(value);
  }
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
  return ['holo', 'reverse'].includes(item.finish) ? `${key}-holo` : key;
}

function variantPrice(item, variant, key = 'trend') {
  const market = variant?.pricing?.cardmarket;
  if (!market) return null;
  const foilPreferred = ['holo', 'reverse'].includes(item.finish);
  const primary = foilPreferred ? `${key}-holo` : key;
  const secondary = foilPreferred ? key : `${key}-holo`;
  const preferredSuffix = foilPreferred ? '-holo' : '';
  const alternateSuffix = foilPreferred ? '' : '-holo';
  const fallbackKeys = key === 'trend'
    ? [
        primary,
        `avg7${preferredSuffix}`,
        `avg30${preferredSuffix}`,
        `avg${preferredSuffix}`,
        `avg1${preferredSuffix}`,
        `low${preferredSuffix}`,
        secondary,
        `avg7${alternateSuffix}`,
        `avg30${alternateSuffix}`,
        `avg${alternateSuffix}`,
        `avg1${alternateSuffix}`,
        `low${alternateSuffix}`,
      ]
    : [primary, secondary];
  return firstPositiveMarketPrice(market, fallbackKeys);
}

function hasMarketPrice(variant) {
  return marketHasPositivePrice(variant?.pricing?.cardmarket);
}

function bestPriceVariant(item, preferred = null) {
  const candidates = [
    preferred,
    item?.variants?.[item?.sourceLanguage],
    item?.variants?.en,
    item?.variants?.de,
    item?.variants?.ja,
  ].filter(Boolean);
  return candidates.find(hasMarketPrice) || preferred || candidates[0] || null;
}

function itemValue(item) {
  const price = variantPrice(item, bestPriceVariant(item, sourceVariant(item)), 'trend');
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

function cardmarketSetCode(card) {
  const setId = String(card?.set?.id || card?.setId || '').trim();
  const onlineCode = String(card?.set?.tcgOnline || card?.tcgOnline || '').trim();
  if (onlineCode) return onlineCode.toUpperCase();
  if (CARDMARKET_SET_CODES[setId]) return CARDMARKET_SET_CODES[setId];
  return setId;
}

function cardmarketSearchTerms(card) {
  const code = cardmarketSetCode(card);
  const number = String(card?.localId || '').split('/')[0].trim();
  if (code && number) return `${code} ${number}`;
  if (card?.name && number) return `${card.name} ${number}`;
  return String(card?.name || code || number || '').trim();
}

function cardmarketPreferredName(card, fallbackCard = null) {
  // Cardmarket findet Namen deutlich zuverlässiger als Kombinationen aus Kürzel
  // und Kartennummer. Bei japanischen Karten ist der verknüpfte englische Name
  // in der Regel der beste Suchbegriff.
  return String(fallbackCard?.name || card?.name || '').trim();
}

function buildCardmarketSearchLink(card, fallbackCard = null) {
  const direct = card?.pricing?.cardmarket?.url || card?.cardmarketDirectUrl;
  if (direct) return direct;
  const broadName = cardmarketPreferredName(card, fallbackCard);
  const search = broadName || cardmarketSearchTerms(card);
  if (!search) return 'https://www.cardmarket.com/de/Pokemon/Products/Singles';
  return `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(search)}`;
}

function buildCardmarketWebSearchLink(card, fallbackCard = null) {
  const code = cardmarketSetCode(card);
  const number = String(card?.localId || '').split('/')[0].trim();
  const name = cardmarketPreferredName(card, fallbackCard);
  const setName = String(card?.setName || card?.set?.name || '').trim();
  const exact = [
    name ? `"${name}"` : '',
    code && number ? `"${code} ${number}"` : '',
    setName ? `"${setName}"` : '',
  ].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(`site:cardmarket.com/de/Pokemon/Products/Singles ${exact}`)}`;
}

function normalizeCard(card, language, previous = null) {
  const automaticLink = buildCardmarketSearchLink(card);
  const previousManual = previous && previous.cardmarketLinkAuto === false && previous.cardmarketLink;
  const freshPricing = sanitizePricing(card.pricing);
  const previousPricing = sanitizePricing(previous?.pricing);
  // Ein frischer Null-Datensatz darf einen zuvor funktionierenden Preis nicht
  // überschreiben. Positive neue Werte haben aber immer Vorrang.
  const pricing = marketHasPositivePrice(freshPricing?.cardmarket)
    ? freshPricing
    : (marketHasPositivePrice(previousPricing?.cardmarket) ? previousPricing : freshPricing);
  return {
    language,
    cardId: card.id,
    name: card.name,
    setId: card.set?.id || card.setId || '',
    setName: card.set?.name || card.setName || 'Unbekanntes Set',
    tcgOnline: card.set?.tcgOnline || card.tcgOnline || '',
    localId: String(card.localId || ''),
    rarity: card.rarity || '',
    illustrator: card.illustrator || '',
    dexId: Array.isArray(card.dexId) ? card.dexId : [],
    hp: card.hp ?? null,
    image: card.image || previous?.image || '',
    fallbackImage: card.fallbackImage || card._fallbackImage || previous?.fallbackImage || '',
    fallbackImageLanguage: card.fallbackImageLanguage || card._fallbackImageLanguage || previous?.fallbackImageLanguage || '',
    imageBroken: previous?.imageBroken || false,
    pricing,
    priceUpdated: pricing?.cardmarket?.updated || previous?.priceUpdated || null,
    cardmarketLink: previousManual || automaticLink,
    cardmarketLinkAuto: !previousManual,
    cardmarketSearch: cardmarketSearchTerms(card),
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
  requestAnimationFrame(queueVisibleImageRepairs);
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
          ${cardImageHtml(variantImageSources(item, variant), item.title, { quality: 'low', eager: true, draggable: false, itemId: item.id, language: sourceCode, placeholder: '<div class="pocket-placeholder">Kein Bild</div>' })}
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
  const displayedPriceVariant = bestPriceVariant(item, variant);
  const trend = variantPrice(item, displayedPriceVariant, 'trend');
  const usesEnglishPrice = displayedPriceVariant === item.variants?.en && displayedPriceVariant !== variant;
  return `
    <button class="collection-card" data-open-card="${escapeHtml(item.id)}">
      <div class="card-art">
        ${cardImageHtml(variantImageSources(item, variant), variant?.name, { quality: 'low', itemId: item.id, language: item.sourceLanguage, placeholder: '<div class="placeholder-card">Kein Bild</div>' })}
        <span class="card-badge">${escapeHtml(LANGS[item.sourceLanguage]?.short || '–')} · ${escapeHtml(item.finish === 'holo' ? 'HOLO' : 'NORMAL')}</span>
      </div>
      <div class="card-info">
        <h3>${escapeHtml(item.title || variant?.name || 'Unbenannte Karte')}</h3>
        <p>${escapeHtml(variant?.setName || 'Set unbekannt')} · ${escapeHtml(variant?.setId || '–')} · #${escapeHtml(variant?.localId || '–')}</p>
        <div class="card-price-row"><strong>${money(trend)}</strong><span>${usesEnglishPrice ? 'EN-Referenz' : 'Trend'}</span></div>
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
        <input id="cardSearchInput" value="${escapeHtml(state.searchQuery)}" placeholder="Name · Nummer · Setkürzel · Reihenfolge egal" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" />
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
  if (!state.searchQuery.trim()) return '<section class="search-start"><div class="search-symbol">⌕</div><h2>Name, Nummer oder Set eingeben</h2><p>Beispiele: „OBF 199 Glurak“, „199 OBF Glurak“ oder „OBF199“. Die Reihenfolge ist egal.</p></section>';
  if (!state.searchResults.length) return '<section class="empty-state small"><h2>Keine Karte gefunden</h2><p>Probiere Name, Nummer und Setkürzel in beliebiger Reihenfolge – zum Beispiel „199 OBF Glurak“.</p></section>';

  return `<div class="results-list">${state.searchResults.map((card) => `
    <button class="result-card" data-search-result="${escapeHtml(card.id)}">
      ${cardImageHtml([card.image, card._fallbackImage], card.name, { quality: 'low', searchCardId: card.id, placeholder: '<div class="result-placeholder"></div>' })}
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
  const tokens = String(query)
    .replace(/[#,;]+/g, ' ')
    .replace(/\s*[-–—]\s*/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  let setToken = '';
  let localId = '';
  const consumed = new Set();

  // Cardmarket-ähnliche Eingabe wie OBF199, SVP088 oder OBF-199.
  tokens.forEach((token, index) => {
    if (setToken || localId) return;
    const match = token.match(/^([A-Za-z]{2,8})(\d{1,4}[A-Za-z]?)$/);
    if (!match) return;
    const code = match[1].toUpperCase();
    if (!SET_ALIASES[code]) return;
    setToken = match[1];
    localId = match[2];
    consumed.add(index);
  });

  const numberIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ index }) => !consumed.has(index))
    .filter(({ token }) => /^\d{1,4}[A-Za-z]{0,3}(?:\/\d{1,4})?$/.test(token)
      || /^(?:TG|GG|RC|XY|BW|SM|SWSH|SVP|DP|HGSS|PR)\d{1,4}[A-Z]?$/i.test(token));

  if (!localId && numberIndexes.length) {
    localId = numberIndexes[0].token.split('/')[0];
    consumed.add(numberIndexes[0].index);
  }

  const setCandidates = tokens
    .map((token, index) => ({ token, index, upper: token.toUpperCase() }))
    .filter(({ index }) => !consumed.has(index))
    .map((candidate) => {
      const alias = SET_ALIASES[candidate.upper];
      const tcgdexId = /^(?:base|gym|neo|ecard|ex|dp|pl|hgss|bw|xy|sm|swsh|sv|cel|pgo|tk|dc)[a-z0-9.]*$/i.test(candidate.token);
      const shortCode = /^[A-Za-z]{2,6}$/.test(candidate.token) && tokens.length <= 3;
      let score = 0;
      if (alias) score += 20;
      if (tcgdexId) score += 18;
      if (candidate.token === candidate.upper) score += 8;
      if (candidate.token === candidate.token.toLowerCase()) score += tokens.length === 2 ? 5 : 2;
      if (AMBIGUOUS_SET_CODES.has(candidate.upper) && candidate.token !== candidate.upper) score -= 12;
      if (shortCode) score += 2;
      return { ...candidate, alias, tcgdexId, score };
    })
    .filter((candidate) => candidate.alias || candidate.tcgdexId || (candidate.score >= 8 && Boolean(localId)))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (!setToken && setCandidates.length) {
    setToken = setCandidates[0].token;
    consumed.add(setCandidates[0].index);
  }

  const name = tokens.filter((_, index) => !consumed.has(index)).join(' ').trim();
  const setId = setToken ? (SET_ALIASES[setToken.toUpperCase()] || setToken.toLowerCase()) : '';
  return { raw: String(query).trim(), name, localId, setToken, setId };
}

async function fetchJson(url, options = {}) {
  const retries = options.retries ?? 1;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: options.cache || 'default',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 280 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function setIdFromCardBrief(card) {
  if (card?.set?.id) return card.set.id;
  const id = String(card?.id || '');
  const localId = String(card?.localId || '');
  const suffix = localId ? `-${localId}` : '';
  if (suffix && id.endsWith(suffix)) return id.slice(0, -suffix.length);
  const split = id.lastIndexOf('-');
  return split > 0 ? id.slice(0, split) : '';
}

async function getSetIndex(language) {
  if (setIndexCache.has(language)) return setIndexCache.get(language);
  const promise = fetchJson(`${API_BASE}/${language}/sets`, { retries: 1 })
    .then((sets) => new Map((sets || []).map((set) => [set.id, set])))
    .catch((error) => {
      setIndexCache.delete(language);
      throw error;
    });
  setIndexCache.set(language, promise);
  return promise;
}

async function enrichCardBriefs(cards, language) {
  let sets = new Map();
  try { sets = await getSetIndex(language); } catch { /* Setnamen sind optional. */ }
  return [...new Map((cards || []).map((card) => [card.id, card])).values()].map((card) => {
    if (card.set?.id) return card;
    const setId = setIdFromCardBrief(card);
    const set = sets.get(setId) || { id: setId, name: setId || 'Set unbekannt' };
    return { ...card, set };
  });
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

async function hydrateCards(cards, language, limit = 18) {
  const unique = [...new Map((cards || []).map((card) => [card.id, card])).values()].slice(0, limit);
  const results = [];
  for (let index = 0; index < unique.length; index += 5) {
    const batch = unique.slice(index, index + 5);
    const settled = await Promise.allSettled(batch.map((card) => card.pricing || card.illustrator ? Promise.resolve(card) : fetchCard(language, card.id)));
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
  if (parsed.setId && parsed.localId) {
    try {
      const direct = await fetchJson(`${API_BASE}/${language}/sets/${encodeURIComponent(parsed.setId)}/${encodeURIComponent(parsed.localId)}`);
      if (direct?.id && cardSearchScore(direct, parsed) > -500) return [direct];
    } catch {
      // Danach folgt die breitere Suche.
    }
  }

  let briefs = [];
  if (parsed.setId && !parsed.name && !parsed.localId) {
    try {
      const set = await fetchJson(`${API_BASE}/${language}/sets/${encodeURIComponent(parsed.setId)}`);
      briefs = Array.isArray(set?.cards) ? set.cards.map((card) => ({ ...card, set: { id: set.id, name: set.name } })) : [];
    } catch {
      briefs = [];
    }
  }

  if (!briefs.length) {
    const params = new URLSearchParams();
    if (parsed.name) params.set('name', parsed.name);
    if (parsed.localId) params.set('localId', parsed.localId);
    params.set('pagination:page', '1');
    params.set('pagination:itemsPerPage', parsed.name ? '60' : '90');
    briefs = await fetchJson(`${API_BASE}/${language}/cards?${params.toString()}`);
  }

  // Der Listen-Endpunkt enthält bereits Bild, Name und Nummer. Nur die Setliste
  // wird einmalig geladen; damit entfallen bis zu 36 Detailanfragen pro Suche.
  let enriched = await enrichCardBriefs(briefs, language);

  if (!enriched.length && parsed.name && parsed.localId) {
    const params = new URLSearchParams({ name: parsed.name, 'pagination:page': '1', 'pagination:itemsPerPage': '60' });
    enriched = await enrichCardBriefs(await fetchJson(`${API_BASE}/${language}/cards?${params.toString()}`), language);
  }

  return enriched
    .map((card) => ({ card, score: cardSearchScore(card, parsed) }))
    .filter((entry) => entry.score > -500)
    .sort((a, b) => b.score - a.score || String(a.card.name).localeCompare(String(b.card.name), 'de'))
    .slice(0, 36)
    .map((entry) => entry.card);
}

async function resolveCardDisplayImage(card, language) {
  if (!card) return card;
  let detailed = card;

  if (!detailed.image && detailed.id) {
    try {
      const full = await fetchCard(language, detailed.id);
      detailed = { ...detailed, ...full, set: full.set || detailed.set };
    } catch {
      // Die kompakte Trefferkarte bleibt verwendbar.
    }
  }

  if (detailed.image || language === 'en') return detailed;

  let english = null;
  try {
    english = await fetchCard('en', detailed.id);
  } catch {
    // Sprachübergreifende IDs sind nicht immer identisch.
  }

  if (!english?.image && detailed.set?.id && detailed.localId) {
    try {
      english = await fetchJson(`${API_BASE}/en/sets/${encodeURIComponent(detailed.set.id)}/${encodeURIComponent(detailed.localId)}`);
    } catch {
      // Für japanische Sets existiert oft kein identischer englischer Setcode.
    }
  }

  if (english?.image) {
    return { ...detailed, _fallbackImage: english.image, _fallbackImageLanguage: 'en' };
  }
  return detailed;
}

async function resolveMissingSearchImages(requestId) {
  const targets = state.searchResults.filter((card) => !card.image && !card._fallbackImage).slice(0, 12);
  if (!targets.length) return;
  let changed = false;
  for (let index = 0; index < targets.length; index += 3) {
    const batch = targets.slice(index, index + 3);
    const resolved = await Promise.allSettled(batch.map((card) => resolveCardDisplayImage(card, state.searchLang)));
    if (requestId !== searchRequestId) return;
    resolved.forEach((entry, offset) => {
      if (entry.status !== 'fulfilled') return;
      const original = batch[offset];
      const next = entry.value;
      if (!next?.image && !next?._fallbackImage) return;
      const resultIndex = state.searchResults.findIndex((card) => card.id === original.id);
      if (resultIndex >= 0) {
        state.searchResults[resultIndex] = next;
        changed = true;
      }
    });
    if (changed) updateSearchResults();
  }
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
    resolveMissingSearchImages(requestId).catch((error) => console.warn('Bild-Fallback fehlgeschlagen.', error));
  }
}

async function openSearchPreview(cardId) {
  modalRoot.innerHTML = '<div class="modal"><div class="modal-handle"></div><div class="loading"><div><div class="spinner"></div>Kartendetails werden geladen …</div></div></div>';
  try {
    const card = await fetchCard(state.searchLang, cardId);
    const withImage = await resolveCardDisplayImage(card, state.searchLang);
    renderPreviewModal(withImage);
  } catch (error) {
    console.error(error);
    closeModal();
    toast('Kartendetails konnten nicht geladen werden.');
  }
}

function renderPreviewModal(card) {
  const market = sanitizeCardmarketMarket(card.pricing?.cardmarket);
  const trend = firstPositiveMarketPrice(market, [
    'trend', 'avg7', 'avg30', 'avg', 'avg1', 'low',
    'trend-holo', 'avg7-holo', 'avg30-holo', 'avg-holo', 'avg1-holo', 'low-holo',
  ]);
  const attach = state.attachContext;
  modalRoot.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Karte auswählen">
      <div class="modal-handle"></div>
      <div class="modal-head">
        <h2>${attach ? 'Vergleichskarte verknüpfen' : 'Karte hinzufügen'}</h2>
        <button class="icon-button" data-close-modal aria-label="Schließen">×</button>
      </div>
      <div class="preview-layout">
        ${cardImageHtml([card.image, card._fallbackImage], card.name, { quality: 'high', eager: true, searchCardId: card.id, placeholder: '<div class="preview-image-placeholder">Kein Bild</div>' })}
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
    // Japanische und internationale Sets haben oft verschiedene IDs.
  }

  if (card.set?.id && card.localId) {
    try {
      const sameSetAndNumber = await fetchJson(`${API_BASE}/en/sets/${encodeURIComponent(card.set.id)}/${encodeURIComponent(card.localId)}`);
      if (sameSetAndNumber?.id) return sameSetAndNumber;
    } catch {
      // Ähnlichkeitsabgleich folgt.
    }
  }

  // Vorsichtiger Bild-/Metadatenersatz: nur sehr eindeutige Übereinstimmungen
  // werden automatisch verknüpft. Dadurch entstehen weniger falsche Preise.
  if (card.localId) {
    try {
      const params = new URLSearchParams({ localId: String(card.localId), 'pagination:page': '1', 'pagination:itemsPerPage': '35' });
      const briefs = await fetchJson(`${API_BASE}/en/cards?${params.toString()}`);
      const candidates = await hydrateCards(briefs, 'en', 16);
      const sourceDex = new Set(Array.isArray(card.dexId) ? card.dexId.map(String) : []);
      const sourceIllustrator = normalizeText(card.illustrator);
      const scored = candidates.map((candidate) => {
        let score = 0;
        if (normalizeNumber(candidate.localId) === normalizeNumber(card.localId)) score += 20;
        if (sourceIllustrator && normalizeText(candidate.illustrator) === sourceIllustrator) score += 55;
        if (card.hp && candidate.hp && Number(card.hp) === Number(candidate.hp)) score += 10;
        if (sourceDex.size && Array.isArray(candidate.dexId) && candidate.dexId.some((id) => sourceDex.has(String(id)))) score += 35;
        if (normalizeText(candidate.name) === normalizeText(card.name)) score += 25;
        return { candidate, score };
      }).sort((a, b) => b.score - a.score);
      if (scored[0]?.score >= 85 && (!scored[1] || scored[0].score - scored[1].score >= 15)) return scored[0].candidate;
    } catch {
      // Manuelle Auswahl bleibt verfügbar.
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
    if (english) {
      item.variants.en = normalizeCard(english, 'en');
      if (!item.variants[language]?.image && english.image) {
        item.variants[language].fallbackImage = english.image;
        item.variants[language].fallbackImageLanguage = 'en';
      }
    }
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
  if (context.lang === 'en') {
    const source = item.variants?.[item.sourceLanguage];
    if (source && !source.image && item.variants.en?.image) {
      source.fallbackImage = item.variants.en.image;
      source.fallbackImageLanguage = 'en';
    }
  }
  saveData();
  closeModal();
  state.attachContext = null;
  toast('Englischer Vergleich wurde gespeichert.');
  navigate('detail', item.id);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Bild konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

async function compressImageFile(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
  if (file.size > 18 * 1024 * 1024) throw new Error('Das Bild ist zu groß.');
  const dataUrl = await readFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Bildformat wird nicht unterstützt.'));
    element.src = dataUrl;
  });
  const maxWidth = 900;
  const maxHeight = 1240;
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

function chooseCustomImage() {
  const item = getItem(state.selectedId);
  if (!item) return;
  const language = item.sourceLanguage || sourceVariant(item)?.language || 'de';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    toast('Bild wird vorbereitet …');
    try {
      const dataUrl = await compressImageFile(file);
      await putCustomImage(customImageKey(item.id, language), dataUrl);
      renderDetail();
      toast('Eigenes Kartenbild wurde gespeichert.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Bild konnte nicht gespeichert werden.');
    }
  }, { once: true });
  input.click();
}

async function removeCustomImage() {
  const item = getItem(state.selectedId);
  if (!item) return;
  const language = item.sourceLanguage || sourceVariant(item)?.language || 'de';
  await deleteCustomImage(customImageKey(item.id, language));
  renderDetail();
  toast('Eigenes Kartenbild wurde entfernt.');
}

async function recoverItemImage(itemId, language, forceFallback = false) {
  const queueKey = `${itemId}:${language}`;
  if (imageRecoveryQueue.has(queueKey) || !navigator.onLine) return false;
  const item = getItem(itemId);
  let variant = item?.variants?.[language] || sourceVariant(item);
  if (!item || !variant?.cardId) return false;
  imageRecoveryQueue.add(queueKey);
  let changed = false;
  try {
    let sourceCard = null;
    try {
      sourceCard = await fetchJson(`${API_BASE}/${language}/cards/${encodeURIComponent(variant.cardId)}`, { cache: 'no-store', retries: 1 });
      const fresh = normalizeCard(sourceCard, language, variant);
      if (fresh.image && !forceFallback) {
        fresh.imageBroken = false;
        item.variants[language] = fresh;
        variant = fresh;
        changed = true;
      } else {
        variant.imageBroken = Boolean(forceFallback);
      }
    } catch {
      variant.imageBroken = Boolean(forceFallback);
    }

    if (!variant.image || forceFallback || variant.imageBroken) {
      const source = sourceCard || variant;
      let english = item.variants?.en;
      if (!english?.image) {
        try {
          const found = await findEnglishCounterpart(source, language);
          if (found) {
            english = normalizeCard(found, 'en', english);
            item.variants.en = english;
            changed = true;
          }
        } catch {
          // Eigenes Bild bleibt als letzte, zuverlässige Option verfügbar.
        }
      }
      if (english?.image && variant.fallbackImage !== english.image) {
        variant.fallbackImage = english.image;
        variant.fallbackImageLanguage = 'en';
        changed = true;
      }
    }

    if (changed) {
      saveData();
      if (state.route === 'detail' && state.selectedId === itemId) renderDetail();
      else if (state.route === 'binder') renderBinder();
      else if (state.route === 'wishlist') renderWishlist();
    }
    return changed;
  } finally {
    imageRecoveryQueue.delete(queueKey);
  }
}

function queueVisibleImageRepairs() {
  if (!navigator.onLine) return;
  const placeholders = [...main.querySelectorAll('[data-image-placeholder-only="true"]')].slice(0, 6);
  placeholders.forEach((element) => {
    recoverItemImage(element.dataset.imageItemId, element.dataset.imageLanguage, false)
      .catch((error) => console.warn('Automatische Bildreparatur fehlgeschlagen.', error));
  });
}

async function repairAllImages() {
  const items = state.data.collection.filter((item) => sourceVariant(item)?.cardId);
  if (!items.length) return toast('Noch keine Karten zum Prüfen vorhanden.');
  toast(`Bilder für ${items.length} Karte${items.length === 1 ? '' : 'n'} werden geprüft …`);
  let repaired = 0;
  for (let index = 0; index < items.length; index += 3) {
    const batch = items.slice(index, index + 3);
    const settled = await Promise.allSettled(batch.map((item) => recoverItemImage(item.id, item.sourceLanguage, false)));
    repaired += settled.filter((entry) => entry.status === 'fulfilled' && entry.value).length;
  }
  render();
  toast(repaired ? `${repaired} Kartenbilder wurden ergänzt.` : 'Keine weiteren Datenbankbilder gefunden. Nutze bei Bedarf „Eigenes Bild wählen“.');
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
  const hasCustomImage = Boolean(customImageForItem(item, sourceLanguage));
  const usesFallbackImage = !hasCustomImage && !variant?.image && variantImageSources(item, variant).length > 0;

  main.innerHTML = `
    <section class="detail-hero">
      <div class="detail-art">
        ${cardImageHtml(variantImageSources(item, variant), variant?.name, { quality: 'high', eager: true, itemId: item.id, language: sourceLanguage, placeholder: '<div class="detail-image-placeholder">Kein Bild</div>' })}
        <div class="image-action-row">
          <button class="image-action-button" data-choose-custom-image>Eigenes Bild wählen</button>
          ${hasCustomImage ? '<button class="image-action-button subtle" data-remove-custom-image>Eigenes Bild entfernen</button>' : ''}
        </div>
        ${usesFallbackImage ? '<p class="image-source-note">Ersatzbild einer verknüpften Sprachversion</p>' : ''}
      </div>
      <div class="detail-main">
        <span class="source-pill">Deine Karte · ${escapeHtml(LANGS[sourceLanguage]?.label || sourceLanguage)}</span>
        <h2>${escapeHtml(item.title || variant?.name || 'Karte')}</h2>
        <p>${escapeHtml(variant?.setName || 'Set unbekannt')} · ${escapeHtml(variant?.setId || '–')} · #${escapeHtml(variant?.localId || '–')}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(item.condition || 'NM')}</span>
          <span class="tag">${escapeHtml(item.finish === 'holo' ? 'Holo' : item.finish === 'reverse' ? 'Reverse Holo' : 'Normal')}</span>
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
        <div class="field"><label for="finish">Variante</label><select id="finish" data-item-field="finish"><option value="normal" ${item.finish === 'normal' ? 'selected' : ''}>Normal</option><option value="reverse" ${item.finish === 'reverse' ? 'selected' : ''}>Reverse Holo</option><option value="holo" ${item.finish === 'holo' ? 'selected' : ''}>Holo / Foil</option></select></div>
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
    const label = code === 'en' ? 'Englische Karte wählen' : `${LANGS[code].label}e Karte wählen`;
    return `
      <article class="language-price-card missing">
        <div class="language-price-head"><span class="language-flag">${escapeHtml(LANGS[code].short)}</span><div><strong>${escapeHtml(LANGS[code].label)}</strong><small>${escapeHtml(role)}</small></div></div>
        <div class="missing-price">
          <strong>Nicht automatisch gefunden</strong>
          <p>Wähle die passende Ausgabe manuell aus.</p>
          <button class="primary-button full-button" data-attach-lang="${code}">${escapeHtml(label)}</button>
        </div>
      </article>
    `;
  }

  const englishFallback = code !== 'en' && !hasMarketPrice(variant) && hasMarketPrice(item.variants?.en)
    ? item.variants.en
    : null;
  const priceVariant = englishFallback || variant;
  const trend = variantPrice(item, priceVariant, 'trend');
  const low = variantPrice(item, priceVariant, 'low');
  const avg7 = variantPrice(item, priceVariant, 'avg7');
  const avg30 = variantPrice(item, priceVariant, 'avg30');
  const nameFallback = code !== 'en' ? item.variants?.en : null;
  const automaticLink = buildCardmarketSearchLink(variant, nameFallback);
  const link = variant.cardmarketLinkAuto === false ? variant.cardmarketLink : automaticLink;
  const webSearch = buildCardmarketWebSearchLink(variant, nameFallback);
  const missingPrices = [trend, low, avg7, avg30].every((value) => value === null);

  return `
    <article class="language-price-card">
      <div class="language-price-head">
        <span class="language-flag">${escapeHtml(LANGS[code].short)}</span>
        <div><strong>${escapeHtml(LANGS[code].label)}</strong><small>${escapeHtml(role)}</small></div>
        ${code === 'en' && item.sourceLanguage !== 'en' ? `<button class="mini-action" data-replace-lang="en">Ändern</button>` : ''}
      </div>
      ${missingPrices ? `
        <div class="missing-price compact-missing">
          <strong>Kein Marktpreis verfügbar</strong>
          <p>TCGdex liefert für diese Ausgabe derzeit keine Cardmarket-Preisdaten.</p>
        </div>
      ` : `
        <div class="price-main-card">
          <strong>${money(trend)}</strong>
          <span>${englishFallback ? 'Englischer Referenzpreis' : 'Trendpreis'}</span>
        </div>
        <div class="price-mini-grid">
          <div><span>Niedrig</span><strong>${money(low)}</strong></div>
          <div><span>7 Tage</span><strong>${money(avg7)}</strong></div>
          <div><span>30 Tage</span><strong>${money(avg30)}</strong></div>
        </div>
      `}
      ${englishFallback ? '<p class="price-fallback-note">Für diese Sprachversion fehlen Daten. Angezeigt wird ersatzweise die verknüpfte englische Ausgabe.</p>' : ''}
      <p class="price-date">Aktualisiert: ${escapeHtml(formatDate(priceVariant.priceUpdated || priceVariant.fetchedAt))}</p>
      <label class="link-label" for="cardmarket-${code}">Cardmarket-Link ${variant.cardmarketLinkAuto ? `(automatisch: ${escapeHtml(variant.cardmarketSearch || cardmarketSearchTerms(variant))})` : '(manuell)'}</label>
      <div class="link-editor">
        <input id="cardmarket-${code}" data-cardmarket-link="${code}" value="${escapeHtml(link)}" placeholder="Cardmarket-Link" inputmode="url" autocapitalize="off" />
        <button class="link-button" data-open-cardmarket="${code}" ${link ? '' : 'disabled'} aria-label="Cardmarket öffnen">
          <svg viewBox="0 0 24 24"><path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
        </button>
      </div>
      <div class="smart-link-actions">
        <button class="save-link-button" data-save-cardmarket="${code}">Link speichern</button>
        <a class="exact-search-link" href="${escapeHtml(webSearch)}" target="_blank" rel="noopener">Exakten Treffer suchen</a>
      </div>
    </article>
  `;
}

function renderSettings() {
  const defaultLanguage = state.data.settings.defaultAddLanguage || 'de';
  main.innerHTML = `
    <section class="search-intro"><h2>Deine App</h2><p>Standardsprache, Datensicherung und Hinweise zur Bedienung.</p></section>
    <div class="settings-list">
      <section class="settings-card version-card">
        <div><h3>BinderDex ${APP_VERSION}</h3><p>Bild-Update: stabilere Ladewege, englische Ersatzbilder und eigene Kartenfotos auf dem Gerät.</p></div>
        <span class="version-badge">V5</span>
      </section>
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
        <h3>Preise reparieren</h3>
        <p>Lädt fehlende deutsche, japanische und englische Vergleichspreise erneut und verwirft alte Nullwerte.</p>
        <button class="primary-button full-button" data-repair-prices>Alle Preise neu prüfen</button>
      </section>

      <section class="settings-card">
        <h3>Bilder reparieren</h3>
        <p>Prüft fehlende Scans erneut und verwendet nach Möglichkeit das passende englische Kartenbild. In den Kartendetails kannst du zusätzlich ein eigenes Foto speichern.</p>
        <button class="primary-button full-button" data-repair-images>Alle Bilder neu prüfen</button>
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
  const freshCards = new Map();
  const jobs = Object.entries(item.variants || {})
    .filter(([, variant]) => variant?.cardId)
    .map(async ([language, variant]) => {
      const card = await fetchJson(`${API_BASE}/${language}/cards/${encodeURIComponent(variant.cardId)}`, { cache: 'no-store', retries: 1 });
      freshCards.set(language, card);
      item.variants[language] = normalizeCard(card, language, variant);
      cardCache.set(`${language}:${variant.cardId}`, Promise.resolve(card));
      return language;
    });

  const settled = await Promise.allSettled(jobs);
  let successful = settled.filter((entry) => entry.status === 'fulfilled').length;

  // Deutsche und japanische Endpunkte können Nullwerte enthalten. Fehlt dort
  // ein positiver Marktpreis, wird die englische Vergleichsausgabe erneut
  // gesucht und frisch geladen, auch wenn bereits ein alter EN-Eintrag existiert.
  if (item.sourceLanguage !== 'en' && !hasMarketPrice(item.variants?.en)) {
    const source = item.variants[item.sourceLanguage];
    if (source?.cardId) {
      try {
        const sourceCard = freshCards.get(item.sourceLanguage)
          || await fetchJson(`${API_BASE}/${item.sourceLanguage}/cards/${encodeURIComponent(source.cardId)}`, { cache: 'no-store', retries: 1 });
        const english = await findEnglishCounterpart(sourceCard, item.sourceLanguage);
        if (english) {
          item.variants.en = normalizeCard(english, 'en', item.variants.en);
          cardCache.set(`en:${english.id}`, Promise.resolve(english));
          successful += 1;
        }
      } catch {
        // Manuelle Auswahl bleibt verfügbar.
      }
    }
  }

  const sourceVariantData = item.variants?.[item.sourceLanguage];
  const englishVariant = item.variants?.en;
  if (sourceVariantData && !sourceVariantData.image && englishVariant?.image) {
    sourceVariantData.fallbackImage = englishVariant.image;
    sourceVariantData.fallbackImageLanguage = 'en';
  }

  if (!successful && jobs.length) throw new Error('Keine Preisdaten konnten aktualisiert werden.');
  return successful;
}

async function repairMissingPricesOnce() {
  if (!navigator.onLine || state.data.settings.priceRepairVersion === APP_VERSION) return;
  const targets = state.data.collection.filter((item) => {
    const source = sourceVariant(item);
    const sourceMissing = !hasMarketPrice(source);
    const englishMissing = item.sourceLanguage !== 'en' && !hasMarketPrice(item.variants?.en);
    return sourceMissing || englishMissing;
  });

  if (!targets.length) {
    state.data.settings.priceRepairVersion = APP_VERSION;
    saveData();
    return;
  }

  toast(`Preisreparatur für ${targets.length} Karte${targets.length === 1 ? '' : 'n'} läuft …`);
  let refreshed = 0;
  for (let index = 0; index < targets.length; index += 3) {
    const batch = targets.slice(index, index + 3);
    const settled = await Promise.allSettled(batch.map((item) => refreshItem(item)));
    refreshed += settled.filter((entry) => entry.status === 'fulfilled').length;
  }

  state.data.settings.priceRepairVersion = APP_VERSION;
  saveData();
  render();
  toast(refreshed
    ? `Preisreparatur abgeschlossen: ${refreshed} Einträge geprüft.`
    : 'Keine positiven Marktpreise gefunden. Fehlende Werte werden nun als – angezeigt.');
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
  const input = main.querySelector(`[data-cardmarket-link="${language}"]`);
  const link = input?.value?.trim() || item?.variants?.[language]?.cardmarketLink?.trim();
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

async function deleteItem() {
  const item = getItem(state.selectedId);
  if (!item || !confirm(`„${item.title}“ wirklich löschen?`)) return;
  await Promise.all(Object.keys(LANGS).map((language) => deleteCustomImage(customImageKey(item.id, language))));
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

async function exportAll() {
  const customImages = await getAllCustomImages();
  downloadJson({ ...state.data, customImages }, `binderdex-backup-${new Date().toISOString().slice(0, 10)}.json`);
  toast('Sicherung inklusive eigener Kartenbilder wurde erstellt.');
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
      if (Array.isArray(parsed.customImages)) {
        await clearCustomImages();
        for (const record of parsed.customImages) {
          if (record?.key && record?.dataUrl) await putCustomImage(record.key, record.dataUrl);
        }
      }
      saveData();
      render();
      toast('Sicherung inklusive Kartenbildern importiert.');
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
  if (target.closest('[data-choose-custom-image]')) return chooseCustomImage();
  if (target.closest('[data-remove-custom-image]')) return removeCustomImage();
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
  if (target.closest('[data-repair-images]')) return repairAllImages().catch((error) => {
    console.error(error);
    toast('Bildprüfung fehlgeschlagen. Prüfe deine Internetverbindung.');
  });
  if (target.closest('[data-repair-prices]')) {
    delete state.data.settings.priceRepairVersion;
    saveData();
    toast('Preisreparatur wurde gestartet …');
    return repairMissingPricesOnce().catch((error) => {
      console.error(error);
      toast('Preisreparatur fehlgeschlagen. Prüfe deine Internetverbindung.');
    });
  }
  if (target.closest('[data-persist-storage]')) return persistStorage();
  if (target.closest('[data-clear-all]')) {
    if (!confirm('Wirklich alle BinderDex-Daten auf diesem Gerät löschen?')) return;
    state.data = defaultData();
    state.binderPage = 0;
    clearCustomImages().catch(() => {});
    saveData();
    toast('Alle Daten und eigenen Kartenbilder wurden gelöscht.');
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

document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.imageCandidates) return;
  let candidates = [];
  try { candidates = JSON.parse(image.dataset.imageCandidates || '[]'); } catch { candidates = []; }
  const next = candidates.shift();
  if (next) {
    image.dataset.imageCandidates = JSON.stringify(candidates);
    image.src = next;
    return;
  }
  image.removeAttribute('data-image-candidates');
  image.classList.add('image-failed');
  image.src = './icons/card-placeholder.svg';
  if (image.dataset.imageItemId && image.dataset.imageLanguage) {
    recoverItemImage(image.dataset.imageItemId, image.dataset.imageLanguage, true)
      .catch((error) => console.warn('Bild-Fallback konnte nicht geladen werden.', error));
  }
}, true);

window.addEventListener('online', () => toast('Wieder online. Preise können aktualisiert werden.'));
window.addEventListener('offline', () => toast('Offline-Modus: Gespeicherte Karten bleiben verfügbar.'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`, { updateViaCache: 'none' });
      registration.update();
    } catch (error) {
      console.error(error);
    }
  });
}

saveData();
render();
loadCustomImages().then(() => render()).catch(() => {});
setTimeout(() => {
  repairMissingPricesOnce().catch((error) => console.warn('Automatische Preisreparatur fehlgeschlagen.', error));
}, 900);

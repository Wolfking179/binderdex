'use strict';

const API_BASE = 'https://api.tcgdex.net/v2';
const STORAGE_KEY = 'binderdex-data-v1';
const LANGS = {
  de: { label: 'Deutsch', short: 'DE' },
  en: { label: 'Englisch', short: 'EN' },
  ja: { label: 'Japanisch', short: 'JP' },
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
  detailLang: 'de',
  searchLang: 'de',
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  collectionFilter: '',
  wishlistFilter: '',
  attachContext: null,
  data: loadData(),
};

let searchTimer;

function defaultData() {
  return {
    version: 1,
    collection: [],
    settings: {
      preferredLanguage: 'de',
    },
  };
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || !Array.isArray(parsed.collection)) return defaultData();
    return {
      ...defaultData(),
      ...parsed,
      settings: { ...defaultData().settings, ...(parsed.settings || {}) },
    };
  } catch {
    return defaultData();
  }
}

function saveData() {
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

function getItem(id) {
  return state.data.collection.find((item) => item.id === id);
}

function primaryVariant(item) {
  const preferred = state.data.settings.preferredLanguage;
  return item.variants?.[preferred]
    || item.variants?.de
    || item.variants?.en
    || item.variants?.ja
    || null;
}

function priceKey(item, key) {
  return item.finish === 'holo' ? `${key}-holo` : key;
}

function variantPrice(item, variant, key = 'trend') {
  if (!variant?.pricing?.cardmarket) return null;
  const value = variant.pricing.cardmarket[priceKey(item, key)];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function itemValue(item) {
  const variant = primaryVariant(item);
  const price = variantPrice(item, variant, 'trend');
  return price === null ? 0 : price * Math.max(1, Number(item.quantity) || 1);
}

function binderItems() {
  return state.data.collection.filter((item) => item.list === 'binder');
}

function wishlistItems() {
  return state.data.collection.filter((item) => item.list === 'wishlist');
}

function normalizeCard(card, language) {
  return {
    language,
    cardId: card.id,
    name: card.name,
    setId: card.set?.id || '',
    setName: card.set?.name || 'Unbekanntes Set',
    localId: card.localId || '',
    rarity: card.rarity || '',
    image: card.image || '',
    pricing: card.pricing || null,
    priceUpdated: card.pricing?.cardmarket?.updated || null,
    cardmarketLink: '',
    fetchedAt: new Date().toISOString(),
  };
}

function titleForRoute() {
  if (state.route === 'detail') return 'Kartendetails';
  if (state.route === 'wishlist') return 'Wunschliste';
  if (state.route === 'search') return state.attachContext ? `${LANGS[state.searchLang].label} verknüpfen` : 'Karte hinzufügen';
  if (state.route === 'settings') return 'Mehr';
  return 'BinderDex';
}

function navigate(route, id = null) {
  state.route = route;
  state.selectedId = id;
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

  if (state.route === 'binder') renderCollection('binder');
  else if (state.route === 'wishlist') renderCollection('wishlist');
  else if (state.route === 'search') renderSearch();
  else if (state.route === 'settings') renderSettings();
  else if (state.route === 'detail') renderDetail();
}

function renderCollection(list) {
  const isBinder = list === 'binder';
  const allItems = isBinder ? binderItems() : wishlistItems();
  const filter = (isBinder ? state.collectionFilter : state.wishlistFilter).trim().toLowerCase();
  const items = filter
    ? allItems.filter((item) => {
        const variant = primaryVariant(item);
        return [item.title, variant?.name, variant?.setName, variant?.localId].join(' ').toLowerCase().includes(filter);
      })
    : allItems;

  if (!allItems.length) {
    main.innerHTML = emptyState(
      isBinder ? 'Dein Binder ist noch leer' : 'Noch keine Wunschkarten',
      isBinder
        ? 'Suche deine erste Karte und füge sie deinem digitalen Binder hinzu.'
        : 'Speichere Karten, nach denen du auf Flohmärkten Ausschau halten möchtest.',
      'Karte suchen',
      'search'
    );
    return;
  }

  const totalValue = binderItems().reduce((sum, item) => sum + itemValue(item), 0);
  const quantity = binderItems().reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
  const wishlistValue = wishlistItems().reduce((sum, item) => sum + itemValue(item), 0);

  main.innerHTML = `
    <section class="hero-card">
      <p class="hero-label">${isBinder ? 'GESCHÄTZTER BINDERWERT' : 'WUNSCHLISTENWERT'}</p>
      <h2 class="hero-value">${money(isBinder ? totalValue : wishlistValue)}</h2>
      <p class="hero-meta">Auf Basis des gespeicherten Cardmarket-Trendpreises</p>
      <div class="hero-mini">
        <strong>${isBinder ? quantity : allItems.length}</strong>
        <span>${isBinder ? 'Karten' : 'Wünsche'}</span>
      </div>
    </section>

    <div class="stats-row">
      <div class="stat-card"><span>Einträge</span><strong>${isBinder ? binderItems().length : wishlistItems().length}</strong></div>
      <div class="stat-card"><span>${isBinder ? 'Exemplare' : 'Preisziel'}</span><strong>${isBinder ? quantity : money(wishlistValue)}</strong></div>
      <div class="stat-card"><span>Sprachen</span><strong>${countLanguages(allItems)}</strong></div>
    </div>

    <div class="section-head">
      <div><h2>${isBinder ? 'Meine Karten' : 'Gesuchte Karten'}</h2><p>${items.length} von ${allItems.length} angezeigt</p></div>
      <button class="text-button" data-go-search>+ Hinzufügen</button>
    </div>

    <div class="toolbar">
      <label class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="collectionFilter" value="${escapeHtml(isBinder ? state.collectionFilter : state.wishlistFilter)}" placeholder="Name, Set oder Nummer" autocomplete="off" />
      </label>
      <button class="filter-button" data-sync-list title="Preise aktualisieren" aria-label="Preise aktualisieren">
        <svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-15-3M4 4v5h5M4 13a8 8 0 0 0 15 3M20 20v-5h-5"/></svg>
      </button>
    </div>

    ${items.length ? `<section class="card-grid">${items.map(collectionCardHtml).join('')}</section>` : `
      <section class="empty-state"><h2>Keine Treffer</h2><p>Versuche einen anderen Namen, ein anderes Set oder eine Kartennummer.</p></section>
    `}
  `;
}

function countLanguages(items) {
  const set = new Set();
  items.forEach((item) => Object.entries(item.variants || {}).forEach(([lang, value]) => value && set.add(lang)));
  return set.size;
}

function collectionCardHtml(item) {
  const variant = primaryVariant(item);
  const trend = variantPrice(item, variant, 'trend');
  return `
    <button class="collection-card" data-open-card="${escapeHtml(item.id)}">
      <div class="card-art">
        ${variant?.image ? `<img src="${escapeHtml(imageUrl(variant.image, 'low'))}" alt="${escapeHtml(variant.name)}" loading="lazy" />` : '<div class="placeholder-card">Kein Bild</div>'}
        <span class="card-badge">${escapeHtml(LANGS[variant?.language]?.short || '–')} · ${escapeHtml(item.finish === 'holo' ? 'HOLO' : 'NORMAL')}</span>
        ${item.list === 'binder' ? `<span class="qty-badge">×${Math.max(1, Number(item.quantity) || 1)}</span>` : ''}
      </div>
      <div class="card-info">
        <h3>${escapeHtml(item.title || variant?.name || 'Unbenannte Karte')}</h3>
        <p>${escapeHtml(variant?.setName || 'Set unbekannt')} · #${escapeHtml(variant?.localId || '–')}</p>
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
  main.innerHTML = `
    <section class="search-intro">
      <h2>${attach ? `${LANGS[state.searchLang].label}e Version finden` : 'Welche Karte suchst du?'}</h2>
      <p>${attach ? 'Wähle die passende Ausgabe aus. Sie wird mit deinem bestehenden Binder-Eintrag verknüpft.' : 'Suche nach Kartenname und wähle die richtige Ausgabe aus.'}</p>
    </section>

    <div class="segmented" aria-label="Kartensprache">
      ${Object.entries(LANGS).map(([code, lang]) => `<button data-search-lang="${code}" class="${state.searchLang === code ? 'active' : ''}">${lang.label}</button>`).join('')}
    </div>

    <div class="toolbar">
      <label class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="cardSearchInput" value="${escapeHtml(state.searchQuery)}" placeholder="z. B. Pikachu, Glurak, Mew …" autocomplete="off" enterkeyhint="search" />
      </label>
      ${attach ? '<button class="filter-button" data-cancel-attach aria-label="Abbrechen">×</button>' : '<button class="filter-button" data-clear-search aria-label="Suche leeren">×</button>'}
    </div>

    <div class="api-note">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
      <span>Marktpreise werden aus den verfügbaren Cardmarket-Daten übernommen. Bei einzelnen alten oder japanischen Ausgaben kann eine manuelle Verknüpfung nötig sein.</span>
    </div>

    <section id="searchResults">${searchResultsHtml()}</section>
  `;

  requestAnimationFrame(() => document.getElementById('cardSearchInput')?.focus());
}

function searchResultsHtml() {
  if (state.searchLoading) return '<div class="loading"><div><div class="spinner"></div>Suche läuft …</div></div>';
  if (!state.searchQuery.trim()) return emptyState('Name eingeben', 'Suche nach einem Pokémon oder einer Trainerkarte.', 'Beispiel: Pikachu', 'sample-search');
  if (!state.searchResults.length) return '<section class="empty-state"><h2>Keine Karte gefunden</h2><p>Prüfe die Schreibweise oder wechsle die Sprache.</p></section>';

  return `<div class="results-list">${state.searchResults.map((card) => `
    <button class="result-card" data-search-result="${escapeHtml(card.id)}">
      ${card.image ? `<img src="${escapeHtml(imageUrl(card.image, 'low'))}" alt="${escapeHtml(card.name)}" loading="lazy" />` : '<div></div>'}
      <div>
        <h3>${escapeHtml(card.name)}</h3>
        <p>Kartennummer ${escapeHtml(card.localId || '–')}</p>
        <strong>${escapeHtml(LANGS[state.searchLang].label)}</strong>
      </div>
      <svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  `).join('')}</div>`;
}

async function performSearch(query) {
  const clean = query.trim();
  state.searchQuery = query;
  if (clean.length < 2) {
    state.searchResults = [];
    state.searchLoading = false;
    renderSearch();
    return;
  }

  state.searchLoading = true;
  renderSearch();
  try {
    const url = `${API_BASE}/${state.searchLang}/cards?name=${encodeURIComponent(clean)}&pagination:page=1&pagination:itemsPerPage=40`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.searchResults = await response.json();
  } catch (error) {
    console.error(error);
    state.searchResults = [];
    toast('Suche nicht erreichbar. Prüfe deine Internetverbindung.');
  } finally {
    state.searchLoading = false;
    renderSearch();
  }
}

async function openSearchPreview(cardId) {
  modalRoot.innerHTML = `<div class="modal"><div class="modal-handle"></div><div class="loading"><div><div class="spinner"></div>Kartendetails werden geladen …</div></div></div>`;
  try {
    const response = await fetch(`${API_BASE}/${state.searchLang}/cards/${encodeURIComponent(cardId)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const card = await response.json();
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
        <h2>${attach ? 'Sprachversion verknüpfen' : 'Karte hinzufügen'}</h2>
        <button class="icon-button" data-close-modal aria-label="Schließen">×</button>
      </div>
      <div class="preview-layout">
        ${card.image ? `<img src="${escapeHtml(imageUrl(card.image, 'high'))}" alt="${escapeHtml(card.name)}" />` : '<div></div>'}
        <div>
          <h3>${escapeHtml(card.name)}</h3>
          <p>${escapeHtml(card.set?.name || 'Set unbekannt')} · #${escapeHtml(card.localId || '–')}</p>
          <p>${escapeHtml(card.rarity || 'Seltenheit unbekannt')}</p>
          <strong>${money(trend)} Trend</strong>
        </div>
      </div>
      <div class="modal-actions">
        ${attach ? `
          <button class="primary-button full-button" data-attach-card="${escapeHtml(card.id)}">Als ${escapeHtml(LANGS[state.searchLang].label)} verknüpfen</button>
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

function addCard(card, list) {
  if (!card?.id) return;
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
    variants: { de: null, en: null, ja: null, [language]: variant },
    quantity: 1,
    condition: 'NM',
    finish: card.variants?.normal === false && card.variants?.holo ? 'holo' : 'normal',
    purchasePrice: '',
    notes: '',
    createdAt: new Date().toISOString(),
  };
  state.data.collection.unshift(item);
  saveData();
  closeModal();
  toast(list === 'binder' ? 'Karte zum Binder hinzugefügt.' : 'Karte zur Wunschliste hinzugefügt.');
  navigate(list);
}

function attachCard(card) {
  const context = state.attachContext;
  if (!context || !card?.id) return;
  const item = getItem(context.itemId);
  if (!item) return;
  item.variants[context.lang] = normalizeCard(card, context.lang);
  item.title = item.title || card.name;
  saveData();
  closeModal();
  state.detailLang = context.lang;
  state.attachContext = null;
  toast(`${LANGS[context.lang].label}e Version verknüpft.`);
  navigate('detail', item.id);
}

function renderDetail() {
  const item = getItem(state.selectedId);
  if (!item) {
    navigate('binder');
    return;
  }
  const variant = item.variants?.[state.detailLang] || primaryVariant(item);
  if (!item.variants?.[state.detailLang]) {
    state.detailLang = variant?.language || 'de';
  }
  const displayVariant = item.variants?.[state.detailLang] || variant;

  main.innerHTML = `
    <section class="detail-hero">
      <div class="detail-art">${displayVariant?.image ? `<img src="${escapeHtml(imageUrl(displayVariant.image, 'high'))}" alt="${escapeHtml(displayVariant.name)}" />` : ''}</div>
      <div class="detail-main">
        <h2>${escapeHtml(item.title || displayVariant?.name || 'Karte')}</h2>
        <p>${escapeHtml(displayVariant?.setName || 'Set unbekannt')} · #${escapeHtml(displayVariant?.localId || '–')}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(item.condition || 'NM')}</span>
          <span class="tag">${escapeHtml(item.finish === 'holo' ? 'Holo' : 'Normal')}</span>
          ${displayVariant?.rarity ? `<span class="tag">${escapeHtml(displayVariant.rarity)}</span>` : ''}
        </div>
      </div>
    </section>

    <div class="detail-actions">
      <button class="secondary-button" data-refresh-item>↻ Preise laden</button>
      <button class="primary-button" data-move-item>${item.list === 'binder' ? 'Zur Wunschliste' : 'In den Binder'}</button>
    </div>

    <section class="panel">
      <div class="panel-title"><h3>Preise & Sprachversionen</h3><span>Cardmarket · EUR</span></div>
      <div class="segmented">
        ${Object.entries(LANGS).map(([code, lang]) => `<button data-detail-lang="${code}" class="${state.detailLang === code ? 'active' : ''}">${lang.short}${item.variants?.[code] ? ' ✓' : ''}</button>`).join('')}
      </div>
      ${Object.keys(LANGS).map((code) => languagePanelHtml(item, code)).join('')}
    </section>

    <section class="panel">
      <div class="panel-title"><h3>Deine Angaben</h3><span>nur auf diesem Gerät</span></div>
      <div class="field-grid">
        <div class="field"><label for="quantity">Menge</label><input id="quantity" data-item-field="quantity" type="number" min="1" inputmode="numeric" value="${escapeHtml(item.quantity)}" /></div>
        <div class="field"><label for="condition">Zustand</label><select id="condition" data-item-field="condition">${['MT','NM','EX','GD','LP','PL','PO'].map((c) => `<option ${item.condition === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
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

function languagePanelHtml(item, code) {
  const variant = item.variants?.[code];
  const active = state.detailLang === code ? 'active' : '';
  if (!variant) {
    return `
      <div class="language-panel ${active}" data-language-panel="${code}">
        <div class="missing-variant">
          <p>Noch keine ${LANGS[code].label.toLowerCase()}e Ausgabe verknüpft. Suche die passende Karte, um ihren eigenen Preis und Link zu speichern.</p>
          <button class="primary-button" data-attach-lang="${code}">${LANGS[code].label} verknüpfen</button>
        </div>
      </div>
    `;
  }

  const trend = variantPrice(item, variant, 'trend');
  const low = variantPrice(item, variant, 'low');
  const avg7 = variantPrice(item, variant, 'avg7');
  const avg30 = variantPrice(item, variant, 'avg30');
  const link = variant.cardmarketLink || '';
  return `
    <div class="language-panel ${active}" data-language-panel="${code}">
      <div class="price-main"><div><strong>${money(trend)}</strong><span>Trendpreis</span></div><span>Stand ${escapeHtml(formatDate(variant.priceUpdated || variant.fetchedAt))}</span></div>
      <div class="price-grid">
        <div class="price-cell"><span>Niedrig</span><strong>${money(low)}</strong></div>
        <div class="price-cell"><span>7 Tage</span><strong>${money(avg7)}</strong></div>
        <div class="price-cell"><span>30 Tage</span><strong>${money(avg30)}</strong></div>
      </div>
      <div class="link-row">
        <input data-cardmarket-link="${code}" value="${escapeHtml(link)}" placeholder="Cardmarket-Link einfügen" inputmode="url" />
        <button class="link-button" data-open-cardmarket="${code}" ${link ? '' : 'disabled'} aria-label="Cardmarket öffnen">
          <svg viewBox="0 0 24 24"><path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
        </button>
      </div>
      <div class="inline-actions" style="margin-top:10px">
        <button class="secondary-button" data-replace-lang="${code}">Andere Ausgabe wählen</button>
        <button class="danger-button" data-remove-lang="${code}">Verknüpfung lösen</button>
      </div>
    </div>
  `;
}

function renderSettings() {
  const preferred = state.data.settings.preferredLanguage;
  main.innerHTML = `
    <section class="search-intro"><h2>Deine App</h2><p>Datensicherung, Installation und persönliche Einstellungen.</p></section>
    <div class="settings-list">
      <section class="settings-card">
        <h3>Auf dem iPhone installieren</h3>
        <p>Öffne die veröffentlichte App in Safari. Danach verhält sie sich fast wie eine normale App und startet im Vollbild.</p>
        <div class="install-steps">
          <div class="install-step">Tippe unten in Safari auf das Teilen-Symbol.</div>
          <div class="install-step">Wähle „Zum Home-Bildschirm“.</div>
          <div class="install-step">Bestätige mit „Hinzufügen“.</div>
        </div>
      </section>

      <section class="settings-card">
        <h3>Bevorzugte Sprache</h3>
        <p>Diese Sprachversion wird auf Binder-Karten zuerst angezeigt und für die Wertberechnung bevorzugt.</p>
        <div class="field"><select id="preferredLanguage">${Object.entries(LANGS).map(([code, lang]) => `<option value="${code}" ${preferred === code ? 'selected' : ''}>${lang.label}</option>`).join('')}</select></div>
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
        <p>Du kannst den Browser bitten, die lokal gespeicherten App-Daten möglichst nicht automatisch zu entfernen.</p>
        <button class="secondary-button full-button" data-persist-storage>Speicher dauerhaft anfragen</button>
      </section>

      <section class="settings-card">
        <h3>Testdaten</h3>
        <p>Füge drei Beispielkarten hinzu, um die Oberfläche auszuprobieren. Die Beispiele können später einzeln gelöscht werden.</p>
        <button class="secondary-button full-button" data-load-demo>Beispielkarten laden</button>
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
    .map(async ([lang, variant]) => {
      const response = await fetch(`${API_BASE}/${lang}/cards/${encodeURIComponent(variant.cardId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const card = await response.json();
      const oldLink = variant.cardmarketLink || '';
      item.variants[lang] = { ...normalizeCard(card, lang), cardmarketLink: oldLink };
    });
  await Promise.all(jobs);
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

function updateCardmarketLink(lang, value) {
  const item = getItem(state.selectedId);
  if (!item?.variants?.[lang]) return;
  item.variants[lang].cardmarketLink = value.trim();
  saveData();
  const button = main.querySelector(`[data-open-cardmarket="${lang}"]`);
  if (button) button.disabled = !value.trim();
}

function openCardmarket(lang) {
  const item = getItem(state.selectedId);
  const link = item?.variants?.[lang]?.cardmarketLink?.trim();
  if (!link) return;
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid URL');
    window.open(url.href, '_blank', 'noopener,noreferrer');
  } catch {
    toast('Bitte einen vollständigen Cardmarket-Link eingeben.');
  }
}

function beginAttach(lang) {
  const item = getItem(state.selectedId);
  if (!item) return;
  state.attachContext = { itemId: item.id, lang };
  state.searchLang = lang;
  state.searchQuery = item.title || '';
  state.searchResults = [];
  navigate('search');
  if (state.searchQuery.length >= 2) performSearch(state.searchQuery);
}

function removeLanguage(lang) {
  const item = getItem(state.selectedId);
  if (!item?.variants?.[lang]) return;
  const linked = Object.values(item.variants).filter(Boolean).length;
  if (linked <= 1) return toast('Mindestens eine Sprachversion muss erhalten bleiben.');
  if (!confirm(`${LANGS[lang].label}e Verknüpfung entfernen?`)) return;
  item.variants[lang] = null;
  state.detailLang = primaryVariant(item)?.language || 'de';
  saveData();
  renderDetail();
}

function moveItem() {
  const item = getItem(state.selectedId);
  if (!item) return;
  item.list = item.list === 'binder' ? 'wishlist' : 'binder';
  saveData();
  toast(item.list === 'binder' ? 'In den Binder verschoben.' : 'Auf die Wunschliste verschoben.');
  navigate(item.list);
}

function deleteItem() {
  const item = getItem(state.selectedId);
  if (!item || !confirm(`„${item.title}“ wirklich löschen?`)) return;
  state.data.collection = state.data.collection.filter((entry) => entry.id !== item.id);
  saveData();
  toast('Eintrag gelöscht.');
  navigate(item.list);
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
      if (!Array.isArray(parsed.collection)) throw new Error('Ungültige Datei');
      state.data = { ...defaultData(), ...parsed, settings: { ...defaultData().settings, ...(parsed.settings || {}) } };
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
  toast(granted ? 'Dauerhafter Speicher wurde aktiviert.' : 'Der Browser hat die Anfrage nicht bestätigt.');
}

function loadDemo() {
  const now = new Date().toISOString();
  const demos = [
    {
      id: uid(), list: 'binder', title: 'Pikachu', quantity: 2, condition: 'NM', finish: 'normal', purchasePrice: '8.00', notes: 'Beispielkarte', createdAt: now,
      variants: { de: { language:'de', cardId:'base1-58', name:'Pikachu', setName:'Grundset', setId:'base1', localId:'58', rarity:'Gewöhnlich', image:'https://assets.tcgdex.net/de/base/base1/58', pricing:null, priceUpdated:null, cardmarketLink:'', fetchedAt:now }, en:null, ja:null }
    },
    {
      id: uid(), list: 'binder', title: 'Mew ex', quantity: 1, condition: 'NM', finish: 'holo', purchasePrice: '', notes: '', createdAt: now,
      variants: { de:null, en:{ language:'en', cardId:'sv04.5-232', name:'Mew ex', setName:'Paldean Fates', setId:'sv04.5', localId:'232', rarity:'Special illustration rare', image:'https://assets.tcgdex.net/en/sv/sv04.5/232', pricing:null, priceUpdated:null, cardmarketLink:'', fetchedAt:now }, ja:null }
    },
    {
      id: uid(), list: 'wishlist', title: 'Glurak', quantity: 1, condition: 'NM', finish: 'holo', purchasePrice: '', notes: 'Auf Flohmärkten prüfen', createdAt: now,
      variants: { de:{ language:'de', cardId:'base1-4', name:'Glurak', setName:'Grundset', setId:'base1', localId:'4', rarity:'Selten', image:'https://assets.tcgdex.net/de/base/base1/4', pricing:null, priceUpdated:null, cardmarketLink:'', fetchedAt:now }, en:null, ja:null }
    }
  ];
  state.data.collection.unshift(...demos);
  saveData();
  toast('Beispielkarten hinzugefügt. Preise können jetzt synchronisiert werden.');
  navigate('binder');
}

function toast(message) {
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  clearTimeout(toastRoot._timer);
  toastRoot._timer = setTimeout(() => { toastRoot.innerHTML = ''; }, 2600);
}

function closeModal() {
  modalRoot.innerHTML = '';
  modalRoot.removeAttribute('data-card');
}

bottomNav.addEventListener('click', (event) => {
  const button = event.target.closest('[data-route]');
  if (!button) return;
  state.attachContext = null;
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
    refreshItem(item).then(() => { saveData(); renderDetail(); toast('Preise aktualisiert.'); }).catch(() => toast('Aktualisierung fehlgeschlagen.'));
  } else {
    syncAllPrices(state.route === 'wishlist' ? 'wishlist' : 'binder');
  }
});

main.addEventListener('click', (event) => {
  const target = event.target;
  const routeButton = target.closest('[data-empty-route]');
  if (routeButton) {
    if (routeButton.dataset.emptyRoute === 'sample-search') {
      state.searchQuery = 'Pikachu';
      performSearch('Pikachu');
    } else navigate(routeButton.dataset.emptyRoute);
    return;
  }
  if (target.closest('[data-go-search]')) return navigate('search');
  const openCard = target.closest('[data-open-card]');
  if (openCard) return navigate('detail', openCard.dataset.openCard);
  if (target.closest('[data-sync-list]')) return syncAllPrices(state.route === 'wishlist' ? 'wishlist' : 'binder');

  const searchLang = target.closest('[data-search-lang]');
  if (searchLang) {
    state.searchLang = searchLang.dataset.searchLang;
    state.searchResults = [];
    renderSearch();
    if (state.searchQuery.trim().length >= 2) performSearch(state.searchQuery);
    return;
  }
  if (target.closest('[data-clear-search]')) {
    state.searchQuery = '';
    state.searchResults = [];
    return renderSearch();
  }
  if (target.closest('[data-cancel-attach]')) {
    const id = state.attachContext?.itemId;
    state.attachContext = null;
    return navigate('detail', id);
  }
  const result = target.closest('[data-search-result]');
  if (result) return openSearchPreview(result.dataset.searchResult);

  const detailLang = target.closest('[data-detail-lang]');
  if (detailLang) {
    state.detailLang = detailLang.dataset.detailLang;
    return renderDetail();
  }
  const attachLang = target.closest('[data-attach-lang], [data-replace-lang]');
  if (attachLang) return beginAttach(attachLang.dataset.attachLang || attachLang.dataset.replaceLang);
  const removeLang = target.closest('[data-remove-lang]');
  if (removeLang) return removeLanguage(removeLang.dataset.removeLang);
  const openLink = target.closest('[data-open-cardmarket]');
  if (openLink) return openCardmarket(openLink.dataset.openCardmarket);
  if (target.closest('[data-refresh-item]')) {
    const item = getItem(state.selectedId);
    if (!item) return;
    toast('Preise werden aktualisiert …');
    return refreshItem(item).then(() => { saveData(); renderDetail(); toast('Preise aktualisiert.'); }).catch(() => toast('Aktualisierung fehlgeschlagen.'));
  }
  if (target.closest('[data-move-item]')) return moveItem();
  if (target.closest('[data-delete-item]')) return deleteItem();
  if (target.closest('[data-export-single]')) return exportSingle();

  if (target.closest('[data-export-all]')) return exportAll();
  if (target.closest('[data-import-all]')) return importAll();
  if (target.closest('[data-persist-storage]')) return persistStorage();
  if (target.closest('[data-load-demo]')) return loadDemo();
  if (target.closest('[data-clear-all]')) {
    if (!confirm('Wirklich alle BinderDex-Daten auf diesem Gerät löschen?')) return;
    state.data = defaultData();
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
    searchTimer = setTimeout(() => performSearch(target.value), 420);
  }
  if (target.id === 'collectionFilter') {
    if (state.route === 'binder') state.collectionFilter = target.value;
    else state.wishlistFilter = target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderCollection(state.route === 'wishlist' ? 'wishlist' : 'binder'), 160);
  }
  if (target.matches('[data-item-field]')) updateItemField(target.dataset.itemField, target.value);
  if (target.matches('[data-cardmarket-link]')) updateCardmarketLink(target.dataset.cardmarketLink, target.value);
});

main.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-item-field]')) updateItemField(target.dataset.itemField, target.value);
  if (target.id === 'preferredLanguage') {
    state.data.settings.preferredLanguage = target.value;
    saveData();
    toast('Bevorzugte Sprache gespeichert.');
  }
});

modalRoot.addEventListener('click', (event) => {
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

render();

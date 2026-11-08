'use strict';

function createCountryMedia() {
 const radioGarden = 'https://radio.garden';
 const radioBrowser = 'https://www.radio-browser.info/';
 const famelack = 'https://famelack.com';
 const famelackData = 'https://raw.githubusercontent.com/famelack/famelack-data/main/tv/raw/countries/';
 const locationsSource = 'https://github.com/iptv-org/database/blob/6321df850d653f192ca61f9d521e5f6bb0c9a320/data/channels.csv';
 const missingCodes = {
  Brunei:'BN', 'Cape Verde':'CV', 'Falkland Islands':'FK', 'Pitcairn Islands':'PN', Macau:'MO',
  Russia:'RU', 'Saint Helena':'SH', 'São Tomé and Príncipe':'ST', Turkey:'TR'
 };
 const sharedCatalogues = {
  'Gaza Strip':'Palestina', 'West Bank':'Palestina', 'Ireland Northern':'Regno Unito',
  Scotland:'Regno Unito', Wales:'Regno Unito', 'Jan Mayen':'Svalbard e Jan Mayen'
 };
 const italianPlaces = {
  Florence:'Firenze', Genoa:'Genova', Milan:'Milano', Naples:'Napoli', Padua:'Padova',
  Rome:'Roma', Turin:'Torino', Venice:'Venezia', London:'Londra', Paris:'Parigi',
  Berlin:'Berlino', Madrid:'Madrid', Moscow:'Mosca', Beijing:'Pechino', Vienna:'Vienna'
 };
 const batchSize = 60;
 const sort = new Intl.Collator('it', {sensitivity:'base', numeric:true});
 const buttons = document.querySelectorAll('.fb-media-nav button');
 const panel = $('fbMedia');
 const filter = $('fbMediaFilter');
 const list = $('fbMediaList');
 const status = $('fbMediaStatus');
 const sources = $('fbMediaSources');
 const more = $('fbMediaMore');
 const retry = $('fbMediaRetry');
 const requests = new Map();
 let country, activeType, revision = 0;
 let entries = [], visible = batchSize, partial = false;

 async function fetchJSON(url, emptyOn404 = false) {
  const response = await fetch(url, {signal:AbortSignal.timeout(12000)});
  if (emptyOn404 && response.status === 404) return [];
  if (!response.ok) throw Error('HTTP ' + response.status);
  return response.json();
 }

 function cached(key, load) {
  if (!requests.has(key)) {
   requests.set(key, load().catch(error => {
    requests.delete(key);
    throw error;
   }));
  }
  return requests.get(key);
 }

 async function browserRadios(code) {
  const batch = 1000;
  for (const mirror of ['de1', 'nl1']) {
   try {
    const rows = [];
    for (let offset = 0; ; offset += batch) {
     const path = '/json/stations/bycountrycodeexact/' + code;
     const query = new URLSearchParams({hidebroken:'true', order:'name', limit:batch, offset});
     const page = await fetchJSON('https://' + mirror + '.api.radio-browser.info' + path + '?' + query);
     if (!Array.isArray(page)) throw Error('Catalogo radio non valido');
     rows.push(...page);
     if (page.length < batch) return rows;
    }
   } catch (error) {
    console.warn('Catalogo Radio Browser non disponibile su ' + mirror, error);
   }
  }
  throw Error('Radio Browser non raggiungibile');
 }

 function streamLink(value) {
  try {
   const url = new URL(value);
   if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {}
  return '';
 }

 async function loadRadios(code) {
  const [garden, browser] = await Promise.allSettled([
   cached('garden', () => fetchJSON('./data/radio-garden.json')),
   cached('radio:' + code, () => browserRadios(code))
  ]);
  const primary = garden.value?.[code];
  const rows = (primary?.stations || []).map(([name, place, path]) => ({
   name, place, href:radioGarden + path, preferred:true
  }));
  const primaryNames = new Set(rows.map(row => normalize(row.name)));
  const stations = new Set();
  const urls = new Set();
  for (const station of browser.value || []) {
   const name = station.name?.trim();
   const place = station.state?.trim();
   const original = streamLink(station.url);
   const href = original.startsWith('https:') ? original : streamLink(station.url_resolved) || original;
   if (!name || !href || primaryNames.has(normalize(name))) continue;
   const key = normalize(name) + '\n' + normalize(place || '');
   const url = original || href;
   if (stations.has(key) || urls.has(url)) continue;
   stations.add(key);
   urls.add(url);
   rows.push({name, place, href});
  }
  return {rows, path:primary?.path, partial:garden.status === 'rejected' || browser.status === 'rejected'};
 }

 async function loadTV(code) {
  const slug = (code === 'GB' ? 'UK' : code).toLowerCase();
  const path = '/tv/' + slug;
  const [catalogue, locations] = await Promise.allSettled([
   cached('tv:' + code, () => fetchJSON(famelackData + slug + '.json', true)),
   cached('tv-locations', () => fetchJSON('./data/tv-localita.json'))
  ]);
  if (!Array.isArray(catalogue.value)) return {rows:[], path, partial:true};
  const rows = catalogue.value.filter(channel => channel.name && typeof channel.nanoid === 'string'
   && /^[A-Za-z0-9_-]+$/.test(channel.nanoid))
   .map(channel => ({
    name:channel.name, place:channel.city || locations.value?.places?.[channel.nanoid],
    href:famelack + path + '/' + channel.nanoid
   }));
  return {rows, path, partial:false};
 }

 function link(label, href) {
  const anchor = document.createElement('a');
  anchor.textContent = label;
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
 }

 function setSources(type, path) {
  if (type === 'radio') {
   sources.replaceChildren('Fonti ', link('Radio Garden', radioGarden + (path || '/search')),
    ' e ', link('Radio Browser', radioBrowser), '.');
  } else {
   sources.replaceChildren('Fonte ', link('TV Garden (Famelack)', famelack + (path || '/tv')),
    '. Località da ', link('IPTV-org', locationsSource), ' quando disponibili.');
  }
 }

 function render(append = false) {
  const terms = normalize(filter.value).split(/\s+/).filter(Boolean);
  const matches = entries.filter(row => terms.every(term => row.search.includes(term)));
  if (!append) list.replaceChildren();
  const start = list.childElementCount;
  const content = document.createDocumentFragment();
  for (const row of matches.slice(start, visible)) {
   const item = document.createElement('li');
   item.className = 'fb-media-row';
   const info = document.createElement('div');
   const name = document.createElement('strong');
   name.textContent = row.name;
   const location = document.createElement('small');
   location.textContent = row.place ? (italianPlaces[row.place] || row.place) : country.name + ' · località non indicata';
   info.append(name, location);
   const action = activeType === 'radio' ? 'Ascolta' : 'Guarda';
   const anchor = link(action + ' ↗', row.href);
   anchor.className = 'btn';
   anchor.setAttribute('aria-label', action + ' ' + row.name + ' (si apre in un’altra scheda)');
   item.append(info, anchor);
   content.append(item);
  }
  list.append(content);
  more.hidden = matches.length <= visible;
  if (append && more.hidden) list.children[start]?.querySelector('a').focus();
  const count = matches.length;
  let message = count
   ? (more.hidden ? '' : list.childElementCount + ' di ') + count + (count === 1 ? ' emittente' : ' emittenti')
   : (terms.length ? 'Nessuna emittente corrisponde alla ricerca.' : 'Nessuna emittente trovata per questo Paese.');
  if (partial) message = entries.length ? message + ' · Una fonte è temporaneamente indisponibile.' :
   'Il catalogo non è disponibile. Verifica la connessione e riprova.';
  status.textContent = message;
 }

 function setView(type) {
  activeType = type;
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.media === type));
  panel.hidden = !type;
  $('fbArchive').hidden = Boolean(type);
  $('fbScroll').hidden = Boolean(type);
 }

 function showInfo() {
  revision++;
  setView(null);
  list.replaceChildren();
 }

 async function showMedia(type) {
  if (!country) return;
  const request = ++revision;
  const code = country.code;
  setView(type);
  panel.scrollTop = 0;
  const title = type === 'radio' ? 'Radio del Paese' : 'TV del Paese';
  $('fbMediaTitle').textContent = country.shared ? title + ' · ' + country.shared : title;
  setSources(type);
  list.replaceChildren();
  filter.value = '';
  filter.hidden = more.hidden = retry.hidden = true;
  status.textContent = 'Caricamento delle emittenti…';
  const result = code ? await (type === 'radio' ? loadRadios(code) : loadTV(code)) : {rows:[]};
  if (request !== revision) return;
  setSources(type, result.path);
  entries = result.rows.map(row => ({
   ...row, search:normalize([row.name, row.place, italianPlaces[row.place]].filter(Boolean).join(' '))
  })).sort((a, b) => Number(!!b.preferred) - Number(!!a.preferred) ||
   sort.compare(a.name, b.name) || sort.compare(a.place || '', b.place || ''));
  partial = result.partial;
  visible = batchSize;
  filter.hidden = !entries.length;
  retry.hidden = !partial;
  render();
 }

 for (const button of buttons) button.addEventListener('click', () => {
  if (activeType === button.dataset.media) showInfo();
  else showMedia(button.dataset.media);
 });
 $('fbMediaBack').addEventListener('click', () => {
  const button = [...buttons].find(item => item.dataset.media === activeType);
  showInfo();
  button?.focus();
 });
 filter.addEventListener('input', () => { visible = batchSize; render(); });
 more.addEventListener('click', () => { visible += batchSize; render(true); });
 retry.addEventListener('click', () => showMedia(activeType));

 return (place, iso) => {
  country = place ? {name:place[0], code:iso || missingCodes[place[1]], shared:sharedCatalogues[place[1]]} : null;
  showInfo();
 };
}

'use strict';

function createCountryMedia() {
 const famelack = 'https://famelack.com';
 const famelackCatalogue = 'https://github.com/famelack/famelack-data';
 const famelackData = 'https://raw.githubusercontent.com/famelack/famelack-data/main/';
 const locationsSource = 'https://github.com/iptv-org/database/blob/6321df850d653f192ca61f9d521e5f6bb0c9a320/data/channels.csv';
 const italianTvSites = new Map([
  ['rai 1','https://www.raiplay.it/dirette/rai1'],
  ['rai 2','https://www.raiplay.it/dirette/rai2'],
  ['rai 3','https://www.raiplay.it/dirette/rai3'],
  ['rai news 24','https://www.raiplay.it/dirette/rainews24'],
  ['la7','https://www.la7play.it/dirette/la7'],
  ['primocanale','https://www.primocanale.it/diretta.html']
 ]);
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
 const player = createCountryPlayer(panel, link);
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

 const countrySlug = code => code === 'GB' ? 'uk' : code.toLowerCase();

 function fetchFamelack(kind, slug) {
  return cached('famelack:' + kind + ':' + slug, async () => {
   const rows = await fetchJSON(famelackData + kind + '/raw/countries/' + slug + '.json', true);
   if (!Array.isArray(rows)) throw Error('Catalogo non valido');
   return rows;
  });
 }

 function streamSource(value, hls = false) {
  try {
   const url = new URL(value);
   if (url.protocol === 'https:' && !url.username && !url.password &&
    !/\.(m3u|pls|asx|xspf|mpd)$/i.test(url.pathname)) {
    return {url:url.href, hls:hls || /\.m3u8(?:[?#]|$)/i.test(url.href)};
   }
  } catch {}
  return null;
 }

 function catalogueStreams(channel) {
  const streams = channel.sources?.streams;
  return Array.isArray(streams) ? streams.map(url => streamSource(url)).filter(Boolean) : [];
 }

 function mergeStreams(first, second) {
  const unique = new Map();
  for (const stream of [...first, ...second]) {
   if (!stream) continue;
   const prior = unique.get(stream.url);
   if (!prior || stream.hls) unique.set(stream.url, stream);
  }
  return [...unique.values()];
 }

 async function loadRadios(code) {
  const [browser, catalogue] = await Promise.allSettled([
   cached('radio:' + code, () => browserRadios(code)),
   fetchFamelack('radio', countrySlug(code))
  ]);
  const stations = new Map();
  function byPlace(name) {
   const key = normalize(name);
   if (!stations.has(key)) stations.set(key, new Map());
   return stations.get(key);
  }
  for (const station of browser.value || []) {
   const name = station.name?.trim();
   if (!name) continue;
   const place = station.state?.trim() || '';
   const key = normalize(italianPlaces[place] || place);
   const group = byPlace(name);
   const row = group.get(key) || {name, place, streams:[]};
   const hls = Number(station.hls) === 1;
   row.streams = mergeStreams(row.streams, [streamSource(station.url, hls), streamSource(station.url_resolved, hls)]);
   group.set(key, row);
  }
  for (const station of catalogue.value || []) {
   const name = station.name?.trim();
   const streams = catalogueStreams(station);
   if (!name || !streams.length) continue;
   const group = byPlace(name);
   const candidates = [...group.values()];
   // Collega i cataloghi tramite lo stesso flusso, oppure tramite un nome univoco nel Paese.
   const matched = candidates.find(row => row.streams.some(known => streams.some(stream => stream.url === known.url)))
    || (candidates.length === 1 ? candidates[0] : group.get(''));
   if (matched) matched.streams = mergeStreams(streams, matched.streams);
   else group.set('', {name, place:station.city, streams});
  }
  const rows = [...stations.values()].flatMap(group => [...group.values()]).filter(row => row.streams.length);
  return {rows, partial:browser.status === 'rejected' || catalogue.status === 'rejected'};
 }

 async function loadTV(code) {
  const slug = countrySlug(code);
  const path = '/tv/' + slug;
  const [catalogue, locations] = await Promise.allSettled([
   fetchFamelack('tv', slug),
   cached('tv-locations', () => fetchJSON('./data/tv-localita.json'))
  ]);
  if (!Array.isArray(catalogue.value)) return {rows:[], partial:true};
  const rows = catalogue.value.filter(channel => channel.name && typeof channel.nanoid === 'string'
   && /^[A-Za-z0-9_-]+$/.test(channel.nanoid))
   .map(channel => ({
    name:channel.name, place:channel.city || locations.value?.places?.[channel.nanoid],
    href:famelack + path + '/' + channel.nanoid,
    official:code === 'IT' ? italianTvSites.get(normalize(channel.name)) : undefined,
    streams:catalogueStreams(channel).filter(stream => stream.hls),
    youtube:Array.isArray(channel.sources?.youtube) ? channel.sources.youtube.map(youtubeId).filter(Boolean) : []
   }));
  return {rows, partial:false};
 }

 function link(label, href) {
  const anchor = document.createElement('a');
  anchor.textContent = label;
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
 }

 function setSources(type) {
  if (type === 'radio') {
   sources.textContent = 'Cataloghi Radio Browser e Famelack.';
  } else {
   sources.replaceChildren('Fonte ', link('Catalogo TV Garden (Famelack)', famelackCatalogue),
    '. Località da ', link('IPTV-org', locationsSource), ' quando disponibili.');
  }
 }

 function rowAction(row) {
  const type = activeType;
  const label = type === 'radio' ? 'Ascolta' : 'Guarda';
  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = label;
  action.setAttribute('aria-label', label + ' ' + row.name);
  action.addEventListener('click', () => player.open(row, action, type));
  return action;
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
   const action = rowAction(row);
   action.className = 'btn';
   item.append(info, action);
   content.append(item);
  }
  list.append(content);
  more.hidden = matches.length <= visible;
  if (append && more.hidden) list.children[start]?.querySelector('.btn')?.focus();
  const count = matches.length;
  let message = count
   ? (more.hidden ? '' : list.childElementCount + ' di ') + count + (count === 1 ? ' emittente' : ' emittenti')
   : (terms.length ? 'Nessuna emittente corrisponde alla ricerca.' : 'Nessuna emittente trovata per questo Paese.');
  if (partial) message = entries.length ? message + ' · Una fonte è temporaneamente indisponibile.' :
   'Il catalogo non è disponibile. Verifica la connessione e riprova.';
  status.textContent = message;
 }

 function setView(type) {
  player.close();
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
  entries = result.rows.map(row => ({
   ...row, search:normalize([row.name, row.place, italianPlaces[row.place]].filter(Boolean).join(' '))
  })).sort((a, b) => sort.compare(a.name, b.name) || sort.compare(a.place || '', b.place || ''));
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

function youtubeId(url) {
 return typeof url === 'string'
  ? /^https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]{11})(?:[?#]|$)/.exec(url)?.[1] : undefined;
}

function createSleepTimer(panel, onExpire) {
 const form = $('fbTimerForm');
 const minutes = $('fbTimerMinutes');
 const state = $('fbTimerState');
 const remaining = $('fbTimerRemaining');
 const message = $('fbTimerMessage');
 let deadline = 0, nextTick;

 function disarm() {
  deadline = 0;
  clearTimeout(nextTick);
  state.hidden = true;
 }

 function expireIfDue(now = Date.now()) {
  if (!deadline || now < deadline) return false;
  disarm();
  onExpire();
  return true;
 }

 function update() {
  clearTimeout(nextTick);
  const now = Date.now();
  if (!deadline || expireIfDue(now)) return;
  const left = deadline - now;
  const seconds = Math.ceil(left / 1000);
  const totalMinutes = Math.floor(seconds / 60);
  const pad = value => String(value).padStart(2, '0');
  const time = totalMinutes < 60 ? String(totalMinutes) : Math.floor(totalMinutes / 60) + ':' + pad(totalMinutes % 60);
  remaining.textContent = time + ':' + pad(seconds % 60);
  nextTick = setTimeout(update, Math.min(1000, left));
 }

 function start(value) {
  const duration = Math.round(value * 60000);
  const end = Date.now() + duration;
  if (duration <= 0 || !Number.isSafeInteger(end)) {
   message.textContent = 'Inserisci una durata valida in minuti, per esempio 45.';
   return;
  }
  deadline = end;
  message.textContent = '';
  state.hidden = false;
  update();
 }

 for (const preset of panel.querySelectorAll('[data-minutes]')) {
  preset.addEventListener('click', () => start(Number(preset.dataset.minutes)));
 }
 form.addEventListener('submit', event => {
  event.preventDefault();
  const value = minutes.value.trim().replace(',', '.');
  start(/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) ? Number(value) : NaN);
 });
 $('fbTimerCancel').addEventListener('click', () => {
  disarm();
  message.textContent = 'Timer disattivato.';
  minutes.focus({preventScroll:true});
 });
 document.addEventListener('visibilitychange', update);
 window.addEventListener('pageshow', update);

 return {
  expireIfDue,
  reset() {
   disarm();
   minutes.value = '';
   message.textContent = '';
  }
 };
}

function createCountryPlayer(panel, link) {
 const directory = $('fbMediaDirectory');
 const player = $('fbPlayer');
 const title = $('fbPlayerTitle');
 const back = $('fbPlayerBack');
 const viewport = $('fbPlayerViewport');
 const status = $('fbPlayerStatus');
 const links = $('fbPlayerLinks');
 const retry = $('fbPlayerRetry');
 const timerPanel = $('fbPlayerTimer');
 let opener, directoryScroll, hlsScript;
 let stopStream = () => {};
 const sleepTimer = createSleepTimer(timerPanel, () => {
  const focusedTimer = timerPanel.contains(document.activeElement);
  stopPlayback();
  timerPanel.hidden = true;
  status.textContent = 'Riproduzione terminata allo scadere del timer.';
  retry.textContent = 'Riproduci di nuovo';
  retry.hidden = false;
  if (focusedTimer) retry.focus({preventScroll:true});
 });

 function loadHls() {
  if (!hlsScript) {
   hlsScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './vendor/hls-1.7.1.min.js';
    const fail = () => {
     clearTimeout(timer);
     script.remove();
     reject(Error('Lettore HLS non disponibile'));
    };
    const timer = setTimeout(fail, 10000);
    script.onerror = fail;
    script.onload = () => {
     clearTimeout(timer);
     if (window.Hls) resolve(window.Hls);
     else fail();
    };
    document.head.append(script);
   }).catch(error => {
    hlsScript = null;
    throw error;
   });
  }
  return hlsScript;
 }

 function stopPlayback() {
  stopStream();
  stopStream = () => {};
  viewport.replaceChildren();
 }

 function close(restoreFocus = false) {
  if (player.hidden) return;
  sleepTimer.reset();
  stopPlayback();
  links.replaceChildren();
  retry.onclick = null;
  player.hidden = true;
  directory.hidden = false;
  panel.setAttribute('aria-labelledby', 'fbMediaTitle');
  if (restoreFocus) {
   panel.scrollTop = directoryScroll;
   opener?.focus({preventScroll:true});
  }
  opener = null;
 }

 function open(row, button, type) {
  close();
  const isRadio = type === 'radio';
  opener = button;
  directoryScroll = panel.scrollTop;
  directory.hidden = true;
  title.textContent = row.name;
  back.textContent = isRadio ? '← Elenco radio' : '← Elenco TV';
  player.hidden = false;
  panel.setAttribute('aria-labelledby', 'fbPlayerTitle');
  panel.scrollTop = 0;
  back.focus({preventScroll:true});

  function addLink(label, href) {
   const anchor = link(label + ' ↗', href);
   anchor.className = 'btn';
   links.append(anchor);
  }
  links.hidden = true;
  if (!isRadio) {
   if (row.official) addLink('Diretta sul sito dell’emittente', row.official);
   if (row.youtube.length) addLink('Apri su YouTube', 'https://www.youtube.com/watch?v=' + row.youtube[0]);
   if (!links.childElementCount) {
    if (row.streams.length) addLink('Link al flusso HLS', row.streams[0].url);
    else addLink('Pagina del canale su Famelack', row.href);
   }
   links.hidden = !row.official && !row.youtube.length;
  }

  const options = [...row.streams, ...(row.youtube || []).map(id => ({id}))];
  function trySource(index) {
   if (sleepTimer.expireIfDue()) return;
   timerPanel.hidden = false;
   retry.hidden = true;
   retry.textContent = '↻ Riprova';
   viewport.replaceChildren();
   const source = options[index];
   if (!source) {
    if (isRadio) {
     status.textContent = 'Diretta radio momentaneamente non disponibile.';
     retry.hidden = false;
    } else {
     links.hidden = false;
     status.textContent = 'Diretta non disponibile nel lettore. Puoi aprire il collegamento qui sotto.';
    }
    return;
   }
   if (source.id) {
    const frame = document.createElement('iframe');
    frame.title = 'Diretta di ' + row.name;
    frame.src = 'https://www.youtube-nocookie.com/embed/' + source.id + '?autoplay=1&playsinline=1';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    viewport.append(frame);
    status.textContent = 'Diretta YouTube';
    return;
   }

   const media = document.createElement(isRadio ? 'audio' : 'video');
   media.controls = true;
   if (!isRadio) media.setAttribute('playsinline', '');
   media.preload = 'auto';
   media.setAttribute('aria-label', 'Diretta di ' + row.name);
   viewport.append(media);
   status.textContent = 'Caricamento della diretta…';
   let cancelled = false, hls;
   const stop = () => {
    cancelled = true;
    clearTimeout(timer);
    hls?.destroy();
    media.pause();
    media.removeAttribute('src');
    media.load();
   };
   stopStream = stop;
   const fail = () => {
    if (cancelled) return;
    stop();
    stopStream = () => {};
    trySource(index + 1);
   };
   const timer = setTimeout(fail, 18000);
   const play = () => {
    if (!cancelled && !sleepTimer.expireIfDue()) media.play().catch(() => {});
   };
   media.addEventListener('error', fail);
   media.addEventListener('timeupdate', () => { if (!cancelled) sleepTimer.expireIfDue(); });
   media.addEventListener('canplay', () => {
    if (cancelled || sleepTimer.expireIfDue()) return;
    clearTimeout(timer);
    if (media.paused) status.textContent = 'Premi Riproduci per avviare la diretta.';
   });
   media.addEventListener('playing', () => {
    if (cancelled || sleepTimer.expireIfDue()) return;
    clearTimeout(timer);
    status.textContent = 'In diretta';
   });
   if (!source.hls || media.canPlayType('application/vnd.apple.mpegurl')) {
    media.src = source.url;
    play();
    return;
   }
   loadHls().then(Hls => {
    if (cancelled || sleepTimer.expireIfDue()) return;
    if (!Hls.isSupported()) return fail();
    hls = new Hls({capLevelToPlayerSize:!isRadio});
    hls.on(Hls.Events.MEDIA_ATTACHED, play);
    hls.on(Hls.Events.ERROR, (_event, details) => { if (details.fatal) fail(); });
    hls.loadSource(source.url);
    hls.attachMedia(media);
   }).catch(fail);
  }
  retry.onclick = () => trySource(0);
  trySource(0);
 }

 back.addEventListener('click', () => close(true));
 return {open, close};
}

'use strict';

const MEDIA_LANGUAGE_NAMES = {
 it:'Italiano',ita:'Italiano',italian:'Italiano',
 en:'Inglese',eng:'Inglese',english:'Inglese',
 fr:'Francese',fra:'Francese',fre:'Francese',french:'Francese',
 de:'Tedesco',deu:'Tedesco',ger:'Tedesco',german:'Tedesco',
 es:'Spagnolo',spa:'Spagnolo',spanish:'Spagnolo',
 pt:'Portoghese',por:'Portoghese',portuguese:'Portoghese',
 ru:'Russo',rus:'Russo',russian:'Russo',zh:'Cinese',zho:'Cinese',chi:'Cinese',
 ja:'Giapponese',jpn:'Giapponese',ar:'Arabo',ara:'Arabo',
 nl:'Olandese',nld:'Olandese',dut:'Olandese',el:'Greco',ell:'Greco',gre:'Greco',
 tr:'Turco',tur:'Turco',hi:'Hindi',hin:'Hindi',ko:'Coreano',kor:'Coreano',
 pl:'Polacco',pol:'Polacco',uk:'Ucraino',ukr:'Ucraino',he:'Ebraico',heb:'Ebraico',
 ro:'Rumeno',ron:'Rumeno',sv:'Svedese',swe:'Svedese',da:'Danese',dan:'Danese',
 no:'Norvegese',nor:'Norvegese',fi:'Finlandese',fin:'Finlandese',
 cs:'Ceco',ces:'Ceco',cze:'Ceco',hu:'Ungherese',hun:'Ungherese'
};
function mediaLanguage(raw) {
 if (!raw) return '';
 const values = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/[,;|]/) : []);
 const translated=values.map(v => {
  const value=String(v||'').trim();if(!value)return '';
  const code=value.toLowerCase().replace(/_/g,'-');
  if(MEDIA_LANGUAGE_NAMES[code])return MEDIA_LANGUAGE_NAMES[code];
  if(/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(code)){
   try{
    const label=new Intl.DisplayNames(['it'],{type:'language'}).of(code);
    if(label&&label.toLowerCase()!==code)return label.charAt(0).toLocaleUpperCase('it')+label.slice(1);
   }catch{}
  }
  return value.charAt(0).toLocaleUpperCase('it')+value.slice(1);
 }).filter(Boolean);
 return [...new Set(translated)].join(', ');
}
const MEDIA_FAVORITES_KEY='terra3d-media-favorites-v1';
const MEDIA_VOLUME_KEY='terra3d-media-volume-v1';
function readMediaFavorites(){
 try{
  const rows=JSON.parse(localStorage.getItem(MEDIA_FAVORITES_KEY)||'[]');
  if(!Array.isArray(rows))return new Map();
  const valid=rows.filter(row=>row&&typeof row.name==='string'&&typeof row.key==='string'
   &&['radio','tv'].includes(row.kind)&&Array.isArray(row.streams)).slice(0,250);
  return new Map(valid.map(row=>[row.key,row]));
 }catch{return new Map();}
}
function mediaStationKey(row,type){
 const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().trim().replace(/\s+/g,' ');
 return [type,row.countryCode||'',norm(row.name),norm(row.place)].join('|');
}
function createCountryMedia() {
 const famelack = 'https://famelack.com';
 const famelackCatalogue = 'https://github.com/famelack/famelack-data';
 const famelackData = 'https://raw.githubusercontent.com/famelack/famelack-data/main/';
 const iptvOrgCatalogue = 'https://github.com/iptv-org/iptv';
 const iptvOrgCountryBase = 'https://iptv-org.github.io/iptv/countries/';
 const freeTVCatalogue = 'https://github.com/Free-TV/IPTV';
 const freeTVItalyPlaylist = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_italy.m3u8';
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
 const catalogueCache='terra3d-media-catalogues-v1';
 const favorites=readMediaFavorites();
 let country, activeType, revision = 0;
 const isFavorite=row=>favorites.has(row.key||mediaStationKey(row,row.kind||activeType));
 function syncFavoritesButton(){
  const button=[...buttons].find(item=>item.dataset.media==='favorites');
  if(button)button.textContent='★ Preferiti'+(favorites.size?' ('+favorites.size+')':'');
 }
 function toggleFavorite(row){
  const kind=row.kind||activeType,key=row.key||mediaStationKey(row,kind);
  if(favorites.has(key))favorites.delete(key);
  else{
   if(favorites.size>=250){status.textContent='Puoi salvare al massimo 250 preferiti.';return;}
   favorites.set(key,{key,kind,name:row.name,place:row.place||'',
    countryCode:row.countryCode||country?.code||'',countryName:row.countryName||country?.name||'',
    language:row.language||'',href:row.href||'',official:row.official||'',
    streams:(row.streams||[]).slice(0,16),youtube:(row.youtube||[]).slice(0,8),sources:row.sources||[]});
  }
  try{localStorage.setItem(MEDIA_FAVORITES_KEY,JSON.stringify([...favorites.values()]));}
  catch{status.textContent='Impossibile salvare i preferiti nel dispositivo.';}
  syncFavoritesButton();
  if(activeType==='favorites'){
   entries=[...favorites.values()].map(prepareRow).sort((a,b)=>sort.compare(a.name,b.name));
   visible=Math.max(batchSize,visible);render();
  }else if(activeType)render();
  player.refreshFavorite();
 }
 const player=createCountryPlayer(panel,link,{isFavorite,toggleFavorite});
 syncFavoritesButton();
 let entries = [], visible = batchSize, partial = false, savedCatalogue = false;

 async function fetchJSON(url, emptyOn404 = false) {
  const response = await fetch(url, {signal:AbortSignal.timeout(12000),cache:'no-cache'});
  if (emptyOn404 && response.status === 404) return [];
  if (!response.ok) throw Error('HTTP ' + response.status);
  return response.json();
 }

 function cached(key, load) {
  let entry=requests.get(key);
  if (!entry || Date.now()-entry.time>120000) {
   entry={time:Date.now()};
   entry.promise=load().catch(error => {
    if(requests.get(key)===entry)requests.delete(key);
    throw error;
   });
   requests.set(key,entry);
  }
  return entry.promise;
 }

 // Conserva l'ultimo elenco valido della singola fonte, senza trattare un guasto come una rimozione.
 async function catalogueWithFallback(key, load) {
  const url=new URL('./_media-catalogue/'+encodeURIComponent(key)+'.json',document.baseURI).href;
  async function savedRows(){
   if(window.caches)try{
    const response=await(await window.caches.open(catalogueCache)).match(url);
    const saved=response?await response.json():null;
    if(Array.isArray(saved?.rows)&&saved.rows.length)return {rows:saved.rows,stale:true};
   }catch{}
   return null;
  }
  try {
   const rows=await load();
   if(!Array.isArray(rows))throw Error('Catalogo non valido');
   if(!rows.length){const saved=await savedRows();if(saved)return saved;}
   if(rows.length && window.caches)try{
    const cache=await window.caches.open(catalogueCache);
    await cache.put(url,new Response(JSON.stringify({savedAt:Date.now(),rows}),{
     headers:{'Content-Type':'application/json'}
    }));
   }catch{}
   return {rows,stale:false};
  }catch(error){
   const saved=await savedRows();
   if(saved)return saved;
   throw error;
  }
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
   const rows = await fetchJSON(famelackData + kind + '/countries/' + slug + '.json', true);
   if (!Array.isArray(rows)) throw Error('Catalogo non valido');
   if(rows.length&&!rows.some(row=>row&&typeof row.name==='string'&&
    (kind!=='tv'||typeof row.nanoid==='string')))throw Error('Formato del catalogo non riconosciuto');
   if (!rows.length) {
    const countries = await cached('famelack-countries:' + kind,
     () => fetchJSON(famelackData + kind + '/countries_metadata.json'));
    if (countries[slug.toUpperCase()]?.channelCount > 0) throw Error('Catalogo del Paese temporaneamente non disponibile');
   }
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


 // IPTV-org e Free-TV: una playlist per il solo Paese richiesto, senza scaricare il mondo intero.
 function parseTVPlaylist(text, origin) {
  if (!text.trimStart().startsWith('#EXTM3U')) throw Error('Playlist M3U non valida');
  const rows = [];
  let pending = null;
  for (const raw of text.split(/\r?\n/)) {
   const line = raw.trim();
   if (line.startsWith('#EXTINF:')) {
    const attr = key => {
     const found = new RegExp('(?:^|\\s)' + key + '="([^"]*)"', 'i').exec(line);
     return found ? found[1].trim() : '';
    };
    // La virgola del nome è la prima fuori dagli attributi tra virgolette.
    const separator=/^#EXTINF:(?:[^",]|"[^"]*")*,/.exec(line);
    const comma=separator?separator[0].length-1:-1;
    const name = (attr('tvg-name') || (comma >= 0 ? line.slice(comma + 1) : ''))
     .replace(/\s*[ⒼⓉⓎ]\s*$/u, '').trim();
    pending = name ? {
     name, place:'', language:mediaLanguage(attr('tvg-language')),
     tvgId:attr('tvg-id'), streams:[],youtube:[],sources:[origin]
    } : null;
   } else if (line && !line.startsWith('#') && pending) {
    const stream = streamSource(line);
    const videoId=youtubeId(line);
    // Evita siti HTML, flussi HTTP bloccati dai browser e formati non supportati.
    if (stream && (stream.hls || /\.(?:mp4|webm)(?:[?#]|$)/i.test(stream.url))) {
     pending.streams = [stream];
     rows.push(pending);
    }else if(videoId){
     pending.youtube=[videoId];
     rows.push(pending);
    }
    pending = null;
   }
  }
  return rows;
 }

 function fetchTVPlaylist(url, origin) {
  return cached('tv-playlist:' + url, async () => {
   const response = await fetch(url, {signal:AbortSignal.timeout(14000), cache:'no-cache'});
   if (response.status === 404) return [];
   if (!response.ok) throw Error('Playlist non raggiungibile: HTTP ' + response.status);
   const text = await response.text();
   if (text.length > 4000000) throw Error('Playlist troppo grande');
   return parseTVPlaylist(text, origin);
  });
 }

 function tvKey(name) {
  let key = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
   .toLocaleLowerCase().replace(/\s*[ⒼⓉⓎ]\s*$/u, '')
   .replace(/\s*\[(?:not\s*24\/7|geo-blocked)\]/gi,'')
   .replace(/\s*\(\d{3,4}p(?:\d+)?\)/gi,'')
   .replace(/[^\p{L}\p{N}]/gu, '');
  if (['telenordgenova','telenordtv','telenorditaly'].includes(key)) key = 'telenord';
  if (key === 'teleliguriasudtls') key = 'teleliguriasud';
  return key;
 }

 function mergeTVEntries(collections) {
  const rows = [], byName = new Map(), byId = new Map();
  for (const group of collections) for (const incoming of group) {
   if (!incoming || !incoming.name) continue;
   const nameKey = tvKey(incoming.name);
   const streams = Array.isArray(incoming.streams) ? incoming.streams : [];
   const id=String(incoming.tvgId||'').toLowerCase().replace(/@(?:sd|hd|fhd|uhd|4k)$/,'');
   // Un URL condiviso non identifica un'emittente: i canali restano ricercabili separatamente.
   const matched=(id?byId.get(id):null)||(nameKey?byName.get(nameKey):null);
   let row;
   if (matched) {
    row = matched;
    row.streams = mergeStreams(row.streams, streams);
    row.youtube = [...new Set([...(row.youtube || []), ...(incoming.youtube || [])])];
    row.sources = [...new Set([...(row.sources || []), ...(incoming.sources || [])])];
    if (!row.place && incoming.place) row.place = incoming.place;
    if (!row.language && incoming.language) row.language = incoming.language;
    if (!row.official && incoming.official) row.official = incoming.official;
    if (!row.href && incoming.href) row.href = incoming.href;
   } else {
    row = {...incoming, streams:mergeStreams([], streams),
     youtube:[...(incoming.youtube || [])],sources:[...(incoming.sources || [])]};
    rows.push(row);
   }
   row.aliases=[...new Set([...(row.aliases||[]),...(incoming.aliases||[]),incoming.name])];
   if (nameKey === 'telenord') row.name = 'Telenord';
   if (nameKey) byName.set(nameKey,row);
   if(id)byId.set(id,row);
  }
  return rows;
 }

 const additionalTV = [
  {name:'Telenord',place:'Genova',language:'Italiano',official:'https://telenord.it/diretta-streaming',
   streams:[streamSource('https://64b16f23efbee.streamlock.net/telenord/telenord/playlist.m3u8'),
    streamSource('https://5db313b643fd8.streamlock.net/Telenord/Telenord/playlist.m3u8')]},
  {name:'TeleGenova',place:'Genova',language:'Italiano',official:'https://telegenova.it/canali/telegenova/',
   streams:[streamSource('https://64b16f23efbee.streamlock.net/telegenova/telegenova/playlist.m3u8')]},
  {name:'Primocanale',place:'Genova',language:'Italiano',official:'https://www.primocanale.it/diretta.html',
   streams:[streamSource('https://msh0203.stream.seeweb.it/live/flv:stream2.sdp/playlist.m3u8')]},
  {name:'Entella TV',place:'Lavagna',language:'Italiano',streams:[]},
  {name:'Tele Liguria Sud',place:'La Spezia',language:'Italiano',streams:[]}
 ].map(row => ({...row,streams:row.streams.filter(Boolean),youtube:[],sources:['Siti delle emittenti']}));

 async function loadRadios(code) {
  const [browser, catalogue] = await Promise.allSettled([
   catalogueWithFallback('radio-browser:'+code,()=>cached('radio:' + code, () => browserRadios(code))),
   catalogueWithFallback('famelack-radio:'+code,()=>fetchFamelack('radio', countrySlug(code)))
  ]);
  const stations = new Map();
  function byPlace(name) {
   const key = normalize(name);
   if (!stations.has(key)) stations.set(key, new Map());
   return stations.get(key);
  }
  for (const station of browser.value?.rows || []) {
   const name = station.name?.trim();
   if (!name) continue;
   const place = station.state?.trim() || '';
   const key = normalize(italianPlaces[place] || place);
   const group = byPlace(name);
   const row = group.get(key) || {name, place, streams:[], language:''};
   if(!row.language)row.language=mediaLanguage(station.languagecodes||station.language);
   const hls = Number(station.hls) === 1;
   row.streams = mergeStreams(row.streams, [streamSource(station.url, hls), streamSource(station.url_resolved, hls)]);
   group.set(key, row);
  }
  for (const station of catalogue.value?.rows || []) {
   const name = station.name?.trim();
   const streams = catalogueStreams(station);
   if (!name || !streams.length) continue;
   const group = byPlace(name);
   const candidates = [...group.values()];
   // Collega i cataloghi tramite lo stesso flusso, oppure tramite un nome univoco nel Paese.
   const matched = candidates.find(row => row.streams.some(known => streams.some(stream => stream.url === known.url)))
    || (candidates.length === 1 ? candidates[0] : group.get(''));
   const language=mediaLanguage(station.languagecodes||station.languages||station.language);
   if(matched){
    matched.streams=mergeStreams(streams,matched.streams);
    if(!matched.language)matched.language=language;
   }else group.set('', {name,place:station.city,streams,language});
  }
  const rows = [...stations.values()].flatMap(group => [...group.values()]).filter(row => row.streams.length);
  const stale=Boolean(browser.value?.stale||catalogue.value?.stale);
  return {rows,stale,partial:stale||browser.status === 'rejected' || catalogue.status === 'rejected'};
 }

 async function loadTV(code) {
  const slug = countrySlug(code);
  const [catalogue, locations, iptvOrg, freeTV] = await Promise.allSettled([
   catalogueWithFallback('famelack-tv:'+code,()=>fetchFamelack('tv', slug)),
   cached('tv-locations', () => fetchJSON('./data/tv-localita.json')),
   catalogueWithFallback('iptv-tv:'+code,()=>fetchTVPlaylist(iptvOrgCountryBase + slug + '.m3u', 'IPTV-org')),
   code === 'IT' ? catalogueWithFallback('free-tv:'+code,()=>fetchTVPlaylist(freeTVItalyPlaylist, 'Free-TV')) : Promise.resolve({rows:[]})
  ]);
  const previous = Array.isArray(catalogue.value?.rows) ? catalogue.value.rows.filter(channel =>
   channel.name && typeof channel.nanoid === 'string' && /^[A-Za-z0-9_-]+$/.test(channel.nanoid))
   .map(channel => ({
    name:channel.name,place:channel.city || locations.value?.places?.[channel.nanoid],
    language:mediaLanguage(channel.languagecodes||channel.languages||channel.language||channel.lang),
    href:famelack + '/tv/' + slug + '/' + channel.nanoid,
    official:code === 'IT' ? italianTvSites.get(normalize(channel.name)) : undefined,
    streams:catalogueStreams(channel).filter(stream => stream.hls),
    youtube:Array.isArray(channel.sources?.youtube) ? channel.sources.youtube.map(youtubeId).filter(Boolean) : [],
    sources:['Famelack']
   })) : [];
  const rows = mergeTVEntries([
   code === 'IT' ? additionalTV : [], previous, iptvOrg.value?.rows || [], freeTV.value?.rows || []
  ]);
  const stale=Boolean(catalogue.value?.stale||iptvOrg.value?.stale||freeTV.value?.stale);
  return {rows,stale,partial:stale||catalogue.status==='rejected'||iptvOrg.status==='rejected'
   ||(code==='IT'&&freeTV.status==='rejected')};
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
  if(type==='favorites'){
   sources.textContent='I preferiti sono salvati soltanto su questo dispositivo e restano disponibili anche scegliendo un altro Paese.';
  }else if(type==='radio'){
   sources.textContent='Cataloghi Radio Browser e Famelack. La lingua è indicata quando fornita dalla fonte.';
  }else{
   sources.replaceChildren('Cataloghi ', link('Famelack', famelackCatalogue),
    ', ', link('IPTV-org', iptvOrgCatalogue),
    ...(country?.code === 'IT' ? [', ', link('Free-TV Italia', freeTVCatalogue)] : []),
    '. Località integrate da ', link('IPTV-org', locationsSource), '.');
  }
 }

 function prepareRow(row){
  const kind=row.kind||activeType, countryCode=row.countryCode||country?.code||'',
   countryName=row.countryName||country?.name||'';
  const key=row.key||mediaStationKey({...row,countryCode},kind);
  return {...row,kind,countryCode,countryName,key,
   search:normalize([row.name,...(row.aliases||[]),row.name==='Telenord'?'Tele Nord Genova':'',row.place,italianPlaces[row.place],countryName,row.language,kind].filter(Boolean).join(' '))};
 }

 function refreshSavedFavorites(rows,type,code){
  let changed=false;
  for(const [key,saved] of favorites){
   if(saved.kind!==type||saved.countryCode!==code)continue;
   const candidates=rows.filter(row=>type==='tv'?tvKey(row.name)===tvKey(saved.name):
    normalize(row.name)===normalize(saved.name)&&normalize(row.place||'')===normalize(saved.place||''));
   if(candidates.length!==1)continue;
   const latest=candidates[0];
   const updated={...saved,streams:mergeStreams(latest.streams||[],saved.streams).slice(0,16),
    youtube:[...new Set([...(latest.youtube||[]),...(saved.youtube||[])])],
    official:latest.official||saved.official,href:latest.href||saved.href,
    language:latest.language||saved.language,sources:latest.sources||saved.sources};
   if(JSON.stringify(saved)!==JSON.stringify(updated)){favorites.set(key,updated);changed=true;}
  }
  if(changed)try{localStorage.setItem(MEDIA_FAVORITES_KEY,JSON.stringify([...favorites.values()]));}catch{}
 }
 function rowAction(row) {
  const type = row.kind||activeType;
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
   const info = document.createElement('div');info.className='fb-media-info';
   const name = document.createElement('strong');
   name.textContent = row.name;
   const location = document.createElement('small');
   const origin=activeType==='favorites' ? row.countryName||row.countryCode : '';
   const where=row.place?(italianPlaces[row.place]||row.place):'Località non indicata';
   const mediaKind=row.kind||activeType;
   const streamInfo = mediaKind==='tv'
    ? (row.streams?.length ? 'Collegamenti stream: '+row.streams.length
     : row.youtube?.length ? 'Diretta YouTube' : 'Solo link esterno') : '';
   const sourceInfo=mediaKind==='tv'&&row.sources?.length?'Fonti: '+row.sources.join(', '):'';
   location.textContent=[origin,where,row.language?'Lingua: '+row.language:'',streamInfo,sourceInfo]
    .filter(Boolean).join(' · ');
   info.append(name,location);
   const actions=document.createElement('div');actions.className='fb-media-actions';
   const fav=document.createElement('button');fav.type='button';fav.className='btn fb-media-star';
   fav.setAttribute('aria-pressed',String(isFavorite(row)));
   fav.setAttribute('aria-label',(isFavorite(row)?'Rimuovi dai':'Aggiungi ai')+' preferiti: '+row.name);
   fav.title=isFavorite(row)?'Rimuovi dai preferiti':'Aggiungi ai preferiti';
   fav.textContent=isFavorite(row)?'★':'☆';
   fav.addEventListener('click',()=>toggleFavorite(row));
   const action=rowAction(row);action.className='btn';
   actions.append(fav,action);item.append(info,actions);
   content.append(item);
  }
  list.append(content);
  more.hidden = matches.length <= visible;
  if (append && more.hidden) list.children[start]?.querySelector('.btn')?.focus();
  const count = matches.length;
  let message = count
   ? (more.hidden ? '' : list.childElementCount + ' di ') + count + (count === 1 ? ' emittente' : ' emittenti')
   : (terms.length?'Nessuna emittente corrisponde alla ricerca.':
      activeType==='favorites'?'Nessun preferito salvato. Tocca ☆ accanto a una radio o una TV.':
      'Nessuna emittente trovata per questo Paese.');
  if (partial) message = entries.length ? message + ' · Una fonte è temporaneamente indisponibile.' :
   'Il catalogo non è disponibile. Verifica la connessione e riprova.';
  if(savedCatalogue)message+=' Sono presenti anche emittenti dell’ultimo elenco salvato. Aggiorna per riprovare.';
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
  const title=type==='favorites'?'Le mie radio e TV preferite':type==='radio'?'Radio del Paese':'TV del Paese';
  $('fbMediaTitle').textContent=type==='favorites'?title:(country.shared?title+' · '+country.shared:title);
  setSources(type);
  list.replaceChildren();
  filter.value = '';
  filter.hidden = more.hidden = retry.hidden = true;
  status.textContent=type==='favorites'?'Caricamento preferiti…':'Caricamento delle emittenti…';
  const result=type==='favorites'?{rows:[...favorites.values()],partial:false}:
   code?await(type==='radio'?loadRadios(code):loadTV(code)):{rows:[],partial:false};
  if (request !== revision) return;
  if(type!=='favorites')refreshSavedFavorites(result.rows,type,code);
  entries=result.rows.map(row=>prepareRow({...row,kind:row.kind||type}))
   .sort((a,b)=>sort.compare(a.name,b.name)||sort.compare(a.place||'',b.place||''));
  partial = result.partial;
  savedCatalogue=Boolean(result.stale);
  visible = batchSize;
  filter.hidden = !entries.length;
  retry.hidden = type==='favorites';
  retry.textContent='↻ Aggiorna elenco';
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
 retry.addEventListener('click', () => {requests.clear();showMedia(activeType);});

 return (place, iso) => {
  country = place ? {name:place[0], code:iso || missingCodes[place[1]], shared:sharedCatalogues[place[1]]} : null;
  showInfo();
 };
}

function youtubeId(url) {
 if(typeof url!=='string')return;
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password)return;
  const host=parsed.hostname.toLowerCase().replace(/^www\./,'');
  const id=host==='youtu.be'?parsed.pathname.slice(1).split('/')[0]:
   ['youtube.com','youtube-nocookie.com'].includes(host)?
    (/^\/(?:embed|live)\/([\w-]{11})(?:\/|$)/.exec(parsed.pathname)?.[1]||
     (parsed.pathname==='/watch'?parsed.searchParams.get('v'):null)):null;
  if(/^[\w-]{11}$/.test(id||''))return id;
 }catch{}
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

function createCountryPlayer(panel, link, favoritesAPI) {
 const directory = $('fbMediaDirectory');
 const player = $('fbPlayer');
 const title = $('fbPlayerTitle');
 const back = $('fbPlayerBack');
 const viewport = $('fbPlayerViewport');
 const status = $('fbPlayerStatus');
 const links = $('fbPlayerLinks');
 const retry = $('fbPlayerRetry');
 const nextSource=$('fbPlayerNext');
 const timerPanel=$('fbPlayerTimer');
 const volumeSlider=$('fbVolumeSlider'),volumeText=$('fbVolumeValue'),muteButton=$('fbPlayerMute');
 const favoriteButton=$('fbPlayerFavorite'),languageLabel=$('fbPlayerLanguage');
 let opener,directoryScroll,hlsScript,currentRow,currentMedia=null,currentFrame=null,volume=80,muted=false;
 try{
  const saved=localStorage.getItem(MEDIA_VOLUME_KEY),number=Number(saved);
  if(saved!==null&&Number.isFinite(number)&&number>=0&&number<=100)volume=number;
 }catch{}
 function applyVolume(){
  volumeSlider.value=String(volume);volumeText.textContent=volume+'%';
  const effective=muted?0:volume;
  muteButton.textContent=effective===0?'🔇':effective<45?'🔉':'🔊';
  muteButton.setAttribute('aria-pressed',String(effective===0));
  muteButton.setAttribute('aria-label',effective===0?'Riattiva audio':'Disattiva audio');
  if(currentMedia){currentMedia.volume=volume/100;currentMedia.muted=effective===0;}
  if(currentFrame?.contentWindow){
   const command=(func,args)=>currentFrame.contentWindow.postMessage(JSON.stringify({event:'command',func,args}),'*');
   command('setVolume',[effective]);command(effective===0?'mute':'unMute',[]);
  }
 }
 volumeSlider.value=String(volume);applyVolume();
 volumeSlider.addEventListener('input',()=>{
  volume=Number(volumeSlider.value);muted=false;
  try{localStorage.setItem(MEDIA_VOLUME_KEY,String(volume));}catch{}
  applyVolume();
 });
 muteButton.addEventListener('click',()=>{
  if(volume===0){volume=50;muted=false;}
  else muted=!muted;
  applyVolume();
 });
 function refreshFavorite(){
  if(!currentRow)return;
  const saved=favoritesAPI.isFavorite(currentRow);
  favoriteButton.setAttribute('aria-pressed',String(saved));
  favoriteButton.textContent=saved?'★ Rimuovi dai preferiti':'☆ Aggiungi ai preferiti';
  favoriteButton.setAttribute('aria-label',(saved?'Rimuovi dai':'Aggiungi ai')+' preferiti: '+currentRow.name);
 }
 favoriteButton.addEventListener('click',()=>{if(currentRow)favoritesAPI.toggleFavorite(currentRow);});
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

 function stopPlayback(){
  stopStream();stopStream=()=>{};
  currentMedia=null;currentFrame=null;
  viewport.replaceChildren();
 }

 function close(restoreFocus = false) {
  if (player.hidden) return;
  sleepTimer.reset();
  stopPlayback();
  links.replaceChildren();
  retry.onclick = null;
  nextSource.onclick=null;nextSource.hidden=true;
  player.hidden = true;
  directory.hidden = false;
  panel.setAttribute('aria-labelledby', 'fbMediaTitle');
  if (restoreFocus) {
   panel.scrollTop = directoryScroll;
   opener?.focus({preventScroll:true});
  }
  opener=null;currentRow=null;
 }

 function open(row, button, type) {
  close();
  const isRadio = type === 'radio';
  currentRow=row;refreshFavorite();
  languageLabel.textContent=row.language?'Lingua: '+row.language:'';
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
    else if (row.href) addLink('Pagina del canale su Famelack', row.href);
   }
   links.hidden = !row.official && !row.youtube.length;
  }

  const options = [...row.streams, ...(row.youtube || []).map(id => ({id}))];
  let sourceIndex=0;
  nextSource.hidden=options.length<2;
  nextSource.onclick=()=>{stopPlayback();trySource((sourceIndex+1)%options.length);};
  function trySource(index) {
   if (sleepTimer.expireIfDue()) return;
   sourceIndex=index;
   timerPanel.hidden = false;
   retry.hidden = true;
   retry.textContent = '↻ Riprova';
   viewport.replaceChildren();
   currentMedia=null;currentFrame=null;
   const source = options[index];
   if (!source) {
    if (isRadio) {
     status.textContent = 'Diretta radio momentaneamente non disponibile.';
     retry.hidden = false;
    } else {
     links.hidden = false;
     status.textContent = 'Diretta non disponibile nel lettore. Puoi aprire il collegamento qui sotto.';
     retry.hidden=false;
    }
    return;
   }
   if (source.id) {
    const frame = document.createElement('iframe');
    frame.title = 'Diretta di ' + row.name;
    frame.src='https://www.youtube-nocookie.com/embed/'+source.id+
     '?autoplay=1&playsinline=1&enablejsapi=1&origin='+encodeURIComponent(location.origin);
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    currentFrame=frame;
    frame.addEventListener('load',()=>{applyVolume();setTimeout(()=>{if(currentFrame===frame)applyVolume();},700);});
    viewport.append(frame);applyVolume();
    status.textContent='Diretta YouTube. Il controllo volume dipende anche dal lettore YouTube.';
    return;
   }

   const media = document.createElement(isRadio ? 'audio' : 'video');
   media.controls = true;
   if (!isRadio) media.setAttribute('playsinline', '');
   media.preload = 'auto';
   media.setAttribute('aria-label', 'Diretta di ' + row.name);
   currentMedia=media;viewport.append(media);applyVolume();
   status.textContent = index?'Provo un collegamento alternativo…':'Caricamento della diretta…';
   let cancelled = false, hls,stallTimer;
   const stop = () => {
    cancelled = true;
    clearTimeout(timer);
    clearTimeout(stallTimer);
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
   media.addEventListener('timeupdate', () => {
    if (!cancelled){clearTimeout(stallTimer);stallTimer=null;sleepTimer.expireIfDue();}
   });
   for(const event of ['waiting','stalled'])media.addEventListener(event,()=>{
    if(cancelled||media.paused||stallTimer)return;
    stallTimer=setTimeout(fail,15000);
   });
   media.addEventListener('pause',()=>{clearTimeout(stallTimer);stallTimer=null;});
   media.addEventListener('canplay', () => {
    if (cancelled || sleepTimer.expireIfDue()) return;
    clearTimeout(timer);
    clearTimeout(stallTimer);stallTimer=null;
    if (media.paused) status.textContent = 'Premi Riproduci per avviare la diretta.';
   });
   media.addEventListener('playing', () => {
    if (cancelled || sleepTimer.expireIfDue()) return;
    clearTimeout(timer);
    clearTimeout(stallTimer);stallTimer=null;
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
  retry.onclick = () => {stopPlayback();trySource(0);};
  trySource(0);
 }

 back.addEventListener('click', () => close(true));
 return {open,close,refreshFavorite};
}

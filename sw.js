// Terra 3D Factbook v3.1 - GitHub Pages offline PWA
const CACHE='terra-3d-factbook-v15-20261111-dirette';
const DATA='terra-3d-factbook-archivio-cia-v1';
const SHELL=['./','./index.html','./media.js?v=20261111-2'];
const FILES=["./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./data/fisica-01.txt","./data/fisica-02.txt","./data/fisica-03.txt","./data/fisica-04.txt","./data/fisica-05.txt","./data/fisica-06.txt","./data/fisica-07.txt","./data/fisica-08.txt","./data/fisica-09.txt","./data/fisica-10.txt","./data/fisica-11.txt","./data/fisica-12.txt","./data/fisica-13.txt","./data/fisica-14.txt","./data/fisica-15.txt","./data/fisica-16.txt","./data/fisica-17.txt","./data/fisica-18.txt","./data/fisica-19.txt","./data/fisica-20.txt","./data/fisica-21.txt","./data/fisica-22.txt","./data/fisica-23.txt","./data/satellite-01.txt","./data/satellite-02.txt","./data/satellite-03.txt","./data/satellite-04.txt","./data/satellite-05.txt","./data/satellite-06.txt","./data/satellite-07.txt","./data/satellite-08.txt"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE)
 .then(c=>c.addAll([...SHELL.map(path=>new Request(path,{cache:'reload'})),...FILES]))
 .then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('terra-3d-')&&k!==CACHE&&k!==DATA).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;
 const u=new URL(req.url),base=new URL(self.registration.scope);
 const same=u.origin===base.origin&&u.pathname.startsWith(base.pathname);
 const cia=u.hostname==='raw.githubusercontent.com'&&u.pathname.includes('/factbook.json/');
 const nasa=u.hostname==='assets.science.nasa.gov';
 if(cia||nasa){e.respondWith(caches.open(DATA).then(async c=>{const hit=await c.match(req);if(hit)return hit;const res=await fetch(req);if(res.ok&&res.type!=='opaque')c.put(req,res.clone()).catch(()=>{});return res;}));return;}
 if(same){
  // HTML sempre dalla rete se disponibile: evita che la PWA mostri una vecchia cartografia.
  if(req.mode==='navigate'){
    e.respondWith(fetch(req,{cache:'no-cache'}).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(req,res.clone()));return res;})
     .catch(()=>caches.match(req)));
  }else{
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(req,res.clone()));return res;})));
  }
}
});

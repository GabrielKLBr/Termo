/* Pré-cache do JSON gerado pelo banco SQLite, jogo e layout para funcionar offline. */
const VERSION='termo-original-template-v6-split-keyboard';
const CORE=['./','./index.html','./src/main.js','./src/styles.js','./data/dictionary.json','./termo-abrir-direto.html','./manifest.webmanifest','./assets/icon.svg','./assets/sobre.svg','./assets/menu.svg','./assets/apagar.svg','./assets/configuracoes.svg','./assets/estatisticas.svg'];
self.addEventListener('install',ev=>ev.waitUntil((async()=>{
 const cache=await caches.open(VERSION);
 await cache.addAll(CORE);
 // Pré-cache da fonte Mitr e dos arquivos fornecidos pela folha Google Fonts.
 try{
  const url='https://fonts.googleapis.com/css2?family=Mitr:wght@300;400;500;600;700&display=swap';
  const resp=await fetch(url);if(resp.ok){await cache.put(url,resp.clone());const css=await resp.text();
   const files=[...new Set([...css.matchAll(/url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^)'"]+)\1\)/g)].map(m=>m[2]))];
   await Promise.allSettled(files.map(async(u)=>{const r=await fetch(u);if(r.ok)await cache.put(u,r);}));
  }
 }catch(e){/* A fonte remota não é essencial para jogar. */}
 await self.skipWaiting();
})()));
self.addEventListener('activate',ev=>ev.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('termo-original-template-')&&key!==VERSION)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',ev=>{
 if(ev.request.method!=='GET')return;
 const u=new URL(ev.request.url);
 if(!['http:','https:'].includes(u.protocol))return;
 // Apenas fontes externas dependem da rede; o banco local está no CORE.
 if(u.hostname==='raw.githubusercontent.com'||u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com'){
 ev.respondWith((async()=>{const cache=await caches.open(VERSION);const existing=await cache.match(ev.request);
  if(existing)return existing;
  const response=await fetch(ev.request);if(response.ok)cache.put(ev.request,response.clone()).catch(()=>{});return response;
 })());return;
 }
 if(u.origin===self.location.origin){ev.respondWith((async()=>{
  const cached=await caches.match(ev.request,{ignoreSearch:ev.request.mode==='navigate'});
  if(cached)return cached;
  try{const r=await fetch(ev.request);if(r.ok) (await caches.open(VERSION)).put(ev.request,r.clone()).catch(()=>{});return r;}
  catch{if(ev.request.mode==='navigate'){const home=await caches.match('./index.html');if(home)return home;}return Response.error();}
 })());}
});

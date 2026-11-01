const owner='GabrielKLBr', repo='Termo';
export default async function handler(req,res){
  if(req.method!=='GET') {res.setHeader('Allow','GET');return res.status(405).json({error:'Método não permitido'});}
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    const r=await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`,{
      headers:{Accept:'application/vnd.github+json','User-Agent':'Termo-Infinito-Downloads','X-GitHub-Api-Version':'2022-11-28'},
      signal:AbortSignal.timeout(7000)});
    if(r.status===404)return res.status(200).json({installer:null,portable:null});
    if(!r.ok)throw Error(`GitHub HTTP ${r.status}`);
    const release=await r.json();
    const assets=Array.isArray(release.assets)?release.assets:[];
    const tag=String(release.tag_name||'');
    const allowed='https://github.com/'+owner+'/'+repo+'/releases/download/'+encodeURIComponent(tag)+'/';
    const find=(pattern)=>{
      const file=assets.find(a=>pattern.test(a.name)&&a.state==='uploaded'&&a.browser_download_url?.startsWith(allowed));
      return file?{url:file.browser_download_url,size:file.size}:null;
    };
    return res.status(200).json({
      installer:find(/^Termo-Setup-[0-9][0-9A-Za-z._-]*-x64\.exe$/),
      portable:find(/^TermoWindows\.zip$/)
    });
  }catch(e){console.error('Falha ao consultar release:',e?.message);return res.status(503).json({error:'Downloads temporariamente indisponíveis'});}
}

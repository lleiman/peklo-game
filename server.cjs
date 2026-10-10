const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const AdmZip=require('adm-zip');
const archiveDir=path.join(__dirname,'archive');
const parts=fs.readdirSync(archiveDir).filter(n=>/^part\d+\.b64$/.test(n)).sort();
if(parts.length!==31) throw new Error('PEKLO assets incomplete: expected 31 parts, received '+parts.length);
const zipBytes=Buffer.from(parts.map(n=>fs.readFileSync(path.join(archiveDir,n),'utf8').trim()).join(''),'base64');
const hash=crypto.createHash('sha256').update(zipBytes).digest('hex');
if(hash!=='ffb012ae6889dd4c1d2d8a636b1d498fb10e10ee334e0bf6ad52ea4a824c654f') throw new Error('PEKLO bundle checksum mismatch: '+hash);
const publicDir='/tmp/peklo-www';
fs.mkdirSync(publicDir,{recursive:true});
new AdmZip(zipBytes).extractAllTo(publicDir,true);
if(!fs.existsSync(path.join(publicDir,'index.html')))throw new Error('PEKLO site missing index.html');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'};
const port=Number(process.env.PORT||3000);
http.createServer((req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'content-type':'text/plain'});return res.end('ok');}
  let u;try{u=new URL(req.url,'http://localhost')}catch{res.writeHead(400);return res.end('Bad request');}
  let uri;try{uri=decodeURIComponent(u.pathname)}catch{res.writeHead(400);return res.end('Bad request');}
  const p=path.resolve(publicDir,'.'+(uri==='/'?'/index.html':uri));
  if(!p.startsWith(publicDir+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  fs.stat(p,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404,{'content-type':'text/plain'});return res.end('Not found');}
    res.writeHead(200,{'content-type':MIME[path.extname(p)]||'application/octet-stream','content-length':stat.size,'cache-control':path.extname(p)==='.webp'?'public, max-age=3600':'no-cache'});
    if(req.method==='HEAD')return res.end();
    fs.createReadStream(p).pipe(res);
  });
}).listen(port,'0.0.0.0',()=>console.log('PEKLO World Design Bible serving at port '+port+', '+parts.length+' asset chunks loaded'));

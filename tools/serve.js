import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.mp4':'video/mp4','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
const allowed=p => p==='index.html' || p==='style.css' || /^(src|media)\//.test(p);
const server=http.createServer((req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'') || 'index.html';
    const target=path.resolve(root,name);
    if(!allowed(name)||!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()) {res.writeHead(404);res.end('Not found');return;}
    const size=fs.statSync(target).size; let start=0,end=size-1,status=200;
    if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416);res.end();return;}
      start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;status=206;
      if(start>end){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}}
    res.writeHead(status,{'Content-Type':mime[path.extname(target)]??'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store',...(status===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
    if(req.method==='HEAD')res.end();else fs.createReadStream(target,{start,end}).pipe(res);
  } catch {res.writeHead(400);res.end('Bad request');}
});
server.listen(Number(process.env.PORT??4173),process.env.BIND??'127.0.0.1',()=>console.log(`Sema local prototype: http://${process.env.BIND??'127.0.0.1'}:${process.env.PORT??4173}`));

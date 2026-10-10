import http from "node:http";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";

const folder=new URL("./archive/",import.meta.url);
const packed=[];
for(let i=0;i<31;i++) packed.push(readFileSync(new URL("part"+String(i).padStart(2,"0")+".b64",folder),"utf8"));
const zip=Buffer.from(packed.join(""),"base64");
const files=unzipSync(new Uint8Array(zip));
const mimes={html:"text/html; charset=utf-8",css:"text/css; charset=utf-8",js:"text/javascript; charset=utf-8",json:"application/json; charset=utf-8",webp:"image/webp",png:"image/png",svg:"image/svg+xml",jpg:"image/jpeg",ico:"image/x-icon"};
const server=http.createServer((req,res)=>{
  let name;
  try{name=decodeURIComponent(new URL(req.url,"http://localhost").pathname).replace(/^\/+/, "")}catch{res.writeHead(400).end("Bad Request");return}
  if(name==="health"){res.writeHead(200,{"Content-Type":"text/plain"});res.end("ok");return}
  if(!name)name="index.html";
  if(name.includes("..")){res.writeHead(400).end("Bad Request");return}
  const data=files[name];
  if(!data){res.writeHead(404,{"Content-Type":"text/plain"});res.end("Not Found");return}
  const extension=name.split(".").pop();
  const body=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  res.writeHead(200,{"Content-Type":mimes[extension]||"application/octet-stream","Cache-Control":extension==="html"?"no-cache":"public, max-age=86400","X-Content-Type-Options":"nosniff"});
  res.end(body);
});
server.listen(Number(process.env.PORT||3000),"0.0.0.0",()=>console.log("PEKLO World Design Bible online"));

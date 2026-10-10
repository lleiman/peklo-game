"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { unzipSync } = require("fflate");

const chunksDir = path.join(__dirname, "chunks");
const parts = fs.readdirSync(chunksDir).filter(f => /^chunk\d\d\.txt$/.test(f)).sort();
if (parts.length !== 16) throw new Error("Incomplete PEKLO asset transfer: " + parts.length);
const b64 = parts.map(f => fs.readFileSync(path.join(chunksDir,f), "utf8")).join("").replace(/\s/g,"");
const archive = Buffer.from(b64, "base64");
const actualHash = crypto.createHash("sha256").update(archive).digest("hex");
const expectedHash = "ffb012ae6889dd4c1d2d8a636b1d498fb10e10ee334e0bf6ad52ea4a824c654f";
if (actualHash !== expectedHash) throw new Error("PEKLO ZIP checksum mismatch: " + actualHash);
const decoded = unzipSync(new Uint8Array(archive));
const assets = new Map(Object.entries(decoded).map(([k,v]) => ["/"+k, Buffer.from(v)]));
const contentTypes = {
 ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8",
 ".webp":"image/webp", ".png":"image/png", ".jpg":"image/jpeg",
 ".svg":"image/svg+xml", ".txt":"text/plain; charset=utf-8"
};
if (!assets.has("/index.html")) throw new Error("PEKLO atlas index.html missing");
const port = Number(process.env.PORT || 3000);
http.createServer((req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,"http://localhost").pathname); }
  catch { res.writeHead(400); res.end("Bad URL"); return; }
  if (pathname === "/health") {
    res.writeHead(200,{"Content-Type":"text/plain"});res.end("ok");return;
  }
  if (pathname === "/") pathname="/index.html";
  if (pathname.includes("..") || pathname.includes("\\") || !assets.has(pathname)) {
    res.writeHead(404,{"Content-Type":"text/plain"});res.end("Not found");return;
  }
  const data = assets.get(pathname);
  const mime = contentTypes[path.extname(pathname).toLowerCase()] || "application/octet-stream";
  res.writeHead(200,{
    "Content-Type":mime,
    "Content-Length":data.length,
    "Cache-Control":pathname.endsWith(".html")?"no-cache":"public, max-age=86400",
    "X-Content-Type-Options":"nosniff"
  });
  if (req.method === "HEAD") res.end(); else res.end(data);
}).listen(port,"0.0.0.0",()=>{
  console.log("PEKLO World Design Bible online: "+port+" (assets="+assets.size+", zip="+archive.length+")");
});
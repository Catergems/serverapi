// index.js — Full Render.com API
// Routes:
//   GET  /video?quality=144p        ← Roblox fetches frames
//   POST /upload?quality=144p       ← upload small files (144p/360p)
//   POST /upload-chunk?quality=720p ← chunked upload for large files (720p)
//   GET  /status                    ← check what's loaded

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const url   = require("url");

const PORT            = process.env.PORT || 3000;
const VALID_QUALITIES = ["144p", "240p", "360p", "480p", "720p"];

if (!fs.existsSync("./videos")) fs.mkdirSync("./videos");

// ── LOAD EXISTING FILES INTO MEMORY ──────────────────────────────────────────
const payloads     = {};  // full assembled buffers served to Roblox
const chunkBuffers = {};  // temp store for in-progress chunked uploads

for (const q of VALID_QUALITIES) {
  const f = `./videos/${q}.json`;
  if (fs.existsSync(f)) {
    payloads[q] = fs.readFileSync(f);
    console.log(`✅ Loaded ${q} — ${(payloads[q].length / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log(`⚠️  ${q} — not uploaded yet`);
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data",  c => chunks.push(c));
    req.on("end",   () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type":                "application/json",
    "Content-Length":              Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

// ── SERVER ────────────────────────────────────────────────────────────────────
http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url, true);
  const route   = parsed.pathname;
  const quality = parsed.query.quality || "144p";

  // ── GET /video?quality=144p ── Roblox fetches this ────────────────────────
  if (req.method === "GET" && route === "/video") {
    const buf = payloads[quality];
    if (!buf) {
      return send(res, 404, { error: `${quality} not uploaded yet` });
    }
    res.writeHead(200, {
      "Content-Type":                "application/json",
      "Content-Length":              buf.length,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buf);
    console.log(`📡 GET ${quality} — ${(buf.length / 1024).toFixed(0)} kb`);

  // ── POST /upload?quality=144p ── single upload (144p / 360p) ─────────────
  } else if (req.method === "POST" && route === "/upload") {
    if (!VALID_QUALITIES.includes(quality)) {
      return send(res, 400, { error: "Invalid quality. Use: 144p, 360p, 720p" });
    }
    try {
      const body = await readBody(req);
      JSON.parse(body.toString("utf8")); // validate JSON

      fs.writeFileSync(`./videos/${quality}.json`, body);
      payloads[quality] = body;

      const mb = (body.length / 1024 / 1024).toFixed(2);
      console.log(`📥 POST ${quality} — ${mb} MB`);
      send(res, 200, { ok: true, quality, mb });

    } catch (err) {
      send(res, 400, { error: "Invalid JSON: " + err.message });
    }

  // ── POST /upload-chunk?quality=720p ── chunked upload for large files ─────
  } else if (req.method === "POST" && route === "/upload-chunk") {
    if (!VALID_QUALITIES.includes(quality)) {
      return send(res, 400, { error: "Invalid quality" });
    }
    try {
      const body  = await readBody(req);
      const chunk = JSON.parse(body.toString("utf8"));
      const { chunkIndex, totalChunks, isLast, frames, title, fps, width, height } = chunk;

      // Init buffer for this quality if first chunk
      if (!chunkBuffers[quality]) {
        chunkBuffers[quality] = { title, fps, width, height, frames: [] };
        console.log(`📦 Starting chunked upload for ${quality} (${totalChunks} chunks)`);
      }

      // Append frames from this chunk
      chunkBuffers[quality].frames.push(...frames);
      process.stdout.write(`\r   ${quality} chunk ${chunkIndex + 1}/${totalChunks}`);

      if (isLast) {
        // Assemble full file
        const full = Buffer.from(JSON.stringify(chunkBuffers[quality]), "utf8");
        fs.writeFileSync(`./videos/${quality}.json`, full);
        payloads[quality] = full;
        delete chunkBuffers[quality];

        const mb = (full.length / 1024 / 1024).toFixed(2);
        console.log(`\n✅ ${quality} assembled — ${mb} MB`);
        send(res, 200, { ok: true, quality, mb, assembled: true });
      } else {
        send(res, 200, { ok: true, quality, chunk: chunkIndex });
      }

    } catch (err) {
      send(res, 400, { error: "Chunk error: " + err.message });
    }

  // ── GET /status ───────────────────────────────────────────────────────────
  } else if (req.method === "GET" && route === "/status") {
    send(res, 200, {
      ok:       true,
      loaded:   VALID_QUALITIES.filter(q =>  payloads[q]).map(q => ({
        quality: q,
        mb:      (payloads[q].length / 1024 / 1024).toFixed(2),
      })),
      missing:  VALID_QUALITIES.filter(q => !payloads[q]),
      pending:  Object.keys(chunkBuffers).map(q => ({
        quality: q,
        frames:  chunkBuffers[q].frames.length,
      })),
    });

  // ── GET / ─────────────────────────────────────────────────────────────────
  } else if (req.method === "GET" && route === "/") {
    send(res, 200, {
      name:    "Roblox Video API",
      version: "2.0.0",
      routes: {
        "GET  /video?quality=144p":         "Roblox fetches video frames",
        "POST /upload?quality=144p":        "Upload small JSON (144p/360p)",
        "POST /upload-chunk?quality=720p":  "Chunked upload for 720p",
        "GET  /status":                     "Check loaded qualities",
      },
    });

  } else {
    send(res, 404, { error: "Unknown route" });
  }

}).listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Roblox Video API v2.0 on port ${PORT}`);
  console.log(`   GET  /video?quality=144p`);
  console.log(`   POST /upload?quality=144p`);
  console.log(`   POST /upload-chunk?quality=720p`);
  console.log(`   GET  /status\n`);
});

// ── KEEP ALIVE — prevents Render free tier sleeping ───────────────────────────
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(() => {
    https.get(`${RENDER_URL}/status`, r => {
      console.log(`🏓 Keep-alive → ${r.statusCode}`);
    }).on("error", () => {});
  }, 10 * 60 * 1000);
  console.log(`🏓 Keep-alive enabled → ${RENDER_URL}`);
}

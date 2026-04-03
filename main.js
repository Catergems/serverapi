// index.js — Render.com API server
// Pure Node.js, no npm installs needed
// 
// Routes:
//   GET  /video?quality=144p   ← Roblox fetches this
//   POST /upload?quality=144p  ← upload json from your PC
//   GET  /status               ← check what's loaded

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const url   = require("url");

const PORT = process.env.PORT || 3000;
const VALID_QUALITIES = ["144p", "360p", "720p"];

// ── STORAGE ───────────────────────────────────────────────────────────────────
if (!fs.existsSync("./videos")) fs.mkdirSync("./videos");

const payloads = {};

for (const q of VALID_QUALITIES) {
  const f = `./videos/${q}.json`;
  if (fs.existsSync(f)) {
    payloads[q] = Buffer.from(fs.readFileSync(f, "utf8"), "utf8");
    console.log(`✅ Loaded ${q} — ${(payloads[q].length / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log(`⚠️  ${q} not uploaded yet`);
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
const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url, true);
  const route   = parsed.pathname;
  const quality = parsed.query.quality || "144p";

  // ── GET /video?quality=144p ───────────────────────────────────────────────
  if (req.method === "GET" && route === "/video") {
    const buf = payloads[quality];
    if (!buf) return send(res, 404, { error: `${quality} not uploaded yet. POST to /upload?quality=${quality}` });

    res.writeHead(200, {
      "Content-Type":                "application/json",
      "Content-Length":              buf.length,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buf);
    console.log(`📡 GET ${quality} — ${(buf.length / 1024).toFixed(0)}kb`);

  // ── POST /upload?quality=144p ─────────────────────────────────────────────
  } else if (req.method === "POST" && route === "/upload") {
    if (!VALID_QUALITIES.includes(quality)) {
      return send(res, 400, { error: `Invalid quality. Use: ${VALID_QUALITIES.join(", ")}` });
    }

    try {
      const body = await readBody(req);

      // Validate JSON before saving
      JSON.parse(body.toString("utf8"));

      // Save to disk + memory
      fs.writeFileSync(`./videos/${quality}.json`, body);
      payloads[quality] = body;

      const mb = (body.length / 1024 / 1024).toFixed(2);
      console.log(`📥 POST ${quality} — ${mb} MB`);
      send(res, 200, { ok: true, quality, mb });

    } catch (err) {
      send(res, 400, { error: "Invalid JSON: " + err.message });
    }

  // ── GET /status ───────────────────────────────────────────────────────────
  } else if (req.method === "GET" && route === "/status") {
    send(res, 200, {
      ok:      true,
      loaded:  VALID_QUALITIES.filter(q =>  payloads[q]).map(q => ({
        quality: q,
        mb: (payloads[q].length / 1024 / 1024).toFixed(2)
      })),
      missing: VALID_QUALITIES.filter(q => !payloads[q]),
    });

  // ── GET / ─────────────────────────────────────────────────────────────────
  } else if (req.method === "GET" && route === "/") {
    send(res, 200, {
      name:   "Roblox Video API",
      routes: {
        "GET  /video?quality=144p":  "Roblox fetches video frames",
        "POST /upload?quality=144p": "Upload converted JSON",
        "GET  /status":              "Check loaded qualities",
      }
    });

  } else {
    send(res, 404, { error: "Unknown route" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Roblox Video API running on port ${PORT}`);
  console.log(`   GET  /video?quality=144p`);
  console.log(`   POST /upload?quality=144p`);
  console.log(`   GET  /status\n`);
});

// ── KEEP ALIVE (prevents Render free tier from sleeping) ──────────────────────
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(() => {
    https.get(`${RENDER_URL}/status`, (r) => {
      console.log(`🏓 Keep-alive → ${r.statusCode}`);
    }).on("error", () => {});
  }, 10 * 60 * 1000);
  console.log(`🏓 Keep-alive enabled → ${RENDER_URL}`);
}

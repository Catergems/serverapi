// POST /upload-chunk?quality=720p  ← receives chunks and reassembles
const chunkBuffers = {};

} else if (req.method === "POST" && route === "/upload-chunk") {
  if (!VALID_QUALITIES.includes(quality)) return send(res, 400, { error: "Invalid quality" });
  try {
    const body   = await readBody(req);
    const chunk  = JSON.parse(body.toString("utf8"));
    const { chunkIndex, totalChunks, isLast, frames, title, fps, width, height } = chunk;

    if (!chunkBuffers[quality]) chunkBuffers[quality] = { frames: [], title, fps, width, height };
    chunkBuffers[quality].frames.push(...frames);

    console.log(`📦 Chunk ${chunkIndex + 1}/${totalChunks} for ${quality}`);

    if (isLast) {
      const full = Buffer.from(JSON.stringify(chunkBuffers[quality]), "utf8");
      fs.writeFileSync(`./videos/${quality}.json`, full);
      payloads[quality] = full;
      delete chunkBuffers[quality];
      const mb = (full.length / 1024 / 1024).toFixed(2);
      console.log(`✅ ${quality} fully assembled — ${mb} MB`);
      send(res, 200, { ok: true, quality, mb });
    } else {
      send(res, 200, { ok: true, chunk: chunkIndex });
    }
  } catch (err) {
    send(res, 400, { error: "Chunk error: " + err.message });
  }

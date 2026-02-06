reviews = texts;
    setCounts(reviews.length);
    setStatus(`TSV loaded: ${reviews.length} reviews.`);
  } catch (err) {
    console.error("TSV load/parse error:", err);
    reviews = [];
    setCounts(0);
    setStatus("Failed to load TSV.");
    showError(
      "Failed to load or parse reviews_test.tsv.\n" +
      "Make sure the file exists next to index.html, is publicly accessible on GitHub Pages, and has a 'text' column.\n\n" +
      Details: ${err.message || String(err)}
    );
  }
}

function parseTSV(tsvText) {
  if (typeof Papa === "undefined" || !Papa.parse) {
    throw new Error("Papa Parse not available (CDN failed).");
  }

  const result = Papa.parse(tsvText, {
    header: true,
    delimiter: "\t",
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (result.errors && result.errors.length) {
    const e = result.errors[0];
    throw new Error(e.message || "Unknown TSV parse error.");
  }
  if (!Array.isArray(result.data)) {
    throw new Error("TSV parse produced no data rows.");
  }
  return result.data;
}

function extractTexts(rows, colName) {
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const v = row[colName];
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (s) out.push(s);
  }
  return out;
}

// ==============================
// Model init (Transformers.js)
// ==============================
async function initModel() {
  clearError();
  setStatus("Loading sentiment model… (first time can take a while)");
  setLoading(true, "Loading model…");

  const { hfToken } = getSettings();

  try {
    // If token provided, attempt to use it (private repo access). If unsupported, will throw and we retry.
    if (hfToken) {
      sentimentPipe = await pipeline("text-classification", MODEL_ID, { token: hfToken });
    } else {
      sentimentPipe = await pipeline("text-classification", MODEL_ID);
    }
    setStatus("Sentiment model ready.");
  } catch (err) {
    console.error("Model load error:", err);

    // Retry without token if token attempt failed (helps if 'token' option unsupported)
    if (hfToken) {
      try {
        console.warn("Retrying model load without token…");
        sentimentPipe = await pipeline("text-classification", MODEL_ID);
        setStatus("Sentiment model ready. (Loaded without token)");
      } catch (err2) {
        console.error("Model load error (retry):", err2);
        sentimentPipe = null;
        setStatus("Model failed to load.");
        showError(
          "Failed to load Transformers.js sentiment model.\n" +
          "If you use a token, ensure it is correct and that the model is accessible.\n\n" +
          Details: ${err2.message || String(err2)}
        );
      }
    } else {
      sentimentPipe = null;
      setStatus("Model failed to load.");
      showError(
        "Failed to load Transformers.js sentiment model.\n" +
        "Check your network / blockers and open Console for details.\n\n" +
        Details: ${err.message || String(err)}
      );
    }
  } finally {
    setLoading(false, "");
  }
}

// ==============================
// Analysis
// ==============================
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeOutput(output) {
  if (!Array.isArray(output)  !output.length  typeof output[0] !== "object") {
    throw new Error("Invalid inference output (expected array of objects).");
  }
  const top = output[0];
  if (typeof top.label !== "string" || typeof top.score !== "number") {
    throw new Error("Invalid inference output fields (missing label/score).");
  }
  return { label: top.label.toUpperCase(), score: top.score };
}

function sentimentBucket(label, score) {
  if (label === "POSITIVE" && score > 0.5) return "positive";
  if (label === "NEGATIVE" && score > 0.5) return "negative";
  return "neutral";
}

function percent(score) {
  const s = Number.isFinite(score) ? score : 0;
  return Math.max(0, Math.min(100, s * 100));
}

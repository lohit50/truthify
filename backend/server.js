import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });

// Fix __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// ── 1. DEBUG ROUTE ─────────────────────────────
app.get("/list-models", async (req, res) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch models" });
  }
});

// ── 2. TEXT ANALYSIS ───────────────────────────
app.post("/analyze", async (req, res) => {
  const { text } = req.body;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a fake news detector. Analyze this: "${text}" 
              Respond exactly as:
              Verdict: Real/Fake/Suspicious
              Confidence: [0-100]%
              Reason: [explanation]`
            }]
          }]
        }),
      }
    );

    const data = await response.json();
    const output = data.candidates?.[0]?.content?.parts?.[0]?.text || null;

    res.json({ result: output });
  } catch (err) {
    res.status(500).json({ error: "Server failed" });
  }
});

// ── 3. IMAGE ANALYSIS ──────────────────────────
app.post("/analyze-image", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image" });

  try {
    const base64Image = fs.readFileSync(req.file.path).toString("base64");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: req.file.mimetype, data: base64Image } },
              { text: "Analyze this image for fake news. Respond with Verdict, Confidence, and Reason." }
            ]
          }]
        }),
      }
    );

    const data = await response.json();
    fs.unlinkSync(req.file.path);

    const output = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    res.json({ result: output });

  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Server failed" });
  }
});


// ── 4. RELATED SOURCES (🔥 NEW FEATURE) ─────────
app.get("/sources", async (req, res) => {
  try {
    const query = req.query.q;

    // Clean keyword
    const keyword = query
      .replace(/[^a-zA-Z ]/g, "")
      .split(" ")
      .slice(0, 3)
      .join(" ");

    // Wikipedia
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(keyword)}`
    );
    const wikiData = await wikiRes.json();

    // NewsAPI (using your key for now)
    const newsRes = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(keyword)}&pageSize=3&sortBy=relevancy&apiKey=bc129e593ccd469c9256e1b0e5f9339d`
    );
    const newsData = await newsRes.json();

    const results = [];

    // Add Wikipedia
    if (wikiData.title && wikiData.extract) {
      results.push({
        type: "Wikipedia",
        title: wikiData.title,
        snippet: wikiData.extract.slice(0, 120) + "...",
        url: wikiData.content_urls?.desktop?.page || "#"
      });
    }

    // Add News
    if (newsData.articles) {
      newsData.articles.forEach(article => {
        results.push({
          type: "News",
          title: article.title,
          snippet: article.source?.name,
          url: article.url
        });
      });
    }

    res.json(results.slice(0, 5));

  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sources" });
  }
});


// ── 5. SERVE FRONTEND ──────────────────────────
app.use(express.static(path.join(__dirname, "../frontend/dist")));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

// ── START SERVER ───────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
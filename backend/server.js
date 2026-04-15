import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());

// ── 1. DEBUG ROUTE (MUST BE AT THE TOP) ───────────────────────
app.get("/list-models", async (req, res) => {
  console.log("Debug route hit: fetching models...");
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.API_KEY}`
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Debug route error:", err);
    res.status(500).json({ error: "Failed to fetch models", details: err.message });
  }
});

// ── 2. TEXT ANALYSIS ──────────────────────────────────────────────
app.post("/analyze", async (req, res) => {
  const { text } = req.body;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ 
            text: `You are a fake news detector. Analyze this: "${text}" 
            Respond exactly as:
            Verdict: Real/Fake/Suspicious
            Confidence: [0-100]%
            Reason: [explanation]` 
          }] }],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || "API Error" });

    const output = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    res.json({ result: output });
  } catch (err) {
    res.status(500).json({ error: "Server failed" });
  }
});

// ── 3. IMAGE ANALYSIS ─────────────────────────────────────────────
app.post("/analyze-image", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image" });

  try {
    const base64Image = fs.readFileSync(req.file.path).toString("base64");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.API_KEY}`,
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

    if (!response.ok) return res.status(500).json({ error: data.error?.message || "API Error" });

    const output = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    res.json({ result: output });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Server failed" });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));
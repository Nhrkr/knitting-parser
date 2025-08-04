const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/parse", async (req, res) => {
  try {
    const { patternText, bust, unit, ease } = req.body;
    // Replace with your OpenRouter API key from https://openrouter.ai
    const apiKey = process.env.OPENAI_API_KEY;

    console.log("🟡 Received request to /parse");
    console.log("🟢 User inputs:", { bust, unit, ease });
    console.log("📄 Pattern text (start):", patternText.slice(0, 200));

    if (!patternText || !bust || !unit || !ease) {
      return res.status(400).json({ error: "Missing required fields in request body." });
    }
    
    const promptTemplate = fs.readFileSync(path.join(__dirname, "Knitting_Pattern_Parser_Prompt.md"), "utf-8");
    const [systemPrompt, userPrompt] = promptTemplate.split("===USER_PROMPT===");

    const systemPromptFinal = systemPrompt
      .replace("{{PATTERN_TEXT}}", patternText)
      .replace("{{BUST}}", bust)
      .replace("{{UNIT}}", unit)
      .replace("{{EASE}}", ease);

    const userPromptFinal = userPrompt
      .replace("{{PATTERN_TEXT}}", patternText)
      .replace("{{BUST}}", bust)
      .replace("{{UNIT}}", unit)
      .replace("{{EASE}}", ease);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "http://localhost:3000", // replace with your app's domain if deployed
          "X-Title": "Knitting Pattern Parser"
        },
        body: JSON.stringify({
          model: "openai/gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPromptFinal.trim() },
            { role: "user", content: userPromptFinal.trim() }
          ],
          max_tokens: 4000,
          temperature: 0.3,
        }),
      });

      const data = await response.json();
      console.log("🔵 OpenAI response status:", response.status);
      console.log("📝 OpenAI response body:", JSON.stringify(data, null, 2));

      if (data.choices && data.choices.length > 0) {
        const content = data.choices?.[0]?.message?.content || '';
        try {
          const jsonStart = content.indexOf('{');
          const jsonEnd = content.lastIndexOf('}');
          const match = jsonStart !== -1 && jsonEnd !== -1 ? content.slice(jsonStart, jsonEnd + 1) : null;
          let parsed;
          if (match) {
            const rawJson = JSON.parse(match);
            if (Array.isArray(rawJson.instructions)) {
              rawJson.instructions.forEach(section => {
                if (Array.isArray(section.steps)) {
                  section.steps = section.steps.map(step => {
                    if (typeof step === 'object' && step.instruction) return step.instruction;
                    return step;
                  });
                }
              });
            }
            // Number and cleanly separate steps for frontend rendering
            if (rawJson.instructions && Array.isArray(rawJson.instructions)) {
              rawJson.instructions.forEach(section => {
                if (Array.isArray(section.steps)) {
                  section.steps = section.steps.map((step, idx) => {
                    if (typeof step === 'object' && step.instruction) return `${idx + 1}. ${step.instruction}`;
                    if (typeof step === 'string') return `${idx + 1}. ${step}`;
                    return '';
                  });
                }
              });
            }
            parsed = rawJson;
          } else {
            parsed = { error: 'no_json_found', message: content };
          }
          res.json({
            size: parsed?.size || parsed?.Size || null,
            materials: parsed?.materials || parsed?.Materials || null,
            gauge: parsed?.gauge || parsed?.Gauge || null,
            instructions: parsed?.instructions || parsed?.Instructions || [],
            raw: parsed
          });
        } catch (err) {
          res.status(500).json({ error: "JSON parse error", message: err.message, raw: content });
        }
      } else {
        res.status(500).json({ error: "Unexpected response from OpenAI" });
      }
    } catch (err) {
      console.error("❌ Error contacting OpenAI:", err);
      res.status(500).json({ error: "OpenAI error", message: err.message });
    }
  } catch (err) {
    console.error("❌ Unexpected error in /parse handler:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🔌 Server running on http://localhost:${PORT}`));
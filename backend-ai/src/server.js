import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { chat } from "./llm.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

let conversationHistory = [];

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, resetHistory, scene } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    if (resetHistory) {
      conversationHistory = [];
    }

    const response = await chat(message, conversationHistory, scene || []);

    conversationHistory.push({ role: "user", content: message });
    conversationHistory.push({
      role: "assistant",
      content: response.message || "Processing...",
    });

    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    res.json({
      message: response.message,
      toolCalls: response.toolCalls,
      conversationId: "default",
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/execute-command", (req, res) => {
  const { command, args } = req.body;
  console.log(`Executing: ${command}`, args);
  res.json({ status: "executed" });
});

app.post("/api/generate-model", async (req, res) => {
  const { prompt } = req.body;
  res.json({ status: "queued", modelUrl: null });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 AI backend running on http://localhost:${PORT}`);
  console.log(`📡 Chat endpoint: POST http://localhost:${PORT}/api/chat`);
});
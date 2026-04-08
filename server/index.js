import 'dotenv/config'

/**
 * OpenAI-compatible chat proxy for the dashboard map assistant.
 * Run: npm run server:dev (from repo root, after npm install)
 *
 * Env (see ../.env.example):
 *   CHAT_MODEL_BASE_URL — e.g. https://api.openai.com/v1 or http://127.0.0.1:11434/v1 (Ollama)
 *   CHAT_MODEL_API_KEY  — optional; omit for local Ollama
 *   CHAT_MODEL_NAME     — model id (default gpt-4o-mini)
 *   PORT                — default 8787
 *   CORS_ORIGIN         — comma-separated allowed origins, or * (default *)
 */

import express from 'express'
import cors from 'cors'

const PORT = Number(process.env.PORT) || 8787
const BASE = process.env.CHAT_MODEL_BASE_URL?.replace(/\/$/, '')
const API_KEY = process.env.CHAT_MODEL_API_KEY || ''
const MODEL = process.env.CHAT_MODEL_NAME || 'gpt-4o-mini'
const MAX_CONTEXT_CHARS = Number(process.env.CHAT_MAX_CONTEXT_CHARS) || 24_000

const corsOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const corsOptions =
  corsOrigins.length === 1 && corsOrigins[0] === '*'
    ? { origin: true }
    : { origin: corsOrigins }

const SYSTEM = `You are the map assistant for the Andhra Pradesh Health Dashboard (React + Leaflet).
You receive a JSON snapshot of the user's current filters and aggregated district data (cases or incidence rate, disease, year, district selection, map level district vs mandal).
Answer concisely in plain language. Use **bold** sparingly for key numbers or labels when helpful.
If the user asks for rankings or totals, use the numbers in the snapshot when they are present; do not invent statistics.
If data for a specific request is missing from the snapshot, say so and suggest changing filters on the map.`

const app = express()
app.use(express.json({ limit: '512kb' }))
app.use(cors(corsOptions))

app.get('/health', (_req, res) => {
  res.json({ ok: true, modelConfigured: Boolean(BASE) })
})

app.post('/chat', async (req, res) => {
  if (!BASE) {
    res.status(503).json({
      error: 'CHAT_MODEL_BASE_URL is not set. Configure the server environment.',
    })
    return
  }

  const { message, context, history } = req.body || {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message (non-empty string) is required' })
    return
  }

  let contextStr = ''
  try {
    contextStr = JSON.stringify(context ?? {}, null, 2)
  } catch {
    contextStr = '{}'
  }
  if (contextStr.length > MAX_CONTEXT_CHARS) {
    contextStr = `${contextStr.slice(0, MAX_CONTEXT_CHARS)}\n… [truncated]`
  }

  const systemContent = `${SYSTEM}\n\nCurrent dashboard snapshot (JSON):\n${contextStr}`

  const prior = Array.isArray(history)
    ? history
        .filter(
          (h) =>
            h &&
            (h.role === 'user' || h.role === 'assistant') &&
            typeof h.content === 'string',
        )
        .slice(-12)
        .map((h) => ({ role: h.role, content: h.content }))
    : []

  const messages = [{ role: 'system', content: systemContent }, ...prior, { role: 'user', content: message.trim() }]

  const headers = {
    'Content-Type': 'application/json',
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
  }

  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.35,
        max_tokens: 1024,
      }),
    })

    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      const errMsg =
        typeof data?.error?.message === 'string'
          ? data.error.message
          : typeof data?.error === 'string'
            ? data.error
            : r.statusText
      res.status(r.status >= 400 ? r.status : 502).json({ error: errMsg || 'Upstream model error' })
      return
    }

    const text =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      ''
    if (typeof text !== 'string' || !text.trim()) {
      res.status(502).json({ error: 'Empty response from model' })
      return
    }

    res.json({ reply: text.trim() })
  } catch (e) {
    res.status(502).json({
      error: e instanceof Error ? e.message : 'Failed to reach model',
    })
  }
})

app.listen(PORT, () => {
  console.log(`Chat API http://localhost:${PORT}  (POST /chat, GET /health)`)
  if (!BASE) {
    console.warn('Set CHAT_MODEL_BASE_URL to enable POST /chat.')
  }
})

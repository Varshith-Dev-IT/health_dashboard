import { useEffect, useId, useRef, useState } from 'react'
import { getDashboardChatReply } from '../chat/dashboardChatbot'
import './DashboardChatbot.css'

function RichReply({ text }) {
  const parts = text.split(/\*\*/)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i}>{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

const SUGGESTIONS = [
  'How many questions can you answer?',
  'What can you answer?',
  'Top 5 districts',
  'Total for Andhra Pradesh',
  'Explain the colours',
  'What are mandals?',
  'Cases in Visakhapatnam',
]

export function DashboardChatbot({ context }) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      text: 'Ask about **rankings** (highest, lowest, top 3), **totals**, **median**, **mandals**, **colours**, **zoom**, or type a **district name** with cases or rate. I follow your current year, disease, and metric. Try **how many questions can you answer** for scope, or **what can you answer** for examples.',
    },
  ])
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, open])

  const pushExchange = (userText) => {
    const t = userText.trim()
    if (!t) return
    const answer = getDashboardChatReply(t, context)
    setMessages((m) => [...m, { role: 'user', text: t }, { role: 'assistant', text: answer }])
  }

  const onSubmit = (e) => {
    e.preventDefault()
    pushExchange(input)
    setInput('')
  }

  return (
    <div className="dashboard-chatbot">
      <button
        type="button"
        className="chat-fab"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="chat-fab-icon" aria-hidden="true">
          💬
        </span>
        <span className="chat-fab-label">Map assistant</span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="chat-panel"
          role="dialog"
          aria-label="Map dashboard assistant"
        >
          <div className="chat-panel-header">
            <div>
              <h2 className="chat-panel-title">Map assistant</h2>
              <p className="chat-panel-sub">Answers about this dashboard and its data</p>
            </div>
            <button
              type="button"
              className="chat-panel-close"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="chat-messages" ref={listRef} role="log" aria-live="polite">
            {messages.map((msg, i) => (
              <div
                key={`${i}-${msg.role}`}
                className={msg.role === 'user' ? 'chat-bubble chat-bubble-user' : 'chat-bubble chat-bubble-assistant'}
              >
                {msg.role === 'assistant' ? <RichReply text={msg.text} /> : msg.text}
              </div>
            ))}
          </div>

          <div className="chat-suggestions" aria-label="Suggested questions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="chat-chip"
                onClick={() => {
                  pushExchange(s)
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <form className="chat-form" onSubmit={onSubmit}>
            <label className="visually-hidden" htmlFor={`${panelId}-input`}>
              Your question
            </label>
            <input
              id={`${panelId}-input`}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Total cases for Andhra Pradesh?"
              autoComplete="off"
            />
            <button type="submit" className="chat-send">
              Send
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}

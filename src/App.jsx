import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ConvexProvider,
  ConvexReactClient,
  useAction,
  useMutation,
  useQuery,
} from 'convex/react'
import './App.css'
import { api } from '../convex/_generated/api.js'
import { getOrCreateOwnerSessionId } from './lib/ownerSession.js'
import AssistantMarkdown from './components/AssistantMarkdown.jsx'

const TOOL_LABELS = {
  listar_inventario_alegra: 'Consultar inventario',
  ajustar_inventario_alegra: 'Ajuste de inventario',
  crear_item_alegra: 'Crear ítem',
  actualizar_item_alegra: 'Actualizar ítem',
  listar_contactos_alegra: 'Listar contactos',
  crear_contacto_alegra: 'Crear contacto',
  obtener_contacto_alegra: 'Detalle de contacto',
  validar_extraccion_contacto_desde_documento: 'Validar datos extraídos (documento)',
  listar_cotizaciones_alegra: 'Listar cotizaciones',
  obtener_cotizacion_alegra: 'Detalle cotización',
  crear_cotizacion_alegra: 'Crear cotización',
  actualizar_cotizacion_alegra: 'Editar cotización',
}

function toolDisplayName(name) {
  return TOOL_LABELS[name] ?? name
}

const convexUrl = import.meta.env.VITE_CONVEX_URL
const CONVERSATION_Q = 'conversation'
const THEME_STORAGE_KEY = 'alegrame-theme'

const SCROLL_BOTTOM_THRESHOLD_PX = 72

function isScrollNearBottom(el, thresholdPx = SCROLL_BOTTOM_THRESHOLD_PX) {
  if (!el) return true
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  return distance <= thresholdPx
}

function getInitialTheme() {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

const DEFAULT_CONVERSATION_TITLE = 'Nueva conversación'

function isEmptyDraftConversation(c) {
  return (
    c.title === DEFAULT_CONVERSATION_TITLE &&
    Array.isArray(c.messages) &&
    c.messages.length === 0
  )
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function ChatWorkspace({ theme, onToggleTheme }) {
  const ownerSessionId = useMemo(() => getOrCreateOwnerSessionId(), [])
  const [searchParams, setSearchParams] = useSearchParams()
  const conversationId = searchParams.get(CONVERSATION_Q)

  const conversations = useQuery(api.conversations.listForOwner, {
    ownerSessionId,
  })
  const conversationDoc = useQuery(
    api.conversations.get,
    conversationId ? { conversationId } : 'skip'
  )

  const canLoadMessages =
    Boolean(conversationId) &&
    conversationDoc !== undefined &&
    conversationDoc !== null

  const messages = useQuery(
    api.messages.listForConversation,
    canLoadMessages ? { conversationId } : 'skip'
  )

  const createConversation = useMutation(api.conversations.create)
  const sendMessage = useAction(api.agentActions.sendMessage)

  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const scrollContainerRef = useRef(null)
  const rutPdfInputRef = useRef(null)
  const stickToBottomRef = useRef(true)

  const isNarrowSidebar = useMediaQuery('(max-width: 860px)')

  const streamingAssistant = messages?.some(
    (m) => m.role === 'assistant' && m.streaming === true
  )
  const showThinking = loading && !streamingAssistant

  const conversationReady = canLoadMessages

  const conversationMissing =
    Boolean(conversationId) &&
    conversations !== undefined &&
    conversationDoc === null

  const docLoading =
    Boolean(conversationId) && conversationDoc === undefined

  const busy =
    loading ||
    conversations === undefined ||
    docLoading ||
    (canLoadMessages && messages === undefined)

  useEffect(() => {
    stickToBottomRef.current = true
  }, [conversationId])

  useEffect(() => {
    if (!isNarrowSidebar || !mobileSidebarOpen) return
    function onKey(e) {
      if (e.key === 'Escape') setMobileSidebarOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isNarrowSidebar, mobileSidebarOpen])

  useEffect(() => {
    if (!isNarrowSidebar || !mobileSidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isNarrowSidebar, mobileSidebarOpen])

  useEffect(() => {
    if (!conversationReady) return
    const el = scrollContainerRef.current
    if (!el || !stickToBottomRef.current) return
    queueMicrotask(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages, loading, showThinking, conversationReady])

  function handleChatScroll() {
    stickToBottomRef.current = isScrollNearBottom(scrollContainerRef.current)
  }
  function setConversationInUrl(id) {
    const next = new URLSearchParams(searchParams)
    next.set(CONVERSATION_Q, id)
    setSearchParams(next, { replace: false })
  }

  function closeMobileSidebar() {
    if (isNarrowSidebar) setMobileSidebarOpen(false)
  }

  async function handleNewConversation() {
    setError(null)
    if (conversations === undefined) return
    const existingDraft = conversations.find(isEmptyDraftConversation)
    if (existingDraft) {
      setConversationInUrl(existingDraft._id)
      closeMobileSidebar()
      return
    }
    const id = await createConversation({ ownerSessionId })
    setConversationInUrl(id)
    closeMobileSidebar()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy || !conversationId || !conversationReady) return

    setError(null)
    setDraft('')
    setLoading(true)
    stickToBottomRef.current = true
    queueMicrotask(() => {
      const el = scrollContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    })

    try {
      await sendMessage({
        ownerSessionId,
        conversationId,
        content: text,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('No se pudo leer el PDF.'))
      }
      reader.onerror = () => reject(new Error('Error al leer el archivo.'))
      reader.readAsDataURL(file)
    })
  }

  async function handleRutPdfChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || busy || !conversationId || !conversationReady) return
    if (file.type !== 'application/pdf') {
      setError('Solo se admite un archivo PDF.')
      return
    }

    setError(null)
    setLoading(true)
    stickToBottomRef.current = true
    queueMicrotask(() => {
      const el = scrollContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    })

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const content = draft.trim()
      setDraft('')
      await sendMessage({
        ownerSessionId,
        conversationId,
        content,
        rutPdf: { filename: file.name, dataUrl },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const showEmptyChat =
    conversationReady &&
    messages !== undefined &&
    messages.length === 0 &&
    !loading

  const hasEmptyDraft =
    conversations !== undefined &&
    conversations.some(isEmptyDraftConversation)

  const sidebarOpen = !isNarrowSidebar || mobileSidebarOpen

  return (
    <div className="shell">
      {isNarrowSidebar && mobileSidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Cerrar panel de conversaciones"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <aside className="app-rail" aria-label="Navegación principal">
        <div className="rail-brand" aria-hidden="true">
          ✦
        </div>
        <nav className="rail-nav" aria-label="Secciones">
          <span className="rail-item rail-item-active" title="Chat">
            💬
          </span>
          <span className="rail-item" title="Inventario">
            ◇
          </span>
          <span className="rail-item" title="Contactos">
            ◎
          </span>
        </nav>
        <div className="rail-bottom">
          <span className="rail-help">?</span>
        </div>
      </aside>

      <aside
        id="sidebar-panel"
        className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}
        aria-hidden={isNarrowSidebar && !mobileSidebarOpen}
        inert={isNarrowSidebar && !mobileSidebarOpen}
      >
        <div className="sidebar-brand">
          <span className="brand-mark">✦</span>
          <span>Alegra AI</span>
        </div>
        <div className="sidebar-head">
          <h2 className="sidebar-title" id="sidebar-conversations-title">
            Conversaciones
          </h2>
          <button
            type="button"
            className="sidebar-new"
            onClick={() => void handleNewConversation()}
            disabled={conversations === undefined}
            title={
              hasEmptyDraft
                ? 'Ya hay un borrador vacío; se abrirá ese'
                : 'Nueva conversación'
            }
          >
            Nueva
          </button>
        </div>
        <nav
          className="sidebar-list"
          aria-labelledby="sidebar-conversations-title"
        >
          {conversations?.length === 0 && (
            <p className="sidebar-empty">Aún no hay conversaciones.</p>
          )}
          {conversations?.map((c) => (
            <Link
              key={c._id}
              to={`?${CONVERSATION_Q}=${c._id}`}
              className={`sidebar-item${
                conversationId === c._id ? ' sidebar-item-active' : ''
              }`}
              onClick={closeMobileSidebar}
            >
              <span className="sidebar-item-title">{c.title}</span>
              <span className="sidebar-item-meta">
                {c.messages.length} en contexto
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="main-header">
          {isNarrowSidebar && (
            <button
              type="button"
              className="main-menu-toggle"
              onClick={() => setMobileSidebarOpen(true)}
              aria-expanded={mobileSidebarOpen}
              aria-controls="sidebar-panel"
              aria-label="Abrir lista de conversaciones"
            >
              <span aria-hidden="true">☰</span>
            </button>
          )}
          <div className="main-heading">
            <span className="main-icon" aria-hidden="true">
              ✦
            </span>
            <div>
              <h1 className="chat-title">Agente Alegra</h1>
              <p className="chat-sub">
                Historial completo en la tabla <code>messages</code> · modelo:{' '}
                <code>conversations.messages</code>
              </p>
            </div>
          </div>
          <div className="main-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark'
                  ? 'Cambiar a modo claro'
                  : 'Cambiar a modo oscuro'
              }
              title={
                theme === 'dark'
                  ? 'Cambiar a modo claro'
                  : 'Cambiar a modo oscuro'
              }
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            </button>
            <span className="user-avatar" aria-label="Usuario">
              A
            </span>
          </div>
        </header>

        {!conversationId && (
          <div className="main-placeholder">
            <p>Selecciona una conversación o crea una nueva.</p>
          </div>
        )}

        {conversationMissing && (
          <div className="chat-banner" role="alert">
            No existe esta conversación. Elige otra en la lista.
          </div>
        )}

        {conversationReady && (
          <div className="chat-main-column">
            {error && (
              <div className="chat-banner" role="status">
                {error}
              </div>
            )}

            <div
              className="chat-scroll"
              ref={scrollContainerRef}
              onScroll={handleChatScroll}
            >
              <ul className="chat-messages" aria-live="polite">
                {showEmptyChat && (
                  <li className="chat-empty">
                    Escribe un mensaje para comenzar esta conversación.
                  </li>
                )}
                {messages?.map((m) => (
                  <li
                    key={m._id}
                    className={`msg msg-${m.role}${
                      m.role === 'assistant' && m.streaming ? ' msg-streaming' : ''
                    }`}
                  >
                    <span className="msg-label">
                      {m.role === 'user' ? 'Tú' : 'Agente'}
                    </span>
                    {m.role === 'assistant' &&
                      Array.isArray(m.toolEvents) &&
                      m.toolEvents.length > 0 && (
                        <ul
                          className="tool-events"
                          aria-label="Herramientas ejecutadas"
                        >
                          {m.toolEvents.map((ev) => {
                            const label =
                              ev.status === 'running'
                                ? `Ejecutando herramienta: ${toolDisplayName(ev.toolName)}…`
                                : `Se ejecutó la herramienta: ${toolDisplayName(ev.toolName)}`
                            return (
                              <li
                                key={ev.callId}
                                className={`tool-event tool-event-${ev.status}`}
                              >
                                <span className="tool-event-label">{label}</span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    <div
                      className={
                        m.role === 'assistant'
                          ? 'msg-markdown'
                          : 'msg-plain'
                      }
                    >
                      {m.role === 'assistant' ? (
                        <AssistantMarkdown>{m.content || ''}</AssistantMarkdown>
                      ) : (
                        m.content
                      )}
                    </div>
                  </li>
                ))}
                {showThinking && (
                  <li className="msg msg-assistant msg-pending">
                    <span className="msg-label">Agente</span>
                    <div className="msg-plain">Pensando…</div>
                  </li>
                )}
              </ul>
            </div>

            <form className="chat-composer" onSubmit={handleSubmit}>
              <input
                ref={rutPdfInputRef}
                type="file"
                accept="application/pdf"
                className="visually-hidden"
                aria-label="Adjuntar PDF de RUT o certificado"
                onChange={(e) => void handleRutPdfChange(e)}
              />
              <button
                type="button"
                className="chat-rut-upload"
                disabled={busy || !conversationId || !conversationReady}
                title="Adjuntar PDF (certificado RUT u otro documento para contacto)"
                aria-label="Adjuntar PDF para análisis del agente"
                onClick={() => rutPdfInputRef.current?.click()}
              >
                +
              </button>
              <textarea
                className="chat-input"
                rows={2}
                value={draft}
                placeholder="Escribe tu mensaje…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSubmit(e)
                  }
                }}
                disabled={busy}
                aria-label="Mensaje para el agente"
              />
              <button
                type="submit"
                className="chat-send"
                disabled={busy || !draft.trim()}
              >
                Enviar
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme)
  const client = useMemo(() => {
    if (!convexUrl?.trim()) return null
    return new ConvexReactClient(convexUrl.trim())
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  function handleToggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  if (!client) {
    return (
      <div className="chat-app">
        <header className="chat-header">
          <h1 className="chat-title">Agente Alegra</h1>
          <p className="chat-sub">
            Configura Convex: ejecuta <code>npx convex dev</code>, añade{' '}
            <code>VITE_CONVEX_URL</code> a <code>.env</code> y reinicia Vite.
          </p>
        </header>
      </div>
    )
  }

  return (
    <ConvexProvider client={client}>
      <ChatWorkspace theme={theme} onToggleTheme={handleToggleTheme} />
    </ConvexProvider>
  )
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ConvexProvider,
  ConvexReactClient,
  useAction,
  useMutation,
  useQuery,
} from "convex/react";
import "./App.css";
import rmlsasLogoUrl from "./assets/rmlsas_logo.jpeg";
import { api } from "../convex/_generated/api.js";
import { getOrCreateOwnerSessionId } from "./lib/ownerSession.js";
import AssistantMarkdown from "./components/AssistantMarkdown.jsx";

const TOOL_LABELS = {
  listar_inventario_alegra: "Consultar inventario",
  ajustar_inventario_alegra: "Ajuste de inventario",
  crear_item_alegra: "Crear ítem",
  actualizar_item_alegra: "Actualizar ítem",
  listar_contactos_alegra: "Listar contactos",
  crear_contacto_alegra: "Crear contacto",
  obtener_contacto_alegra: "Detalle de contacto",
  validar_extraccion_contacto_desde_documento:
    "Validar datos extraídos (documento)",
  listar_cotizaciones_alegra: "Listar cotizaciones",
  obtener_cotizacion_alegra: "Detalle cotización",
  crear_cotizacion_alegra: "Crear cotización",
  actualizar_cotizacion_alegra: "Editar cotización",
  transfer_to_EstadisticasAlegra: "Delegar en agente de estadísticas Alegra",
  stats_ranking_clientes_facturacion: "Estadísticas: ranking de clientes",
  stats_ranking_productos_por_lineas_factura:
    "Estadísticas: ranking de productos",
  stats_comparativo_mensual_ventas_vs_compras:
    "Estadísticas: ventas vs compras por mes",
  stats_contar_clientes_por_ciudad: "Estadísticas: clientes por ciudad",
  stats_facturas_proveedor_filtradas:
    "Estadísticas: facturas de proveedor (filtro texto)",
};

function toolDisplayName(name) {
  if (typeof name !== "string") return String(name);
  if (name.startsWith("__handoff__")) {
    const slug = name.slice("__handoff__".length).replace(/_/g, " ").trim();
    return slug
      ? `Traspaso al agente de estadísticas (${slug})`
      : "Traspaso al agente de estadísticas";
  }
  if (name.startsWith("__agent_active__")) {
    const slug = name
      .slice("__agent_active__".length)
      .replace(/_/g, " ")
      .trim();
    return slug ? `Agente activo: ${slug}` : "Agente activo";
  }
  return TOOL_LABELS[name] ?? name;
}

function ChatMicIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 14a4 4 0 004-4V6a4 4 0 00-8 0v4a4 4 0 004 4z" />
      <path d="M19 11a7 7 0 01-14 0M12 18v4M9 22h6" />
    </svg>
  );
}

function ConversationCompactBadge() {
  return (
    <div className="msg-chat-log-inner">
      <span className="msg-chat-log-sparkles" aria-hidden={true}>
        ✨
      </span>
      <span className="msg-chat-log-label">Conversación resumida</span>
    </div>
  );
}

function ToolEventIcon({ status }) {
  if (status === "running") {
    return (
      <span
        className="tool-event-icon tool-event-icon-running"
        aria-hidden="true"
      >
        <span className="tool-spinner" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="tool-event-icon tool-event-icon-error"
        aria-hidden="true"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 4L4 12M4 4l8 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="tool-event-icon tool-event-icon-done" aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3.5 8l3 3 6.5-6.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const CONVERSATION_Q = "conversation";
const THEME_STORAGE_KEY = "alegrame-theme";

const SCROLL_BOTTOM_THRESHOLD_PX = 72;
const COMPOSER_MIN_ROWS = 1;
const COMPOSER_MAX_ROWS = 10;

function isScrollNearBottom(el, thresholdPx = SCROLL_BOTTOM_THRESHOLD_PX) {
  if (!el) return true;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance <= thresholdPx;
}

function getInitialTheme() {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const DEFAULT_CONVERSATION_TITLE = "Nueva conversación";

/** Debe coincidir con `DEFAULT_RUT_PDF_USER_COPY` en convex/agentActions.ts (texto guardado si solo hay PDF). */
const DEFAULT_RUT_PDF_USER_COPY =
  "Adjunto PDF de certificado RUT (Chile). Extrae los datos para dar de alta el contacto en Alegra: usa **validar_extraccion_contacto_desde_documento** con lo leído, muestra un resumen claro y **no** llames **crear_contacto_alegra** hasta que confirme explícitamente.";

/** Logo RML SAS en sidebar: recorte franja central del JPEG (ratio ancho:alto constante). */
function RmlSasBrandLogo({ className = "" }) {
  const cls = ["brand-logo-crop", className].filter(Boolean).join(" ");
  return (
    <span className={cls}>
      <img
        src={rmlsasLogoUrl}
        alt="RML SAS"
        width={76}
        height={39}
        decoding="async"
      />
    </span>
  );
}

function isEmptyDraftConversation(c) {
  return (
    c.title === DEFAULT_CONVERSATION_TITLE &&
    Array.isArray(c.messages) &&
    c.messages.length === 0
  );
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function ChatWorkspace({ theme, onToggleTheme }) {
  const ownerSessionId = useMemo(() => getOrCreateOwnerSessionId(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get(CONVERSATION_Q);

  const conversations = useQuery(api.conversations.listForOwner, {
    ownerSessionId,
  });
  const conversationDoc = useQuery(
    api.conversations.get,
    conversationId ? { conversationId } : "skip",
  );

  const canLoadMessages =
    Boolean(conversationId) &&
    conversationDoc !== undefined &&
    conversationDoc !== null;

  const messages = useQuery(
    api.messages.listForConversation,
    canLoadMessages ? { conversationId } : "skip",
  );

  const createConversation = useMutation(api.conversations.create);
  const sendMessage = useAction(api.agentActions.sendMessage);

  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  /** Texto exacto que persistirá Convex (`messages.content`) hasta que llegue por suscripción. */
  const [pendingOptimisticUser, setPendingOptimisticUser] = useState(null);
  const [error, setError] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const scrollContainerRef = useRef(null);
  const rutPdfInputRef = useRef(null);
  const composerTextareaRef = useRef(null);
  /** Tras «Nueva conversación»: enfocar textarea cuando la UI esté lista (`busy` puede esperar mensajes). */
  const pendingComposerFocusConversationIdRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const speechRecognitionRef = useRef(null);
  /** Texto previo del compositor al iniciar dictado. */
  const speechDraftPrefixRef = useRef("");
  /** Texto transcrito final acumulado en esta sesión de dictado. */
  const speechFinalBufferRef = useRef("");
  const [dictationListening, setDictationListening] = useState(false);

  const speechSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  const isNarrowSidebar = useMediaQuery("(max-width: 860px)");

  const streamingAssistant = messages?.some(
    (m) => m.role === "assistant" && m.streaming === true,
  );
  const showThinking = loading && !streamingAssistant;

  const displayMessages = useMemo(() => {
    const base = messages ?? [];
    if (!pendingOptimisticUser) return base;
    const echoed = base.some(
      (m) =>
        m.role === "user" &&
        m.content === pendingOptimisticUser.storedContent,
    );
    if (echoed) return base;
    return [
      ...base,
      {
        _id: "__optimistic_user__",
        role: "user",
        content: pendingOptimisticUser.storedContent,
      },
    ];
  }, [messages, pendingOptimisticUser]);

  const conversationReady = canLoadMessages;

  const conversationMissing =
    Boolean(conversationId) &&
    conversations !== undefined &&
    conversationDoc === null;

  const docLoading = Boolean(conversationId) && conversationDoc === undefined;

  const busy =
    loading ||
    conversations === undefined ||
    docLoading ||
    (canLoadMessages && messages === undefined);

  useLayoutEffect(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
    const verticalPadding =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom);
    const verticalBorder =
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);
    const maxHeight =
      lineHeight * COMPOSER_MAX_ROWS + verticalPadding + verticalBorder;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [conversationId]);

  useLayoutEffect(() => {
    const targetId = pendingComposerFocusConversationIdRef.current;
    if (!conversationId || !targetId) return;
    if (targetId !== conversationId) {
      pendingComposerFocusConversationIdRef.current = null;
      return;
    }
    if (!conversationReady || busy) return;
    pendingComposerFocusConversationIdRef.current = null;
    composerTextareaRef.current?.focus({ preventScroll: true });
  }, [conversationReady, conversationId, busy]);

  useEffect(() => {
    setPendingOptimisticUser(null);
  }, [conversationId]);

  useEffect(() => {
    if (!pendingOptimisticUser || messages === undefined) return;
    const echoed = messages.some(
      (m) =>
        m.role === "user" &&
        m.content === pendingOptimisticUser.storedContent,
    );
    if (echoed) setPendingOptimisticUser(null);
  }, [messages, pendingOptimisticUser]);

  useEffect(() => {
    if (!isNarrowSidebar || !mobileSidebarOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNarrowSidebar, mobileSidebarOpen]);

  useEffect(() => {
    if (!isNarrowSidebar || !mobileSidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isNarrowSidebar, mobileSidebarOpen]);

  useEffect(() => {
    if (!conversationReady) return;
    const el = scrollContainerRef.current;
    if (!el || !stickToBottomRef.current) return;
    queueMicrotask(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [displayMessages, loading, showThinking, conversationReady]);

  useEffect(() => {
    const rec = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (rec) {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    }
  }, [conversationId]);

  function abortSpeechDictation() {
    const rec = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (rec) {
      try {
        rec.abort();
      } catch {
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
    }
    setDictationListening(false);
  }

  function toggleSpeechDictation() {
    const Rec =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Rec || busy || !conversationId || !conversationReady) return;

    if (dictationListening || speechRecognitionRef.current) {
      abortSpeechDictation();
      return;
    }

    speechDraftPrefixRef.current = draft;
    speechFinalBufferRef.current = "";

    const recognition = new Rec();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const row = event.results[i];
        const piece = row[0]?.transcript ?? "";
        if (!piece) continue;
        if (row.isFinal) {
          const trimmed = piece.trim();
          if (trimmed) {
            const prev = speechFinalBufferRef.current;
            speechFinalBufferRef.current =
              prev && !/\s$/.test(prev)
                ? `${prev} ${trimmed}`
                : `${prev}${trimmed}`;
          }
        } else {
          interimChunk += piece;
        }
      }

      const prefix = speechDraftPrefixRef.current;
      const finals = speechFinalBufferRef.current;
      let assembled = prefix;
      if (finals) {
        if (assembled.length > 0 && !/\s$/.test(assembled)) assembled += " ";
        assembled += finals;
      }
      if (interimChunk) {
        if (assembled.length > 0 && !/\s$/.test(assembled)) assembled += " ";
        assembled += interimChunk;
      }
      setDraft(assembled);
    };

    recognition.onerror = (evt) => {
      const err = evt.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        setError(
          "Micrófono denegado o sin permiso. Permite acceso para dictar en español.",
        );
      } else if (err !== "no-speech" && err !== "aborted") {
        setError(`No se pudo dictar (${String(err)})`);
      }
      speechRecognitionRef.current = null;
      setDictationListening(false);
    };

    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setDictationListening(false);
    };

    try {
      recognition.start();
      speechRecognitionRef.current = recognition;
      setDictationListening(true);
    } catch {
      speechRecognitionRef.current = null;
      setDictationListening(false);
      setError("No se pudo iniciar el dictado de voz.");
    }
  }

  function handleChatScroll() {
    stickToBottomRef.current = isScrollNearBottom(scrollContainerRef.current);
  }
  function setConversationInUrl(id) {
    const next = new URLSearchParams(searchParams);
    next.set(CONVERSATION_Q, id);
    setSearchParams(next, { replace: false });
  }

  function closeMobileSidebar() {
    if (isNarrowSidebar) setMobileSidebarOpen(false);
  }

  async function handleNewConversation() {
    setError(null);
    if (conversations === undefined) return;
    const existingDraft = conversations.find(isEmptyDraftConversation);
    if (existingDraft) {
      pendingComposerFocusConversationIdRef.current = existingDraft._id;
      setConversationInUrl(existingDraft._id);
      closeMobileSidebar();
      return;
    }
    const id = await createConversation({ ownerSessionId });
    pendingComposerFocusConversationIdRef.current = id;
    setConversationInUrl(id);
    closeMobileSidebar();
  }

  function handleSubmit(e) {
    e?.preventDefault?.();
    abortSpeechDictation();
    const text = draft.trim();
    if (!text || busy || !conversationId || !conversationReady) return;

    setError(null);
    setDraft("");
    setPendingOptimisticUser({ storedContent: text });
    setLoading(true);
    stickToBottomRef.current = true;
    queueMicrotask(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });

    sendMessage({
      ownerSessionId,
      conversationId,
      content: text,
    })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setPendingOptimisticUser(null);
      })
      .finally(() => setLoading(false));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("No se pudo leer el PDF."));
      };
      reader.onerror = () => reject(new Error("Error al leer el archivo."));
      reader.readAsDataURL(file);
    });
  }

  async function handleRutPdfChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy || !conversationId || !conversationReady) return;
    abortSpeechDictation();
    if (file.type !== "application/pdf") {
      setError("Solo se admite un archivo PDF.");
      return;
    }

    setError(null);
    setLoading(true);
    stickToBottomRef.current = true;
    queueMicrotask(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });

    const content = draft.trim();
    const messageText = content || DEFAULT_RUT_PDF_USER_COPY;
    const safeName = file.name.trim() || "documento.pdf";
    const storedContent = `${messageText}\n\n[Adjunto PDF: ${safeName}]`;
    setDraft("");
    setPendingOptimisticUser({ storedContent });

    try {
      const dataUrl = await readFileAsDataUrl(file);
      sendMessage({
        ownerSessionId,
        conversationId,
        content,
        rutPdf: { filename: file.name, dataUrl },
      })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          setPendingOptimisticUser(null);
        })
        .finally(() => setLoading(false));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPendingOptimisticUser(null);
      setLoading(false);
    }
  }

  const showEmptyChat =
    conversationReady &&
    messages !== undefined &&
    messages.length === 0 &&
    !loading &&
    !pendingOptimisticUser;

  const hasEmptyDraft =
    conversations !== undefined && conversations.some(isEmptyDraftConversation);

  const sidebarOpen = !isNarrowSidebar || mobileSidebarOpen;

  const mainColumnClass = `chat-main-column${
    showEmptyChat ? " chat-main-column--empty" : ""
  }`;
  const composerWrapClass = `chat-composer-wrap${
    showEmptyChat ? " chat-composer-wrap--hero" : ""
  }`;

  const chatComposerForm = (
    <form
      className="chat-composer"
      onSubmit={handleSubmit}
      onMouseDown={(event) => {
        const t = event.target;
        if (!(t instanceof Element)) return;
        if (t.closest("button") || t === composerTextareaRef.current) return;
        queueMicrotask(() => composerTextareaRef.current?.focus());
      }}
    >
      <input
        ref={rutPdfInputRef}
        type="file"
        accept="application/pdf"
        className="visually-hidden"
        aria-label="Adjuntar PDF de RUT o certificado"
        onChange={(e) => void handleRutPdfChange(e)}
      />
      <label htmlFor="alegrame-chat-input" className="visually-hidden">
        Mensaje para el agente
      </label>
      <textarea
        id="alegrame-chat-input"
        ref={composerTextareaRef}
        className="chat-input"
        rows={COMPOSER_MIN_ROWS}
        value={draft}
        placeholder="Escribe tu mensaje…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit(e);
          }
        }}
        disabled={busy}
        autoComplete="off"
      />
      <div className="chat-composer-footer">
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
        <span className="chat-composer-hint">
          Enter envía · Shift+Enter nueva línea · Dictado: español
        </span>
        <button
          type="button"
          className={`chat-voice${dictationListening ? " chat-voice-listening" : ""}`}
          disabled={
            busy || !speechSupported || !conversationId || !conversationReady
          }
          title={
            !speechSupported
              ? "Dictado no disponible en este navegador (usa Chrome, Edge o Safari)."
              : dictationListening
                ? "Detener dictado"
                : "Dictar en español (pulsa para iniciar)"
          }
          aria-label={
            dictationListening ? "Detener dictado" : "Dictar en español"
          }
          aria-pressed={dictationListening}
          onClick={() => toggleSpeechDictation()}
        >
          <ChatMicIcon className="chat-voice-icon" />
        </button>
        <button
          type="submit"
          className="chat-send"
          disabled={busy || !draft.trim()}
          aria-label="Enviar mensaje"
        >
          <svg className="chat-send-icon" viewBox="0 0 20 20" aria-hidden>
            <path
              d="M10 15V5M5.75 9.25 10 5l4.25 4.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </form>
  );

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
      <aside
        id="sidebar-panel"
        className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`}
        aria-hidden={isNarrowSidebar && !mobileSidebarOpen}
        inert={isNarrowSidebar && !mobileSidebarOpen}
      >
        <div className="sidebar-brand">
          <RmlSasBrandLogo />
          <span>Alegra IA</span>
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
                ? "Ya hay un borrador vacío; se abrirá ese"
                : "Nueva conversación"
            }
            aria-label="Nueva conversación"
          >
            <svg className="sidebar-new-icon" viewBox="0 0 20 20" aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                d="M10 4v12M4 10h12"
              />
            </svg>
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
                conversationId === c._id ? " sidebar-item-active" : ""
              }`}
              onClick={closeMobileSidebar}
            >
              <span className="sidebar-item-title">{c.title}</span>
              <span className="sidebar-item-meta">
                {new Date(c._creationTime).toLocaleString("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                })}
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
            <div>
              <h1 className="chat-title">Alegra IA - RML SAS</h1>
            </div>
          </div>
          <div className="main-actions">
            <div className="theme-switch-wrap">
              <span className="theme-switch-prefix" id="theme-mode-label">
                Modo:
              </span>
              <span
                className={`theme-switch-glyph theme-switch-glyph-sun${theme === "light" ? " theme-switch-glyph--active" : ""}`}
                aria-hidden
              >
                ☀
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                aria-labelledby="theme-mode-label"
                className={`theme-switch${theme === "dark" ? " theme-switch--dark" : ""}`}
                onClick={onToggleTheme}
              ></button>
              <span
                className={`theme-switch-glyph theme-switch-glyph-moon${theme === "dark" ? " theme-switch-glyph--active" : ""}`}
                aria-hidden
              >
                ☾
              </span>
            </div>
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
          <div className={mainColumnClass}>
            {error && (
              <div className="chat-banner" role="status">
                {error}
              </div>
            )}

            {showEmptyChat ? (
              <div
                className="chat-empty-hero"
                aria-labelledby="chat-empty-heading"
              >
                <h2 id="chat-empty-heading" className="chat-empty-prompt">
                  ¿En qué puedo ayudarte con RML SAS hoy?
                </h2>
                <div className={composerWrapClass}>{chatComposerForm}</div>
              </div>
            ) : (
              <>
                <div
                  className="chat-scroll"
                  ref={scrollContainerRef}
                  onScroll={handleChatScroll}
                >
                  <ul className="chat-messages" aria-live="polite">
                    {displayMessages.map((m) => {
                      if (m.uiLogKind === "conversation_compacted") {
                        return (
                          <li
                            key={m._id}
                            className="msg msg-chat-log"
                            role="status"
                          >
                            <ConversationCompactBadge />
                          </li>
                        );
                      }
                      return (
                        <li
                          key={m._id}
                          className={`msg msg-${m.role}${
                            m.role === "assistant" && m.streaming
                              ? " msg-streaming"
                              : ""
                          }`}
                        >
                          <span className="msg-label">
                            {m.role === "user" ? "Tú" : "Agente"}
                          </span>
                          {m.role === "assistant" &&
                            Array.isArray(m.toolEvents) &&
                            m.toolEvents.length > 0 && (
                              <ul
                                className="tool-events"
                                aria-label="Herramientas ejecutadas"
                              >
                                {m.toolEvents.map((ev) => {
                                  const label =
                                    ev.status === "running"
                                      ? `Ejecutando herramienta: ${toolDisplayName(ev.toolName)}…`
                                      : ev.status === "error"
                                        ? `Error al ejecutar: ${toolDisplayName(ev.toolName)}`
                                        : `Se ejecutó la herramienta: ${toolDisplayName(ev.toolName)}`;
                                  return (
                                    <li
                                      key={ev.callId}
                                      className={`tool-event tool-event-${ev.status}`}
                                      aria-busy={ev.status === "running"}
                                    >
                                      <ToolEventIcon status={ev.status} />
                                      <span className="tool-event-label">
                                        {label}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          <div
                            className={
                              m.role === "assistant"
                                ? "msg-markdown"
                                : "msg-plain"
                            }
                          >
                            {m.role === "assistant" ? (
                              <AssistantMarkdown>
                                {m.content || ""}
                              </AssistantMarkdown>
                            ) : (
                              m.content
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {showThinking && (
                      <li className="msg msg-assistant msg-pending">
                        <span className="msg-label">Agente</span>
                        <div className="msg-plain">Pensando…</div>
                      </li>
                    )}
                  </ul>
                </div>

                <div className={composerWrapClass}>{chatComposerForm}</div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const client = useMemo(() => {
    if (!convexUrl?.trim()) return null;
    return new ConvexReactClient(convexUrl.trim());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function handleToggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  if (!client) {
    return (
      <div className="chat-app">
        <header className="chat-header">
          <h1 className="chat-title">Agente Alegra</h1>
          <p className="chat-sub">
            Configura Convex: ejecuta <code>npx convex dev</code>, añade{" "}
            <code>VITE_CONVEX_URL</code> a <code>.env</code> y reinicia Vite.
          </p>
        </header>
      </div>
    );
  }

  return (
    <ConvexProvider client={client}>
      <ChatWorkspace theme={theme} onToggleTheme={handleToggleTheme} />
    </ConvexProvider>
  );
}

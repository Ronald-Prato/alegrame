import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Turnos de texto en la ventana del modelo. */
export const plainContextTurn = v.object({
  role: v.union(v.literal('user'), v.literal('assistant')),
  content: v.string(),
})

/** Resultado opaco de `responses.compact` (OpenAI Agents SDK). */
export const compactionContextTurn = v.object({
  kind: v.literal('compaction'),
  payloadJson: v.string(),
})

export const conversationContextTurn = v.union(
  plainContextTurn,
  compactionContextTurn,
)

const toolEventRow = v.object({
  callId: v.string(),
  toolName: v.string(),
  status: v.union(
    v.literal('running'),
    v.literal('done'),
    v.literal('error'),
  ),
  inputSummary: v.optional(v.string()),
  outputSummary: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
})

export default defineSchema({
  conversations: defineTable({
    /** Agrupa conversaciones por cliente (p. ej. localStorage) sin auth */
    ownerSessionId: v.string(),
    title: v.string(),
    /** Ventana enviada al agente; puede incluir items `responses.compact` (kind compaction). */
    messages: v.array(conversationContextTurn),
  }).index('by_owner', ['ownerSessionId']),

  /** Historial completo de la UI; cada turno usuario/asistente es una fila (no se compacta aquí). */
  messages: defineTable({
    conversationId: v.id('conversations'),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    streaming: v.optional(v.boolean()),
    /** Llamadas a herramientas durante esta respuesta del asistente (telemetría UI). */
    toolEvents: v.optional(v.array(toolEventRow)),
    /** Marcador solo para líneas de sistema en el hilo visible. */
    uiLogKind: v.optional(v.union(v.literal('conversation_compacted'))),
  }).index('by_conversation', ['conversationId']),
})

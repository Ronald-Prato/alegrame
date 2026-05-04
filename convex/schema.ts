import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Mensaje en la ventana de contexto del modelo (puede compactarse sin borrar el historial). */
const contextMessage = v.object({
  role: v.union(v.literal('user'), v.literal('assistant')),
  content: v.string(),
})

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
    /** Ventana enviada al agente; puede recortarse o compactarse */
    messages: v.array(contextMessage),
  }).index('by_owner', ['ownerSessionId']),

  /** Historial completo, una fila por mensaje */
  messages: defineTable({
    conversationId: v.id('conversations'),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    streaming: v.optional(v.boolean()),
    /** Llamadas a herramientas durante esta respuesta del asistente (telemetría UI). */
    toolEvents: v.optional(v.array(toolEventRow)),
  }).index('by_conversation', ['conversationId']),
})

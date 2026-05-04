import { internalMutation, mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { conversationContextTurn } from './schema'

export const create = mutation({
  args: {
    ownerSessionId: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('conversations', {
      ownerSessionId: args.ownerSessionId,
      title: (args.title?.trim() || 'Nueva conversación').slice(0, 120),
      messages: [],
    })
  },
})

export const listForOwner = query({
  args: { ownerSessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('conversations')
      .withIndex('by_owner', (q) =>
        q.eq('ownerSessionId', args.ownerSessionId)
      )
      .order('desc')
      .collect()
  },
})

export const get = query({
  args: { conversationId: v.id('conversations') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId)
  },
})

/**
 * Recorta solo el campo `messages` (contexto del modelo). La tabla `messages`
 * conserva el historial completo.
 */
export const trimContextWindow = mutation({
  args: {
    conversationId: v.id('conversations'),
    ownerSessionId: v.string(),
    maxMessages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId)
    if (!conv || conv.ownerSessionId !== args.ownerSessionId) {
      throw new Error('Conversación no encontrada')
    }
    const max = args.maxMessages ?? 40
    if (conv.messages.length <= max) return { trimmed: false as const }
    await ctx.db.patch(args.conversationId, {
      messages: conv.messages.slice(-max),
    })
    return { trimmed: true as const }
  },
})

/** Punto de extensión: reemplazar el contexto por un resumen + cola reciente (ahora = solo recorte). */
export const compactContextPlaceholder = mutation({
  args: {
    conversationId: v.id('conversations'),
    ownerSessionId: v.string(),
    keepLast: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId)
    if (!conv || conv.ownerSessionId !== args.ownerSessionId) {
      throw new Error('Conversación no encontrada')
    }
    const keep = args.keepLast ?? 20
    await ctx.db.patch(args.conversationId, {
      messages: conv.messages.slice(-keep),
    })
    return { ok: true as const }
  },
})

export const internalAppendContext = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    entry: conversationContextTurn,
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId)
    if (!conv) return
    await ctx.db.patch(args.conversationId, {
      messages: [...conv.messages, args.entry],
    })
  },
})

export const internalSetContext = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    messages: v.array(conversationContextTurn),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      messages: args.messages,
    })
  },
})

export const internalTrimContextTail = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    maxMessages: v.number(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId)
    if (!conv) return
    if (conv.messages.length <= args.maxMessages) return
    await ctx.db.patch(args.conversationId, {
      messages: conv.messages.slice(-args.maxMessages),
    })
  },
})

export const internalPatchTitle = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      title: args.title.slice(0, 120),
    })
  },
})

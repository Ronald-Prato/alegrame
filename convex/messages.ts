import { internalMutation, internalQuery, query } from './_generated/server'
import { v } from 'convex/values'

export const listForConversation = query({
  args: { conversationId: v.id('conversations') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', args.conversationId)
      )
      .order('asc')
      .collect()
  },
})

export const internalAdd = internalMutation({
  args: {
    conversationId: v.id('conversations'),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    streaming: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      ...(args.streaming !== undefined ? { streaming: args.streaming } : {}),
    })
  },
})

/** Línea de sistema visible en el chat (historial tabla `messages` intacto por turnos). */
export const internalAppendCompactNotice = internalMutation({
  args: { conversationId: v.id('conversations') },
  handler: async (ctx, args) => {
    return await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      role: 'assistant',
      content: '',
      uiLogKind: 'conversation_compacted',
    })
  },
})

export const internalCreateAssistantDraft = internalMutation({
  args: { conversationId: v.id('conversations') },
  handler: async (ctx, args) => {
    return await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      role: 'assistant',
      content: '',
      streaming: true,
    })
  },
})

export const internalAppendAssistantDelta = internalMutation({
  args: {
    messageId: v.id('messages'),
    delta: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.messageId)
    if (!doc || doc.role !== 'assistant') return
    await ctx.db.patch(args.messageId, {
      content: doc.content + args.delta,
    })
  },
})

export const internalSetAssistantContent = internalMutation({
  args: {
    messageId: v.id('messages'),
    content: v.string(),
    streaming: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      streaming: args.streaming,
    })
  },
})

export const internalFinalizeAssistantStream = internalMutation({
  args: { messageId: v.id('messages') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { streaming: false })
  },
})

export const internalGet = internalQuery({
  args: { messageId: v.id('messages') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId)
  },
})

export const internalAppendToolEvent = internalMutation({
  args: {
    messageId: v.id('messages'),
    callId: v.string(),
    toolName: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.messageId)
    if (!doc || doc.role !== 'assistant') return
    const prev = doc.toolEvents ?? []
    if (prev.some((t) => t.callId === args.callId)) return
    await ctx.db.patch(args.messageId, {
      toolEvents: [
        ...prev,
        {
          callId: args.callId,
          toolName: args.toolName,
          status: 'running' as const,
        },
      ],
    })
  },
})

export const internalCompleteToolEvent = internalMutation({
  args: {
    messageId: v.id('messages'),
    callId: v.string(),
    failed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.messageId)
    if (!doc?.toolEvents?.length) return
    const next = doc.toolEvents.map((t) => {
      if (t.callId !== args.callId) return t
      const status = args.failed === true ? ('error' as const) : ('done' as const)
      return {
        ...t,
        status,
      }
    })
    await ctx.db.patch(args.messageId, { toolEvents: next })
  },
})

import { httpRouter } from 'convex/server'
import type { Id } from './_generated/dataModel'
import { api } from './_generated/api'
import { httpAction } from './_generated/server'

/**
 * Rutas HTTP públicas (`.convex.site`).
 */
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
}

const http = httpRouter()

http.route({
  path: '/agent/send',
  method: 'OPTIONS',
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders })
  }),
})

http.route({
  path: '/agent/send',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    let body: {
      ownerSessionId?: string
      conversationId?: string
      content?: string
    }
    try {
      body = await request.json()
    } catch {
      return new Response(JSON.stringify({ error: 'JSON inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (
      typeof body.ownerSessionId !== 'string' ||
      typeof body.conversationId !== 'string' ||
      typeof body.content !== 'string'
    ) {
      return new Response(
        JSON.stringify({
          error:
            'Requiere ownerSessionId (string), conversationId (id) y content (string).',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const result = await ctx.runAction(api.agentActions.sendMessage, {
      ownerSessionId: body.ownerSessionId,
      conversationId: body.conversationId as Id<'conversations'>,
      content: body.content,
    })

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }),
})

export default http

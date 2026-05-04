import { tool } from '@openai/agents'
import { z } from 'zod'
import { alegraJsonRequest } from '../lib/alegraClient'

/** Línea de cotización (ítem de catálogo Alegra). Ver PUT /estimates/{id} en la doc. */
const estimateLineSchema = z.object({
  item_id: z.string().describe('Id del producto/servicio en Alegra (catálogo /items).'),
  quantity: z
    .number()
    .describe('Cantidad cotizada (> 0). El precio no incluye impuestos ni descuentos.'),
  price: z
    .number()
    .describe(
      'Precio unitario en la cotización **sin** impuestos ni descuentos (según documentación Alegra).',
    ),
  description: z
    .string()
    .describe('Descripción de la línea; cadena vacía para omitir.'),
  reference: z
    .string()
    .describe('Referencia del producto en la línea; cadena vacía para omitir.'),
  discount: z
    .number()
    .default(-1)
    .describe(
      'Porcentaje de descuento **sin** símbolo %; **-1** = no enviar descuento en esta línea.',
    ),
  tax_ids: z
    .array(z.string())
    .default([])
    .describe(
      'Ids de impuestos Alegra aplicados a la línea (ej. IVA); vacío si no aplica impuesto explícito.',
    ),
})

function buildEstimateItemsFromLines(
  lines: z.infer<typeof estimateLineSchema>[],
): Record<string, unknown>[] {
  return lines
    .filter((l) => l.item_id.trim())
    .map((l) => {
      const row: Record<string, unknown> = {
        id: l.item_id.trim(),
        quantity: l.quantity,
        price: l.price,
      }
      if (l.description.trim()) row.description = l.description.trim()
      if (l.reference.trim()) row.reference = l.reference.trim()
      if (l.discount >= 0) row.discount = l.discount
      if (l.tax_ids.length > 0) {
        row.tax = l.tax_ids.map((id) => ({ id: id.trim() })).filter((t) => t.id)
      }
      return row
    })
}

/**
 * GET /estimates — listar cotizaciones.
 * https://developer.alegra.com/reference/get_estimates
 */
export function createAlegraListEstimatesTool() {
  return tool({
    name: 'listar_cotizaciones_alegra',
    description:
      'Lista cotizaciones en Alegra (GET `/estimates`). Hasta **30** por llamada (`limit` ≤ 30). Filtros opcionales: cliente, ítem, fecha, numeración. Con `metadata=true` la respuesta incluye `metadata.total` y array `data`. Orden: `order_field` id | name | date | dueDate y `order_direction` ASC | DESC.',
    parameters: z.object({
      start: z
        .number()
        .describe(
          'Desde qué cotización paginar (ej. 20); **0** = no enviar (inicio por defecto API).',
        ),
      limit: z
        .number()
        .describe(
          'Cantidad a retornar; **máximo 30** (Alegra error si es mayor). **0** = omitir (API suele usar 30 por defecto).',
        ),
      order_direction: z
        .enum(['', 'ASC', 'DESC'])
        .describe('Vacío = comportamiento por defecto API (ASC).'),
      order_field: z
        .enum(['', 'id', 'name', 'date', 'dueDate'])
        .describe('Campo de orden; vacío = defecto API.'),
      metadata: z
        .boolean()
        .describe('true para incluir total de cotizaciones en `metadata` y lista en `data`.'),
      item_id: z.string().describe('Filtrar por id de ítem; vacío = sin filtro.'),
      client_id: z.string().describe('Filtrar por id de cliente; vacío = sin filtro.'),
      number: z
        .string()
        .describe('Filtrar por numeración (prefijo+número según doc); vacío = sin filtro.'),
      client_name: z.string().describe('Filtrar por nombre de cliente; vacío = sin filtro.'),
      date: z
        .string()
        .describe('Filtrar por fecha de cotización `YYYY-MM-DD`; vacío = sin filtro.'),
    }),
    execute: async (args) => {
      if (args.limit > 30) {
        return JSON.stringify({
          error:
            'El límite de cotizaciones debe ser menor o igual a 30 (documentación Alegra GET /estimates).',
        })
      }
      const params = new URLSearchParams()
      if (args.start > 0) params.set('start', String(args.start))
      if (args.limit > 0) params.set('limit', String(args.limit))
      if (args.order_direction.trim())
        params.set('order_direction', args.order_direction.trim())
      if (args.order_field.trim()) params.set('order_field', args.order_field.trim())
      if (args.metadata) params.set('metadata', 'true')
      if (args.item_id.trim()) params.set('item_id', args.item_id.trim())
      if (args.client_id.trim()) params.set('client_id', args.client_id.trim())
      if (args.number.trim()) params.set('number', args.number.trim())
      if (args.client_name.trim()) params.set('client_name', args.client_name.trim())
      if (args.date.trim()) params.set('date', args.date.trim())

      const qs = params.toString()
      const path = qs ? `/estimates?${qs}` : '/estimates'
      const result = await alegraJsonRequest('GET', path)
      return JSON.stringify(result)
    },
  })
}

/**
 * GET /estimates/{id}
 * https://developer.alegra.com/reference/get_estimates-id
 */
export function createAlegraGetEstimateTool() {
  return tool({
    name: 'obtener_cotizacion_alegra',
    description:
      'Obtiene una cotización por **id** (GET `/estimates/{id}`). Usa el id del listado. Con `include_comments=true` añade query `fields=comments` según documentación Alegra.',
    parameters: z.object({
      estimate_id: z.string().describe('Id de la cotización en Alegra.'),
      include_comments: z
        .boolean()
        .describe('true para solicitar comentarios asociados (`fields=comments`).'),
    }),
    execute: async (args) => {
      const id = encodeURIComponent(args.estimate_id.trim())
      const path = args.include_comments
        ? `/estimates/${id}?fields=${encodeURIComponent('comments')}`
        : `/estimates/${id}`
      const result = await alegraJsonRequest('GET', path)
      return JSON.stringify(result)
    },
  })
}

/**
 * POST /estimates — crear cotización.
 * https://developer.alegra.com/reference/post_estimates
 *
 * Esquema «genérico»: obligatorios **date**, **dueDate**, **client**, **items**.
 */
export function createAlegraCreateEstimateTool() {
  return tool({
    name: 'crear_cotizacion_alegra',
    description:
      'Crea una cotización (POST `/estimates`). Antes de llamar, confirma con el usuario los campos **obligatorios** del esquema Alegra: **date**, **dueDate**, **client** (id) y **items** (cada línea: id de ítem del catálogo, **price** sin impuestos/descuentos, **quantity**). Opcionales según doc: observations, anotation, seller, priceList, warehouse, costCenter, currency (multimoneda), numberTemplate. Obtén **client_id** con listar_contactos_alegra y **item_id**/precios con listar_inventario_alegra.',
    parameters: z.object({
      date: z.string().describe('Fecha cotización `YYYY-MM-DD` (obligatoria en POST).'),
      due_date: z.string().describe('Vencimiento `YYYY-MM-DD` (obligatorio en POST).'),
      client_id: z.string().describe('Id del cliente/contacto en Alegra (obligatorio).'),
      lines: z
        .array(estimateLineSchema)
        .min(1)
        .describe('Líneas: ítem de catálogo con cantidad y precio unitario sin impuestos.'),
      observations: z
        .string()
        .describe('Observaciones internas (máx. 500); vacío para omitir.'),
      anotation: z
        .string()
        .describe('Notas visibles en PDF (máx. 500); vacío para omitir.'),
      seller_id: z.string().describe('Id vendedor; vacío para omitir.'),
      price_list_id: z.string().describe('Id lista de precios; vacío para omitir.'),
      warehouse_id: z.string().describe('Id bodega; vacío = principal según doc.'),
      cost_center_id: z.string().describe('Id centro de costo; vacío para omitir.'),
      currency_code: z
        .string()
        .describe('Código ISO 4217 (3 letras), solo si multimoneda; vacío para omitir.'),
      currency_exchange_rate: z
        .number()
        .describe(
          'Tasa de cambio; obligatoria si `currency_code` no está vacía (doc Alegra). Usar -1 si no aplica multimoneda.',
        ),
      number_template_id: z.string().describe('Id numeración cotización; vacío para omitir.'),
    }),
    execute: async (args) => {
      const clientId = args.client_id.trim()
      if (!clientId) {
        return JSON.stringify({
          error: 'POST /estimates exige **client** con id (documentación Alegra).',
        })
      }
      if (!args.date.trim() || !args.due_date.trim()) {
        return JSON.stringify({
          error: 'POST /estimates exige **date** y **dueDate** (documentación Alegra).',
        })
      }

      const items = buildEstimateItemsFromLines(args.lines)
      if (items.length === 0) {
        return JSON.stringify({
          error: 'Se requiere al menos una línea con item_id válido en **items**.',
        })
      }
      for (const it of items) {
        const q = Number(it.quantity)
        const p = Number(it.price)
        if (!(q > 0)) {
          return JSON.stringify({
            error: 'Cada línea debe tener quantity mayor que 0.',
          })
        }
        if (!(p >= 0)) {
          return JSON.stringify({
            error: 'Cada línea debe tener price válido (≥ 0).',
          })
        }
      }

      const code = args.currency_code.trim()
      if (code && !(args.currency_exchange_rate > 0)) {
        return JSON.stringify({
          error:
            'Con **currency** activa, Alegra exige **exchangeRate** (> 0) junto al código ISO.',
        })
      }

      const body: Record<string, unknown> = {
        date: args.date.trim(),
        dueDate: args.due_date.trim(),
        client: { id: clientId },
        items,
      }

      if (args.observations.trim()) body.observations = args.observations.trim()
      if (args.anotation.trim()) body.anotation = args.anotation.trim()
      if (args.seller_id.trim()) body.seller = { id: args.seller_id.trim() }
      if (args.price_list_id.trim()) body.priceList = { id: args.price_list_id.trim() }
      if (args.warehouse_id.trim()) body.warehouse = { id: args.warehouse_id.trim() }
      if (args.cost_center_id.trim()) body.costCenter = { id: args.cost_center_id.trim() }
      if (code) {
        body.currency = { code, exchangeRate: args.currency_exchange_rate }
      }
      if (args.number_template_id.trim()) {
        body.numberTemplate = { id: args.number_template_id.trim() }
      }

      const result = await alegraJsonRequest('POST', '/estimates', body)
      return JSON.stringify(result)
    },
  })
}

/**
 * PUT /estimates/{id} — edición parcial.
 * https://developer.alegra.com/reference/put_estimates-id
 */
export function createAlegraUpdateEstimateTool() {
  return tool({
    name: 'actualizar_cotizacion_alegra',
    description:
      'Actualiza una cotización existente (PUT `/estimates/{id}`). Solo se modifican los atributos enviados; el resto queda igual. Para **borrar** observations o anotation, usa los flags `clear_observations` / `clear_anotation` (API: enviar `null`). Campos editables según doc: date, dueDate, observations, anotation, client, items (cada línea id/price/quantity y opcionales), seller, priceList, currency, costCenter, warehouse, comments, numberTemplate. Si envías **replace_items**, reemplaza el arreglo completo de líneas.',
    parameters: z.object({
      estimate_id: z.string().describe('Id de la cotización a editar.'),
      date: z.string().describe('Nueva fecha `YYYY-MM-DD`; vacío = no cambiar.'),
      due_date: z.string().describe('Nuevo vencimiento; vacío = no cambiar.'),
      observations: z
        .string()
        .describe('Texto observations (máx. 500); vacío = no cambiar salvo clear_observations.'),
      clear_observations: z
        .boolean()
        .describe('true para enviar observations: null (borrar según doc Alegra).'),
      anotation: z
        .string()
        .describe('Notas PDF; vacío = no cambiar salvo clear_anotation.'),
      clear_anotation: z
        .boolean()
        .describe('true para enviar anotation: null.'),
      client_id: z.string().describe('Nuevo id de cliente; vacío = no cambiar.'),
      seller_id: z.string().describe('Id vendedor; vacío = no cambiar.'),
      price_list_id: z.string().describe('Id lista de precios; vacío = no cambiar.'),
      warehouse_id: z.string().describe('Id bodega; vacío = no cambiar.'),
      cost_center_id: z.string().describe('Id centro de costo; vacío = no cambiar.'),
      currency_code: z.string().describe('Código moneda; vacío = no cambiar bloque currency.'),
      currency_exchange_rate: z
        .number()
        .describe('Tasa; obligatoria si currency_code tiene valor. -1 si no usas currency.'),
      replace_items: z
        .boolean()
        .describe(
          'Si true, envía **items** construido desde **lines** (reemplazo del detalle). Si false, no toques líneas.',
        ),
      lines: z
        .array(estimateLineSchema)
        .describe('Líneas cuando replace_items=true (misma forma que en crear).'),
      comments: z
        .array(z.string())
        .describe('Comentarios a asociar; **vacío** = no enviar el campo comments.'),
      number_template_id: z.string().describe('Id numeración; vacío = no cambiar.'),
    }),
    execute: async (args) => {
      const patch: Record<string, unknown> = {}

      if (args.date.trim()) patch.date = args.date.trim()
      if (args.due_date.trim()) patch.dueDate = args.due_date.trim()

      if (args.clear_observations) patch.observations = null
      else if (args.observations.trim()) patch.observations = args.observations.trim()

      if (args.clear_anotation) patch.anotation = null
      else if (args.anotation.trim()) patch.anotation = args.anotation.trim()

      if (args.client_id.trim()) patch.client = { id: args.client_id.trim() }
      if (args.seller_id.trim()) patch.seller = { id: args.seller_id.trim() }
      if (args.price_list_id.trim()) patch.priceList = { id: args.price_list_id.trim() }
      if (args.warehouse_id.trim()) patch.warehouse = { id: args.warehouse_id.trim() }
      if (args.cost_center_id.trim()) patch.costCenter = { id: args.cost_center_id.trim() }

      const code = args.currency_code.trim()
      if (code) {
        if (!(args.currency_exchange_rate > 0)) {
          return JSON.stringify({
            error: 'Si envías currency.code, incluye exchangeRate > 0.',
          })
        }
        patch.currency = { code, exchangeRate: args.currency_exchange_rate }
      }

      if (args.replace_items) {
        const items = buildEstimateItemsFromLines(args.lines)
        if (items.length === 0) {
          return JSON.stringify({
            error: 'replace_items=true requiere al menos una línea con item_id válido.',
          })
        }
        for (const it of items) {
          const q = Number(it.quantity)
          const p = Number(it.price)
          if (!(q > 0) || !(p >= 0)) {
            return JSON.stringify({
              error: 'Cada línea debe tener quantity > 0 y price ≥ 0.',
            })
          }
        }
        patch.items = items
      }

      if (args.comments.length > 0) patch.comments = args.comments

      if (args.number_template_id.trim()) {
        patch.numberTemplate = { id: args.number_template_id.trim() }
      }

      if (Object.keys(patch).length === 0) {
        return JSON.stringify({
          error:
            'No hay cambios: indica al menos un campo a modificar (fecha, cliente, líneas con replace_items, etc.).',
        })
      }

      const id = encodeURIComponent(args.estimate_id.trim())
      const result = await alegraJsonRequest('PUT', `/estimates/${id}`, patch)
      return JSON.stringify(result)
    },
  })
}

export function createAlegraEstimateTools() {
  return [
    createAlegraListEstimatesTool(),
    createAlegraGetEstimateTool(),
    createAlegraCreateEstimateTool(),
    createAlegraUpdateEstimateTool(),
  ]
}

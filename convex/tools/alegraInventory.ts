import { tool } from '@openai/agents'
import { z } from 'zod'
import { alegraJsonRequest } from '../lib/alegraClient'

function normalizeItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    Array.isArray((payload as { data: unknown }).data)
  ) {
    return (payload as { data: unknown[] }).data
  }
  return []
}

/** Lectura de inventario vía GET /items (hasta 30 ítems por llamada). Ver https://developer.alegra.com/reference/get_items */
export async function fetchAlegraItems(query?: string): Promise<unknown> {
  const params = new URLSearchParams({ limit: '30' })
  if (query?.trim()) params.set('query', query.trim())
  const body = await alegraJsonRequest('GET', `/items?${params}`)
  if (body && typeof body === 'object' && 'error' in body) return body
  return normalizeItems(body)
}

/**
 * GET /items/{id} — detalle de un ítem (estado, tipo, variantes).
 * https://developer.alegra.com/reference/get_items-id
 */
export function createAlegraGetItemTool() {
  return tool({
    name: 'obtener_item_alegra',
    description:
      'Obtiene un producto/servicio por **id numérico de Alegra** (GET `/items/{id}`). Usa **mode=advanced** por defecto para ver `status`, `type` (`simple`, `service`, `kit`, **`variantParent`**, **`variant`**), inventario y precios. Si el ítem es padre con variantes, pide `fields` con **`itemVariants,variantAttributes`** (según doc GET /items) para listar los **ids hijos** facturables. Útil cuando una factura falla por «ítems activos» o para confirmar que el id no es la referencia (ej. `RMS004`). Doc: https://developer.alegra.com/reference/get_items-id',
    parameters: z.object({
      item_id: z.string().describe('Id del ítem en Alegra (no la referencia/SKU).'),
      fields: z
        .string()
        .describe(
          'Query `fields` separados por coma (ej. `itemVariants,variantAttributes`). Vacío = solo mode advanced.',
        ),
    }),
    execute: async (args) => {
      const id = encodeURIComponent(args.item_id.trim())
      if (!id) {
        return JSON.stringify({ error: 'Falta item_id.' })
      }
      const params = new URLSearchParams()
      params.set('mode', 'advanced')
      if (args.fields.trim()) params.set('fields', args.fields.trim())
      const result = await alegraJsonRequest('GET', `/items/${id}?${params.toString()}`)
      return JSON.stringify(result)
    },
  })
}

/**
 * Herramienta del agente: listado de inventario en Alegra.
 */
export function createAlegraInventoryTool() {
  return tool({
    name: 'listar_inventario_alegra',
    description:
      'Consulta inventario en Alegra GET /items (hasta 30 ítems): nombre, referencia/SKU, stock, precios. Usa esta herramienta ante preguntas sobre inventario existente, cantidades o precios. Para un producto concreto (medida, código o nombre parcial), pasa palabras clave en `query`; si viene vacío, reintenta con otro término. Para listado general, `query` vacío. Para ver **tipo** (`variantParent` vs `variant`) o `status` exacto del API, usa **obtener_item_alegra** con el **id** devuelto aquí.',
    parameters: z.object({
      query: z
        .string()
        .describe(
          'Términos de búsqueda en nombre o referencia en Alegra. Obligatorio para un ítem concreto; vacío solo para listados generales.',
        ),
    }),
    execute: async ({ query }) => {
      const trimmed = query.trim()
      const data = await fetchAlegraItems(trimmed === '' ? undefined : trimmed)
      return JSON.stringify(data)
    },
  })
}

const adjustmentLineSchema = z.object({
  item_id: z.string().describe('Identificador del ítem en Alegra (campo id).'),
  adjustment_type: z
    .enum(['in', 'out'])
    .describe(
      '`in` = entrada / aumentar stock; `out` = salida / disminuir stock.',
    ),
  quantity: z
    .number()
    .describe('Unidades a mover (valor positivo); el tipo in/out define el sentido.'),
  unit_cost: z
    .number()
    .describe(
      'Costo unitario del movimiento (la API lo exige). Para salidas (`out`), usa el costo del ítem si viene en el listado; si no, confirma con el usuario.',
    ),
})

/**
 * POST /inventory-adjustments — ajuste de existencias (entrada/salida).
 * https://developer.alegra.com/reference/post_inventory-adjustments
 */
export function createAlegraInventoryAdjustmentTool() {
  return tool({
    name: 'ajustar_inventario_alegra',
    description:
      'Crea un **ajuste de inventario** en Alegra (POST /inventory-adjustments): **sube o baja cantidades** en stock por bodega. Úsalo cuando el usuario quiera cambiar existencias; **no** uses actualizar_item_alegra para cantidades (eso solo cambia datos del ítem). Obtén `item_id` y si puedes el costo con listar_inventario_alegra. Si la API exige numeración (`resolution`) y falla, pide al usuario el id de numeración de ajustes en Alegra.',
    parameters: z.object({
      date: z
        .string()
        .describe(
          'Fecha del ajuste `YYYY-MM-DD`. Cadena vacía = hoy (UTC).',
        ),
      observations: z
        .string()
        .describe('Motivo del ajuste; cadena vacía si no aplica.'),
      warehouse_id: z
        .string()
        .describe(
          'Id de bodega en Alegra; vacío = bodega principal (según documentación Alegra).',
        ),
      cost_center_id: z
        .string()
        .describe('Id de centro de costo; vacío si no aplica.'),
      resolution_id: z
        .string()
        .describe(
          'Id de numeración tipo inventoryAdjustment; vacío si la cuenta asigna una por defecto. Si hay error de numeración, indica configurarlo en Alegra o proporcionar este id.',
        ),
      lines: z
        .array(adjustmentLineSchema)
        .min(1)
        .describe(
          'Productos a ajustar: cada línea requiere id, tipo in/out, cantidad y unit_cost.',
        ),
    }),
    execute: async (args) => {
      const lines = args.lines.filter((l) => l.item_id.trim())
      if (lines.length === 0) {
        return JSON.stringify({
          error: 'Se requiere al menos una línea con item_id válido.',
        })
      }
      for (const l of lines) {
        if (!(l.quantity > 0)) {
          return JSON.stringify({
            error: 'Cada línea debe tener quantity mayor que 0.',
          })
        }
      }

      const date =
        args.date.trim() || new Date().toISOString().slice(0, 10)

      const body: Record<string, unknown> = {
        date,
        items: lines.map((l) => ({
          id: l.item_id.trim(),
          type: l.adjustment_type,
          quantity: l.quantity,
          unitCost: l.unit_cost,
        })),
      }

      if (args.observations.trim()) {
        body.observations = args.observations.trim()
      }
      if (args.warehouse_id.trim()) {
        body.warehouse = { id: args.warehouse_id.trim() }
      }
      if (args.cost_center_id.trim()) {
        body.costCenter = { id: args.cost_center_id.trim() }
      }
      if (args.resolution_id.trim()) {
        body.resolution = args.resolution_id.trim()
      }

      const result = await alegraJsonRequest(
        'POST',
        '/inventory-adjustments',
        body,
      )
      return JSON.stringify(result)
    },
  })
}

/**
 * POST /items — crear producto o servicio.
 * https://developer.alegra.com/reference/post_items
 */
export function createAlegraCreateItemTool() {
  return tool({
    name: 'crear_item_alegra',
    description:
      'Crea un ítem en Alegra (POST /items). Úsalo cuando el usuario quiera dar de alta un producto o servicio nuevo. Para productos con inventario, pon track_inventory true y define unidad/costo/cantidad inicial cuando los tengas; los servicios van como item_type service sin inventario. Si faltan datos obligatorios para Alegra, pregunta antes de llamar.',
    parameters: z.object({
      name: z.string().describe('Nombre del producto o servicio.'),
      description: z
        .string()
        .describe('Descripción; usa cadena vacía si no aplica.'),
      reference: z
        .string()
        .describe('Referencia o SKU; cadena vacía si no aplica.'),
      item_type: z
        .enum(['product', 'service'])
        .describe('product = bien; service = sin inventario.'),
      price: z
        .number()
        .describe(
          'Precio de venta principal. Usa 0 si el usuario no ha indicado precio y no hay otro valor.',
        ),
      track_inventory: z
        .boolean()
        .describe(
          'true solo para productos físicos con inventario en Alegra; false para servicios y productos sin stock.',
        ),
      inventory_unit: z
        .string()
        .describe(
          'Unidad de inventario Alegra si track_inventory (ej. unit, piece, kilogram). Cadena vacío → unit.',
        ),
      unit_cost: z
        .number()
        .describe(
          'Costo unitario si track_inventory; usa 0 si no se conoce.',
        ),
      initial_quantity: z
        .number()
        .describe(
          'Cantidad inicial si track_inventory; usa 0 si empiezan sin stock.',
        ),
    }),
    execute: async (args) => {
      const body: Record<string, unknown> = {
        name: args.name.trim(),
        type: args.item_type,
      }
      if (args.description.trim())
        body.description = args.description.trim()
      if (args.reference.trim()) body.reference = args.reference.trim()
      body.price = args.price

      if (args.item_type === 'product' && args.track_inventory) {
        body.inventory = {
          unit: args.inventory_unit.trim() || 'unit',
          unitCost: args.unit_cost,
          initialQuantity: args.initial_quantity,
        }
      }

      const result = await alegraJsonRequest('POST', '/items', body)
      return JSON.stringify(result)
    },
  })
}

/**
 * PUT /items/{id} — editar ítem existente.
 * https://developer.alegra.com/reference/put_items-id
 */
export function createAlegraUpdateItemTool() {
  return tool({
    name: 'actualizar_item_alegra',
    description:
      'Actualiza **datos del ítem** en Alegra (PUT /items/{id}): nombre, descripción, referencia, precio, estado. **No cambia cantidades de inventario** — para subir/bajar stock usa **ajustar_inventario_alegra**. Obtén el id con listar_inventario_alegra si hace falta.',
    parameters: z.object({
      item_id: z.string().describe('Identificador del ítem en Alegra (campo id).'),
      name: z
        .string()
        .describe('Nuevo nombre; cadena vacía para no cambiar.'),
      description: z
        .string()
        .describe('Nueva descripción; cadena vacía para no cambiar.'),
      reference: z
        .string()
        .describe('Nueva referencia; cadena vacía para no cambiar.'),
      price: z
        .number()
        .describe(
          'Nuevo precio principal; usa -1 para no modificar el precio.',
        ),
      status: z
        .enum(['active', 'inactive', 'unchanged'])
        .describe(
          'Estado en Alegra; unchanged si no debe cambiar (productos inactivos hay que activar antes de editar otros campos).',
        ),
    }),
    execute: async (args) => {
      const patch: Record<string, unknown> = {}
      if (args.name.trim()) patch.name = args.name.trim()
      if (args.description.trim()) patch.description = args.description.trim()
      if (args.reference.trim()) patch.reference = args.reference.trim()
      if (args.price >= 0) patch.price = args.price
      if (args.status !== 'unchanged') patch.status = args.status

      if (Object.keys(patch).length === 0) {
        return JSON.stringify({
          error:
            'No hay campos para actualizar: indica al menos nombre, descripción, referencia, precio (≥0) o estado distinto de unchanged.',
        })
      }

      const id = encodeURIComponent(args.item_id.trim())
      const result = await alegraJsonRequest('PUT', `/items/${id}`, patch)
      return JSON.stringify(result)
    },
  })
}

export function createAlegraItemTools() {
  return [
    createAlegraInventoryTool(),
    createAlegraGetItemTool(),
    createAlegraInventoryAdjustmentTool(),
    createAlegraCreateItemTool(),
    createAlegraUpdateItemTool(),
  ]
}

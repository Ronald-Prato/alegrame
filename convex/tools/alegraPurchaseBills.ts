import { tool } from '@openai/agents'
import { z } from 'zod'
import { alegraJsonRequest } from '../lib/alegraClient'

/** Línea de compra con ítem de catálogo. Ver POST/PUT /bills. */
const billItemLineSchema = z.object({
  item_id: z.string().describe('Id del producto/servicio en Alegra (/items).'),
  quantity: z
    .number()
    .describe('Cantidad comprada (> 0). Precio sin impuestos/descuentos en la línea según doc.'),
  price: z
    .number()
    .describe('Precio de compra **sin** impuestos ni descuentos (documentación Alegra).'),
  description: z
    .string()
    .describe('Observaciones del ítem en la línea; vacío para omitir.'),
  reference: z
    .string()
    .describe('Referencia en la línea; vacío para omitir.'),
  discount: z
    .number()
    .default(-1)
    .describe('Porcentaje de descuento sin %; **-1** = no enviar descuento.'),
  tax_ids: z
    .array(z.string())
    .default([])
    .describe('Ids de impuestos Alegra; vacío si no aplica.'),
})

/** Línea de compra por categoría contable. */
const billCategoryLineSchema = z.object({
  category_id: z.string().describe('Id de la categoría (cuenta de gasto) en Alegra.'),
  quantity: z.number().describe('Cantidad (> 0).'),
  price: z.number().describe('Precio sin impuestos/descuentos según doc.'),
  observations: z.string().describe('Observaciones; vacío para omitir.'),
  discount: z
    .number()
    .default(-1)
    .describe('Porcentaje sin %; **-1** = omitir.'),
  tax_ids: z
    .array(z.string())
    .default([])
    .describe('Ids de impuestos; vacío si no aplica.'),
})

function buildBillItemsFromLines(
  lines: z.infer<typeof billItemLineSchema>[],
): Record<string, unknown>[] {
  return lines
    .filter((l) => l.item_id.trim())
    .map((l) => {
      const row: Record<string, unknown> = {
        id: l.item_id.trim(),
        quantity: l.quantity,
        price: l.price,
      }
      if (l.description.trim()) row.observations = l.description.trim()
      if (l.reference.trim()) row.reference = l.reference.trim()
      if (l.discount >= 0) row.discount = l.discount
      if (l.tax_ids.length > 0) {
        row.tax = l.tax_ids.map((id) => ({ id: id.trim() })).filter((t) => t.id)
      }
      return row
    })
}

function buildBillCategoriesFromLines(
  lines: z.infer<typeof billCategoryLineSchema>[],
): Record<string, unknown>[] {
  return lines
    .filter((l) => l.category_id.trim())
    .map((l) => {
      const row: Record<string, unknown> = {
        id: l.category_id.trim(),
        quantity: l.quantity,
        price: l.price,
      }
      if (l.observations.trim()) row.observations = l.observations.trim()
      if (l.discount >= 0) row.discount = l.discount
      if (l.tax_ids.length > 0) {
        row.tax = l.tax_ids.map((id) => ({ id: id.trim() })).filter((t) => t.id)
      }
      return row
    })
}

function buildPurchasesPayload(args: {
  item_lines: z.infer<typeof billItemLineSchema>[]
  category_lines: z.infer<typeof billCategoryLineSchema>[]
}): Record<string, unknown> | null {
  const items = buildBillItemsFromLines(args.item_lines)
  const categories = buildBillCategoriesFromLines(args.category_lines)
  if (items.length === 0 && categories.length === 0) return null
  const purchases: Record<string, unknown> = {}
  if (items.length > 0) purchases.items = items
  if (categories.length > 0) purchases.categories = categories
  return purchases
}

function validatePurchaseLines(
  items: Record<string, unknown>[],
  categories: Record<string, unknown>[],
): { ok: true } | { ok: false; error: string } {
  if (items.length === 0 && categories.length === 0) {
    return {
      ok: false,
      error:
        '**purchases** requiere al menos una línea en **item_lines** y/o **category_lines** con ids válidos.',
    }
  }
  const all = [...items, ...categories]
  for (const row of all) {
    const q = Number(row.quantity)
    const p = Number(row.price)
    if (!(q > 0)) {
      return { ok: false, error: 'Cada línea debe tener quantity mayor que 0.' }
    }
    if (!(p >= 0)) {
      return { ok: false, error: 'Cada línea debe tener price válido (≥ 0).' }
    }
  }
  return { ok: true }
}

/**
 * GET /bills — listar facturas de compra (facturas de proveedor en la API).
 * https://developer.alegra.com/reference/get_bills
 */
export function createAlegraListPurchaseBillsTool() {
  return tool({
    name: 'listar_facturas_compra_alegra',
    description:
      'Lista **facturas de compra** en Alegra (GET `/bills`; en la API: facturas de proveedor). Hasta **30** por llamada (`limit` ≤ 30). Con `metadata=true` la respuesta incluye `metadata` y `data`. Orden: `order_field` date | name | dueDate y `order_direction` ASC | DESC. Filtros: fechas, proveedor (`provider_name`, `client_id`), estado (`open`, `closed`, `void`), ítem, tipo (`bill`, `supportDocument`, `all` Colombia), etc.',
    parameters: z.object({
      start: z
        .number()
        .describe('Offset de listado; **0** = omitir (inicio por defecto API).'),
      limit: z
        .number()
        .describe('Cantidad; **máximo 30**. **0** = omitir (API usa ~30 por defecto).'),
      order_direction: z
        .enum(['', 'ASC', 'DESC'])
        .describe('Vacío = ASC por defecto API.'),
      order_field: z
        .enum(['', 'date', 'name', 'dueDate'])
        .describe('Campo de orden; vacío = defecto API.'),
      metadata: z
        .boolean()
        .describe('true para incluir total en metadata y lista en data.'),
      bill_number: z
        .string()
        .describe('Filtrar por número de factura (coincidencia parcial); vacío = sin filtro.'),
      client_name: z
        .string()
        .describe('Filtrar por nombre de cliente (doc API); vacío = sin filtro.'),
      date: z.string().describe('Fecha documento `YYYY-MM-DD` exacta; vacío = sin filtro.'),
      due_date: z.string().describe('Vencimiento `YYYY-MM-DD` exacto; vacío = sin filtro.'),
      status: z
        .string()
        .describe('open | closed | void; vacío = sin filtro.'),
      item_id: z.string().describe('Id de ítem; vacío = sin filtro.'),
      client_id: z
        .string()
        .describe('Id del proveedor (contacto) en Alegra; vacío = sin filtro.'),
      provider_name: z
        .string()
        .describe('Nombre del proveedor (búsqueda parcial); vacío = sin filtro.'),
      uuid: z.string().describe('México: uuid; vacío = sin filtro.'),
      purchase_order_id: z.string().describe('Id orden de compra; vacío = sin filtro.'),
      type: z
        .enum(['', 'bill', 'supportDocument', 'all'])
        .describe(
          'Colombia/documentos: **bill** factura proveedor, **supportDocument**, **all**; vacío = enviar **bill** (comportamiento API por defecto).',
        ),
    }),
    execute: async (args) => {
      if (args.limit > 30) {
        return JSON.stringify({
          error: 'El límite debe ser ≤ 30 (documentación GET /bills).',
        })
      }
      const params = new URLSearchParams()
      if (args.start > 0) params.set('start', String(args.start))
      if (args.limit > 0) params.set('limit', String(args.limit))
      if (args.order_direction.trim()) params.set('order_direction', args.order_direction.trim())
      if (args.order_field.trim()) params.set('order_field', args.order_field.trim())
      if (args.metadata) params.set('metadata', 'true')
      if (args.bill_number.trim()) params.set('billNumber', args.bill_number.trim())
      if (args.client_name.trim()) params.set('client_name', args.client_name.trim())
      if (args.date.trim()) params.set('date', args.date.trim())
      if (args.due_date.trim()) params.set('dueDate', args.due_date.trim())
      if (args.status.trim()) params.set('status', args.status.trim())
      if (args.item_id.trim()) params.set('item_id', args.item_id.trim())
      if (args.client_id.trim()) params.set('client_id', args.client_id.trim())
      if (args.provider_name.trim()) params.set('provider_name', args.provider_name.trim())
      if (args.uuid.trim()) params.set('uuid', args.uuid.trim())
      if (args.purchase_order_id.trim()) params.set('purchaseOrder_id', args.purchase_order_id.trim())
      if (args.type.trim()) params.set('type', args.type.trim())

      const qs = params.toString()
      const path = qs ? `/bills?${qs}` : '/bills'
      const result = await alegraJsonRequest('GET', path)
      return JSON.stringify(result)
    },
  })
}

/**
 * GET /bills/{id}
 * https://developer.alegra.com/reference/get_bills-id
 */
export function createAlegraGetPurchaseBillTool() {
  return tool({
    name: 'obtener_factura_compra_alegra',
    description:
      'Obtiene el detalle de una **factura de compra** (GET `/bills/{id}`). Opcionalmente pide campos extra en `fields` (coma-separados: journal, comments, stamp, etc.; ver doc Alegra).',
    parameters: z.object({
      bill_id: z.string().describe('Id de la factura de compra en Alegra.'),
      fields: z
        .string()
        .describe(
          'Campos adicionales separados por coma (ej. journal,comments,stamp); vacío = omitir.',
        ),
      include_void_payments: z
        .boolean()
        .describe('true para incluir pagos anulados según doc (`includeVoidPayments`).'),
    }),
    execute: async (args) => {
      const id = encodeURIComponent(args.bill_id.trim())
      if (!id) return JSON.stringify({ error: 'Falta bill_id.' })
      const params = new URLSearchParams()
      if (args.fields.trim()) params.set('fields', args.fields.trim())
      if (args.include_void_payments) params.set('includeVoidPayments', 'true')
      const qs = params.toString()
      const path = qs ? `/bills/${id}?${qs}` : `/bills/${id}`
      const result = await alegraJsonRequest('GET', path)
      return JSON.stringify(result)
    },
  })
}

/**
 * POST /bills
 * https://developer.alegra.com/reference/post_bills
 */
export function createAlegraCreatePurchaseBillTool() {
  return tool({
    name: 'crear_factura_compra_alegra',
    description:
      'Crea una **factura de compra** (POST `/bills`; API: factura de proveedor). Obligatorios según esquema base: **date**, **dueDate**, **provider** (id contacto proveedor), **purchases** (`item_lines` y/o líneas de categoría). **Regla para el agente:** ante intención **explícita o implícita** de crear factura de compra / compra a proveedor / registrar factura del proveedor, **debes ejecutar esta herramienta** en cuanto tengas los datos mínimos válidos (no sustituir con solo texto prometiendo crear después). Revisa [post_bills](https://developer.alegra.com/reference/post_bills) para país (Colombia: `paymentMethod`/`paymentType` al emitir; documento soporte y numeración; México, Costa Rica, etc.). Ítems: id de catálogo, no `variantParent` como línea — usar hijo **variant** si aplica.',
    parameters: z.object({
      date: z.string().describe('Fecha `YYYY-MM-DD`.'),
      due_date: z.string().describe('Vencimiento `YYYY-MM-DD`.'),
      provider_id: z.string().describe('Id del proveedor (contacto tipo proveedor) en Alegra.'),
      item_lines: z
        .array(billItemLineSchema)
        .describe('Líneas de productos/servicios del catálogo; puede ir vacío si solo hay categorías.'),
      category_lines: z
        .array(billCategoryLineSchema)
        .describe('Líneas por categoría contable; puede ir vacío si solo hay ítems.'),
      observations: z.string().describe('Observaciones (máx. 500); vacío para omitir.'),
      terms_conditions: z.string().describe('Términos y condiciones; vacío para omitir.'),
      warehouse_id: z.string().describe('Id bodega; vacío = principal según doc.'),
      cost_center_id: z.string().describe('Id centro de costo; vacío para omitir.'),
      currency_code: z.string().describe('ISO 4217 si multimoneda; vacío para omitir.'),
      currency_exchange_rate: z
        .number()
        .describe('Tasa si multimoneda; **-1** si no aplica.'),
      number_template_id: z.string().describe('Id numeración (ej. documento soporte CO); vacío para omitir.'),
      number_template_number: z.string().describe('Número manual si aplica; vacío para omitir.'),
      /** Colombia / documento soporte — ver doc */
      colombia_payment_form: z
        .string()
        .describe(
          'Colombia al emitir: forma de pago API `paymentMethod`: CASH | CREDIT (catálogo [colombia](https://developer.alegra.com/reference/colombia)); vacío si no aplica.',
        ),
      colombia_payment_type: z
        .string()
        .describe(
          'Colombia: medio de pago API `paymentType` (valor del catálogo DIAN); vacío si no aplica.',
        ),
      colombia_bill_operation_type: z
        .string()
        .describe('Colombia documento soporte: INDIVIDUAL | ACCUMULATED si aplica; vacío para omitir.'),
      colombia_physical_document: z
        .string()
        .describe('Colombia: número físico del documento si aplica; vacío para omitir.'),
      expedir_al_crear: z
        .boolean()
        .default(false)
        .describe(
          'true → `stamp: { generateStamp: true }` en POST (expedir/timbrar según país y config Alegra; ver [post_bills](https://developer.alegra.com/reference/post_bills)).',
        ),
    }),
    execute: async (args) => {
      const providerId = args.provider_id.trim()
      if (!providerId) {
        return JSON.stringify({ error: 'POST /bills exige **provider** con id.' })
      }
      if (!args.date.trim() || !args.due_date.trim()) {
        return JSON.stringify({ error: 'POST /bills exige **date** y **dueDate**.' })
      }

      const purchases = buildPurchasesPayload({
        item_lines: args.item_lines,
        category_lines: args.category_lines,
      })
      if (!purchases) {
        return JSON.stringify({
          error:
            'Indica al menos una línea en **item_lines** o **category_lines** (purchases no puede quedar vacío).',
        })
      }

      const items = buildBillItemsFromLines(args.item_lines)
      const categories = buildBillCategoriesFromLines(args.category_lines)
      const lineCheck = validatePurchaseLines(items, categories)
      if (!lineCheck.ok) return JSON.stringify({ error: lineCheck.error })

      const code = args.currency_code.trim()
      if (code && !(args.currency_exchange_rate > 0)) {
        return JSON.stringify({
          error: 'Con moneda extranjera incluye **exchangeRate** > 0.',
        })
      }

      const body: Record<string, unknown> = {
        date: args.date.trim(),
        dueDate: args.due_date.trim(),
        provider: { id: providerId },
        purchases,
      }

      if (args.observations.trim()) body.observations = args.observations.trim()
      if (args.terms_conditions.trim()) body.termsConditions = args.terms_conditions.trim()
      if (args.warehouse_id.trim()) body.warehouse = { id: args.warehouse_id.trim() }
      if (args.cost_center_id.trim()) body.costCenter = { id: args.cost_center_id.trim() }

      if (code) {
        body.currency = { code, exchangeRate: args.currency_exchange_rate }
      }

      if (args.number_template_id.trim() || args.number_template_number.trim()) {
        const nt: Record<string, unknown> = {}
        if (args.number_template_id.trim()) nt.id = args.number_template_id.trim()
        if (args.number_template_number.trim()) nt.number = args.number_template_number.trim()
        body.numberTemplate = nt
      }

      if (args.colombia_payment_form.trim()) body.paymentMethod = args.colombia_payment_form.trim()
      if (args.colombia_payment_type.trim()) body.paymentType = args.colombia_payment_type.trim()
      if (args.colombia_bill_operation_type.trim()) {
        body.billOperationType = args.colombia_bill_operation_type.trim()
      }
      if (args.colombia_physical_document.trim()) {
        body.physicalDocument = args.colombia_physical_document.trim()
      }
      if (args.expedir_al_crear) {
        body.stamp = { generateStamp: true }
      }

      const result = await alegraJsonRequest('POST', '/bills', body)
      return JSON.stringify(result)
    },
  })
}

/**
 * PUT /bills/{id}
 * https://developer.alegra.com/reference/put_bills-id
 */
export function createAlegraUpdatePurchaseBillTool() {
  return tool({
    name: 'actualizar_factura_compra_alegra',
    description:
      'Actualiza una **factura de compra** (PUT `/bills/{id}`). Solo cambian los campos enviados; el resto queda igual. Para borrar texto, enviar **null** en la API (usa flags `clear_*`). **Regla para el agente:** si el usuario quiere **editar** o **actualizar** una factura de compra / factura de proveedor (cambiar fechas, líneas, proveedor, observaciones, etc.), **debes ejecutar esta herramienta** con los cambios, no limitarte a decir que «se puede editar». Para reemplazar líneas usa `replace_purchases` con los arreglos completos.',
    parameters: z.object({
      bill_id: z.string().describe('Id de la factura a editar.'),
      date: z.string().describe('Nueva fecha; vacío = no cambiar.'),
      due_date: z.string().describe('Nuevo vencimiento; vacío = no cambiar.'),
      observations: z.string().describe('Observaciones; vacío = no cambiar salvo clear_observations.'),
      clear_observations: z.boolean().describe('true → observations: null.'),
      terms_conditions: z.string().describe('Términos; vacío = no cambiar salvo clear_terms_conditions.'),
      clear_terms_conditions: z.boolean().describe('true → termsConditions: null.'),
      provider_id: z.string().describe('Nuevo id proveedor; vacío = no cambiar.'),
      warehouse_id: z.string().describe('Id bodega; vacío = no cambiar.'),
      cost_center_id: z.string().describe('Id centro de costo; vacío = no cambiar.'),
      currency_code: z.string().describe('Moneda; vacío = no cambiar bloque currency.'),
      currency_exchange_rate: z
        .number()
        .describe('Tasa si envías currency; -1 si no usas currency.'),
      replace_purchases: z
        .boolean()
        .describe('Si true, reemplaza **purchases** por item_lines + category_lines.'),
      item_lines: z.array(billItemLineSchema).describe('Líneas ítems si replace_purchases.'),
      category_lines: z.array(billCategoryLineSchema).describe('Líneas categoría si replace_purchases.'),
      number_template_id: z.string().describe('Numeración; vacío = no cambiar.'),
      number_template_number: z.string().describe('Número manual; vacío = no cambiar.'),
      colombia_payment_form: z.string().describe('Colombia paymentMethod; vacío = no cambiar.'),
      colombia_payment_type: z.string().describe('Colombia paymentType; vacío = no cambiar.'),
      colombia_bill_operation_type: z.string().describe('billOperationType; vacío = no cambiar.'),
      colombia_physical_document: z.string().describe('physicalDocument; vacío = no cambiar.'),
      expedir_al_editar: z
        .boolean()
        .default(false)
        .describe(
          'true → incluye `stamp: { generateStamp: true }` en el PUT (emisión en edición según doc Alegra).',
        ),
    }),
    execute: async (args) => {
      const patch: Record<string, unknown> = {}

      if (args.date.trim()) patch.date = args.date.trim()
      if (args.due_date.trim()) patch.dueDate = args.due_date.trim()

      if (args.clear_observations) patch.observations = null
      else if (args.observations.trim()) patch.observations = args.observations.trim()

      if (args.clear_terms_conditions) patch.termsConditions = null
      else if (args.terms_conditions.trim()) patch.termsConditions = args.terms_conditions.trim()

      if (args.provider_id.trim()) patch.provider = { id: args.provider_id.trim() }
      if (args.warehouse_id.trim()) patch.warehouse = { id: args.warehouse_id.trim() }
      if (args.cost_center_id.trim()) patch.costCenter = { id: args.cost_center_id.trim() }

      const curr = args.currency_code.trim()
      if (curr) {
        if (!(args.currency_exchange_rate > 0)) {
          return JSON.stringify({ error: 'Si envías currency, incluye exchangeRate > 0.' })
        }
        patch.currency = { code: curr, exchangeRate: args.currency_exchange_rate }
      }

      if (args.replace_purchases) {
        const purchases = buildPurchasesPayload({
          item_lines: args.item_lines,
          category_lines: args.category_lines,
        })
        if (!purchases) {
          return JSON.stringify({
            error: 'Con replace_purchases indica líneas en item_lines y/o category_lines.',
          })
        }
        const items = buildBillItemsFromLines(args.item_lines)
        const categories = buildBillCategoriesFromLines(args.category_lines)
        const lineCheck = validatePurchaseLines(items, categories)
        if (!lineCheck.ok) return JSON.stringify({ error: lineCheck.error })
        patch.purchases = purchases
      }

      if (args.number_template_id.trim() || args.number_template_number.trim()) {
        const nt: Record<string, unknown> = {}
        if (args.number_template_id.trim()) nt.id = args.number_template_id.trim()
        if (args.number_template_number.trim()) nt.number = args.number_template_number.trim()
        patch.numberTemplate = nt
      }

      if (args.colombia_payment_form.trim()) patch.paymentMethod = args.colombia_payment_form.trim()
      if (args.colombia_payment_type.trim()) patch.paymentType = args.colombia_payment_type.trim()
      if (args.colombia_bill_operation_type.trim()) {
        patch.billOperationType = args.colombia_bill_operation_type.trim()
      }
      if (args.colombia_physical_document.trim()) {
        patch.physicalDocument = args.colombia_physical_document.trim()
      }

      if (args.expedir_al_editar) {
        patch.stamp = { generateStamp: true }
      }

      if (Object.keys(patch).length === 0) {
        return JSON.stringify({
          error: 'Sin cambios: indica campos a modificar o replace_purchases.',
        })
      }

      const id = encodeURIComponent(args.bill_id.trim())
      const result = await alegraJsonRequest('PUT', `/bills/${id}`, patch)
      return JSON.stringify(result)
    },
  })
}

export function createAlegraPurchaseBillTools() {
  return [
    createAlegraListPurchaseBillsTool(),
    createAlegraGetPurchaseBillTool(),
    createAlegraCreatePurchaseBillTool(),
    createAlegraUpdatePurchaseBillTool(),
  ]
}

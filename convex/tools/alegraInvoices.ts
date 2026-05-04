import { tool } from '@openai/agents'
import { z } from 'zod'
import { alegraJsonRequest } from '../lib/alegraClient'

/** Línea de factura (ítem de catálogo). Ver POST/PUT /invoices en la doc Alegra. */
const invoiceLineSchema = z.object({
  item_id: z.string().describe('Id del producto/servicio en Alegra (catálogo /items).'),
  quantity: z
    .number()
    .describe('Cantidad vendida (> 0). El precio no incluye impuestos ni descuentos.'),
  price: z
    .number()
    .describe(
      'Precio unitario **sin** impuestos ni descuentos (según documentación Alegra).',
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

function buildInvoiceItemsFromLines(
  lines: z.infer<typeof invoiceLineSchema>[],
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

function validateInvoiceLines(items: Record<string, unknown>[]):
  | { ok: true }
  | { ok: false; error: string } {
  if (items.length === 0) {
    return { ok: false, error: 'Se requiere al menos una línea con item_id válido en **items**.' }
  }
  for (const it of items) {
    const q = Number(it.quantity)
    const p = Number(it.price)
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
 * GET /invoices — listar facturas de venta.
 * https://developer.alegra.com/reference/get_invoices
 */
export function createAlegraListInvoicesTool() {
  return tool({
    name: 'listar_facturas_venta_alegra',
    description:
      'Lista facturas de venta en Alegra (GET `/invoices`). Hasta **30** por llamada (`limit` ≤ 30). Con `metadata=true` la respuesta incluye `metadata` y `data`. Orden: `order_field` id | name | date | dueDate | status y `order_direction` ASC | DESC. Filtros: fechas, cliente, estado (`draft`, `open`, etc.), ítem, id (coma-separados, hasta 30).',
    parameters: z.object({
      start: z
        .number()
        .describe(
          'Desde qué factura paginar (offset de listado); **0** = no enviar (inicio por defecto API).',
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
        .enum(['', 'id', 'name', 'date', 'dueDate', 'status'])
        .describe('Campo de orden; vacío = defecto API.'),
      metadata: z
        .boolean()
        .describe('true para incluir total en `metadata` y lista en `data`.'),
      invoice_ids: z
        .string()
        .describe(
          'Ids de facturas separados por coma sin espacios (máx. 30); si se envía, la API ignora otros filtros.',
        ),
      date: z.string().describe('Filtrar por fecha de factura `YYYY-MM-DD`; vacío = sin filtro.'),
      due_date: z
        .string()
        .describe('Filtrar por vencimiento `YYYY-MM-DD`; vacío = sin filtro.'),
      status: z
        .string()
        .describe(
          'Estado: `open`, `closed`, `draft`, `void`; varios separados por coma; vacío = sin filtro.',
        ),
      client_id: z.string().describe('Filtrar por id de cliente; vacío = sin filtro.'),
      client_name: z.string().describe('Filtrar por nombre de cliente; vacío = sin filtro.'),
      client_identification: z
        .string()
        .describe('Filtrar por identificación del cliente; vacío = sin filtro.'),
      number_template_full_number: z
        .string()
        .describe('Filtrar por numeración completa; vacío = sin filtro.'),
      item_id: z.string().describe('Filtrar por id de ítem; vacío = sin filtro.'),
      date_after: z.string().describe('Fecha documento desde (excluye día); vacío = sin filtro.'),
      date_after_or_now: z
        .string()
        .describe('Fecha documento desde día actual en adelante; vacío = sin filtro.'),
      date_before: z.string().describe('Fecha documento hacia atrás; vacío = sin filtro.'),
      date_before_or_now: z
        .string()
        .describe('Fecha documento hasta día actual hacia atrás; vacío = sin filtro.'),
      due_date_after: z.string().describe('Vencimiento desde día siguiente; vacío = sin filtro.'),
      due_date_after_or_now: z
        .string()
        .describe('Vencimiento desde hoy en adelante; vacío = sin filtro.'),
      due_date_before: z.string().describe('Vencimiento hacia atrás; vacío = sin filtro.'),
      due_date_before_or_now: z
        .string()
        .describe('Vencimiento hasta hoy hacia atrás; vacío = sin filtro.'),
      to_replace: z
        .boolean()
        .default(false)
        .describe(
          'Filtrar facturas a sustituir; si true, `client_id` es obligatorio según doc (envía solo si aplica).',
        ),
    }),
    execute: async (args) => {
      if (args.limit > 30) {
        return JSON.stringify({
          error:
            'El límite de facturas debe ser menor o igual a 30 (documentación Alegra GET /invoices).',
        })
      }
      const params = new URLSearchParams()
      if (args.start > 0) params.set('start', String(args.start))
      if (args.limit > 0) params.set('limit', String(args.limit))
      if (args.order_direction.trim())
        params.set('order_direction', args.order_direction.trim())
      if (args.order_field.trim()) params.set('order_field', args.order_field.trim())
      if (args.metadata) params.set('metadata', 'true')
      if (args.invoice_ids.trim()) params.set('id', args.invoice_ids.trim())
      if (args.date.trim()) params.set('date', args.date.trim())
      if (args.due_date.trim()) params.set('dueDate', args.due_date.trim())
      if (args.status.trim()) params.set('status', args.status.trim())
      if (args.client_id.trim()) params.set('client_id', args.client_id.trim())
      if (args.client_name.trim()) params.set('client_name', args.client_name.trim())
      if (args.client_identification.trim())
        params.set('client_identification', args.client_identification.trim())
      if (args.number_template_full_number.trim())
        params.set('numberTemplate_fullNumber', args.number_template_full_number.trim())
      if (args.item_id.trim()) params.set('item_id', args.item_id.trim())
      if (args.date_after.trim()) params.set('date_after', args.date_after.trim())
      if (args.date_after_or_now.trim())
        params.set('date_afterOrNow', args.date_after_or_now.trim())
      if (args.date_before.trim()) params.set('date_before', args.date_before.trim())
      if (args.date_before_or_now.trim())
        params.set('date_beforeOrNow', args.date_before_or_now.trim())
      if (args.due_date_after.trim()) params.set('dueDate_after', args.due_date_after.trim())
      if (args.due_date_after_or_now.trim())
        params.set('dueDate_afterOrNow', args.due_date_after_or_now.trim())
      if (args.due_date_before.trim()) params.set('dueDate_before', args.due_date_before.trim())
      if (args.due_date_before_or_now.trim())
        params.set('dueDate_beforeOrNow', args.due_date_before_or_now.trim())
      if (args.to_replace) params.set('toReplace', 'true')

      const qs = params.toString()
      const path = qs ? `/invoices?${qs}` : '/invoices'
      const result = await alegraJsonRequest('GET', path)
      return JSON.stringify(result)
    },
  })
}

/**
 * POST /invoices — crear factura de venta **siempre en borrador (draft)**.
 * https://developer.alegra.com/reference/post_invoices
 *
 * Regla de producto: **nunca** se envían `payments` ni `status` distinto de `draft` en este flujo
 * (los pagos en creación pondrían la factura en `open` según doc).
 */
export function createAlegraCreateInvoiceTool() {
  return tool({
    name: 'crear_factura_venta_borrador_alegra',
    description:
      'Crea factura de venta (POST `/invoices`) **siempre en estado `draft`**; no envía `payments`. **El agente no debe llamar esta herramienta** hasta tener **todos** los datos del checklist de país (ver instrucciones del sistema): el esquema genérico **no** es suficiente en cuentas Colombia/México/etc. **Siempre (doc [post_invoices](https://developer.alegra.com/reference/post_invoices), esquema simple):** `date`, `dueDate`, `client.id`, `items` (línea: **id** interno Alegra, **price** sin impuestos/descuentos, **quantity**); no usar SKU como id; `variantParent` → usar id hijo `variant` (**obtener_item_alegra**). **Colombia:** con **FE 2.1** activa, **`paymentForm`** obligatorio (`CASH` contado / `CREDIT` crédito); si **`paymentForm` es `CASH`**, **`paymentMethod`** también obligatorio (catálogo [Colombia](https://developer.alegra.com/docs/colombia)). **México:** `paymentMethod`, `paymentType` (PUE/PPD), etc. según esquema MX en la misma doc. Opcionales: observations, anotation, termsConditions, seller, priceList, warehouse, costCenter, currency+exchangeRate, numberTemplate, estimate. Emitir después con **abrir_factura_venta_alegra**.',
    parameters: z.object({
      date: z.string().describe('Fecha factura `YYYY-MM-DD` (obligatoria en POST).'),
      due_date: z.string().describe('Vencimiento `YYYY-MM-DD` (obligatorio en POST).'),
      client_id: z.string().describe('Id del cliente/contacto en Alegra (obligatorio).'),
      lines: z
        .array(invoiceLineSchema)
        .min(1)
        .describe('Líneas: ítem de catálogo con cantidad y precio unitario sin impuestos.'),
      observations: z
        .string()
        .describe('Observaciones internas (máx. 500); vacío para omitir.'),
      anotation: z
        .string()
        .describe('Notas visibles en PDF (máx. 500); vacío para omitir.'),
      terms_conditions: z
        .string()
        .describe('Términos y condiciones (máx. 500); vacío para omitir.'),
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
          'Tasa de cambio; obligatoria si `currency_code` no está vacía. Usar -1 si no aplica multimoneda.',
        ),
      number_template_id: z.string().describe('Id numeración; vacío para omitir.'),
      number_template_prefix: z
        .string()
        .describe('Prefijo si numeración manual; vacío para omitir.'),
      number_template_number: z
        .string()
        .describe('Número si numeración manual; vacío para omitir.'),
      estimate_id: z
        .string()
        .describe('Id cotización a asociar (la factura usa `items` enviados, no los de la cotización). Vacío para omitir.'),
      /** Campos condicionales por país — el agente debe completar según doc y país de la empresa */
      payment_method: z
        .string()
        .describe(
          '**Colombia:** con FE 2.1, obligatorio si `paymentForm` es `CASH` (medio de pago; catálogo doc Colombia). **México:** obligatorio en esquema factura MX. Vacío solo si el país/región no lo exige y el usuario lo confirmó.',
        ),
      payment_form: z
        .string()
        .describe(
          '**Colombia:** `CASH` (contado) o `CREDIT` (crédito). Con facturación electrónica **2.1** activa es obligatorio según doc; el agente debe preguntarlo **antes** de crear. Vacío solo si no aplica Colombia/FE.',
        ),
      invoice_type: z
        .string()
        .describe('Tipo de factura (ej. NATIONAL); vacío = defecto API según país.'),
      payment_type_mexico: z
        .string()
        .describe('México: PUE | PPD si aplica; vacío si no es México.'),
      cfdi_use_mexico: z
        .string()
        .describe('México: clave Uso CFDI si aplica; vacío para omitir.'),
      account_number_mexico: z
        .string()
        .describe('México: número de cuenta/tarjaje (mín. 4 caracteres si aplica); vacío para omitir.'),
      regime_client_mexico: z
        .string()
        .describe('México: régimen fiscal cliente (CFDI 4.0) si aplica; vacío para omitir.'),
      operation_type_colombia: z
        .string()
        .describe('Colombia: STANDARD | AIU_SERVICE | THIRD_PARTY_INCOME; vacío = STANDARD según doc.'),
      purchase_order_number_colombia: z.string().describe('Colombia: orden de compra si aplica FE; vacío para omitir.'),
    }),
    execute: async (args) => {
      const clientId = args.client_id.trim()
      if (!clientId) {
        return JSON.stringify({
          error: 'POST /invoices exige **client** con id (documentación Alegra).',
        })
      }
      if (!args.date.trim() || !args.due_date.trim()) {
        return JSON.stringify({
          error: 'POST /invoices exige **date** y **dueDate** (documentación Alegra).',
        })
      }

      const items = buildInvoiceItemsFromLines(args.lines)
      const lineCheck = validateInvoiceLines(items)
      if (!lineCheck.ok) return JSON.stringify({ error: lineCheck.error })

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
        status: 'draft',
      }

      if (args.observations.trim()) body.observations = args.observations.trim()
      if (args.anotation.trim()) body.anotation = args.anotation.trim()
      if (args.terms_conditions.trim()) body.termsConditions = args.terms_conditions.trim()
      if (args.seller_id.trim()) body.seller = { id: args.seller_id.trim() }
      if (args.price_list_id.trim()) body.priceList = { id: args.price_list_id.trim() }
      if (args.warehouse_id.trim()) body.warehouse = { id: args.warehouse_id.trim() }
      if (args.cost_center_id.trim()) body.costCenter = { id: args.cost_center_id.trim() }
      if (code) {
        body.currency = { code, exchangeRate: args.currency_exchange_rate }
      }
      if (args.number_template_id.trim()) {
        const nt: Record<string, unknown> = { id: args.number_template_id.trim() }
        if (args.number_template_prefix.trim()) nt.prefix = args.number_template_prefix.trim()
        if (args.number_template_number.trim()) nt.number = args.number_template_number.trim()
        body.numberTemplate = nt
      }
      if (args.estimate_id.trim()) body.estimate = args.estimate_id.trim()

      if (args.payment_method.trim()) body.paymentMethod = args.payment_method.trim()
      if (args.payment_form.trim()) body.paymentForm = args.payment_form.trim()
      if (args.invoice_type.trim()) body.type = args.invoice_type.trim()
      if (args.payment_type_mexico.trim()) body.paymentType = args.payment_type_mexico.trim()
      if (args.cfdi_use_mexico.trim()) body.cfdiUse = args.cfdi_use_mexico.trim()
      if (args.account_number_mexico.trim()) body.accountNumber = args.account_number_mexico.trim()
      if (args.regime_client_mexico.trim()) body.regimeClient = args.regime_client_mexico.trim()
      if (args.operation_type_colombia.trim())
        body.operationType = args.operation_type_colombia.trim()
      if (args.purchase_order_number_colombia.trim())
        body.purchaseOrderNumber = args.purchase_order_number_colombia.trim()

      const result = await alegraJsonRequest('POST', '/invoices', body)
      return JSON.stringify(result)
    },
  })
}

/**
 * PUT /invoices/{id} — edición parcial.
 * https://developer.alegra.com/reference/put_invoices-id
 */
export function createAlegraUpdateInvoiceTool() {
  return tool({
    name: 'actualizar_factura_venta_alegra',
    description:
      'Actualiza una factura de venta (PUT `/invoices/{id}`). Solo se modifican atributos enviados; el resto queda igual. Para borrar texto, la API admite **`null`** (usa flags `clear_*`). **No** expone `status` ni `payments` para evitar abrir/facturar por error; para pasar de borrador a emitida usa **abrir_factura_venta_alegra**. Campos editables típicos: date, dueDate, observations, anotation, termsConditions, client, items (con `replace_items`), seller, priceList, currency, warehouse, costCenter, comments, numberTemplate, retentions, y extensiones por país según doc.',
    parameters: z.object({
      invoice_id: z.string().describe('Id de la factura a editar.'),
      date: z.string().describe('Nueva fecha `YYYY-MM-DD`; vacío = no cambiar.'),
      due_date: z.string().describe('Nuevo vencimiento; vacío = no cambiar.'),
      observations: z
        .string()
        .describe('Observaciones internas; vacío = no cambiar salvo clear_observations.'),
      clear_observations: z.boolean().describe('true para enviar observations: null.'),
      anotation: z
        .string()
        .describe('Notas PDF; vacío = no cambiar salvo clear_anotation.'),
      clear_anotation: z.boolean().describe('true para enviar anotation: null.'),
      terms_conditions: z
        .string()
        .describe('Términos y condiciones; vacío = no cambiar salvo clear_terms_conditions.'),
      clear_terms_conditions: z.boolean().describe('true para enviar termsConditions: null.'),
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
        .describe('Si true, reemplaza **items** por **lines**.'),
      lines: z
        .array(invoiceLineSchema)
        .describe('Líneas cuando replace_items=true (misma forma que en crear).'),
      comments: z
        .array(z.string())
        .describe('Comentarios; **vacío** = no enviar comments.'),
      number_template_id: z.string().describe('Id numeración; vacío = no cambiar.'),
      number_template_prefix: z.string().describe('Prefijo numeración manual; vacío = no cambiar.'),
      number_template_number: z.string().describe('Número numeración manual; vacío = no cambiar.'),
      payment_method: z.string().describe('Actualizar paymentMethod país si aplica; vacío = no cambiar.'),
      payment_form: z.string().describe('Actualizar paymentForm si aplica; vacío = no cambiar.'),
      payment_type_mexico: z.string().describe('México: paymentType; vacío = no cambiar.'),
      cfdi_use_mexico: z.string().describe('México: cfdiUse; vacío = no cambiar.'),
      regime_client_mexico: z.string().describe('México: regimeClient; vacío = no cambiar.'),
      invoice_type: z.string().describe('Tipo factura; vacío = no cambiar.'),
      purchase_order_number_colombia: z.string().describe('Colombia: orden compra; vacío = no cambiar.'),
    }),
    execute: async (args) => {
      const patch: Record<string, unknown> = {}

      if (args.date.trim()) patch.date = args.date.trim()
      if (args.due_date.trim()) patch.dueDate = args.due_date.trim()

      if (args.clear_observations) patch.observations = null
      else if (args.observations.trim()) patch.observations = args.observations.trim()

      if (args.clear_anotation) patch.anotation = null
      else if (args.anotation.trim()) patch.anotation = args.anotation.trim()

      if (args.clear_terms_conditions) patch.termsConditions = null
      else if (args.terms_conditions.trim()) patch.termsConditions = args.terms_conditions.trim()

      if (args.client_id.trim()) patch.client = { id: args.client_id.trim() }
      if (args.seller_id.trim()) patch.seller = { id: args.seller_id.trim() }
      if (args.price_list_id.trim()) patch.priceList = { id: args.price_list_id.trim() }
      if (args.warehouse_id.trim()) patch.warehouse = { id: args.warehouse_id.trim() }
      if (args.cost_center_id.trim()) patch.costCenter = { id: args.cost_center_id.trim() }

      const curr = args.currency_code.trim()
      if (curr) {
        if (!(args.currency_exchange_rate > 0)) {
          return JSON.stringify({
            error: 'Si envías currency, incluye exchangeRate > 0.',
          })
        }
        patch.currency = { code: curr, exchangeRate: args.currency_exchange_rate }
      }

      if (args.replace_items) {
        const items = buildInvoiceItemsFromLines(args.lines)
        const lineCheck = validateInvoiceLines(items)
        if (!lineCheck.ok) return JSON.stringify({ error: lineCheck.error })
        patch.items = items
      }

      if (args.comments.length > 0) patch.comments = args.comments

      if (args.number_template_id.trim()) {
        const nt: Record<string, unknown> = { id: args.number_template_id.trim() }
        if (args.number_template_prefix.trim()) nt.prefix = args.number_template_prefix.trim()
        if (args.number_template_number.trim()) nt.number = args.number_template_number.trim()
        patch.numberTemplate = nt
      }

      if (args.payment_method.trim()) patch.paymentMethod = args.payment_method.trim()
      if (args.payment_form.trim()) patch.paymentForm = args.payment_form.trim()
      if (args.payment_type_mexico.trim()) patch.paymentType = args.payment_type_mexico.trim()
      if (args.cfdi_use_mexico.trim()) patch.cfdiUse = args.cfdi_use_mexico.trim()
      if (args.regime_client_mexico.trim()) patch.regimeClient = args.regime_client_mexico.trim()
      if (args.invoice_type.trim()) patch.type = args.invoice_type.trim()
      if (args.purchase_order_number_colombia.trim())
        patch.purchaseOrderNumber = args.purchase_order_number_colombia.trim()

      if (Object.keys(patch).length === 0) {
        return JSON.stringify({
          error:
            'No hay cambios: indica al menos un campo a modificar o replace_items con líneas.',
        })
      }

      const id = encodeURIComponent(args.invoice_id.trim())
      const result = await alegraJsonRequest('PUT', `/invoices/${id}`, patch)
      return JSON.stringify(result)
    },
  })
}

/**
 * POST /invoices/{id}/open — abrir / emitir factura (p. ej. desde anulación o pasar borrador a abierta según flujo Alegra).
 * https://developer.alegra.com/reference/post_invoices-id-open
 */
export function createAlegraOpenInvoiceTool() {
  return tool({
    name: 'abrir_factura_venta_alegra',
    description:
      'Abre/emite la factura de venta (POST `/invoices/{id}/open`). **Campo de ruta obligatorio:** id de la factura. **Cuerpo JSON obligatorio** en la API (puede ser `{}`). Sin objeto `stamp` → abrir **sin** timbrar/expedir electrónicamente según doc. Con `timbrar_o_expedir_al_abrir=true` envía `stamp: { generateStamp: true }` para timbrar (MX) o expedir/emitir FE en Alegra según país (configuración empresa). **Antes de llamar**, el usuario debe tener la factura coherente con su país (cliente, ítems, impuestos, y **campos obligatorios del país** para emisión: en México `paymentMethod`, `paymentType`, etc.; en Colombia con FE 2.1 a menudo `paymentForm` y a veces `paymentMethod`; revisa la doc de tu país en [post_invoices](https://developer.alegra.com/reference/post_invoices) y catálogos Alegra).',
    parameters: z.object({
      invoice_id: z.string().describe('Id de la factura de venta a abrir/emitir.'),
      timbrar_o_expedir_al_abrir: z
        .boolean()
        .describe(
          'true = enviar stamp.generateStamp true (timbrar/expedir según país). false = cuerpo vacío (sin timbrar al abrir).',
        ),
    }),
    execute: async (args) => {
      const id = encodeURIComponent(args.invoice_id.trim())
      if (!id) {
        return JSON.stringify({ error: 'Falta invoice_id.' })
      }
      const body: Record<string, unknown> = args.timbrar_o_expedir_al_abrir
        ? { stamp: { generateStamp: true } }
        : {}
      const result = await alegraJsonRequest('POST', `/invoices/${id}/open`, body)
      return JSON.stringify(result)
    },
  })
}

/**
 * POST /invoices/preview — URL de PDF de vista previa.
 * https://developer.alegra.com/reference/post_invoices-preview
 */
export function createAlegraPreviewInvoiceTool() {
  return tool({
    name: 'vista_previa_factura_venta_alegra',
    description:
      'Vista previa PDF (POST `/invoices/preview`). Mismo núcleo que crear más **campos por país** si la cuenta los exige al validar (p. ej. Colombia `paymentForm` / `paymentMethod` bajo FE 2.1; México `paymentMethod`, `paymentType`). Si omites lo que el país requiere, la vista previa puede fallar igual que el alta. Doc: [post_invoices-preview](https://developer.alegra.com/reference/post_invoices-preview).',
    parameters: z.object({
      date: z.string().describe('Fecha `YYYY-MM-DD`.'),
      due_date: z.string().describe('Vencimiento `YYYY-MM-DD`.'),
      client_id: z.string().describe('Id cliente en Alegra.'),
      lines: z.array(invoiceLineSchema).min(1).describe('Líneas de ítems (igual que crear factura).'),
      anotation: z.string().describe('Notas en PDF; vacío para omitir.'),
      terms_conditions: z.string().describe('Términos y condiciones; vacío para omitir.'),
      number_template_id: z.string().describe('Id numeración; vacío para omitir.'),
      number_template_prefix: z.string().describe('Prefijo numeración manual; vacío para omitir.'),
      number_template_number: z.string().describe('Número manual; vacío para omitir.'),
      currency_code: z.string().describe('ISO 4217 si multimoneda; vacío = omitir.'),
      currency_exchange_rate: z
        .number()
        .describe('Tasa si multimoneda; -1 si no aplica.'),
      payment_method: z.string().describe('Medio/forma de pago según país; vacío = omitir.'),
      payment_form: z.string().describe('Colombia CASH/CREDIT u otro; vacío = omitir.'),
      invoice_type: z.string().describe('Tipo factura (ej. NATIONAL); vacío = omitir.'),
      payment_type_mexico: z.string().describe('México PUE/PPD; vacío = omitir.'),
      account_number_mexico: z.string().describe('México cuenta/tarjeta si aplica; vacío = omitir.'),
    }),
    execute: async (args) => {
      if (!args.date.trim() || !args.due_date.trim()) {
        return JSON.stringify({
          error: 'La vista previa exige **date** y **dueDate**.',
        })
      }
      const clientId = args.client_id.trim()
      if (!clientId) {
        return JSON.stringify({ error: 'La vista previa exige **client** con id.' })
      }
      const items = buildInvoiceItemsFromLines(args.lines)
      const lineCheck = validateInvoiceLines(items)
      if (!lineCheck.ok) return JSON.stringify({ error: lineCheck.error })

      const body: Record<string, unknown> = {
        date: args.date.trim(),
        dueDate: args.due_date.trim(),
        client: { id: clientId },
        items,
      }

      if (args.anotation.trim()) body.anotation = args.anotation.trim()
      if (args.terms_conditions.trim()) body.termsConditions = args.terms_conditions.trim()

      if (args.number_template_id.trim()) {
        const nt: Record<string, unknown> = { id: args.number_template_id.trim() }
        if (args.number_template_prefix.trim()) nt.prefix = args.number_template_prefix.trim()
        if (args.number_template_number.trim()) nt.number = args.number_template_number.trim()
        body.numberTemplate = nt
      }

      const code = args.currency_code.trim()
      if (code) {
        if (!(args.currency_exchange_rate > 0)) {
          return JSON.stringify({
            error: 'Con currency en vista previa, incluye exchangeRate > 0.',
          })
        }
        body.currency = { code, exchangeRate: args.currency_exchange_rate }
      }

      if (args.payment_method.trim()) body.paymentMethod = args.payment_method.trim()
      if (args.payment_form.trim()) body.paymentForm = args.payment_form.trim()
      if (args.invoice_type.trim()) body.type = args.invoice_type.trim()
      if (args.payment_type_mexico.trim()) body.paymentType = args.payment_type_mexico.trim()
      if (args.account_number_mexico.trim()) body.accountNumber = args.account_number_mexico.trim()

      const result = await alegraJsonRequest('POST', '/invoices/preview', body)
      return JSON.stringify(result)
    },
  })
}

export function createAlegraInvoiceTools() {
  return [
    createAlegraListInvoicesTool(),
    createAlegraCreateInvoiceTool(),
    createAlegraUpdateInvoiceTool(),
    createAlegraOpenInvoiceTool(),
    createAlegraPreviewInvoiceTool(),
  ]
}

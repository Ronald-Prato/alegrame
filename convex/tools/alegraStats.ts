import { tool } from '@openai/agents'
import { z } from 'zod'
import { alegraJsonRequest } from '../lib/alegraClient'

const PAGE_LIMIT = 30
/** Evita timeouts en cuentas muy grandes; pedir rangos más cortos si se alcanza. */
const MAX_INVOICE_PAGES = 400
const MAX_BILL_PAGES = 400
const MAX_CONTACT_PAGES = 120
/** Detalle por factura para líneas de producto (costoso en API). */
const MAX_INVOICE_DETAIL_FETCHES = 350
const DETAIL_CONCURRENCY = 6

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseIsoDateStrict(s: string): { ok: true; value: string } | { ok: false; error: string } {
  const t = s.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return { ok: false, error: 'Las fechas deben ser YYYY-MM-DD.' }
  }
  const d = new Date(`${t}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'Fecha inválida.' }
  return { ok: true, value: t }
}

/** Alegra `date_after` / `date_before` suelen trabajar como límites exclusivos del día indicado en la doc interna del proyecto. */
function alegraExclusiveLowerBound(inclusiveStart: string): string {
  const d = new Date(`${inclusiveStart}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function alegraExclusiveUpperBound(inclusiveEnd: string): string {
  const d = new Date(`${inclusiveEnd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function normalizePaginated(payload: unknown): { rows: unknown[]; total?: number } {
  if (Array.isArray(payload)) return { rows: payload }
  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    Array.isArray((payload as { data: unknown }).data)
  ) {
    const meta = (payload as { metadata?: { total?: unknown } }).metadata
    const rows = (payload as { data: unknown[] }).data
    const totalRaw =
      meta && typeof meta === 'object' && typeof meta.total === 'number' ? meta.total : undefined
    const base: { rows: unknown[]; total?: number } = { rows }
    if (typeof totalRaw === 'number') base.total = totalRaw
    return base
  }
  return { rows: [] }
}

function rowClient(row: Record<string, unknown>): { id: string; name: string } {
  const c = row.client
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>
    return { id: String(o.id ?? ''), name: String(o.name ?? '') }
  }
  return { id: '', name: '' }
}

function contactCity(contact: Record<string, unknown>): string {
  const addr = contact.address
  if (addr && typeof addr === 'object') {
    const city = (addr as Record<string, unknown>).city
    if (typeof city === 'string') return city
  }
  return ''
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeLower(s: string): string {
  return stripDiacritics(s.trim()).toLowerCase()
}

function cityMatchesSearch(cityRaw: string, searchRaw: string): boolean {
  const city = normalizeLower(cityRaw)
  const search = normalizeLower(searchRaw)
  if (!city || !search) return false
  if (city.includes(search)) return true
  if (search.includes('bogota')) {
    return (
      city.includes('bogota') ||
      city.includes('distrito capital') ||
      city.includes('bogota, d.c') ||
      city.includes('bogota d.c')
    )
  }
  return false
}

function lineSubtotal(price: number, qty: number, discountRaw: unknown): number {
  const disc = num(discountRaw)
  let gross = price * qty
  if (disc > 0 && disc <= 100) {
    gross *= 1 - disc / 100
  }
  return gross
}

async function fetchAllInvoiceSummaries(args: {
  fecha_inicio: string
  fecha_fin: string
  status_csv: string
}): Promise<
  | {
      ok: true
      summaries: Array<{
        id: string
        date: string
        status: string
        total: number
        client: { id: string; name: string }
      }>
      warnings: string[]
    }
  | { ok: false; error: string }
> {
  const warnings: string[] = []
  const summaries: Array<{
    id: string
    date: string
    status: string
    total: number
    client: { id: string; name: string }
  }> = []

  let start = 0
  let totalKnown: number | undefined

  for (let page = 0; page < MAX_INVOICE_PAGES; page++) {
    const params = new URLSearchParams()
    params.set('metadata', 'true')
    params.set('limit', String(PAGE_LIMIT))
    params.set('start', String(start))
    params.set('order_field', 'date')
    params.set('order_direction', 'ASC')
    params.set('date_after', alegraExclusiveLowerBound(args.fecha_inicio))
    params.set('date_before', alegraExclusiveUpperBound(args.fecha_fin))
    if (args.status_csv.trim()) params.set('status', args.status_csv.trim())

    const body = await alegraJsonRequest('GET', `/invoices?${params}`)
    if (body && typeof body === 'object' && 'error' in body) {
      return { ok: false, error: String((body as { error?: unknown }).error ?? 'Error Alegra') }
    }

    const { rows, total } = normalizePaginated(body)
    if (typeof total === 'number') totalKnown = total

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      summaries.push({
        id: String(r.id ?? ''),
        date: String(r.date ?? ''),
        status: String(r.status ?? ''),
        total: num(r.total),
        client: rowClient(r),
      })
    }

    if (rows.length < PAGE_LIMIT) break
    start += PAGE_LIMIT
    if (totalKnown !== undefined && start >= totalKnown) break
  }

  if (warnings.length === 0 && summaries.length >= PAGE_LIMIT * MAX_INVOICE_PAGES) {
    warnings.push(
      'Se alcanzó el límite de páginas de facturas de venta; acorta el rango de fechas para un resultado completo.',
    )
  }

  return { ok: true, summaries, warnings }
}

async function fetchInvoiceDetail(id: string): Promise<Record<string, unknown> | null> {
  const body = await alegraJsonRequest('GET', `/invoices/${encodeURIComponent(id)}`)
  if (body && typeof body === 'object' && 'error' in body) return null
  if (body && typeof body === 'object') return body as Record<string, unknown>
  return null
}

async function mapLimit<T, R>(items: T[], chunk: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += chunk) {
    const slice = items.slice(i, i + chunk)
    const part = await Promise.all(slice.map(fn))
    out.push(...part)
  }
  return out
}

async function fetchAllBillsInRange(args: {
  fecha_inicio: string
  fecha_fin: string
  status_csv: string
}): Promise<
  | {
      ok: true
      bills: Array<{
        id: string
        date: string
        status: string
        total: number
        observations: string
        providerName: string
        categoryTexts: string[]
      }>
      warnings: string[]
    }
  | { ok: false; error: string }
> {
  const warnings: string[] = []
  const bills: Array<{
    id: string
    date: string
    status: string
    total: number
    observations: string
    providerName: string
    categoryTexts: string[]
  }> = []

  let start = 0
  let totalKnown: number | undefined
  const fi = args.fecha_inicio
  const ff = args.fecha_fin

  for (let page = 0; page < MAX_BILL_PAGES; page++) {
    const params = new URLSearchParams()
    params.set('metadata', 'true')
    params.set('limit', String(PAGE_LIMIT))
    params.set('start', String(start))
    params.set('order_field', 'date')
    params.set('order_direction', 'ASC')
    params.set('type', 'bill')
    if (args.status_csv.trim()) params.set('status', args.status_csv.trim())

    const body = await alegraJsonRequest('GET', `/bills?${params}`)
    if (body && typeof body === 'object' && 'error' in body) {
      return { ok: false, error: String((body as { error?: unknown }).error ?? 'Error Alegra') }
    }

    const { rows, total } = normalizePaginated(body)
    if (typeof total === 'number') totalKnown = total

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const date = String(r.date ?? '')
      if (date && (date < fi || date > ff)) continue

      const prov = r.provider
      let providerName = ''
      if (prov && typeof prov === 'object') {
        providerName = String((prov as Record<string, unknown>).name ?? '')
      }

      const obs = String(r.observations ?? '')
      const cats: string[] = []
      const purchases = r.purchases
      if (purchases && typeof purchases === 'object') {
        const c = (purchases as Record<string, unknown>).categories
        if (Array.isArray(c)) {
          for (const rowCat of c) {
            if (rowCat && typeof rowCat === 'object') {
              const name = String((rowCat as Record<string, unknown>).name ?? '')
              if (name) cats.push(name)
            }
          }
        }
      }

      bills.push({
        id: String(r.id ?? ''),
        date,
        status: String(r.status ?? ''),
        total: num(r.total),
        observations: obs,
        providerName,
        categoryTexts: cats,
      })
    }

    if (rows.length < PAGE_LIMIT) break
    start += PAGE_LIMIT
    if (totalKnown !== undefined && start >= totalKnown) break
  }

  if (bills.length >= PAGE_LIMIT * MAX_BILL_PAGES - 100) {
    warnings.push(
      'Muchas facturas de proveedor paginadas; si el rango es muy amplio el total puede estar incompleto por límites de paginación.',
    )
  }

  return { ok: true, bills, warnings }
}

export function createAlegraStatsTools() {
  return [
    tool({
      name: 'stats_ranking_clientes_facturacion',
      description:
        'Ranking de **clientes** por **facturación** en Alegra usando solo el listado de facturas de venta (GET `/invoices` paginado). Agrega totales por cliente en el rango inclusivo `[fecha_inicio, fecha_fin]`. Respeta `estados` típicos `open,closed` (excluye borradores/anuladas si así lo configuras).',
      parameters: z.object({
        fecha_inicio: z.string().describe('Inicio inclusive `YYYY-MM-DD`.'),
        fecha_fin: z.string().describe('Fin inclusive `YYYY-MM-DD`.'),
        estados: z
          .string()
          .describe(
            'Filtra facturas Alegra (`status`): ej. `open,closed`; vacío = sin filtro de estado.',
          ),
        top_n: z
          .number()
          .describe('Cuántos clientes devolver ordenados por mayor facturación (mínimo 1).'),
      }),
      execute: async (args) => {
        const a = parseIsoDateStrict(args.fecha_inicio)
        const b = parseIsoDateStrict(args.fecha_fin)
        if (!a.ok) return JSON.stringify({ error: a.error })
        if (!b.ok) return JSON.stringify({ error: b.error })
        if (a.value > b.value) {
          return JSON.stringify({ error: 'fecha_inicio no puede ser posterior a fecha_fin.' })
        }

        const fetched = await fetchAllInvoiceSummaries({
          fecha_inicio: a.value,
          fecha_fin: b.value,
          status_csv: args.estados.trim(),
        })
        if (!fetched.ok) return JSON.stringify({ error: fetched.error })

        const byClient = new Map<string, { name: string; facturacion: number; facturas: number }>()
        for (const s of fetched.summaries) {
          const cid = s.client.id || 'unknown'
          const name = s.client.name || '(sin nombre)'
          const cur = byClient.get(cid) ?? { name, facturacion: 0, facturas: 0 }
          cur.facturacion += s.total
          cur.facturas += 1
          if (!cur.name && name) cur.name = name
          byClient.set(cid, cur)
        }

        const ranking = [...byClient.entries()]
          .map(([client_id, v]) => ({
            client_id,
            cliente: v.name,
            facturacion_total_aprox: Math.round(v.facturacion * 100) / 100,
            numero_facturas: v.facturas,
          }))
          .sort((x, y) => y.facturacion_total_aprox - x.facturacion_total_aprox)

        const n = Math.max(1, Math.floor(args.top_n))
        return JSON.stringify({
          ok: true,
          periodo: { desde: a.value, hasta: b.value },
          facturas_consideradas: fetched.summaries.length,
          ranking: ranking.slice(0, n),
          advertencias: fetched.warnings,
          nota:
            'Totales según campo `total` de cada factura en Alegra (puede incluir impuestos según configuración). Para «mejor cliente» define con el usuario si es por facturación, frecuencia o margen.',
        })
      },
    }),

    tool({
      name: 'stats_ranking_productos_por_lineas_factura',
      description:
        'Ranking de **productos/servicios** vendidos según las **líneas** de cada factura de venta en el rango. Llama GET `/invoices/{id}` por cada factura (límite interno de volumen). Devuelve tops por **cantidad** o por **importe** estimado (`quantity * price` con descuento % si viene en línea).',
      parameters: z.object({
        fecha_inicio: z.string(),
        fecha_fin: z.string(),
        estados: z.string().describe('Ej. `open,closed`; vacío = todos los estados listados.'),
        orden: z.enum(['cantidad', 'importe']).describe('Orden descendente del ranking.'),
        top_n: z.number().describe('Tamaño del ranking (ej. 15).'),
        modo: z
          .enum(['mas_vendidos', 'menos_vendidos'])
          .describe('`menos_vendidos` devuelve el tail del ranking (excluye cantidad 0).'),
      }),
      execute: async (args) => {
        const a = parseIsoDateStrict(args.fecha_inicio)
        const b = parseIsoDateStrict(args.fecha_fin)
        if (!a.ok) return JSON.stringify({ error: a.error })
        if (!b.ok) return JSON.stringify({ error: b.error })
        if (a.value > b.value) {
          return JSON.stringify({ error: 'fecha_inicio no puede ser posterior a fecha_fin.' })
        }

        const fetched = await fetchAllInvoiceSummaries({
          fecha_inicio: a.value,
          fecha_fin: b.value,
          status_csv: args.estados.trim(),
        })
        if (!fetched.ok) return JSON.stringify({ error: fetched.error })

        const ids = fetched.summaries.map((s) => s.id).filter(Boolean)
        if (ids.length > MAX_INVOICE_DETAIL_FETCHES) {
          return JSON.stringify({
            error: `Hay ${ids.length} facturas en el rango; reduce fechas (máximo procesable ~${MAX_INVOICE_DETAIL_FETCHES}) para analizar líneas de producto.`,
          })
        }

        const details = await mapLimit(ids, DETAIL_CONCURRENCY, fetchInvoiceDetail)
        const missed = details.filter((d) => d === null).length

        const map = new Map<string, { name: string; cantidad: number; importe_sin_impuesto_estimado: number }>()
        for (const inv of details) {
          if (!inv) continue
          const items = inv.items
          if (!Array.isArray(items)) continue
          for (const line of items) {
            if (!line || typeof line !== 'object') continue
            const o = line as Record<string, unknown>
            const pid = String(o.id ?? '')
            if (!pid) continue
            const name = String(o.name ?? '')
            const price = num(o.price)
            const qty = num(o.quantity)
            const sub = lineSubtotal(price, qty, o.discount)
            const cur =
              map.get(pid) ?? { name: name || pid, cantidad: 0, importe_sin_impuesto_estimado: 0 }
            cur.cantidad += qty
            cur.importe_sin_impuesto_estimado += sub
            if (!cur.name && name) cur.name = name
            map.set(pid, cur)
          }
        }

        const rows = [...map.entries()].map(([item_id, v]) => ({
          item_id,
          nombre: v.name,
          cantidad_total: Math.round(v.cantidad * 1000) / 1000,
          importe_estimado: Math.round(v.importe_sin_impuesto_estimado * 100) / 100,
        }))

        const sortKey = args.orden === 'cantidad' ? 'cantidad_total' : 'importe_estimado'
        rows.sort((x, y) => (y[sortKey] as number) - (x[sortKey] as number))

        const n = Math.max(1, Math.floor(args.top_n))
        let ranking = rows
        if (args.modo === 'menos_vendidos') {
          ranking = [...rows].reverse().filter((r) => r.cantidad_total > 0)
        } else {
          ranking = rows
        }

        return JSON.stringify({
          ok: true,
          periodo: { desde: a.value, hasta: b.value },
          facturas_con_detalle: ids.length,
          lineas_facturas_sin_detalle: missed,
          orden: args.orden,
          modo: args.modo,
          ranking: ranking.slice(0, n),
          advertencias: fetched.warnings,
          nota_precios:
            'Importe estimado desde líneas (`price`, `quantity`, `discount` según Alegra); no sustituye informe contable.',
        })
      },
    }),

    tool({
      name: 'stats_comparativo_mensual_ventas_vs_compras',
      description:
        'Compara por **mes calendario** la suma de `total` de **facturas de venta** vs **facturas de proveedor** (`GET /bills`, tipo bill) en el rango. Sirve como proxy de «facturación vs compras/inversión en proveedores» (no es margen bruto contable si faltan costos).',
      parameters: z.object({
        fecha_inicio: z.string(),
        fecha_fin: z.string(),
        estados_facturas: z.string().describe('Ej. `open,closed`; vacío = todos.'),
        estados_facturas_proveedor: z.string().describe('Ej. `open,closed`; vacío = todos.'),
      }),
      execute: async (args) => {
        const a = parseIsoDateStrict(args.fecha_inicio)
        const b = parseIsoDateStrict(args.fecha_fin)
        if (!a.ok) return JSON.stringify({ error: a.error })
        if (!b.ok) return JSON.stringify({ error: b.error })
        if (a.value > b.value) {
          return JSON.stringify({ error: 'fecha_inicio no puede ser posterior a fecha_fin.' })
        }

        const inv = await fetchAllInvoiceSummaries({
          fecha_inicio: a.value,
          fecha_fin: b.value,
          status_csv: args.estados_facturas.trim(),
        })
        if (!inv.ok) return JSON.stringify({ error: inv.error })

        const bills = await fetchAllBillsInRange({
          fecha_inicio: a.value,
          fecha_fin: b.value,
          status_csv: args.estados_facturas_proveedor.trim(),
        })
        if (!bills.ok) return JSON.stringify({ error: bills.error })

        const ventasPorMes = new Map<string, number>()
        for (const s of inv.summaries) {
          const key = (s.date || '').slice(0, 7)
          if (!key || key.length !== 7) continue
          ventasPorMes.set(key, (ventasPorMes.get(key) ?? 0) + s.total)
        }

        const comprasPorMes = new Map<string, number>()
        for (const bill of bills.bills) {
          const key = (bill.date || '').slice(0, 7)
          if (!key || key.length !== 7) continue
          comprasPorMes.set(key, (comprasPorMes.get(key) ?? 0) + bill.total)
        }

        const months = new Set([...ventasPorMes.keys(), ...comprasPorMes.keys()])
        const serie = [...months]
          .sort()
          .map((mes) => {
            const v = ventasPorMes.get(mes) ?? 0
            const c = comprasPorMes.get(mes) ?? 0
            return {
              mes,
              ventas_facturas_total: Math.round(v * 100) / 100,
              compras_proveedor_total: Math.round(c * 100) / 100,
              diferencia_ventas_menos_compras: Math.round((v - c) * 100) / 100,
            }
          })

        let mejor = serie[0]
        for (const row of serie) {
          if (!mejor || row.diferencia_ventas_menos_compras > mejor.diferencia_ventas_menos_compras) {
            mejor = row
          }
        }

        return JSON.stringify({
          ok: true,
          periodo: { desde: a.value, hasta: b.value },
          mes_mayor_diferencia_ventas_menos_compras: mejor ?? null,
          serie_mensual: serie,
          facturas_venta_usadas: inv.summaries.length,
          facturas_proveedor_usadas: bills.bills.length,
          advertencias: [...inv.warnings, ...bills.warnings],
          nota:
            '«Inversión en productos» se aproxima con compras a proveedores registradas como facturas de proveedor; no incluye nómina ni otros gastos.',
        })
      },
    }),

    tool({
      name: 'stats_contar_clientes_por_ciudad',
      description:
        'Cuenta **clientes** (`GET /contacts`, tipo client, modo advanced) cuyo campo de ciudad en dirección coincide con `ciudad_busqueda` (contiene texto, tolera Bogotá / Bogotá D.C.). No exige rango de fechas (snapshot del maestro).',
      parameters: z.object({
        ciudad_busqueda: z
          .string()
          .describe('Ej. Bogotá, Medellín — se compara contra `address.city`.'),
      }),
      execute: async (args) => {
        const search = args.ciudad_busqueda.trim()
        if (!search) return JSON.stringify({ error: 'Indica ciudad_busqueda.' })

        let counted = 0
        let scanned = 0
        const muestra: Array<{ id: string; nombre: string; ciudad: string }> = []
        const warnings: string[] = []
        let stoppedByPageLimit = false

        for (let page = 0; page < MAX_CONTACT_PAGES; page++) {
          const params = new URLSearchParams()
          params.set('limit', String(PAGE_LIMIT))
          params.set('start', String(page * PAGE_LIMIT))
          params.set('type', 'client')
          params.set('mode', 'advanced')

          const raw = await alegraJsonRequest('GET', `/contacts?${params}`)
          if (raw && typeof raw === 'object' && 'error' in raw) {
            return JSON.stringify({ error: String((raw as { error?: unknown }).error) })
          }

          const list = Array.isArray(raw)
            ? raw
            : raw &&
                typeof raw === 'object' &&
                'data' in raw &&
                Array.isArray((raw as { data: unknown }).data)
              ? (raw as { data: unknown[] }).data
              : []

          if (list.length === 0) break

          for (const row of list) {
            if (!row || typeof row !== 'object') continue
            const c = row as Record<string, unknown>
            scanned += 1
            const city = contactCity(c)
            if (cityMatchesSearch(city, search)) {
              counted += 1
              if (muestra.length < 15) {
                muestra.push({
                  id: String(c.id ?? ''),
                  nombre: String(c.name ?? ''),
                  ciudad: city,
                })
              }
            }
          }

          if (list.length < PAGE_LIMIT) break
          if (page === MAX_CONTACT_PAGES - 1) stoppedByPageLimit = true
        }

        if (stoppedByPageLimit) {
          warnings.push(
            'Se alcanzó el límite de páginas de contactos; el conteo puede ser una cota inferior.',
          )
        }

        return JSON.stringify({
          ok: true,
          ciudad_busqueda: search,
          clientes_coincidentes: counted,
          clientes_escaneados: scanned,
          muestra,
          advertencias: warnings,
          nota: 'Coincidencia por texto en ciudad registrada; datos deben estar completos en Alegra.',
        })
      },
    }),

    tool({
      name: 'stats_facturas_proveedor_filtradas',
      description:
        'Lista paginada internamente las **facturas de proveedor** en `[fecha_inicio, fecha_fin]` y permite sumar/importar solo las que coinciden con `texto_filtro` en observaciones, nombre de proveedor o nombres de categorías de compra (útil para buscar gastos relacionados con «renta», «declaración», etc.). Si `texto_filtro` está vacío, incluye todas las del rango.',
      parameters: z.object({
        fecha_inicio: z.string(),
        fecha_fin: z.string(),
        texto_filtro: z
          .string()
          .describe(
            'Texto a buscar (sin acentos opcional); vacío = sin filtro de texto. Ej: renta, DIAN, declaracion.',
          ),
        estados: z.string().describe('Ej. `closed`; vacío = todos.'),
      }),
      execute: async (args) => {
        const a = parseIsoDateStrict(args.fecha_inicio)
        const b = parseIsoDateStrict(args.fecha_fin)
        if (!a.ok) return JSON.stringify({ error: a.error })
        if (!b.ok) return JSON.stringify({ error: b.error })
        if (a.value > b.value) {
          return JSON.stringify({ error: 'fecha_inicio no puede ser posterior a fecha_fin.' })
        }

        const bills = await fetchAllBillsInRange({
          fecha_inicio: a.value,
          fecha_fin: b.value,
          status_csv: args.estados.trim(),
        })
        if (!bills.ok) return JSON.stringify({ error: bills.error })

        const needle = normalizeLower(args.texto_filtro.trim())
        const filtered = needle
          ? bills.bills.filter((bill) => {
              const haystack = [
                bill.observations,
                bill.providerName,
                ...bill.categoryTexts,
              ]
                .join(' ')
                .toLowerCase()
              const h = stripDiacritics(haystack).toLowerCase()
              return h.includes(needle)
            })
          : bills.bills

        const totalSum = filtered.reduce((acc, x) => acc + x.total, 0)

        return JSON.stringify({
          ok: true,
          periodo: { desde: a.value, hasta: b.value },
          texto_filtro: args.texto_filtro.trim(),
          coincidencias: filtered.length,
          total_facturas_en_rango: bills.bills.length,
          suma_totales_coincidencias: Math.round(totalSum * 100) / 100,
          muestra: filtered.slice(0, 25).map((b) => ({
            id: b.id,
            fecha: b.date,
            proveedor: b.providerName,
            total: b.total,
            estado: b.status,
            observaciones: b.observations.slice(0, 280),
            categorias: b.categoryTexts,
          })),
          advertencias: bills.warnings,
          nota:
            'Los montos son los `total` devueltos por Alegra para facturas de proveedor; una liquidación de «declaración de renta» puede estar partida en varios documentos o fuera de Alegra.',
        })
      },
    }),
  ]
}

"use node";

import {
  Agent,
  assistant,
  extractAllTextOutput,
  getDefaultModelSettings,
  run,
  user,
  type RunHandoffCallItem,
  type RunHandoffOutputItem,
} from "@openai/agents";
import type { StreamedRunResult } from "@openai/agents";
import {
  OpenAIResponsesCompactionSession,
  setDefaultOpenAIKey,
} from "@openai/agents-openai";
import {
  MemorySession,
  type AgentInputItem,
  type RunItem,
  type RunToolCallOutputItem,
} from "@openai/agents-core";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { createAlegraItemTools } from "./tools/alegraInventory";
import { createAlegraContactTools } from "./tools/alegraContacts";
import { createAlegraEstimateTools } from "./tools/alegraEstimates";
import { createAlegraInvoiceTools } from "./tools/alegraInvoices";
import { createAlegraPurchaseBillTools } from "./tools/alegraPurchaseBills";
import { createAlegraColombiaPaymentCatalogTools } from "./tools/alegraColombiaPaymentCatalog";
import { createAlegraStatsTools } from "./tools/alegraStats";
import { createPeriodAnchorTools } from "./tools/periodAnchors";

const MAX_CONTEXT_MESSAGES = 40;

/** User + assistant text turns in `conversations.messages` (las filas compaction no cuentan). */
const CONTEXT_COMPACTION_PLAIN_MIN = 20;

type ConvexContextEntry =
  | { role: "user" | "assistant"; content: string }
  | { kind: "compaction"; payloadJson: string };

function isConvexCompactionEntry(
  entry: ConvexContextEntry,
): entry is { kind: "compaction"; payloadJson: string } {
  return "kind" in entry && entry.kind === "compaction";
}

function countPlainContextTurns(entries: ConvexContextEntry[]): number {
  return entries.filter((e) => !isConvexCompactionEntry(e)).length;
}

function extractUserMessageText(item: {
  content:
    | string
    | readonly { type?: string; text?: string }[];
}): string {
  const c = item.content;
  if (typeof c === "string") return c.trim();
  const parts: string[] = [];
  for (const part of c ?? []) {
    if (
      part &&
      typeof part === "object" &&
      part.type === "input_text" &&
      typeof part.text === "string"
    ) {
      parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

function extractAssistantMessageText(item: {
  content:
    | string
    | readonly { type?: string; text?: string }[];
}): string {
  const c = item.content;
  if (typeof c === "string") return c.trim();
  const parts: string[] = [];
  for (const part of c ?? []) {
    if (
      part &&
      typeof part === "object" &&
      part.type === "output_text" &&
      typeof part.text === "string"
    ) {
      parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

function convexContextToAgentItems(entries: ConvexContextEntry[]): AgentInputItem[] {
  return entries.map((e) => {
    if (isConvexCompactionEntry(e)) {
      return JSON.parse(e.payloadJson) as AgentInputItem;
    }
    return e.role === "user" ? user(e.content) : assistant(e.content);
  });
}

function agentItemsToConvexContext(items: AgentInputItem[]): ConvexContextEntry[] {
  return items.map((item) => {
    if (item.type === "compaction") {
      return {
        kind: "compaction",
        payloadJson: JSON.stringify(item),
      };
    }
    if (item.type === "message" && item.role === "user") {
      const content = extractUserMessageText(item);
      return {
        role: "user",
        content: content || "",
      };
    }
    if (item.type === "message" && item.role === "assistant") {
      const content = extractAssistantMessageText(item);
      return {
        role: "assistant",
        content: content || "",
      };
    }
    throw new Error(
      `No se puede mapar item de compaction a Convex: tipo ${JSON.stringify(item && "type" in item ? item.type : "?")}`,
    );
  });
}

async function compactContextWithAgentsSdk(
  modelName: string,
  agentItems: AgentInputItem[],
): Promise<AgentInputItem[]> {
  const session = new OpenAIResponsesCompactionSession({
    underlyingSession: new MemorySession({ initialItems: agentItems }),
    model: modelName,
    compactionMode: "input",
    shouldTriggerCompaction: () => false,
  });
  const result = await session.runCompaction({ force: true, compactionMode: "input" });
  if (!result) {
    throw new Error("OpenAI compaction no produjo resultado (runCompaction devolvió null).");
  }
  return session.getItems();
}

async function maybeCompactConversationMessages(
  ctx: ActionCtx,
  args: { conversationId: Id<"conversations"> },
  meta: {
    plainCountMinimum: number;
    modelName: string;
    history: ConvexContextEntry[];
  },
): Promise<{ compacted: boolean }> {
  if (countPlainContextTurns(meta.history) < meta.plainCountMinimum) {
    return { compacted: false };
  }
  try {
    const agentItems = convexContextToAgentItems(meta.history);
    const compactedItems = await compactContextWithAgentsSdk(meta.modelName, agentItems);
    const nextEntries = agentItemsToConvexContext(compactedItems);
    await ctx.runMutation(internal.conversations.internalSetContext, {
      conversationId: args.conversationId,
      messages: nextEntries,
    });
    await ctx.runMutation(internal.conversations.internalTrimContextTail, {
      conversationId: args.conversationId,
      maxMessages: MAX_CONTEXT_MESSAGES,
    });
    await ctx.runMutation(internal.messages.internalAppendCompactNotice, {
      conversationId: args.conversationId,
    });
    return { compacted: true };
  } catch (err) {
    console.error("maybeCompactConversationMessages failed:", err);
    return { compacted: false };
  }
}

const STATS_AGENT_INSTRUCTIONS = [
  '# Contexto multi-agente',
  'Los traspasos entre agentes ocurren en segundo plano; **no** menciones el cambio de agente salvo que el usuario pregunte.',
  '',
  'Eres el **asistente exclusivo de estadísticas** sobre datos en **Alegra** (facturas de venta, facturas de proveedor y contactos).',
  '',
  '## Regla obligatoria: rango de fechas para informes temporales',
  '- Para rankings de ventas, clientes que más compraron, productos más/menos vendidos, comparativos mensuales ventas vs compras y gastos por período necesitas **`fecha_inicio`** y **`fecha_fin`** (`YYYY-MM-DD`) **antes** de llamar herramientas Alegra.',
  '- **Fechas relativas** («el mes pasado», «este mes», «este año», «lo que va del año», «últimos N días»): invoca **`resolver_rango_fechas_relativo`** con **`preset`** adecuado y **`zona_horaria`** IANA (**`America/Bogota`** por defecto si el usuario no indicó país/zona). Usa **`fecha_inicio`** y **`fecha_fin`** que devuelve en las llamadas siguientes.',
  '- Si el usuario da solo un año natural (ej. 2025), usa **2025-01-01** y **2025-12-31** y confírmalo en una línea.',
  '- Si dice «últimos 4 meses» u otro período **multi-mes ambiguo** sin fechas, **pregunta** cotas claras **o** ofrece separar por mes — no extrapoles con reglas inventadas.',
  '- **Excepción**: `stats_contar_clientes_por_ciudad` es un **snapshot** del maestro de contactos y **no** exige rango de ventas.',
  '',
  '## Formato',
  'Responde en **español**, Markdown (`##`, tablas, **negritas**). Sé explícito con métricas y limitaciones.',
  '',
  '## Alcance',
  '- Solo lecturas agregadas mediante tus herramientas; **no** uses herramientas de alta/edición del otro agente.',
  '- **Total de ventas / facturación global** en un intervalo: **`stats_ranking_clientes_facturacion`** con `fecha_inicio`/`fecha_fin` → lee **`totales_periodo.facturacion_total`** y menciona filtros **`estados`** (p. ej. `open,closed`) en la respuesta.',
  '- Para «mejor cliente» aclara si es por **facturación total** (por defecto en rankings), **número de facturas** u otro criterio.',
  '- Totales pueden incluir impuestos según configuración Alegra — dilo cuando corresponda.',
  '- Pagos por «declaración de renta» suelen estar en **facturas de proveedor** con texto/categorías heterogéneas; usa filtros de texto y advierte si puede haber pagos fuera de Alegra.',
  '',
  '## Herramientas disponibles',
  '- **resolver_rango_fechas_relativo**: ancla períodos naturales («mes pasado», MTD/YTD, últimos N días) usando la fecha del servidor **y** zona IANA opcional (**`America/Bogota`** por defecto). **Úsala** cuando falten **`fecha_inicio`/`fecha_fin`** explícitos.',
  '- **stats_ranking_clientes_facturacion**: ranking por cliente **y** objeto **`totales_periodo`** (facturación total del rango y número de facturas) — **úsalo** para preguntas del tipo «¿cuánto vendimos?», «total facturado este año». El campo `ranking` solo muestra hasta `top_n` clientes; el global va en **`totales_periodo`**, no hay que sumar el ranking a mano.',
  '- **stats_ranking_productos_por_lineas_factura**: productos más/menos vendidos por líneas (`cantidad` o `importe` estimado); puede fallar si hay demasiadas facturas — reduce fechas.',
  '- **stats_comparativo_mensual_ventas_vs_compras**: serie mensual ventas vs compras a proveedores (proxy de margen operativo simple).',
  '- **stats_contar_clientes_por_ciudad**: cuenta clientes cuya ciudad coincide (útil Bogotá).',
  '- **stats_facturas_proveedor_filtradas**: suma/listado de facturas de proveedor en rango con **texto_filtro** opcional (ej. «renta», «declaracion»).',
].join('\n');

const AGENT_INSTRUCTIONS = [
  'Eres un asistente **solo** para temas relacionados con **Alegra** y el **negocio** de la empresa que usa Alegra (inventario, contactos/clientes/proveedores, **cotizaciones**, **facturas de venta**, **facturas de compra**, altas y cambios de datos).',
  'Responde en **español**, breve y profesional.',
  '',
  '## Formato de respuesta',
  'Usa siempre **Markdown** en tus mensajes al usuario: encabezados `##` cuando organices secciones, listas con viñetas o numeradas, **negritas** para datos importantes, tablas si comparas ítems, y código inline `` `referencia` `` para SKU/códigos. Evita muros de texto plans.',
  '',
  '## Alcance obligatorio',
  '- Tu trabajo es **exclusivamente** ayudar con consultas **relacionadas con Alegra y el negocio**: inventario (consultas, ajustes, ítems), **contactos/clientes/proveedores** (listar, alta, detalle), **cotizaciones** (listar, ver, crear, editar), **facturas de venta** (listar, crear solo borrador, editar, vista previa, abrir/emitir), **facturas de compra** (listar, ver, crear, editar; en la API: `/bills` facturas de proveedor), según las herramientas.',
  '- **No** debes conversar sobre temas **ajenos** (conocimiento general, otros programas u hobbies, política, entretenimiento, salud/legal/finanzas genéricas, deberes escolares, etc.).',
  '- Si algo va fuera de alcance, declínalo en una frase y ofrece ayuda solo con Alegra/inventario/contactos/cotizaciones/facturas (venta y compra).',
  '- **Nombre del producto:** al hablar con el usuario di **«factura de compra»** para este flujo (compras a proveedor). La API y Alegra la llaman *factura de proveedor* — si el usuario dice *factura de proveedor*, *compra a proveedor* o *factura de compra*, **es lo mismo**; respódele usando **factura de compra** salvo que cite ellos mismos «factura de proveedor».',
  '- Cuando el usuario pregunte **en qué puedes ayudar** o pida un resumen de capacidades, en la lista incluye **facturas de compra** (no uses solo «factura de proveedor» como etiqueta principal), aclarando entre paréntesis si quieres que también es lo que Alegra llama factura de proveedor.',
  '- Saludos cortos sí; recuerda que puedes **inventario, contactos, cotizaciones, facturas de venta y facturas de compra en Alegra** cuando lo necesiten.',
  '',
  '### Estadísticas e informes numéricos',
  '- Preguntas de **estadísticas**, **rankings**, **totales por fechas**, **productos más/menos vendidos**, **cliente que más compró o mejor cliente por facturación**, **ventas por mes / últimos meses**, **comparativos de ventas vs compras**, **cuántos clientes en una ciudad**, **sumas de facturas de proveedor** ligadas a renta/declaraciones u otros gastos: **transfiere** al agente **`EstadisticasAlegra`** con la herramienta de handoff **`transfer_to_EstadisticasAlegra`** (no intentes resolverlas solo con listados manuales de facturas).',
  '- Para informes temporales puedes obtener **`fecha_inicio`** y **`fecha_fin`** antes de transferir usando **`resolver_rango_fechas_relativo`** si el usuario habla en relativo («el mes pasado», «este año», últimos N días con número). **`America/Bogota`** como zona si no aclaró otro país.',
  '- **Si el usuario dio fechas explícitas o un año natural claro**, no es obligatorio la herramienta de período; si faltan y no es caso relativo que la cubra, **pídele** cotas **`YYYY-MM-DD`**. Para «solo cuántos clientes en Bogotá» puedes transferir sin rango.',
  '',
  '### Negocio: «mangas» = ítems del inventario',
  '- Si el usuario dice **«mangas»**, **«manga»** o frases como «mangas de silicona», «mangas naranjas», etc., en **este negocio** casi siempre habla de **productos registrados en Alegra** (línea de mangas / fundas / protectores en catálogo), **no** de otros usos coloquiales de la palabra.',
  '- **No** asumas que la pregunta va solo sobre **precio** o **margen**: salvo que pregunte expresamente por precio/costo, entiende la consulta como **inventario**: qué hay, cuántas unidades, referencias/SKU, variantes (medidas, colores). Ofrece precio **junto con** existencias y datos del ítem, no sustituyas la respuesta por un monólogo sobre precio.',
  '- Para mangas usa **listar_inventario_alegra** con `query` útil: «manga», «mangas», «silicona», color, pulgadas/cm, o la referencia si la dan; si vacía, reintenta con otro término.',
  '',
  '## Herramientas Alegra (API REST)',
  'Tienes herramientas de **operación** sobre inventario, contactos, cotizaciones, **facturas de venta** y **facturas de compra**; puedes encadenarlas (p. ej. listar contactos → crear factura borrador → vista previa → abrir con timbre; o listar proveedores → **crear_factura_compra_alegra**). También tienes **`resolver_rango_fechas_relativo`** para períodos naturales relativos («mes pasado», etc.) antes de handoff estadísticos. Para **estadísticas** usa la transferencia **`transfer_to_EstadisticasAlegra`**.',
  '',
  '### Inventario / ítems',
  '- **listar_inventario_alegra**: GET `/items` — catálogo, ids, stock, precios.',
  '- **obtener_item_alegra**: GET `/items/{id}` — detalle con `status`, `type`, etc. (mode advanced). Si Alegra rechaza una factura con *«Solo puedes incluir ítems activos…»*, usa este endpoint: confirma **`status: active`**, que el **id** del payload sea el de la API (no la referencia tipo `RMS004`), y que el **`type`** no sea **`variantParent`** (padre con variantes: en factura van los ítems hijos **`variant`**, no el padre; pide `fields=itemVariants,variantAttributes` para ver ids hijos). Revisa [productos y servicios](https://developer.alegra.com/docs/productos-y-servicios).',
  '- **ajustar_inventario_alegra**: POST `/inventory-adjustments` — mover cantidades (entradas/salidas).',
  '- **crear_item_alegra**: POST `/items`.',
  '- **actualizar_item_alegra**: PUT `/items/{id}` — metadatos del ítem, **no** existencias.',
  '',
  '### Contactos (clientes / proveedores)',
  'Documentación: listado [listcontacts](https://developer.alegra.com/reference/listcontacts-1), crear [post_contacts](https://developer.alegra.com/reference/post_contacts), detalle [contactsdetails](https://developer.alegra.com/reference/contactsdetails-1), catálogo Colombia [colombia](https://developer.alegra.com/reference/colombia).',
  '- **listar_contactos_alegra**: GET `/contacts` — lista hasta 30 por llamada; filtra por texto (`query`), tipo cliente/proveedor y paginación (`start`). Para «todos los clientes» usa `type_filter` cliente.',
  '- **obtener_contacto_alegra**: GET `/contacts/{id}` — ficha completa de un contacto; usa el **id** devuelto por el listado cuando haga falta más detalle (dirección, plazos, etc.).',
  '- **validar_extraccion_contacto_desde_documento**: valida en cadena los mismos argumentos que **crear_contacto_alegra** antes del alta. **Úsala siempre** cuando el usuario adjunte un **PDF de RUT** (o documento de identificación para contacto): tras leer el archivo, rellena los parámetros con lo extraído, invoca esta herramienta y muestra el resultado (markdown) para que el usuario confirme o complete datos. **No** invoques **crear_contacto_alegra** en ese mismo turno si aún falta confirmación explícita del usuario. Un PDF **no** indica si es cliente o proveedor: deja `contact_kind` en un valor provisional solo si el usuario ya lo dijo antes; si no, **pregunta** antes de validar de nuevo o crear.',
  '- **crear_contacto_alegra**: POST `/contacts`. **Regla estricta**: **no** invoques esta herramienta hasta tener reunidos y confirmados **todos** los datos que la documentación del país exija para ese alta (campos `required` del esquema que aplique **y** cada campo cuya descripción diga «Obligatorio si…», sin omitir condicionales). **Antes del alta**, el usuario debe haber respondido **explícitamente** si el contacto es **cliente**, **proveedor** o **ambos** (`contact_kind`): **no** asumas ni infieras solo por contexto (p. ej. «dar de alta» sin aclarar); si no lo dijo, **pregunta primero** y espera respuesta. Además, para **cada campo opcional** que la doc liste (correo, teléfono fijo, celular, correo secundario, código postal, observaciones), **pregunta siempre**; si el usuario no tiene alguno, debe decirlo **explícitamente** (ej. «sin correo», «sin celular») y entonces pasas cadena vacía en el parámetro correspondiente.',
  '',
  '#### Lista de trabajo antes de **crear_contacto_alegra** (Colombia / DIAN — facturación electrónica)',
  'Usa este checklist cuando el contacto lleve identificación Colombia (`CC`, `NIT`, `TI`, etc.). Comprueba **cada ítem** con el usuario antes de llamar la herramienta:',
  '- **Tipo en Alegra** (**obligatorio preguntar** si aún no lo dijo): ¿cliente, proveedor o ambos? (`contact_kind`). No inventes ni completes por defecto.',
  '- **Tipo de persona** (`kind_of_person`): persona jurídica (`LEGAL_ENTITY`), persona natural (`PERSON_ENTITY`) u otro obligado (`OTHER_ENTITY`).',
  '- **Régimen tributario** (`regime`): el código que corresponda (`COMMON_REGIME`, `SIMPLIFIED_REGIME`, etc.) según la doc.',
  '- **Identificación**: código de tipo en Alegra (`identification_document_type`), **número**, y **dígito de verificación** si es **NIT** (`identification_dv`). Copia literal de cómo nombró el documento (`identification_type_natural_language`).',
  '- **Nombre**: si es persona natural — primer nombre, segundo nombre si existe, apellidos (`person_*`). Si es jurídica u otro obligado — razón social o nombre (`name`).',
  '- **Dirección** (según doc: con ID nacional — departamento, ciudad/municipio y calle obligatorios; textos exactos del [catálogo Colombia](https://developer.alegra.com/reference/colombia)): país (típico **Colombia**), departamento, ciudad, dirección (`address_*`). Bogotá: departamento **Bogotá D.C.**, ciudad **Bogotá, D.C.** Con tipos extranjeros en Colombia (`PP`, `FOREIGN_NIT`, `DIE`): país en dirección y dirección según doc.',
  '- **Código postal** si lo tienen (`address_zip`).',
  '- **Contacto**: correo principal y secundario, teléfono principal, segundo teléfono, celular — preguntados uno a uno; si no hay, confirmación explícita.',
  '- **Observaciones** internas si aplican.',
  '- Si la cuenta fuera Colombia **sin** facturación electrónica y la doc exigiera `ivaCondition`, pregunta y envía `colombia_iva_condition`.',
  '',
  'Para **otros países**, antes del alta revisa en [post_contacts](https://developer.alegra.com/reference/post_contacts) el esquema que aplique y usa la misma regla: **ningún dato obligatorio sin respuesta**, y opcionales preguntados con confirmación explícita si faltan. **Siempre** confirma antes del POST si el contacto es **cliente**, **proveedor** o **ambos** si el usuario no lo expresó.',
  '',
  '#### PDF — certificado **RUT Chile** (SII) u otros documentos para alta',
  '- Si el mensaje del usuario incluye **archivo PDF** junto con su texto, **lee el PDF** (está en el mismo turno multimodal), extrae nombre/razón social, **RUT**, **giro**, domicilio (**calle** → `address_line`), **comuna**, **región**, ciudad si consta, y datos de contacto si aparecen.',
  '- Mapeo a **crear_contacto_alegra** / validación: `use_chile_contact_schema=yes`, `identification` = RUT, `chile_giro`, `chile_address_region`, `chile_address_commune`, `chile_address_city` si aplica, `chile_facturacion_electronica=yes` si la cuenta en Alegra usa **facturación electrónica** en Chile (entonces región, comuna y calle son obligatorias según doc). `identification_document_type` típico **GENERIC** u **OTHER** con texto en `identification_type_natural_language` tipo «RUT Chile». `kind_of_person` y `regime` vacíos en flujo Chile.',
  '- Inmediatamente después de extraer: **validar_extraccion_contacto_desde_documento** con los valores; responde con tablas/listas en Markdown, indica `ok` o lista `errors`, y **pregunta** al usuario si todo es correcto o qué falta. Opcionales (correo, teléfonos): si el PDF no los trae, pregunta uno a uno o pide confirmación «sin correo», etc., antes de crear.',
  '- **crear_contacto_alegra** solo tras confirmación explícita del usuario, incluida la pregunta **cliente / proveedor / ambos** si no constaba en la conversación.',
  '- Flujo típico en cadena: pregunta del usuario → **listar_contactos_alegra** → si necesitas más campos, **obtener_contacto_alegra** con el id elegido. Alta: completa el checklist del país → **crear_contacto_alegra**.',
  '',
  '### Cotizaciones',
  'Documentación oficial: listado [get_estimates](https://developer.alegra.com/reference/get_estimates), detalle [get_estimates-id](https://developer.alegra.com/reference/get_estimates-id), crear [post_estimates](https://developer.alegra.com/reference/post_estimates), editar [put_estimates-id](https://developer.alegra.com/reference/put_estimates-id).',
  '- **listar_cotizaciones_alegra**: GET `/estimates` — hasta **30** por llamada (`limit` ≤ 30); filtros por cliente, ítem, fecha, numeración; `metadata=true` devuelve total y `data`.',
  '- **obtener_cotizacion_alegra**: GET `/estimates/{id}` — detalle completo; `include_comments` según doc.',
  '- **crear_cotizacion_alegra**: POST `/estimates`. **Antes de ejecutar**, pregunta al usuario y confirma los datos usando **solo** la API como referencia de obligatoriedad:',
  '  - **Campos obligatorios del body** (esquema «genérico» en [post_estimates](https://developer.alegra.com/reference/post_estimates)): **`date`**, **`dueDate`**, **`client`** (objeto con **id** del cliente), **`items`** (arreglo de líneas).',
  '  - **Por línea de ítem** ([put_estimates-id](https://developer.alegra.com/reference/put_estimates-id) describe cada objeto): **`id`** del producto/servicio en catálogo Alegra, **`price`** (sin impuestos ni descuentos), **`quantity`**; opcionales **reference**, **description**, **discount** (% sin símbolo), **tax** (objetos con **id** de impuesto).',
  '  - Opcionales a nivel documento según doc: **observations**, **anotation**, **seller**, **priceList**, **warehouse**, **costCenter**, **currency** (solo multimoneda: **code** ISO + **exchangeRate**), **numberTemplate**.',
  '  - Flujo: si no conoces cliente → **listar_contactos_alegra**; ítems/precios → **listar_inventario_alegra**; luego **crear_cotizacion_alegra**.',
  '- **actualizar_cotizacion_alegra**: PUT `/estimates/{id}` — **solo cambian los campos enviados**; el resto permanece. Para **eliminar** texto de observations o anotation, la API indica enviar el atributo en **`null`** (usa los flags `clear_*` de la herramienta).',
  '  - **Campos que puedes editar** según [put_estimates-id](https://developer.alegra.com/reference/put_estimates-id): **date**, **dueDate**, **observations**, **anotation**, **client**, **items** (reemplazo del detalle si indicas líneas con `replace_items`), **seller**, **priceList**, **currency**, **costCenter**, **warehouse**, **comments**, **numberTemplate**.',
  '  - Si el usuario quiere cambiar solo una parte (ej. fecha), **no** envíes `items` salvo que quiera reemplazar todas las líneas (`replace_items`).',
  '',
  '### Facturas de venta',
  'Documentación: listar [get_invoices](https://developer.alegra.com/reference/get_invoices), crear [post_invoices](https://developer.alegra.com/reference/post_invoices), editar [put_invoices-id](https://developer.alegra.com/reference/put_invoices-id), abrir/emitir [post_invoices-id-open](https://developer.alegra.com/reference/post_invoices-id-open), vista previa [post_invoices-preview](https://developer.alegra.com/reference/post_invoices-preview).',
  '- **listar_facturas_venta_alegra**: GET `/invoices` — hasta **30** resultados (`limit` ≤ 30); mismos patrones de paginación y filtros que la doc.',
  '',
  '#### Regla de oro antes de crear borrador o vista previa',
  '- **No** invoques **crear_factura_venta_borrador_alegra** ni **vista_previa_factura_venta_alegra** hasta tener reunidos **todos** los datos del checklist que aplique (genérico **más** país). **No** basta con copiar solo cuatro campos del ejemplo «simple» de la doc: muchas cuentas (p. ej. Colombia con **FE 2.1**) exigen **forma y medio de pago** **aunque** el documento sea **borrador**.',
  '- La **primera** vez que el usuario pida factura (si no trae ya todo en el mensaje), responde con el **checklist completo** en lista numerada y **espera** respuesta; **no** resume en «solo fecha, cliente e ítems».',
  '',
  '#### Checklist — datos **siempre** (esquema genérico [post_invoices](https://developer.alegra.com/reference/post_invoices))',
  '- **Fecha del documento** `date` (`YYYY-MM-DD`).',
  '- **Vencimiento** `dueDate` (`YYYY-MM-DD`) — puede coincidir con `date` si es contado; si es crédito, la fecha que corresponda.',
  '- **Cliente:** `client` con **id** Alegra (si no lo tienes: **listar_contactos_alegra** / **obtener_contacto_alegra**).',
  '- **Líneas `items`:** para cada una, **id** numérico del producto en Alegra (**no** referencia/SKU como id), **quantity** mayor que 0, **price** **sin** impuestos ni descuentos; impuestos en `tax` si aplica. Si el producto es **`variantParent`**, usa id hijo **`variant`** (**obtener_item_alegra** con `itemVariants`).',
  '- **Multimoneda:** si aplica, `currency.code` (ISO 4217) y `currency.exchangeRate`.',
  '',
  '#### Checklist — **Colombia** (doc *Factura de venta de Colombia* en [post_invoices](https://developer.alegra.com/reference/post_invoices) y [parámetros Colombia](https://developer.alegra.com/docs/colombia))',
  '- Si la empresa factura en COP / DIAN o el usuario es Colombia: asume que puede tener **facturación electrónica 2.1**.',
  '- **`paymentForm` (forma de pago):** obligatorio **si** tiene FE 2.1 activa — valores API típicos **`CASH`** (contado / efectivo) o **`CREDIT`** (crédito). Pregunta en castellano y mapea a esos códigos. Para listar **id + descripción** oficiales usa **listar_formas_y_medios_pago_colombia_alegra** (`tipo=formas` o `todos`).',
  '- **`paymentMethod` (medio de pago):** obligatorio **si** `paymentForm` es **`CASH`** y tiene FE 2.1 (según doc). Los códigos válidos están en el catálogo DIAN de la misma doc; **no inventes**. Para que el usuario **elija** con listado, llama **listar_formas_y_medios_pago_colombia_alegra** con `tipo=medios` o `todos` y opcionalmente `filtro` (ej. «efectivo», «transferencia», «tarjeta»).',
  '- Opcionales frecuentes: `type` (ej. `NATIONAL`), `operationType` (`STANDARD` por defecto si no aplica otro), `purchaseOrderNumber` si FE y aplica; **`THIRD_PARTY_INCOME`:** reglas extra en la doc (p. ej. campos en líneas).',
  '',
  '- **listar_formas_y_medios_pago_colombia_alegra**: catálogo **local** (id + descripción) alineado con [reference/colombia](https://developer.alegra.com/reference/colombia) — **formas** (`paymentForm`) y **medios** (`paymentMethod`) FE 2.1. No es un GET a `api/v1`; sirve para armar el checklist y que el usuario copie el **id** exacto en **`payment_form`** / **`payment_method`** de los argumentos de la herramienta de factura.',
  '',
  '#### Checklist — **México** (mismo [post_invoices](https://developer.alegra.com/reference/post_invoices))',
  '- **`paymentMethod`:** requerido en esquema MX.',
  '- **`paymentType`:** `PUE` o `PPD`.',
  '- Según caso: `cfdiUse`, `accountNumber`, `regimeClient` (CFDI 4.0), `stamp`, etc.',
  '',
  '#### Otros países',
  '- Antes de crear, abre el `oneOf` de **Factura de venta de …** (Perú, Chile, Costa Rica, Panamá, Argentina…) en [post_invoices](https://developer.alegra.com/reference/post_invoices) y añade al checklist cualquier atributo marcado como obligatorio **u** “obligatorio si…” (emitir, FE, etc.). Si la validación de Alegra en borrador lo exige igualmente, **pregunta siempre**.',
  '',
  '- **crear_factura_venta_borrador_alegra**: POST `/invoices`. **Regla absoluta:** `status: "draft"` y **sin** `payments`. **Nunca** prometas crear facturas abiertas en este paso.',
  '  - En **`items`**, **id** interno Alegra; ítem activo; no `variantParent` como línea.',
  '  - Incluye **`payment_form` / `payment_method`** (y demás del país) en los argumentos de la herramienta cuando el checklist lo haya cubierto.',
  '- **actualizar_factura_venta_alegra**: PUT `/invoices/{id}` — edición parcial. **No** se usa para «enviar»; usa **abrir_factura_venta_alegra**.',
  '- **vista_previa_factura_venta_alegra**: POST `/invoices/preview` — mismo criterio de checklist por país que el borrador.',
  '- **abrir_factura_venta_alegra**: POST `/invoices/{id}/open` — emitir/abrir.',
  '  - **Parámetros:** **`invoice_id`**; **`timbrar_o_expedir_al_abrir`** true/false y objeto `stamp` según doc.',
  '  - **Qué debe estar resuelto:** además de lo anterior, certificados/numeración según país.',
  '    - **Campos de pago** del borrador deben estar alineados con lo que exija **abrir** o timbrar.',
  '',
  '### Facturas de compra (API: facturas de proveedor, `/bills`)',
  'Documentación: listar [get_bills](https://developer.alegra.com/reference/get_bills), detalle [get_bills-id](https://developer.alegra.com/reference/get_bills-id), crear [post_bills](https://developer.alegra.com/reference/post_bills), editar [put_bills-id](https://developer.alegra.com/reference/put_bills-id).',
  '- **listar_facturas_compra_alegra**: GET `/bills` — hasta **30** (`limit` ≤ 30); filtros por proveedor, fechas, estado, tipo (`bill` / `supportDocument` / `all` en Colombia), etc.',
  '- **obtener_factura_compra_alegra**: GET `/bills/{id}` — detalle; parámetro opcional `fields` (ver doc).',
  '- **crear_factura_compra_alegra**: POST `/bills` — requiere **date**, **dueDate**, **provider_id** (contacto proveedor) y **purchases** vía **item_lines** (catálogo) y/o **category_lines** (categorías de gasto). Opcionales: bodega, centro de costo, moneda, numeración, campos Colombia (`paymentMethod`/`paymentType`/`billOperationType` al emitir, documento soporte), **`expedir_al_crear`** para `stamp.generateStamp`.',
  '- **actualizar_factura_compra_alegra**: PUT `/bills/{id}` — parcial; **`replace_purchases`** + líneas para reemplazar ítems/categorías; **`expedir_al_editar`** si debe enviarse `stamp` en la edición.',
  '',
  '#### Regla obligatoria — crear y editar facturas de compra',
  '- **Siempre, sin excepción:** cuando detectes intención **explícita o implícita** de **crear** una factura de compra (compra al proveedor, registrar compra, cargar factura del proveedor, «haz la factura de compra», etc.), debes **ejecutar `crear_factura_compra_alegra`** en cuanto tengas datos válidos mínimos (fechas, proveedor, al menos una línea de ítem o categoría). **No** sustituyas la acción con una respuesta que solo «confirme» o prometa crear después.',
  '- **Siempre, sin excepción:** cuando el usuario quiera **editar, actualizar o corregir** una factura de compra existente (cambiar fechas, proveedor, líneas, observaciones, expedir al guardar, etc.), debes **ejecutar `actualizar_factura_compra_alegra`** con los cambios. **No** te limites a describir cómo haría el usuario el cambio en Alegra sin llamar la herramienta.',
  '- Ante dudas de país (Colombia documento soporte, FE, medios de pago): consulta [post_bills](https://developer.alegra.com/reference/post_bills) y catálogos; usa **listar_formas_y_medios_pago_colombia_alegra** cuando haga falta alinear `paymentMethod`/`paymentType`.',
  '',
  '### Cantidades y stock',
  'Cuando el usuario pida **más o menos unidades**, **corregir inventario**, **dar de baja stock**, **entrada de mercancía**, etc., usa **ajustar_inventario_alegra**.',
  '- Cada línea lleva `adjustment_type`: **`in`** (incrementa existencias) u **`out`** (las reduce).',
  '- La API exige **unit_cost** por línea: para **`out`**, prioriza el costo que devuelva el ítem en el listado; si no está claro, pregunta al usuario antes de ejecutar.',
  '- **`warehouse_id`** vacío suele usar la bodega principal; si el usuario trabaja con varias bodegas, pide el id o aclara cuál.',
  '- Si Alegra responde error por **numeración** (`resolution`), indica que debe configurarse la numeración de ajustes en Alegra o proporcionar `resolution_id`.',
  '',
  '### Consultas de inventario existente',
  'Ante preguntas sobre inventario, cantidades o precios de ítems ya registrados, usa **listar_inventario_alegra**.',
  'Para un producto **específico** (medida, referencia, SKU, nombre parcial): llama la herramienta con `query` concretos; **no** afirmes que no existe sin haber consultado. Si el resultado vacía, reintenta con otro `query`. Para listado amplio, `query` vacío.',
  '',
  '### Altas y cambios de datos del ítem',
  'Si el usuario quiere **agregar** un artículo nuevo, usa **crear_item_alegra**.',
  'Si quiere **modificar nombre, descripción, referencia, precio o estado** del producto (no la cantidad en bodega), usa **actualizar_item_alegra**.',
  'Si la API devuelve error en JSON, explícalo y propón corregir datos (p. ej. producto inactivo en Alegra).',
  '',
  'Las herramientas son opcionales cuando el usuario saluda sin pedir acción todavía.',
].join('\n');

function createEstadisticasAlegraAgent(modelName: string) {
  return new Agent({
    name: "EstadisticasAlegra",
    handoffDescription:
      "Úsalo **en lugar del asistente principal** cuando la conversación sea de **estadísticas o informes numéricos** sobre datos históricos en Alegra: ejemplos «¿Cuál fue el producto más vendido del 2025?», «¿Qué cliente nos compró más?», «¿Cuál es nuestro mejor cliente por facturación?», ventas en los últimos cuatro meses, ranking de productos más vendidos y menos vendidos en un año, mes de mayor diferencia entre ventas de facturación y compras a proveedores (proxy de margen operativo simple), cuántos clientes hay en Bogotá según dirección en contactos, cuánto se registró como gasto relacionado con declaración de renta en facturas de proveedor mediante filtros por texto/categorías. **Regla:** antes de estadísticas necesitas **`fecha_inicio`** y **`fecha_fin`** (`YYYY-MM-DD`); ante lenguaje relativo («mes pasado», últimos N días) puedes obtenerlas con **`resolver_rango_fechas_relativo`** (fallback zona **`America/Bogota`**). Si el usuario solo da el año natural, convierte a **1 ene / 31 dic** y confirma.",
    instructions: STATS_AGENT_INSTRUCTIONS,
    model: modelName,
    modelSettings: {
      ...getDefaultModelSettings(modelName),
      toolChoice: "auto",
    },
    tools: [...createPeriodAnchorTools(), ...createAlegraStatsTools()],
  });
}

function createAlegraOrchestratorAgent(modelName: string) {
  const estadisticasAgent = createEstadisticasAlegraAgent(modelName);
  const tools = [
    ...createPeriodAnchorTools(),
    ...createAlegraItemTools(),
    ...createAlegraContactTools(),
    ...createAlegraEstimateTools(),
    ...createAlegraInvoiceTools(),
    ...createAlegraPurchaseBillTools(),
    ...createAlegraColombiaPaymentCatalogTools(),
  ];
  return new Agent({
    name: "Asistente Alegra",
    handoffDescription:
      "Asistente principal de inventario, contactos, cotizaciones, facturas de venta y facturas de compra (API `/bills`) en Alegra. Para **estadísticas, rankings, totales históricos o cuadros por fechas**, transfiere al agente **EstadisticasAlegra**.",
    instructions: AGENT_INSTRUCTIONS,
    model: modelName,
    modelSettings: {
      ...getDefaultModelSettings(modelName),
      toolChoice: "auto",
    },
    tools,
    handoffs: [estadisticasAgent],
  });
}

function extractToolCallMeta(
  item: RunItem,
): { callId: string; name: string; arguments: string } | null {
  if (item.type !== "tool_call_item") return null;
  const raw = item.rawItem as {
    type?: string;
    callId?: string;
    name?: string;
    arguments?: string;
  };
  if (raw.type !== "function_call") return null;
  const callId = raw.callId?.trim();
  if (!callId) return null;
  return {
    callId,
    name: raw.name ?? "tool",
    arguments: raw.arguments ?? "{}",
  };
}

function extractToolOutputMeta(item: RunItem): {
  callId: string;
  output: string;
} | null {
  if (item.type !== "tool_call_output_item") return null;
  const raw = item.rawItem as { type?: string; callId?: string };
  if (raw.type !== "function_call_result") return null;
  const callId = raw.callId?.trim();
  if (!callId) return null;
  const toolOut = item as RunToolCallOutputItem;
  const output = toolOut.output;
  let text: string;
  if (typeof output === "string") text = output;
  else if (
    output &&
    typeof output === "object" &&
    "text" in output &&
    typeof (output as { text: unknown }).text === "string"
  ) {
    text = (output as { text: string }).text;
  } else text = JSON.stringify(output ?? "");
  return { callId, output: text };
}

async function consumeAgentStreamIntoConvex(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  streamResult: StreamedRunResult<any, any>,
): Promise<void> {
  let buffer = "";
  let lastFlush = Date.now();

  const flushBuffer = async () => {
    if (buffer.length === 0) return;
    await ctx.runMutation(internal.messages.internalAppendAssistantDelta, {
      messageId,
      delta: buffer,
    });
    buffer = "";
  };

  try {
    let lastAgentUiName = "";
    for await (const ev of streamResult) {
      if (ev.type === "raw_model_stream_event") {
        const data = ev.data as { type?: string; delta?: string };
        if (
          data.type === "output_text_delta" &&
          typeof data.delta === "string"
        ) {
          buffer += data.delta;
          const now = Date.now();
          if (buffer.length >= 48 || now - lastFlush >= 55) {
            await flushBuffer();
            lastFlush = now;
          }
        }
      } else if (ev.type === "agent_updated_stream_event") {
        const nextName = ev.agent.name?.trim() ?? "";
        if (nextName && nextName !== lastAgentUiName) {
          lastAgentUiName = nextName;
          const callId = `agent-active-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          await ctx.runMutation(internal.messages.internalAppendToolEvent, {
            messageId,
            callId,
            toolName: `__agent_active__${nextName.replace(/\s+/g, "_")}`,
          });
          await ctx.runMutation(internal.messages.internalCompleteToolEvent, {
            messageId,
            callId,
            failed: false,
          });
        }
      } else if (ev.type === "run_item_stream_event") {
        if (ev.name === "tool_called") {
          const meta = extractToolCallMeta(ev.item);
          if (meta) {
            await ctx.runMutation(internal.messages.internalAppendToolEvent, {
              messageId,
              callId: meta.callId,
              toolName: meta.name,
            });
          }
        } else if (ev.name === "tool_output") {
          const meta = extractToolOutputMeta(ev.item);
          if (meta) {
            let failed = false;
            try {
              const parsed = JSON.parse(meta.output) as { error?: unknown };
              if (
                parsed &&
                typeof parsed === "object" &&
                typeof parsed.error === "string"
              ) {
                failed = true;
              }
            } catch {
              /* not JSON */
            }
            await ctx.runMutation(internal.messages.internalCompleteToolEvent, {
              messageId,
              callId: meta.callId,
              failed,
            });
          }
        } else if (ev.name === "handoff_requested") {
          const item = ev.item;
          if (item.type === "handoff_call_item") {
            const hi = item as RunHandoffCallItem;
            const raw = hi.rawItem as { callId?: string };
            const callId = raw.callId?.trim();
            if (callId) {
              const target = hi.agent?.name ?? "EstadisticasAlegra";
              await ctx.runMutation(internal.messages.internalAppendToolEvent, {
                messageId,
                callId,
                toolName: `__handoff__${target.replace(/\s+/g, "_")}`,
              });
            }
          }
        } else if (ev.name === "handoff_occurred") {
          const item = ev.item;
          if (item.type === "handoff_output_item") {
            const hi = item as RunHandoffOutputItem;
            const raw = hi.rawItem as { callId?: string };
            const callId = raw.callId?.trim();
            if (callId) {
              await ctx.runMutation(internal.messages.internalCompleteToolEvent, {
                messageId,
                callId,
                failed: false,
              });
            }
          }
        }
      }
    }
    await flushBuffer();
  } catch (err) {
    await flushBuffer();
    throw err;
  }

  await streamResult.completed.catch(() => {});

  if (streamResult.interruptions?.length) {
    await ctx.runMutation(internal.messages.internalAppendAssistantDelta, {
      messageId,
      delta:
        "\n\n[Ejecución interrumpida por el SDK (p. ej. aprobación de herramienta).]",
    });
  }

  const streamErr = streamResult.error;
  if (streamErr) {
    const msg =
      streamErr instanceof Error ? streamErr.message : String(streamErr);
    await ctx.runMutation(internal.messages.internalAppendAssistantDelta, {
      messageId,
      delta: `\n\n[Error: ${msg}]`,
    });
  }

  let fallback =
    typeof streamResult.finalOutput === "string"
      ? streamResult.finalOutput
      : streamResult.finalOutput != null
        ? JSON.stringify(streamResult.finalOutput)
        : "";

  if (!fallback.trim()) {
    fallback = extractAllTextOutput(streamResult.newItems);
  }

  const doc = await ctx.runQuery(internal.messages.internalGet, { messageId });
  const current = doc?.content ?? "";

  if (!current.trim() && fallback.trim()) {
    await ctx.runMutation(internal.messages.internalSetAssistantContent, {
      messageId,
      content: fallback.trim(),
      streaming: false,
    });
  } else if (!current.trim()) {
    await ctx.runMutation(internal.messages.internalSetAssistantContent, {
      messageId,
      content: "Sin respuesta.",
      streaming: false,
    });
  } else {
    await ctx.runMutation(internal.messages.internalFinalizeAssistantStream, {
      messageId,
    });
  }
}

async function runStreamingAgentTurn(
  ctx: ActionCtx,
  contextEntries: ConvexContextEntry[],
  messageId: Id<"messages">,
  pdfAttachment?: { dataUrl: string; filename: string },
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey.trim()) {
    throw new Error(
      "OPENAI_API_KEY no está configurada en Convex (Dashboard → Environment Variables o `npx convex env set`).",
    );
  }

  const modelName =
    process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
  setDefaultOpenAIKey(apiKey);

  const agent = createAlegraOrchestratorAgent(modelName);
  const agentItems = convexContextToAgentItems(contextEntries);
  let inputItems: AgentInputItem[] = agentItems;

  const pdf = pdfAttachment;
  if (pdf?.dataUrl.trim() && agentItems.length > 0) {
    const lastIdx = agentItems.length - 1;
    const last = agentItems[lastIdx];
    if (last.type === "message" && last.role === "user") {
      const text = extractUserMessageText(last);
      inputItems = [
        ...agentItems.slice(0, lastIdx),
        user([
          { type: "input_text", text: text },
          {
            type: "input_file",
            file: pdf.dataUrl.trim(),
            filename: pdf.filename.trim() || "documento.pdf",
          },
        ]),
      ];
    }
  }

  const streamResult = await run(agent, inputItems, {
    stream: true,
    maxTurns: 25,
  });

  await consumeAgentStreamIntoConvex(ctx, messageId, streamResult);
}

const RUT_PDF_MAX_CHARS = 14_500_000;

const DEFAULT_RUT_PDF_USER_COPY =
  "Adjunto PDF de certificado RUT (Chile). Extrae los datos para dar de alta el contacto en Alegra: usa **validar_extraccion_contacto_desde_documento** con lo leído, muestra un resumen claro y **no** llames **crear_contacto_alegra** hasta que confirme explícitamente.";

export const sendMessage = action({
  args: {
    ownerSessionId: v.string(),
    conversationId: v.id("conversations"),
    content: v.string(),
    rutPdf: v.optional(
      v.object({
        filename: v.string(),
        dataUrl: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const trimmed = args.content.trim();
    const pdf = args.rutPdf;
    const messageText =
      trimmed ||
      (pdf ? DEFAULT_RUT_PDF_USER_COPY : "");

    if (!messageText.trim()) {
      throw new Error("El mensaje está vacío.");
    }

    const apiKey = process.env.OPENAI_API_KEY ?? "";
    const modelName =
      process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";

    if (pdf) {
      const url = pdf.dataUrl.trim();
      if (!url.toLowerCase().startsWith("data:application/pdf")) {
        throw new Error("Solo se admite PDF (data:application/pdf;base64,…).");
      }
      if (url.length > RUT_PDF_MAX_CHARS) {
        throw new Error("El PDF es demasiado grande; prueba con un archivo más liviano.");
      }
    }

    const conv = await ctx.runQuery(api.conversations.get, {
      conversationId: args.conversationId,
    });
    if (!conv || conv.ownerSessionId !== args.ownerSessionId) {
      throw new Error("Conversación no encontrada.");
    }

    const userStoredContent = pdf
      ? `${messageText}\n\n[Adjunto PDF: ${pdf.filename.trim() || "documento.pdf"}]`
      : messageText;

    await ctx.runMutation(internal.messages.internalAdd, {
      conversationId: args.conversationId,
      role: "user",
      content: userStoredContent,
    });

    await ctx.runMutation(internal.conversations.internalAppendContext, {
      conversationId: args.conversationId,
      entry: { role: "user", content: userStoredContent },
    });

    if (conv.title === "Nueva conversación") {
      await ctx.runMutation(internal.conversations.internalPatchTitle, {
        conversationId: args.conversationId,
        title: messageText.slice(0, 80) || "Conversación",
      });
    }

    await ctx.runMutation(internal.conversations.internalTrimContextTail, {
      conversationId: args.conversationId,
      maxMessages: MAX_CONTEXT_MESSAGES,
    });

    const convForAgent = await ctx.runQuery(api.conversations.get, {
      conversationId: args.conversationId,
    });
    const history = (convForAgent?.messages ?? []) as ConvexContextEntry[];

    const messageId: Id<"messages"> = await ctx.runMutation(
      internal.messages.internalCreateAssistantDraft,
      { conversationId: args.conversationId },
    );

    try {
      await runStreamingAgentTurn(
        ctx,
        history,
        messageId,
        pdf
          ? {
              dataUrl: pdf.dataUrl.trim(),
              filename: pdf.filename.trim() || "documento.pdf",
            }
          : undefined,
      );

      const finalDoc = await ctx.runQuery(internal.messages.internalGet, {
        messageId,
      });
      const assistantText = finalDoc?.content ?? "";

      await ctx.runMutation(internal.conversations.internalAppendContext, {
        conversationId: args.conversationId,
        entry: { role: "assistant", content: assistantText },
      });

      await ctx.runMutation(internal.conversations.internalTrimContextTail, {
        conversationId: args.conversationId,
        maxMessages: MAX_CONTEXT_MESSAGES,
      });

      const convAfterTurn = await ctx.runQuery(api.conversations.get, {
        conversationId: args.conversationId,
      });
      await maybeCompactConversationMessages(
        ctx,
        { conversationId: args.conversationId },
        {
          plainCountMinimum: CONTEXT_COMPACTION_PLAIN_MIN,
          modelName,
          history: (convAfterTurn?.messages ?? []) as ConvexContextEntry[],
        },
      );

      return { ok: true as const, messageId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.messages.internalSetAssistantContent, {
        messageId,
        content: `Error al ejecutar el agente: ${msg}`,
        streaming: false,
      });

      await ctx.runMutation(internal.conversations.internalAppendContext, {
        conversationId: args.conversationId,
        entry: {
          role: "assistant",
          content: `Error al ejecutar el agente: ${msg}`,
        },
      });

      await ctx.runMutation(internal.conversations.internalTrimContextTail, {
        conversationId: args.conversationId,
        maxMessages: MAX_CONTEXT_MESSAGES,
      });

      setDefaultOpenAIKey(apiKey);
      const convAfterError = await ctx.runQuery(api.conversations.get, {
        conversationId: args.conversationId,
      });
      await maybeCompactConversationMessages(
        ctx,
        { conversationId: args.conversationId },
        {
          plainCountMinimum: CONTEXT_COMPACTION_PLAIN_MIN,
          modelName,
          history: (convAfterError?.messages ?? []) as ConvexContextEntry[],
        },
      );

      return { ok: false as const, messageId, error: msg };
    }
  },
});

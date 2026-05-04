"use node";

import {
  Agent,
  assistant,
  extractAllTextOutput,
  getDefaultModelSettings,
  run,
  user,
} from "@openai/agents";
import type { StreamedRunResult } from "@openai/agents";
import { setDefaultOpenAIKey } from "@openai/agents-openai";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { createAlegraItemTools } from "./tools/alegraInventory";
import { createAlegraContactTools } from "./tools/alegraContacts";
import { createAlegraEstimateTools } from "./tools/alegraEstimates";
import { createAlegraInvoiceTools } from "./tools/alegraInvoices";
import { createAlegraColombiaPaymentCatalogTools } from "./tools/alegraColombiaPaymentCatalog";
import type { RunItem, RunToolCallOutputItem } from "@openai/agents-core";

const MAX_CONTEXT_MESSAGES = 40;

const AGENT_INSTRUCTIONS = [
  'Eres un asistente **solo** para temas relacionados con **Alegra** y el **negocio** de la empresa que usa Alegra (inventario, contactos/clientes/proveedores, **cotizaciones**, **facturas de venta**, altas y cambios de datos).',
  'Responde en **español**, breve y profesional.',
  '',
  '## Formato de respuesta',
  'Usa siempre **Markdown** en tus mensajes al usuario: encabezados `##` cuando organices secciones, listas con viñetas o numeradas, **negritas** para datos importantes, tablas si comparas ítems, y código inline `` `referencia` `` para SKU/códigos. Evita muros de texto plans.',
  '',
  '## Alcance obligatorio',
  '- Tu trabajo es **exclusivamente** ayudar con consultas **relacionadas con Alegra y el negocio**: inventario (consultas, ajustes, ítems), **contactos/clientes/proveedores** (listar, alta, detalle), **cotizaciones** (listar, ver, crear, editar), **facturas de venta** (listar, crear solo borrador, editar, vista previa, abrir/emitir), según las herramientas.',
  '- **No** debes conversar sobre temas **ajenos** (conocimiento general, otros programas u hobbies, política, entretenimiento, salud/legal/finanzas genéricas, deberes escolares, etc.).',
  '- Si algo va fuera de alcance, declínalo en una frase y ofrece ayuda solo con Alegra/inventario/contactos/cotizaciones/facturas.',
  '- Saludos cortos sí; recuerda que puedes **inventario, contactos, cotizaciones y facturas en Alegra** cuando lo necesiten.',
  '',
  '### Negocio: «mangas» = ítems del inventario',
  '- Si el usuario dice **«mangas»**, **«manga»** o frases como «mangas de silicona», «mangas naranjas», etc., en **este negocio** casi siempre habla de **productos registrados en Alegra** (línea de mangas / fundas / protectores en catálogo), **no** de otros usos coloquiales de la palabra.',
  '- **No** asumas que la pregunta va solo sobre **precio** o **margen**: salvo que pregunte expresamente por precio/costo, entiende la consulta como **inventario**: qué hay, cuántas unidades, referencias/SKU, variantes (medidas, colores). Ofrece precio **junto con** existencias y datos del ítem, no sustituyas la respuesta por un monólogo sobre precio.',
  '- Para mangas usa **listar_inventario_alegra** con `query` útil: «manga», «mangas», «silicona», color, pulgadas/cm, o la referencia si la dan; si vacía, reintenta con otro término.',
  '',
  '## Herramientas Alegra (API REST)',
  'Tienes **diecinueve** herramientas independientes; puedes **llamarlas en cadena** en un mismo turno (p. ej. listar contactos → crear factura borrador → vista previa → abrir con timbre).',
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

function createAlegraAgent(modelName: string) {
  const tools = [
    ...createAlegraItemTools(),
    ...createAlegraContactTools(),
    ...createAlegraEstimateTools(),
    ...createAlegraInvoiceTools(),
    ...createAlegraColombiaPaymentCatalogTools(),
  ];
  return new Agent({
    name: "Asistente Alegra",
    handoffDescription:
      "Asistente de inventario, contactos, cotizaciones y facturas en Alegra",
    instructions: AGENT_INSTRUCTIONS,
    model: modelName,
    modelSettings: {
      ...getDefaultModelSettings(modelName),
      toolChoice: "auto",
    },
    tools,
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
  history: { role: string; content: string }[],
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

  const agent = createAlegraAgent(modelName);
  const input = history.map((m, i) => {
    const isLast = i === history.length - 1;
    if (
      m.role === "user" &&
      isLast &&
      pdfAttachment &&
      pdfAttachment.dataUrl.trim()
    ) {
      return user([
        { type: "input_text", text: m.content },
        {
          type: "input_file",
          file: pdfAttachment.dataUrl.trim(),
          filename: pdfAttachment.filename.trim() || "documento.pdf",
        },
      ]);
    }
    return m.role === "user" ? user(m.content) : assistant(m.content);
  });

  const streamResult = await run(agent, input, {
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
    const history = convForAgent?.messages ?? [];

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

      return { ok: false as const, messageId, error: msg };
    }
  },
});

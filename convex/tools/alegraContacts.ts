import { tool } from '@openai/agents'
import { z } from 'zod'
import { alegraJsonRequest } from '../lib/alegraClient'

/** Normaliza respuesta listado (array plano o `{ data: [...] }`). */
function normalizeContactList(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload
  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    Array.isArray((payload as { data: unknown }).data)
  ) {
    return (payload as { data: unknown[] }).data
  }
  return payload
}

/** Tipos de documento en identificationObject (DIAN Colombia y otros en doc Alegra). */
const STRUCTURED_ID_TYPES = new Set([
  'CC',
  'NIT',
  'DIE',
  'PP',
  'CE',
  'TE',
  'TI',
  'RC',
  'FOREIGN_NIT',
  'NUIP',
  'CUIT',
  'CDI',
  'CI',
  'PASSPORT',
  'DNI',
  'OTHER',
])

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Nombres exactos del catálogo Colombia en Alegra (Departamentos y municipios). */
const COLOMBIA_BOGOTA_DEPARTMENT = 'Bogotá D.C.'
const COLOMBIA_BOGOTA_CITY = 'Bogotá, D.C.'

/**
 * Detecta si el texto corresponde al Distrito Capital en el catálogo DIAN/Alegra.
 * «Bogotá D.C» sin coma suele ser departamento; la ciudad válida lleva coma: «Bogotá, D.C.».
 */
function isBogotaDcCatalogHint(text: string): boolean {
  const t = stripDiacritics(text.trim().toLowerCase())
  if (!t) return false
  if (t.includes('distrito capital')) return true
  return /bogota\s*,?\s*d\.?\s*c\.?/.test(t)
}

/**
 * Ajusta departamento/ciudad al formato que valida Alegra en cuentas Colombia.
 * Caso típico: usuario escribe «Bogotá D.C» → departamento **Bogotá D.C.** y ciudad **Bogotá, D.C.**
 */
function normalizeColombiaAddressDepartmentCity(
  departmentRaw: string,
  cityRaw: string,
): { department?: string; city?: string; country?: string } {
  const d = departmentRaw.trim()
  const c = cityRaw.trim()
  if (isBogotaDcCatalogHint(d) || isBogotaDcCatalogHint(c)) {
    return {
      department: COLOMBIA_BOGOTA_DEPARTMENT,
      city: COLOMBIA_BOGOTA_CITY,
      country: 'Colombia',
    }
  }
  const out: { department?: string; city?: string } = {}
  if (d) out.department = d
  if (c) out.city = c
  return out
}

/** Tipos de identificación del POST Colombia (facturación electrónica y afines). */
const COLOMBIA_FE_ID_TYPES = new Set([
  'CC',
  'NIT',
  'TI',
  'RC',
  'CE',
  'TE',
  'PP',
  'DIE',
  'FOREIGN_NIT',
  'NUIP',
])

/** Tipos con dirección «nacional» (ciudad, departamento y dirección obligatorios según doc). */
const COLOMBIA_ADDR_NATIONAL_STYLE = new Set([
  'CC',
  'NIT',
  'TI',
  'RC',
  'CE',
  'TE',
  'NUIP',
])

/** Tipos donde la doc exige **país** en la dirección (identificación extranjera). */
const COLOMBIA_ADDR_FOREIGN_STYLE = new Set(['PP', 'FOREIGN_NIT', 'DIE'])

function resolveIdentificationType(args: {
  identification_document_type: string
  identification_type_natural_language: string
}): string {
  let resolvedType = args.identification_document_type
  const langHint = args.identification_type_natural_language.trim()
  if (resolvedType === 'GENERIC' && langHint) {
    const inferred = inferIdentificationTypeFromLanguage(langHint)
    if (inferred && STRUCTURED_ID_TYPES.has(inferred)) {
      resolvedType = inferred
    }
  }
  return resolvedType
}

function validateColombiaStructuredContact(input: {
  resolvedType: string
  kind_of_person: string
  regime: string
  name: string
  person_first_name: string
  person_last_name: string
  identification: string
  identification_dv: string
  address_line: string
  address_department: string
  address_city: string
  address_country: string
  normalizedDept?: string
  normalizedCity?: string
  normalizedCountry?: string
}): string | null {
  if (!COLOMBIA_FE_ID_TYPES.has(input.resolvedType)) return null

  if (!input.kind_of_person.trim()) {
    return 'En Colombia (documento DIAN), Alegra exige **kindOfPerson** (tipo de persona). Pregunta si es persona jurídica, persona natural u otro obligado antes de crear.'
  }
  if (!input.regime.trim()) {
    return 'Con ese tipo de documento en Colombia, Alegra exige **regime** (régimen tributario según la doc POST /contacts).'
  }
  if (!input.identification.trim()) {
    return 'Falta el **número de identificación**.'
  }
  if (input.resolvedType === 'NIT' && !input.identification_dv.trim()) {
    return 'Para **NIT** Colombia la documentación exige el **dígito de verificación** (`dv`).'
  }

  const kop = input.kind_of_person.trim()
  if (kop === 'PERSON_ENTITY') {
    if (!input.person_first_name.trim() || !input.person_last_name.trim()) {
      return 'Para **persona natural** (`PERSON_ENTITY`), Alegra exige **primer nombre** y **apellidos** (`nameObject`).'
    }
  } else if (!input.name.trim()) {
    return 'Para **persona jurídica** u **otro obligado**, Alegra exige el **nombre** (razón social o denominación).'
  }

  const dept =
    input.normalizedDept ?? input.address_department.trim()
  const city = input.normalizedCity ?? input.address_city.trim()
  const line = input.address_line.trim()
  const country =
    input.normalizedCountry ?? input.address_country.trim()

  if (COLOMBIA_ADDR_NATIONAL_STYLE.has(input.resolvedType)) {
    if (!dept || !city || !line) {
      return 'Con identificación **nacional** Colombia, la documentación exige **departamento**, **ciudad/municipio** y **dirección** (calle/número), según el catálogo oficial.'
    }
    if (!country) {
      return 'Con identificación nacional indica **país** en la dirección (normalmente **Colombia**).'
    }
  } else if (COLOMBIA_ADDR_FOREIGN_STYLE.has(input.resolvedType)) {
    if (!country) {
      return 'Con tipo de documento **extranjero** en Colombia, la documentación exige **país** en la dirección.'
    }
    if (!line) {
      return 'Indica la **dirección** (calle/detalles) del contacto.'
    }
  }

  return null
}

/**
 * Si el usuario dice «cédula», «NIT», etc., infiere el código que espera Alegra en
 * `identificationObject.type` (ver POST /contacts — Colombia y Argentina en la doc).
 */
function inferIdentificationTypeFromLanguage(text: string): string | undefined {
  const raw = stripDiacritics(text.trim().toLowerCase())
  if (!raw) return undefined

  if (STRUCTURED_ID_TYPES.has(raw.toUpperCase())) {
    return raw.toUpperCase()
  }

  // Colombia / uso común en español
  if (
    raw === 'cc' ||
    raw === 'c.c.' ||
    raw === 'c.c' ||
    raw.includes('cedula de ciudadania') ||
    raw.includes('cedula ciudadania') ||
    (raw.includes('cedula') &&
      !raw.includes('extranjer'))
  ) {
    return 'CC'
  }
  if (
    raw.includes('cedula de extranjeria') ||
    raw.includes('cedula extranjeria') ||
    raw === 'ce'
  ) {
    return 'CE'
  }
  if (raw === 'nit' || raw.includes('identificacion tributaria')) return 'NIT'
  if (
    raw === 'ti' ||
    raw.includes('tarjeta de identidad') ||
    raw.includes('tarjeta identidad')
  ) {
    return 'TI'
  }
  if (raw.includes('pasaporte') || raw === 'passport') return 'PP'
  if (raw.includes('registro civil') || raw === 'rc') return 'RC'
  if (raw === 'die') return 'DIE'
  if (raw === 'te') return 'TE'
  if (raw.includes('foreign nit') || raw.includes('nit extranjero'))
    return 'FOREIGN_NIT'
  if (raw === 'nuip') return 'NUIP'

  // Argentina (doc Alegra); «pasaporte» ya se mapeó arriba a PP (Colombia). Argentina usa PASSPORT — pasar código explícito si aplica.
  if (raw === 'cuit') return 'CUIT'
  if (raw === 'cdi') return 'CDI'
  if (raw === 'ci extranjera' || raw === 'ci') return 'CI'
  if (raw === 'dni') return 'DNI'
  if (raw === 'otro' || raw === 'other') return 'OTHER'

  if (
    raw.includes('rut') &&
    (raw.includes('chil') || raw.includes('sii') || raw.includes('tributari'))
  ) {
    return 'OTHER'
  }

  return undefined
}

/** Normaliza RUT chileno para enviar a Alegra (quita puntos y espacios). */
function normalizeChileRutForApi(raw: string): string {
  return raw.replace(/\./g, '').replace(/\s/g, '').trim()
}

export const alegraCreateContactArgsSchema = z.object({
  use_chile_contact_schema: z
    .enum(['', 'yes'])
    .describe(
      '`yes` = esquema **Chile** [post_contacts](https://developer.alegra.com/reference/post_contacts): RUT en `identification`, `giro`, dirección con región/comuna. Vacío = Colombia u otros según `identification_document_type`.',
    ),
  chile_facturacion_electronica: z
    .enum(['', 'yes', 'no'])
    .describe(
      'Solo Chile: `yes` si en Alegra el contacto exige **facturación electrónica** (según doc, entonces **región**, **comuna** y calle son obligatorias).',
    ),
  chile_giro: z.string().describe('Chile: actividad económica / giro (`giro` en API).'),
  chile_address_region: z.string().describe('Chile: región (`address.region`).'),
  chile_address_commune: z.string().describe('Chile: comuna (`address.commune`).'),
  chile_address_city: z
    .string()
    .describe('Chile: ciudad si consta en el certificado (`address.city`); puede estar vacío.'),
  kind_of_person: z
    .enum(['', 'LEGAL_ENTITY', 'PERSON_ENTITY', 'OTHER_ENTITY'])
    .describe(
      'Colombia FE/DIAN: obligatorio — `LEGAL_ENTITY` jurídica, `PERSON_ENTITY` natural, `OTHER_ENTITY` otro obligado. Vacío solo si el contacto no usa tipos Colombia de esta herramienta.',
    ),
  regime: z
    .enum([
      '',
      'COMMON_REGIME',
      'SIMPLIFIED_REGIME',
      'NATIONAL_CONSUMPTION_TAX',
      'NOT_REPONSIBLE_FOR_CONSUMPTION',
      'INC_IVA_RESPONSIBLE',
      'SPECIAL_REGIME',
    ])
    .describe(
      'Colombia: régimen tributario del contacto según doc (`COMMON_REGIME`, `SIMPLIFIED_REGIME`, etc.). Obligatorio con documentos Colombia FE. Vacío si no aplica.',
    ),
  name: z
    .string()
    .describe(
      'Nombre o razón social (`name`). Obligatorio si **no** es persona natural en Colombia; vacío si es `PERSON_ENTITY` y usas solo `person_*`. En Chile es el nombre o razón social del RUT.',
    ),
  person_first_name: z.string().describe('Primer nombre (Colombia `PERSON_ENTITY`); vacío si no aplica.'),
  person_second_name: z.string().describe('Segundo nombre; vacío si no tiene.'),
  person_last_name: z
    .string()
    .describe('Apellidos (`lastName` en nameObject); obligatorio para `PERSON_ENTITY` Colombia.'),
  identification: z
    .string()
    .describe(
      'Número del documento; vacío solo si la cuenta permite alta sin identificación. Chile: RUT (con o sin puntos/guion).',
    ),
  identification_document_type: z
    .enum([
      'GENERIC',
      'CC',
      'NIT',
      'TI',
      'CE',
      'PP',
      'RC',
      'DIE',
      'TE',
      'FOREIGN_NIT',
      'NUIP',
      'CUIT',
      'CDI',
      'CI',
      'PASSPORT',
      'DNI',
      'OTHER',
    ])
    .describe(
      'Tipo código Alegra. Colombia: **CC**, **NIT**, etc. Chile con `use_chile_contact_schema=yes`: suele ser **GENERIC** u **OTHER** con RUT en `identification`.',
    ),
  identification_type_natural_language: z
    .string()
    .describe(
      'Cómo nombró el usuario el documento. Si tipo es GENERIC y hay texto, se infiere código.',
    ),
  identification_dv: z
    .string()
    .describe(
      'Dígito verificación NIT Colombia; obligatorio si tipo es NIT.',
    ),
  colombia_iva_condition: z
    .string()
    .describe(
      'Solo si la cuenta es Colombia **sin** facturación electrónica y la doc exige `ivaCondition` (ej. `FINAL_CONSUMER`, `IVA_RESPONSABLE`). Vacío si no aplica.',
    ),
  email: z.string().describe('Correo principal; vacío si confirmaron que no tienen.'),
  email_secondary: z.string().describe('Correo secundario; vacío si no aplica.'),
  phone_primary: z.string().describe('Teléfono principal; vacío si no tienen.'),
  phone_secondary: z.string().describe('Teléfono 2; vacío si no aplica.'),
  mobile: z.string().describe('Celular; vacío si no tienen.'),
  contact_kind: z
    .enum(['client', 'provider', 'both'])
    .describe(
      'Cliente, proveedor o ambos en Alegra. **Solo** el valor que el usuario haya dicho **explícitamente** en el chat; si no lo ha aclarado, **no** invoques esta herramienta: pregunta primero.',
    ),
  address_line: z
    .string()
    .describe(
      'Dirección (calle/número). Colombia ID nacional: obligatoria según doc. Chile: se envía como `address.description`.',
    ),
  address_department: z
    .string()
    .describe(
      'Departamento catálogo [Colombia](https://developer.alegra.com/reference/colombia). Bogotá → **Bogotá D.C.**',
    ),
  address_city: z
    .string()
    .describe(
      'Municipio/catálogo. Bogotá → **Bogotá, D.C.**',
    ),
  address_country: z
    .string()
    .describe(
      'País en dirección. Nacional Colombia → suele ser **Colombia**. Extranjero obligatorio según tipo doc.',
    ),
  address_zip: z.string().describe('Código postal; vacío si no aplica.'),
  observations: z.string().describe('Observaciones internas; vacío si no aplica.'),
})

export type AlegraCreateContactArgs = z.infer<typeof alegraCreateContactArgsSchema>

export function validateContactCreationPreSubmit(
  args: AlegraCreateContactArgs,
): { errors: string[] } {
  const errors: string[] = []
  if (args.use_chile_contact_schema === 'yes') {
    if (!args.name.trim()) {
      errors.push('Chile: falta **nombre** o razón social (`name`).')
    }
    if (!args.identification.trim()) {
      errors.push('Chile: falta **RUT** (`identification`).')
    }
    if (!args.chile_giro.trim()) {
      errors.push(
        'Chile: falta **giro**; en el certificado RUT suele figurar como actividad o giro.',
      )
    }
    if (args.chile_facturacion_electronica === 'yes') {
      if (!args.chile_address_region.trim()) {
        errors.push('Chile (FE): falta **región** (`chile_address_region`).')
      }
      if (!args.chile_address_commune.trim()) {
        errors.push('Chile (FE): falta **comuna** (`chile_address_commune`).')
      }
      if (!args.address_line.trim()) {
        errors.push(
          'Chile (FE): falta **calle/dirección** (usa `address_line` → `address.description` en API).',
        )
      }
    }
    return { errors }
  }

  const resolvedType = resolveIdentificationType(args)

  const addrLine = args.address_line.trim()
  const addrDeptIn = args.address_department.trim()
  const addrCityIn = args.address_city.trim()
  let normalized = normalizeColombiaAddressDepartmentCity(addrDeptIn, addrCityIn)
  const addrCountryIn = args.address_country.trim()
  if (addrCountryIn) {
    normalized = { ...normalized, country: addrCountryIn }
  }
  if (
    COLOMBIA_ADDR_NATIONAL_STYLE.has(resolvedType) &&
    !(normalized.country ?? '').trim()
  ) {
    normalized = { ...normalized, country: 'Colombia' }
  }

  const validationErr = validateColombiaStructuredContact({
    resolvedType,
    kind_of_person: args.kind_of_person,
    regime: args.regime,
    name: args.name,
    person_first_name: args.person_first_name,
    person_last_name: args.person_last_name,
    identification: args.identification,
    identification_dv: args.identification_dv,
    address_line: addrLine,
    address_department: addrDeptIn,
    address_city: addrCityIn,
    address_country: addrCountryIn,
    ...(normalized.department ? { normalizedDept: normalized.department } : {}),
    ...(normalized.city ? { normalizedCity: normalized.city } : {}),
    ...(normalized.country ? { normalizedCountry: normalized.country } : {}),
  })
  if (validationErr) errors.push(validationErr)
  return { errors }
}

/**
 * GET /contacts — listado de contactos (clientes/proveedores).
 * https://developer.alegra.com/reference/listcontacts-1
 */
export function createAlegraListContactsTool() {
  return tool({
    name: 'listar_contactos_alegra',
    description:
      'Lista contactos en Alegra (GET `/contacts`): clientes y/o proveedores guardados. Filtra por texto en nombre o identificación (`query`), por tipo, paginación. Úsala cuando pregunten por clientes, proveedores o agenda comercial. Tras obtener un `id`, puedes encadenar **obtener_contacto_alegra** para el detalle.',
    parameters: z.object({
      query: z
        .string()
        .describe(
          'Texto que coincida con nombre o identificación; vacío = sin filtro de búsqueda.',
        ),
      type_filter: z
        .enum(['', 'client', 'provider'])
        .describe(
          '`client` = solo clientes, `provider` = solo proveedores, cadena vacía = ambos.',
        ),
      limit: z
        .number()
        .describe(
          'Cantidad a traer (la API Alegra admite máximo 30 por solicitud).',
        ),
      start: z
        .number()
        .describe(
          'Desde qué índice paginar (0 = inicio). Si hay más resultados, puedes llamar de nuevo con start mayor.',
        ),
      mode: z
        .enum(['', 'simple', 'advanced'])
        .describe(
          '`simple` excluye varios campos pesados; `advanced` trae todo; vacío = omitir (comportamiento por defecto de Alegra).',
        ),
    }),
    execute: async (args) => {
      const params = new URLSearchParams()
      const lim = Math.min(30, Math.max(1, Math.floor(args.limit || 30)))
      params.set('limit', String(lim))
      const start = Math.max(0, Math.floor(args.start))
      if (start > 0) params.set('start', String(start))
      const q = args.query.trim()
      if (q) params.set('query', q)
      if (args.type_filter === 'client' || args.type_filter === 'provider') {
        params.set('type', args.type_filter)
      }
      if (args.mode === 'simple' || args.mode === 'advanced') {
        params.set('mode', args.mode)
      }

      const raw = await alegraJsonRequest('GET', `/contacts?${params}`)
      if (raw && typeof raw === 'object' && 'error' in raw) {
        return JSON.stringify(raw)
      }
      return JSON.stringify(normalizeContactList(raw))
    },
  })
}

/**
 * POST /contacts — crear contacto.
 * https://developer.alegra.com/reference/post_contacts
 */
export function createAlegraCreateContactTool() {
  return tool({
    name: 'crear_contacto_alegra',
    description:
      'Crea un contacto en Alegra (POST `/contacts`). **No la invoques** hasta tener **todos** los datos **obligatorios** del país que aplique según [post_contacts](https://developer.alegra.com/reference/post_contacts) (campos requeridos y textos «Obligatorio si…»), más los opcionales que el usuario deba confirmar explícitamente (correos, teléfonos: si no hay, que digan «sin correo» / «sin teléfono»). **Antes del POST**, el usuario debe haber dicho **en esta conversación** si el contacto es **cliente**, **proveedor** o **ambos** (`contact_kind`); si solo pidió «crear contacto» o subió un PDF sin aclararlo, **pregunta primero** — no elijas tú el tipo. **Chile** (`use_chile_contact_schema=yes`): `name`, RUT en `identification`, `chile_giro`, dirección con `chile_address_region`, `chile_address_commune`, `address_line` como calle; si la cuenta exige FE en Chile, `chile_facturacion_electronica=yes`. En **Colombia con tipo DIAN** (`CC`, `NIT`, etc.), la herramienta valida antes del POST: `kindOfPerson`, `regime`, documento (+ `dv` si NIT), nombre según tipo de persona, dirección nacional (departamento, ciudad catálogo, calle, país) o extranjera (país, dirección). Cédula → **CC**; NIT → **NIT** + DV. Bogotá: departamento **Bogotá D.C.**, ciudad **Bogotá, D.C.** (coma); normalización automática si el usuario escribe «Bogotá D.C». **GENERIC** solo sin número o fuera de Colombia FE.',
    parameters: alegraCreateContactArgsSchema,
    execute: async (args) => {
      if (args.use_chile_contact_schema === 'yes') {
        const pre = validateContactCreationPreSubmit(args)
        if (pre.errors.length) {
          return JSON.stringify({
            error: pre.errors.join('\n'),
            code: 'VALIDATION',
          })
        }

        const body: Record<string, unknown> = {
          name: args.name.trim(),
          identification: normalizeChileRutForApi(args.identification),
        }
        if (args.chile_giro.trim()) body.giro = args.chile_giro.trim()

        const addr: Record<string, string> = {}
        if (args.chile_address_region.trim()) {
          addr.region = args.chile_address_region.trim()
        }
        if (args.chile_address_commune.trim()) {
          addr.commune = args.chile_address_commune.trim()
        }
        if (args.address_line.trim()) {
          addr.description = args.address_line.trim()
        }
        if (args.chile_address_city.trim()) {
          addr.city = args.chile_address_city.trim()
        }
        if (Object.keys(addr).length > 0) body.address = addr

        if (args.email.trim()) body.email = args.email.trim()
        if (args.email_secondary.trim()) {
          body.emailSecondary = args.email_secondary.trim()
        }
        if (args.phone_primary.trim()) {
          body.phonePrimary = args.phone_primary.trim()
        }
        if (args.phone_secondary.trim()) {
          body.phoneSecondary = args.phone_secondary.trim()
        }
        if (args.mobile.trim()) body.mobile = args.mobile.trim()
        if (args.observations.trim()) {
          body.observations = args.observations.trim()
        }

        if (args.contact_kind === 'both') {
          body.type = ['client', 'provider']
        } else if (args.contact_kind === 'client') {
          body.type = ['client']
        } else {
          body.type = ['provider']
        }

        const result = await alegraJsonRequest('POST', '/contacts', body)
        return JSON.stringify(result)
      }

      const resolvedType = resolveIdentificationType(args)

      const pre = validateContactCreationPreSubmit(args)
      if (pre.errors.length) {
        return JSON.stringify({
          error: pre.errors.join('\n'),
          code: 'VALIDATION',
        })
      }

      const addrLine = args.address_line.trim()
      const addrDeptIn = args.address_department.trim()
      const addrCityIn = args.address_city.trim()
      let normalized = normalizeColombiaAddressDepartmentCity(
        addrDeptIn,
        addrCityIn,
      )
      const addrCountryIn = args.address_country.trim()
      if (addrCountryIn) {
        normalized = { ...normalized, country: addrCountryIn }
      }
      if (
        COLOMBIA_ADDR_NATIONAL_STYLE.has(resolvedType) &&
        !(normalized.country ?? '').trim()
      ) {
        normalized = { ...normalized, country: 'Colombia' }
      }

      const body: Record<string, unknown> = {}

      const isColombiaFe = COLOMBIA_FE_ID_TYPES.has(resolvedType)
      if (isColombiaFe) {
        body.kindOfPerson = args.kind_of_person.trim()
        body.regime = args.regime.trim()
        const kop = args.kind_of_person.trim()
        if (kop === 'PERSON_ENTITY') {
          body.nameObject = {
            firstName: args.person_first_name.trim(),
            lastName: args.person_last_name.trim(),
            ...(args.person_second_name.trim()
              ? { secondName: args.person_second_name.trim() }
              : {}),
          }
        } else {
          body.name = args.name.trim()
        }
        const iva = args.colombia_iva_condition.trim()
        if (iva) body.ivaCondition = iva
      } else {
        body.name = args.name.trim()
      }

      const idNumber = args.identification.trim()

      if (idNumber) {
        if (resolvedType !== 'GENERIC' && STRUCTURED_ID_TYPES.has(resolvedType)) {
          const obj: Record<string, unknown> = {
            number: idNumber,
            type: resolvedType,
          }
          const dv = args.identification_dv.trim()
          if (dv && resolvedType === 'NIT') obj.dv = dv
          body.identificationObject = obj
        } else {
          body.identification = idNumber
        }
      }

      if (args.email.trim()) body.email = args.email.trim()
      if (args.email_secondary.trim()) {
        body.emailSecondary = args.email_secondary.trim()
      }
      if (args.phone_primary.trim()) {
        body.phonePrimary = args.phone_primary.trim()
      }
      if (args.phone_secondary.trim()) {
        body.phoneSecondary = args.phone_secondary.trim()
      }
      if (args.mobile.trim()) body.mobile = args.mobile.trim()
      if (args.observations.trim()) {
        body.observations = args.observations.trim()
      }

      if (args.contact_kind === 'both') {
        body.type = ['client', 'provider']
      } else if (args.contact_kind === 'client') {
        body.type = ['client']
      } else {
        body.type = ['provider']
      }

      const addrZip = args.address_zip.trim()
      const hasAddr =
        !!addrLine ||
        !!normalized.department ||
        !!normalized.city ||
        !!normalized.country ||
        !!addrZip

      if (hasAddr) {
        body.address = {
          ...(addrLine ? { address: addrLine } : {}),
          ...(normalized.department ? { department: normalized.department } : {}),
          ...(normalized.city ? { city: normalized.city } : {}),
          ...(normalized.country ? { country: normalized.country } : {}),
          ...(addrZip ? { zipCode: addrZip } : {}),
        }
      }

      const result = await alegraJsonRequest('POST', '/contacts', body)
      return JSON.stringify(result)
    },
  })
}

/**
 * GET /contacts/{id} — detalle de un contacto.
 * https://developer.alegra.com/reference/contactsdetails-1
 */
export function createAlegraGetContactTool() {
  return tool({
    name: 'obtener_contacto_alegra',
    description:
      'Obtiene el detalle de un contacto por **id** en Alegra (GET `/contacts/{id}`): datos completos, dirección, tipo, listas de precio/plazo si aplica. Úsalo después de **listar_contactos_alegra** cuando necesites más campos que el listado. Parámetro opcional `fields_extra` para enlaces (`statementLink`, adjuntos `url`) según doc Alegra.',
    parameters: z.object({
      contact_id: z.string().describe('Id del contacto en Alegra.'),
      fields_extra: z
        .enum(['', 'url', 'statementLink', 'statementLink,url'])
        .describe(
          'Vacío = sin extra. `url` o `statementLink` según necesidad (ver documentación Alegra).',
        ),
    }),
    execute: async (args) => {
      const id = encodeURIComponent(args.contact_id.trim())
      const fe = args.fields_extra.trim()
      const path =
        fe === ''
          ? `/contacts/${id}`
          : `/contacts/${id}?fields=${encodeURIComponent(fe)}`
      const result = await alegraJsonRequest('GET', path)
      return JSON.stringify(result)
    },
  })
}

export function createContactExtractionValidationTool() {
  return tool({
    name: 'validar_extraccion_contacto_desde_documento',
    description:
      'Tras **leer** un PDF de identificación tributaria (p. ej. **RUT Chile** del SII), llama esta herramienta con **los mismos campos** que usarías en **crear_contacto_alegra** (mismos nombres de parámetro). Devuelve errores de validación según [post_contacts](https://developer.alegra.com/reference/post_contacts) (Colombia FE o Chile según `use_chile_contact_schema`) y facilita listar lo que falta antes de confirmar con el usuario. **Obligatorio** en el flujo de carga de PDF: primero analiza el archivo en el mensaje del usuario, rellena argumentos según lo leído, invoca esta herramienta y **después** muestra al usuario un resumen claro en Markdown pidiendo confirmación o datos faltantes. El PDF **no** dice si es cliente o proveedor: si el usuario no lo ha dicho, **pregunta** eso aparte antes de **crear_contacto_alegra**.',
    parameters: alegraCreateContactArgsSchema.extend({
      notas_sobre_lectura: z
        .string()
        .describe(
          'Breve nota sobre dudas del OCR o campos ilegibles (puede estar vacío).',
        ),
    }),
    execute: async (args) => {
      const { notas_sobre_lectura, ...rest } = args
      const v = validateContactCreationPreSubmit(rest)
      return JSON.stringify({
        ok: v.errors.length === 0,
        errors: v.errors,
        notas_sobre_lectura: notas_sobre_lectura.trim() || undefined,
      })
    },
  })
}

export function createAlegraContactTools() {
  return [
    createAlegraListContactsTool(),
    createAlegraCreateContactTool(),
    createAlegraGetContactTool(),
    createContactExtractionValidationTool(),
  ]
}

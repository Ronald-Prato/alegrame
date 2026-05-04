import { tool } from '@openai/agents'
import { z } from 'zod'

/** Catálogo oficial Alegra — «Formas de pago» (paymentForm en facturas CO). */
export const COLOMBIA_FORMAS_PAGO_FE_21: ReadonlyArray<{
  id: string
  descripcion: string
}> = [
  { id: 'CASH', descripcion: 'Contado' },
  { id: 'CREDIT', descripcion: 'Crédito' },
]

/** Catálogo oficial Alegra — «Medios de pago» (paymentMethod en facturas CO con FE 2.1). */
export const COLOMBIA_MEDIOS_PAGO_FE_21: ReadonlyArray<{
  id: string
  descripcion: string
}> = [
  { id: 'INSTRUMENT_NOT_DEFINED', descripcion: 'Instrumento no definido' },
  { id: 'CASH', descripcion: 'Efectivo' },
  { id: 'DEBIT_TRANSFER', descripcion: 'Débito ACH' },
  { id: 'BANK_DEPOSIT', descripcion: 'Consignación bancaria' },
  { id: 'ACH_CREDIT', descripcion: 'Crédito ACH' },
  { id: 'ACH_DEBIT', descripcion: 'Débito ACH' },
  { id: 'REVERSION_ACH_DEBIT', descripcion: 'Reversión débito de demanda ACH' },
  { id: 'REVERSION_ACH_CREDIT', descripcion: 'Reversión crédito de demanda ACH' },
  { id: 'CREDIT_ACH_DEMAND', descripcion: 'Crédito de demanda ACH' },
  { id: 'DEBIT_ACH_DEMAND', descripcion: 'Débito de demanda ACH' },
  { id: 'NATIONAL_CLEARING', descripcion: 'Clearing nacional o regional' },
  { id: 'REVERSION_CREDIT_SAVING', descripcion: 'Reversión crédito ahorro' },
  { id: 'REVERSION_DEBIT_SAVING', descripcion: 'Reversión débito ahorro' },
  { id: 'CREDIT_SAVING', descripcion: 'Crédito ahorro' },
  { id: 'DEBIT_SAVING', descripcion: 'Débito ahorro' },
  { id: 'BOOKENTRY_CREDIT', descripcion: 'Bookentry crédito' },
  { id: 'BOOKENTRY_DEBIT', descripcion: 'Bookentry débito' },
  { id: 'CTP_CREDIT', descripcion: 'Crédito pago negocio corporativo (CTP)' },
  { id: 'CHECK', descripcion: 'Cheque' },
  { id: 'BANK_PROYECT', descripcion: 'Proyecto bancario' },
  { id: 'BANK_PROYECT_CERTIFIED', descripcion: 'Proyecto bancario certificado' },
  { id: 'EXCHANGE_RATE_PENDING_ACEPT', descripcion: 'Nota cambiaria esperando aceptación' },
  { id: 'CERTIFIED_CHECK', descripcion: 'Cheque certificado' },
  { id: 'LOCAL_CHECK', descripcion: 'Cheque local' },
  { id: 'CTP_DEBIT', descripcion: 'Débito Pago Negocio Corporativo (CTP)' },
  { id: 'CTX_CREDIT', descripcion: 'Crédito Negocio Intercambio Corporativo (CTX)' },
  { id: 'CTX_DEBIT', descripcion: 'Débito Negocio Intercambio Corporativo (CTX)' },
  { id: 'CREDIT_TRANSFER', descripcion: 'Transferecia crédito' },
  { id: 'PPD_PAY', descripcion: 'Pago y depósito pre acordado (PPD)' },
  { id: 'CTP_CREDIT_SAVING', descripcion: 'Pago negocio corporativo ahorros crédito (CTP)' },
  { id: 'CTP_DEBIT_SAVING', descripcion: 'Pago negocio corporativo ahorros débito (CTP)' },
  { id: 'EXCHANGE_RATE', descripcion: 'Nota cambiaria' },
  { id: 'CREDIT_TRANSFER_BANK', descripcion: 'Transferencia crédito bancario' },
  { id: 'DEBIT_TRANSFER_INTERBANK', descripcion: 'Transferencia débito interbancario' },
  { id: 'DEBIT_TRANSFER_BANK', descripcion: 'Transferencia débito bancaria' },
  { id: 'CREDIT_CARD', descripcion: 'Tarjeta crédito' },
  { id: 'DEBIT_CARD', descripcion: 'Tarjeta débito' },
  { id: 'POSTTURN', descripcion: 'Postgiro' },
  { id: 'URGENT_BUSINESS_PAYMENT', descripcion: 'Pago comercial urgente' },
  { id: 'URGENT_CASH_PAYMENT', descripcion: 'Pago tesorería urgente' },
  { id: 'PROMISING_NOTE', descripcion: 'Nota promisoria' },
  { id: 'PROMISING_NOTE_SIGNED_PROVIDER', descripcion: 'Nota promisoria firmada por el acreedor' },
  {
    id: 'PROMISING_NOTE_SIGNED_PROVIDER_BANK',
    descripcion: 'Nota promisoria firmada por el acreedor, avalada por el banco',
  },
  {
    id: 'PROMISING_NOTE_SIGNED_PROVIDER_THIRD',
    descripcion: 'Nota promisoria firmada por el acreedor, avalada por un tercero',
  },
  { id: 'PROMISING_NOTE_SIGNED_BANK', descripcion: 'Nota promisoria firmada por el bancos' },
  {
    id: 'PROMISING_NOTE_SIGNED_BANK_ENDORSED_BANK',
    descripcion: 'Nota promisoria firmada por un banco avalada por otro banco',
  },
  { id: 'PROMISING_NOTE_SIGNED', descripcion: 'Nota promisoria firmada' },
  {
    id: 'PROMISING_NOTE_SIGNED_THIRD',
    descripcion: 'Nota promisoria firmada por un tercero avalada por un banco',
  },
  { id: 'WITHDRAWAL_NOTE_CREDITOR', descripcion: 'Retiro de nota por el acreedor' },
  { id: 'BONDS', descripcion: 'Bonos' },
  { id: 'VOUCHERS', descripcion: 'Vales' },
  {
    id: 'WITHDRAWAL_NOTE_CREDITOR_BANK',
    descripcion: 'Retiro de nota por el acreedor sobre un banco',
  },
  {
    id: 'WITHDRAWAL_NOTE_CREDITOR_ENDORSED_BANK',
    descripcion: 'Retiro de nota por el acreedor, avalada por otro banco',
  },
  {
    id: 'WITHDRAWAL_NOTE_CREDITOR_BANK_ENDORSED_THIRD',
    descripcion: 'Retiro de nota por el acreedor, sobre un banco avalada por un tercero',
  },
  {
    id: 'WITHDRAWAL_NOTE_CREDITOR_ENDORSED_THIRD',
    descripcion: 'Retiro de una nota por el acreedor sobre un tercero',
  },
  {
    id: 'WITHDRAWAL_NOTE_CREDITOR_THIRD_PARTY',
    descripcion: 'Retiro de una nota por el acreedor sobre un tercero avalada por un banco',
  },
  { id: 'TRANSFERABLE_BANK_NOTE', descripcion: 'Nota bancaria transferible' },
  { id: 'TRANSFERABLE_LOCAL_CHECK', descripcion: 'Cheque local transferible' },
  { id: 'REFERENCED_TURN', descripcion: 'Giro referenciado' },
  { id: 'URGENT_TURN', descripcion: 'Giro urgente' },
  { id: 'OPEN_FORMAT_TWIST', descripcion: 'Giro formato abierto' },
  {
    id: 'PAYMENT_METHOD_REQUESTED_NOT_USED',
    descripcion: 'Método de pago solicitado no usado',
  },
  { id: 'CLEARING_PARTNERS', descripcion: 'Clearing entre partners' },
  { id: 'CCD_CREDIT', descripcion: 'Desembolso Crédito (CCD)s' },
  { id: 'CCD_DEBIT', descripcion: 'Desembolso (CCD) débito' },
  { id: 'BANK_CHECK', descripcion: 'Cheque bancario de gerencia' },
  { id: 'CDD_CREDIT', descripcion: 'Desembolso Crédito plus (CCD+)s' },
  { id: 'CDD_CASH', descripcion: 'Desembolso Débito plus (CCD+)' },
  { id: 'CCD_CASH_CREDIT', descripcion: 'Desembolso Crédito (CCD)' },
  { id: 'CCD_CASH_DEBIT', descripcion: 'Desembolso Débito (CCD)' },
  { id: 'CTX_CREDIT_DEAL', descripcion: 'Crédito Intercambio Corporativo (CTX)' },
  { id: 'CTX_DEBIT_DEAL', descripcion: 'Débito Intercambio Corporativo (CTX)' },
  { id: 'CCD_CREDIT_PLUS', descripcion: 'Desembolso Crédito plus (CCD+)' },
  { id: 'CCD_DEBIT_PLUS', descripcion: 'Desembolso Débito plus (CCD+)' },
  {
    id: 'FRENCH_BANKING_STANDARD_TELEX',
    descripcion: 'Telex estándar bancario',
  },
  { id: 'MUTUAL_AGREEMENT', descripcion: 'Otro' },
]

const FUENTE_DOC =
  'https://developer.alegra.com/reference/colombia (Formas de pago y Medios de pago, FE 2.1)'

function filtrar<T extends { id: string; descripcion: string }>(
  filas: ReadonlyArray<T>,
  filtro: string,
): T[] {
  const q = filtro.trim().toLowerCase()
  if (!q) return [...filas]
  return filas.filter(
    (r) =>
      r.id.toLowerCase().includes(q) || r.descripcion.toLowerCase().includes(q),
  )
}

/**
 * Catálogo local del listado oficial Alegra (documentación Colombia / DIAN FE 2.1).
 * No llama a la API de Alegra: los ids deben coincidir con POST /invoices (paymentForm / paymentMethod).
 */
export function createAlegraColombiaPaymentCatalogTool() {
  return tool({
    name: 'listar_formas_y_medios_pago_colombia_alegra',
    description:
      'Devuelve **id** y **descripción** de **formas de pago** (`paymentForm`: CASH/CREDIT) y **medios de pago** (`paymentMethod`) según el catálogo oficial de **Colombia / DIAN facturación electrónica 2.1** en [reference/colombia](https://developer.alegra.com/reference/colombia). Úsalo **antes** de **crear_factura_venta_borrador_alegra** o **vista_previa** para que el usuario elija códigos válidos. Opcionalmente filtra por texto en id o descripción. **Nota:** son datos de documentación (no es un GET dinámico a `api/v1`); la respuesta incluye `fuente`.',
    parameters: z.object({
      tipo: z
        .enum(['formas', 'medios', 'todos'])
        .describe(
          '`formas` = solo paymentForm (contado/crédito). `medios` = solo paymentMethod DIAN. `todos` = ambos bloques.',
        ),
      filtro: z
        .string()
        .describe(
          'Subcadena para filtrar por id o descripción (sin distinguir mayúsculas); vacío = sin filtro.',
        ),
    }),
    execute: async (args) => {
      const filtro = args.filtro
      if (args.tipo === 'formas') {
        return JSON.stringify({
          fuente: FUENTE_DOC,
          categoria: 'paymentForm',
          items: filtrar(COLOMBIA_FORMAS_PAGO_FE_21, filtro),
        })
      }
      if (args.tipo === 'medios') {
        return JSON.stringify({
          fuente: FUENTE_DOC,
          categoria: 'paymentMethod',
          items: filtrar(COLOMBIA_MEDIOS_PAGO_FE_21, filtro),
        })
      }
      return JSON.stringify({
        fuente: FUENTE_DOC,
        formas_pago: filtrar(COLOMBIA_FORMAS_PAGO_FE_21, filtro),
        medios_pago: filtrar(COLOMBIA_MEDIOS_PAGO_FE_21, filtro),
      })
    },
  })
}

export function createAlegraColombiaPaymentCatalogTools() {
  return [createAlegraColombiaPaymentCatalogTool()]
}

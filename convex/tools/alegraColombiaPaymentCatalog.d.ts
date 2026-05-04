import { z } from 'zod';
/** Catálogo oficial Alegra — «Formas de pago» (paymentForm en facturas CO). */
export declare const COLOMBIA_FORMAS_PAGO_FE_21: ReadonlyArray<{
    id: string;
    descripcion: string;
}>;
/** Catálogo oficial Alegra — «Medios de pago» (paymentMethod en facturas CO con FE 2.1). */
export declare const COLOMBIA_MEDIOS_PAGO_FE_21: ReadonlyArray<{
    id: string;
    descripcion: string;
}>;
/**
 * Catálogo local del listado oficial Alegra (documentación Colombia / DIAN FE 2.1).
 * No llama a la API de Alegra: los ids deben coincidir con POST /invoices (paymentForm / paymentMethod).
 */
export declare function createAlegraColombiaPaymentCatalogTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    tipo: z.ZodEnum<{
        formas: "formas";
        medios: "medios";
        todos: "todos";
    }>;
    filtro: z.ZodString;
}, z.core.$strip>, string>;
export declare function createAlegraColombiaPaymentCatalogTools(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    tipo: z.ZodEnum<{
        formas: "formas";
        medios: "medios";
        todos: "todos";
    }>;
    filtro: z.ZodString;
}, z.core.$strip>, string>[];
//# sourceMappingURL=alegraColombiaPaymentCatalog.d.ts.map
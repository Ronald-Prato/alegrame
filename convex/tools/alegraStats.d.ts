import { z } from 'zod';
export declare function createAlegraStatsTools(): (import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    fecha_inicio: z.ZodString;
    fecha_fin: z.ZodString;
    estados: z.ZodString;
    top_n: z.ZodNumber;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    fecha_inicio: z.ZodString;
    fecha_fin: z.ZodString;
    estados_facturas: z.ZodString;
    estados_facturas_proveedor: z.ZodString;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    ciudad_busqueda: z.ZodString;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    fecha_inicio: z.ZodString;
    fecha_fin: z.ZodString;
    texto_filtro: z.ZodString;
    estados: z.ZodString;
}, z.core.$strip>, string>)[];
//# sourceMappingURL=alegraStats.d.ts.map
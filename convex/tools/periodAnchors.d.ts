import { z } from 'zod';
/** Herramienta compartida: ancla «hoy» y meses relativos usando la hora del servidor (Convex Node) en una zona IANA. */
export declare function createPeriodAnchorTools(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    zona_horaria: z.ZodOptional<z.ZodString>;
    preset: z.ZodEnum<{
        last_calendar_month: "last_calendar_month";
        this_calendar_month: "this_calendar_month";
        last_calendar_year: "last_calendar_year";
        this_calendar_year: "this_calendar_year";
        rolling_inclusive_days: "rolling_inclusive_days";
    }>;
    dias_rolling_inclusive: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, string>[];
//# sourceMappingURL=periodAnchors.d.ts.map
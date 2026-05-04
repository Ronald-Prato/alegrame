import { tool } from '@openai/agents';
import { DateTime } from 'luxon';
import { z } from 'zod';

const PRESETS = [
  'last_calendar_month',
  /** Desde el día 1 del mes actual hasta **hoy** inclusive (ventas «de este mes hasta la fecha»). */
  'this_calendar_month',
  'last_calendar_year',
  /** Desde el 1 de enero del año en curso hasta **hoy** inclusive. */
  'this_calendar_year',
  /** Últimos `dias_rolling_inclusive` días cerrando **hoy** inclusive en la zona. */
  'rolling_inclusive_days',
] as const;

type Preset = (typeof PRESETS)[number];

function parseZone(zona_horaria: string): { ok: true; tz: string } | { ok: false; error: string } {
  const tz = zona_horaria.trim() || 'America/Bogota';
  const probe = DateTime.now().setZone(tz);
  if (!probe.isValid) {
    return { ok: false, error: `Zona horaria IANA inválida: ${tz} (${probe.invalidReason ?? '?'})` };
  }
  return { ok: true, tz };
}

function boundsForPreset(
  tz: string,
  preset: Preset,
  diasRollingInclusive: number | undefined,
): { ok: true; fecha_inicio: string; fecha_fin: string; etiqueta: string } | { ok: false; error: string } {
  const now = DateTime.now().setZone(tz);
  if (!now.isValid) {
    return { ok: false, error: `No se pudo obtener la fecha actual en ${tz}` };
  }

  const todayStart = now.startOf('day');

  switch (preset) {
    case 'last_calendar_month': {
      const monthStart = now.startOf('month').minus({ months: 1 });
      const monthEnd = monthStart.endOf('month').startOf('day');
      return {
        ok: true,
        fecha_inicio: monthStart.toFormat('yyyy-LL-dd'),
        fecha_fin: monthEnd.toFormat('yyyy-LL-dd'),
        etiqueta: `Mes calendario anterior (${monthStart.setLocale('es').toFormat('LLLL yyyy')}) en ${tz}`,
      };
    }
    case 'this_calendar_month': {
      const start = now.startOf('month');
      const end = todayStart;
      if (start > end) {
        return { ok: false, error: 'Estado temporal inesperado (inicio de mes después de hoy).' };
      }
      return {
        ok: true,
        fecha_inicio: start.toFormat('yyyy-LL-dd'),
        fecha_fin: end.toFormat('yyyy-LL-dd'),
        etiqueta: `Mes calendario en curso (del 1 al hoy) en ${tz}`,
      };
    }
    case 'last_calendar_year': {
      const y = now.year - 1;
      const fecha_inicio = `${y}-01-01`;
      const fecha_fin = `${y}-12-31`;
      return {
        ok: true,
        fecha_inicio,
        fecha_fin,
        etiqueta: `Año natural anterior (${y}) en ${tz}`,
      };
    }
    case 'this_calendar_year': {
      const start = DateTime.fromObject({ year: now.year, month: 1, day: 1 }, { zone: tz }).startOf('day');
      const end = todayStart;
      return {
        ok: true,
        fecha_inicio: start.toFormat('yyyy-LL-dd'),
        fecha_fin: end.toFormat('yyyy-LL-dd'),
        etiqueta: `Año natural en curso (del 1-ene al hoy) en ${tz}`,
      };
    }
    case 'rolling_inclusive_days': {
      const n = diasRollingInclusive;
      if (n == null || !Number.isInteger(n)) {
        return {
          ok: false,
          error: 'Para `rolling_inclusive_days` debes enviar **dias_rolling_inclusive** (entero 1–366).',
        };
      }
      if (n < 1 || n > 366) {
        return { ok: false, error: '`dias_rolling_inclusive` debe estar entre 1 y 366.' };
      }
      const start = todayStart.minus({ days: n - 1 });
      return {
        ok: true,
        fecha_inicio: start.toFormat('yyyy-LL-dd'),
        fecha_fin: todayStart.toFormat('yyyy-LL-dd'),
        etiqueta: `Últimos ${n} día(s) inclusive hasta hoy en ${tz}`,
      };
    }
    default: {
      const _exhaust: never = preset;
      return { ok: false, error: `Preset no soportado: ${String(_exhaust)}` };
    }
  }
}

/** Herramienta compartida: ancla «hoy» y meses relativos usando la hora del servidor (Convex Node) en una zona IANA. */
export function createPeriodAnchorTools() {
  return [
    tool({
      name: 'resolver_rango_fechas_relativo',
      description:
        'Convierte lenguaje relativo («el mes pasado», «este mes», «este año», «últimos 30 días») en **`fecha_inicio`** y **`fecha_fin`** inclusivas formato **`YYYY-MM-DD`**, usando la fecha/hora **actual del servidor** y una **zona horaria IANA** (ej. `America/Bogota`, `America/Santiago`). ' +
        'Llámala **antes** de ejecutar estadísticas cuando el usuario no dio fechas explícitas. `this_calendar_month` = del día 1 del mes hasta **hoy**; `rolling_inclusive_days` requiere `dias_rolling_inclusive`.',
      parameters: z.object({
        zona_horaria: z
          .string()
          .optional()
          .describe(
            'Zona IANA (`America/Bogota`, `America/Santiago`, `America/Mexico_City`, …). Omite o deja vacío para usar **`America/Bogota`** por defecto.',
          ),
        preset: z.enum(PRESETS).describe('Tipo de período a resolver.'),
        dias_rolling_inclusive: z
          .number()
          .int()
          .optional()
          .describe('Solo si `preset` es `rolling_inclusive_days`: cuántos días hacia atrás desde **hoy** inclusive.'),
      }),
      execute: async (args) => {
        const zone = parseZone(args.zona_horaria ?? '');
        if (!zone.ok) return JSON.stringify({ error: zone.error });

        const bounds = boundsForPreset(
          zone.tz,
          args.preset,
          args.dias_rolling_inclusive ?? undefined,
        );
        if (!bounds.ok) return JSON.stringify({ error: bounds.error });

        const nowUtc = DateTime.utc().toISO();
        return JSON.stringify({
          zona_horaria: zone.tz,
          preset: args.preset,
          fecha_inicio: bounds.fecha_inicio,
          fecha_fin: bounds.fecha_fin,
          etiqueta: bounds.etiqueta,
          referencia_servidor_utc: nowUtc,
        });
      },
    }),
  ];
}

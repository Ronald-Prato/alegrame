import { z } from 'zod';
/** Lectura de inventario vía GET /items (hasta 30 ítems por llamada). Ver https://developer.alegra.com/reference/get_items */
export declare function fetchAlegraItems(query?: string): Promise<unknown>;
/**
 * GET /items/{id} — detalle de un ítem (estado, tipo, variantes).
 * https://developer.alegra.com/reference/get_items-id
 */
export declare function createAlegraGetItemTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    item_id: z.ZodString;
    fields: z.ZodString;
}, z.core.$strip>, string>;
/**
 * Herramienta del agente: listado de inventario en Alegra.
 */
export declare function createAlegraInventoryTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    query: z.ZodString;
}, z.core.$strip>, string>;
/**
 * POST /inventory-adjustments — ajuste de existencias (entrada/salida).
 * https://developer.alegra.com/reference/post_inventory-adjustments
 */
export declare function createAlegraInventoryAdjustmentTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    date: z.ZodString;
    observations: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    resolution_id: z.ZodString;
    lines: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        adjustment_type: z.ZodEnum<{
            out: "out";
            in: "in";
        }>;
        quantity: z.ZodNumber;
        unit_cost: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, string>;
/**
 * POST /items — crear producto o servicio.
 * https://developer.alegra.com/reference/post_items
 */
export declare function createAlegraCreateItemTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    reference: z.ZodString;
    item_type: z.ZodEnum<{
        product: "product";
        service: "service";
    }>;
    price: z.ZodNumber;
    track_inventory: z.ZodBoolean;
    inventory_unit: z.ZodString;
    unit_cost: z.ZodNumber;
    initial_quantity: z.ZodNumber;
}, z.core.$strip>, string>;
/**
 * PUT /items/{id} — editar ítem existente.
 * https://developer.alegra.com/reference/put_items-id
 */
export declare function createAlegraUpdateItemTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    item_id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    reference: z.ZodString;
    price: z.ZodNumber;
    status: z.ZodEnum<{
        active: "active";
        inactive: "inactive";
        unchanged: "unchanged";
    }>;
}, z.core.$strip>, string>;
export declare function createAlegraItemTools(): (import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    item_id: z.ZodString;
    fields: z.ZodString;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    query: z.ZodString;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    date: z.ZodString;
    observations: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    resolution_id: z.ZodString;
    lines: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        adjustment_type: z.ZodEnum<{
            out: "out";
            in: "in";
        }>;
        quantity: z.ZodNumber;
        unit_cost: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    reference: z.ZodString;
    item_type: z.ZodEnum<{
        product: "product";
        service: "service";
    }>;
    price: z.ZodNumber;
    track_inventory: z.ZodBoolean;
    inventory_unit: z.ZodString;
    unit_cost: z.ZodNumber;
    initial_quantity: z.ZodNumber;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    item_id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    reference: z.ZodString;
    price: z.ZodNumber;
    status: z.ZodEnum<{
        active: "active";
        inactive: "inactive";
        unchanged: "unchanged";
    }>;
}, z.core.$strip>, string>)[];
//# sourceMappingURL=alegraInventory.d.ts.map
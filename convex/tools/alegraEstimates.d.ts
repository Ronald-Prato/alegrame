import { z } from 'zod';
/**
 * GET /estimates — listar cotizaciones.
 * https://developer.alegra.com/reference/get_estimates
 */
export declare function createAlegraListEstimatesTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    start: z.ZodNumber;
    limit: z.ZodNumber;
    order_direction: z.ZodEnum<{
        "": "";
        ASC: "ASC";
        DESC: "DESC";
    }>;
    order_field: z.ZodEnum<{
        "": "";
        id: "id";
        name: "name";
        date: "date";
        dueDate: "dueDate";
    }>;
    metadata: z.ZodBoolean;
    item_id: z.ZodString;
    client_id: z.ZodString;
    number: z.ZodString;
    client_name: z.ZodString;
    date: z.ZodString;
}, z.core.$strip>, string>;
/**
 * GET /estimates/{id}
 * https://developer.alegra.com/reference/get_estimates-id
 */
export declare function createAlegraGetEstimateTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    estimate_id: z.ZodString;
    include_comments: z.ZodBoolean;
}, z.core.$strip>, string>;
/**
 * POST /estimates — crear cotización.
 * https://developer.alegra.com/reference/post_estimates
 *
 * Esquema «genérico»: obligatorios **date**, **dueDate**, **client**, **items**.
 */
export declare function createAlegraCreateEstimateTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    date: z.ZodString;
    due_date: z.ZodString;
    client_id: z.ZodString;
    lines: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        description: z.ZodString;
        reference: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    observations: z.ZodString;
    anotation: z.ZodString;
    seller_id: z.ZodString;
    price_list_id: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    number_template_id: z.ZodString;
}, z.core.$strip>, string>;
/**
 * PUT /estimates/{id} — edición parcial.
 * https://developer.alegra.com/reference/put_estimates-id
 */
export declare function createAlegraUpdateEstimateTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    estimate_id: z.ZodString;
    date: z.ZodString;
    due_date: z.ZodString;
    observations: z.ZodString;
    clear_observations: z.ZodBoolean;
    anotation: z.ZodString;
    clear_anotation: z.ZodBoolean;
    client_id: z.ZodString;
    seller_id: z.ZodString;
    price_list_id: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    replace_items: z.ZodBoolean;
    lines: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        description: z.ZodString;
        reference: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    comments: z.ZodArray<z.ZodString>;
    number_template_id: z.ZodString;
}, z.core.$strip>, string>;
export declare function createAlegraEstimateTools(): (import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    start: z.ZodNumber;
    limit: z.ZodNumber;
    order_direction: z.ZodEnum<{
        "": "";
        ASC: "ASC";
        DESC: "DESC";
    }>;
    order_field: z.ZodEnum<{
        "": "";
        id: "id";
        name: "name";
        date: "date";
        dueDate: "dueDate";
    }>;
    metadata: z.ZodBoolean;
    item_id: z.ZodString;
    client_id: z.ZodString;
    number: z.ZodString;
    client_name: z.ZodString;
    date: z.ZodString;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    estimate_id: z.ZodString;
    include_comments: z.ZodBoolean;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    date: z.ZodString;
    due_date: z.ZodString;
    client_id: z.ZodString;
    lines: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        description: z.ZodString;
        reference: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    observations: z.ZodString;
    anotation: z.ZodString;
    seller_id: z.ZodString;
    price_list_id: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    number_template_id: z.ZodString;
}, z.core.$strip>, string>)[];
//# sourceMappingURL=alegraEstimates.d.ts.map
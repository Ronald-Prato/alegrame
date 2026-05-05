import { z } from 'zod';
/**
 * GET /bills — listar facturas de compra (facturas de proveedor en la API).
 * https://developer.alegra.com/reference/get_bills
 */
export declare function createAlegraListPurchaseBillsTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    start: z.ZodNumber;
    limit: z.ZodNumber;
    order_direction: z.ZodEnum<{
        "": "";
        ASC: "ASC";
        DESC: "DESC";
    }>;
    order_field: z.ZodEnum<{
        "": "";
        name: "name";
        date: "date";
        dueDate: "dueDate";
    }>;
    metadata: z.ZodBoolean;
    bill_number: z.ZodString;
    client_name: z.ZodString;
    date: z.ZodString;
    due_date: z.ZodString;
    status: z.ZodString;
    item_id: z.ZodString;
    client_id: z.ZodString;
    provider_name: z.ZodString;
    uuid: z.ZodString;
    purchase_order_id: z.ZodString;
    type: z.ZodEnum<{
        "": "";
        bill: "bill";
        supportDocument: "supportDocument";
        all: "all";
    }>;
}, z.core.$strip>, string>;
/**
 * GET /bills/{id}
 * https://developer.alegra.com/reference/get_bills-id
 */
export declare function createAlegraGetPurchaseBillTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    bill_id: z.ZodString;
    fields: z.ZodString;
    include_void_payments: z.ZodBoolean;
}, z.core.$strip>, string>;
/**
 * POST /bills
 * https://developer.alegra.com/reference/post_bills
 */
export declare function createAlegraCreatePurchaseBillTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    date: z.ZodString;
    due_date: z.ZodString;
    provider_id: z.ZodString;
    item_lines: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        description: z.ZodString;
        reference: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    category_lines: z.ZodArray<z.ZodObject<{
        category_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        observations: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    observations: z.ZodString;
    terms_conditions: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    number_template_id: z.ZodString;
    number_template_number: z.ZodString;
    colombia_payment_form: z.ZodString;
    colombia_payment_type: z.ZodString;
    colombia_bill_operation_type: z.ZodString;
    colombia_physical_document: z.ZodString;
    expedir_al_crear: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>, string>;
/**
 * PUT /bills/{id}
 * https://developer.alegra.com/reference/put_bills-id
 */
export declare function createAlegraUpdatePurchaseBillTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    bill_id: z.ZodString;
    date: z.ZodString;
    due_date: z.ZodString;
    observations: z.ZodString;
    clear_observations: z.ZodBoolean;
    terms_conditions: z.ZodString;
    clear_terms_conditions: z.ZodBoolean;
    provider_id: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    replace_purchases: z.ZodBoolean;
    item_lines: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        description: z.ZodString;
        reference: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    category_lines: z.ZodArray<z.ZodObject<{
        category_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        observations: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    number_template_id: z.ZodString;
    number_template_number: z.ZodString;
    colombia_payment_form: z.ZodString;
    colombia_payment_type: z.ZodString;
    colombia_bill_operation_type: z.ZodString;
    colombia_physical_document: z.ZodString;
    expedir_al_editar: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>, string>;
export declare function createAlegraPurchaseBillTools(): (import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    start: z.ZodNumber;
    limit: z.ZodNumber;
    order_direction: z.ZodEnum<{
        "": "";
        ASC: "ASC";
        DESC: "DESC";
    }>;
    order_field: z.ZodEnum<{
        "": "";
        name: "name";
        date: "date";
        dueDate: "dueDate";
    }>;
    metadata: z.ZodBoolean;
    bill_number: z.ZodString;
    client_name: z.ZodString;
    date: z.ZodString;
    due_date: z.ZodString;
    status: z.ZodString;
    item_id: z.ZodString;
    client_id: z.ZodString;
    provider_name: z.ZodString;
    uuid: z.ZodString;
    purchase_order_id: z.ZodString;
    type: z.ZodEnum<{
        "": "";
        bill: "bill";
        supportDocument: "supportDocument";
        all: "all";
    }>;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    bill_id: z.ZodString;
    fields: z.ZodString;
    include_void_payments: z.ZodBoolean;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    date: z.ZodString;
    due_date: z.ZodString;
    provider_id: z.ZodString;
    item_lines: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        description: z.ZodString;
        reference: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    category_lines: z.ZodArray<z.ZodObject<{
        category_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        observations: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    observations: z.ZodString;
    terms_conditions: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    number_template_id: z.ZodString;
    number_template_number: z.ZodString;
    colombia_payment_form: z.ZodString;
    colombia_payment_type: z.ZodString;
    colombia_bill_operation_type: z.ZodString;
    colombia_physical_document: z.ZodString;
    expedir_al_crear: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    bill_id: z.ZodString;
    date: z.ZodString;
    due_date: z.ZodString;
    observations: z.ZodString;
    clear_observations: z.ZodBoolean;
    terms_conditions: z.ZodString;
    clear_terms_conditions: z.ZodBoolean;
    provider_id: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    replace_purchases: z.ZodBoolean;
    item_lines: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        description: z.ZodString;
        reference: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    category_lines: z.ZodArray<z.ZodObject<{
        category_id: z.ZodString;
        quantity: z.ZodNumber;
        price: z.ZodNumber;
        observations: z.ZodString;
        discount: z.ZodDefault<z.ZodNumber>;
        tax_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    number_template_id: z.ZodString;
    number_template_number: z.ZodString;
    colombia_payment_form: z.ZodString;
    colombia_payment_type: z.ZodString;
    colombia_bill_operation_type: z.ZodString;
    colombia_physical_document: z.ZodString;
    expedir_al_editar: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>, string>)[];
//# sourceMappingURL=alegraPurchaseBills.d.ts.map
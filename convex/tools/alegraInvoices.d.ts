import { z } from 'zod';
/**
 * GET /invoices — listar facturas de venta.
 * https://developer.alegra.com/reference/get_invoices
 */
export declare function createAlegraListInvoicesTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
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
        status: "status";
        name: "name";
        date: "date";
        dueDate: "dueDate";
    }>;
    metadata: z.ZodBoolean;
    invoice_ids: z.ZodString;
    date: z.ZodString;
    due_date: z.ZodString;
    status: z.ZodString;
    client_id: z.ZodString;
    client_name: z.ZodString;
    client_identification: z.ZodString;
    number_template_full_number: z.ZodString;
    item_id: z.ZodString;
    date_after: z.ZodString;
    date_after_or_now: z.ZodString;
    date_before: z.ZodString;
    date_before_or_now: z.ZodString;
    due_date_after: z.ZodString;
    due_date_after_or_now: z.ZodString;
    due_date_before: z.ZodString;
    due_date_before_or_now: z.ZodString;
    to_replace: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>, string>;
/**
 * POST /invoices — crear factura de venta **siempre en borrador (draft)**.
 * https://developer.alegra.com/reference/post_invoices
 *
 * Regla de producto: **nunca** se envían `payments` ni `status` distinto de `draft` en este flujo
 * (los pagos en creación pondrían la factura en `open` según doc).
 */
export declare function createAlegraCreateInvoiceTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
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
    terms_conditions: z.ZodString;
    seller_id: z.ZodString;
    price_list_id: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    number_template_id: z.ZodString;
    number_template_prefix: z.ZodString;
    number_template_number: z.ZodString;
    estimate_id: z.ZodString;
    payment_method: z.ZodString;
    payment_form: z.ZodString;
    invoice_type: z.ZodString;
    payment_type_mexico: z.ZodString;
    cfdi_use_mexico: z.ZodString;
    account_number_mexico: z.ZodString;
    regime_client_mexico: z.ZodString;
    operation_type_colombia: z.ZodString;
    purchase_order_number_colombia: z.ZodString;
}, z.core.$strip>, string>;
/**
 * PUT /invoices/{id} — edición parcial.
 * https://developer.alegra.com/reference/put_invoices-id
 */
export declare function createAlegraUpdateInvoiceTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    invoice_id: z.ZodString;
    date: z.ZodString;
    due_date: z.ZodString;
    observations: z.ZodString;
    clear_observations: z.ZodBoolean;
    anotation: z.ZodString;
    clear_anotation: z.ZodBoolean;
    terms_conditions: z.ZodString;
    clear_terms_conditions: z.ZodBoolean;
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
    number_template_prefix: z.ZodString;
    number_template_number: z.ZodString;
    payment_method: z.ZodString;
    payment_form: z.ZodString;
    payment_type_mexico: z.ZodString;
    cfdi_use_mexico: z.ZodString;
    regime_client_mexico: z.ZodString;
    invoice_type: z.ZodString;
    purchase_order_number_colombia: z.ZodString;
}, z.core.$strip>, string>;
/**
 * POST /invoices/{id}/open — abrir / emitir factura (p. ej. desde anulación o pasar borrador a abierta según flujo Alegra).
 * https://developer.alegra.com/reference/post_invoices-id-open
 */
export declare function createAlegraOpenInvoiceTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    invoice_id: z.ZodString;
    timbrar_o_expedir_al_abrir: z.ZodBoolean;
}, z.core.$strip>, string>;
/**
 * POST /invoices/preview — URL de PDF de vista previa.
 * https://developer.alegra.com/reference/post_invoices-preview
 */
export declare function createAlegraPreviewInvoiceTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
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
    anotation: z.ZodString;
    terms_conditions: z.ZodString;
    number_template_id: z.ZodString;
    number_template_prefix: z.ZodString;
    number_template_number: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    payment_method: z.ZodString;
    payment_form: z.ZodString;
    invoice_type: z.ZodString;
    payment_type_mexico: z.ZodString;
    account_number_mexico: z.ZodString;
}, z.core.$strip>, string>;
export declare function createAlegraInvoiceTools(): (import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
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
        status: "status";
        name: "name";
        date: "date";
        dueDate: "dueDate";
    }>;
    metadata: z.ZodBoolean;
    invoice_ids: z.ZodString;
    date: z.ZodString;
    due_date: z.ZodString;
    status: z.ZodString;
    client_id: z.ZodString;
    client_name: z.ZodString;
    client_identification: z.ZodString;
    number_template_full_number: z.ZodString;
    item_id: z.ZodString;
    date_after: z.ZodString;
    date_after_or_now: z.ZodString;
    date_before: z.ZodString;
    date_before_or_now: z.ZodString;
    due_date_after: z.ZodString;
    due_date_after_or_now: z.ZodString;
    due_date_before: z.ZodString;
    due_date_before_or_now: z.ZodString;
    to_replace: z.ZodDefault<z.ZodBoolean>;
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
    terms_conditions: z.ZodString;
    seller_id: z.ZodString;
    price_list_id: z.ZodString;
    warehouse_id: z.ZodString;
    cost_center_id: z.ZodString;
    currency_code: z.ZodString;
    currency_exchange_rate: z.ZodNumber;
    number_template_id: z.ZodString;
    number_template_prefix: z.ZodString;
    number_template_number: z.ZodString;
    estimate_id: z.ZodString;
    payment_method: z.ZodString;
    payment_form: z.ZodString;
    invoice_type: z.ZodString;
    payment_type_mexico: z.ZodString;
    cfdi_use_mexico: z.ZodString;
    account_number_mexico: z.ZodString;
    regime_client_mexico: z.ZodString;
    operation_type_colombia: z.ZodString;
    purchase_order_number_colombia: z.ZodString;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    invoice_id: z.ZodString;
    date: z.ZodString;
    due_date: z.ZodString;
    observations: z.ZodString;
    clear_observations: z.ZodBoolean;
    anotation: z.ZodString;
    clear_anotation: z.ZodBoolean;
    terms_conditions: z.ZodString;
    clear_terms_conditions: z.ZodBoolean;
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
    number_template_prefix: z.ZodString;
    number_template_number: z.ZodString;
    payment_method: z.ZodString;
    payment_form: z.ZodString;
    payment_type_mexico: z.ZodString;
    cfdi_use_mexico: z.ZodString;
    regime_client_mexico: z.ZodString;
    invoice_type: z.ZodString;
    purchase_order_number_colombia: z.ZodString;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    invoice_id: z.ZodString;
    timbrar_o_expedir_al_abrir: z.ZodBoolean;
}, z.core.$strip>, string>)[];
//# sourceMappingURL=alegraInvoices.d.ts.map
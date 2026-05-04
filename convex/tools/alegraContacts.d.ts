import { z } from 'zod';
export declare const alegraCreateContactArgsSchema: z.ZodObject<{
    use_chile_contact_schema: z.ZodEnum<{
        "": "";
        yes: "yes";
    }>;
    chile_facturacion_electronica: z.ZodEnum<{
        "": "";
        yes: "yes";
        no: "no";
    }>;
    chile_giro: z.ZodString;
    chile_address_region: z.ZodString;
    chile_address_commune: z.ZodString;
    chile_address_city: z.ZodString;
    kind_of_person: z.ZodEnum<{
        "": "";
        LEGAL_ENTITY: "LEGAL_ENTITY";
        PERSON_ENTITY: "PERSON_ENTITY";
        OTHER_ENTITY: "OTHER_ENTITY";
    }>;
    regime: z.ZodEnum<{
        "": "";
        COMMON_REGIME: "COMMON_REGIME";
        SIMPLIFIED_REGIME: "SIMPLIFIED_REGIME";
        NATIONAL_CONSUMPTION_TAX: "NATIONAL_CONSUMPTION_TAX";
        NOT_REPONSIBLE_FOR_CONSUMPTION: "NOT_REPONSIBLE_FOR_CONSUMPTION";
        INC_IVA_RESPONSIBLE: "INC_IVA_RESPONSIBLE";
        SPECIAL_REGIME: "SPECIAL_REGIME";
    }>;
    name: z.ZodString;
    person_first_name: z.ZodString;
    person_second_name: z.ZodString;
    person_last_name: z.ZodString;
    identification: z.ZodString;
    identification_document_type: z.ZodEnum<{
        GENERIC: "GENERIC";
        CC: "CC";
        NIT: "NIT";
        TI: "TI";
        CE: "CE";
        PP: "PP";
        RC: "RC";
        DIE: "DIE";
        TE: "TE";
        FOREIGN_NIT: "FOREIGN_NIT";
        NUIP: "NUIP";
        CUIT: "CUIT";
        CDI: "CDI";
        CI: "CI";
        PASSPORT: "PASSPORT";
        DNI: "DNI";
        OTHER: "OTHER";
    }>;
    identification_type_natural_language: z.ZodString;
    identification_dv: z.ZodString;
    colombia_iva_condition: z.ZodString;
    email: z.ZodString;
    email_secondary: z.ZodString;
    phone_primary: z.ZodString;
    phone_secondary: z.ZodString;
    mobile: z.ZodString;
    contact_kind: z.ZodEnum<{
        client: "client";
        provider: "provider";
        both: "both";
    }>;
    address_line: z.ZodString;
    address_department: z.ZodString;
    address_city: z.ZodString;
    address_country: z.ZodString;
    address_zip: z.ZodString;
    observations: z.ZodString;
}, z.core.$strip>;
export type AlegraCreateContactArgs = z.infer<typeof alegraCreateContactArgsSchema>;
export declare function validateContactCreationPreSubmit(args: AlegraCreateContactArgs): {
    errors: string[];
};
/**
 * GET /contacts — listado de contactos (clientes/proveedores).
 * https://developer.alegra.com/reference/listcontacts-1
 */
export declare function createAlegraListContactsTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    query: z.ZodString;
    type_filter: z.ZodEnum<{
        "": "";
        client: "client";
        provider: "provider";
    }>;
    limit: z.ZodNumber;
    start: z.ZodNumber;
    mode: z.ZodEnum<{
        "": "";
        simple: "simple";
        advanced: "advanced";
    }>;
}, z.core.$strip>, string>;
/**
 * POST /contacts — crear contacto.
 * https://developer.alegra.com/reference/post_contacts
 */
export declare function createAlegraCreateContactTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    use_chile_contact_schema: z.ZodEnum<{
        "": "";
        yes: "yes";
    }>;
    chile_facturacion_electronica: z.ZodEnum<{
        "": "";
        yes: "yes";
        no: "no";
    }>;
    chile_giro: z.ZodString;
    chile_address_region: z.ZodString;
    chile_address_commune: z.ZodString;
    chile_address_city: z.ZodString;
    kind_of_person: z.ZodEnum<{
        "": "";
        LEGAL_ENTITY: "LEGAL_ENTITY";
        PERSON_ENTITY: "PERSON_ENTITY";
        OTHER_ENTITY: "OTHER_ENTITY";
    }>;
    regime: z.ZodEnum<{
        "": "";
        COMMON_REGIME: "COMMON_REGIME";
        SIMPLIFIED_REGIME: "SIMPLIFIED_REGIME";
        NATIONAL_CONSUMPTION_TAX: "NATIONAL_CONSUMPTION_TAX";
        NOT_REPONSIBLE_FOR_CONSUMPTION: "NOT_REPONSIBLE_FOR_CONSUMPTION";
        INC_IVA_RESPONSIBLE: "INC_IVA_RESPONSIBLE";
        SPECIAL_REGIME: "SPECIAL_REGIME";
    }>;
    name: z.ZodString;
    person_first_name: z.ZodString;
    person_second_name: z.ZodString;
    person_last_name: z.ZodString;
    identification: z.ZodString;
    identification_document_type: z.ZodEnum<{
        GENERIC: "GENERIC";
        CC: "CC";
        NIT: "NIT";
        TI: "TI";
        CE: "CE";
        PP: "PP";
        RC: "RC";
        DIE: "DIE";
        TE: "TE";
        FOREIGN_NIT: "FOREIGN_NIT";
        NUIP: "NUIP";
        CUIT: "CUIT";
        CDI: "CDI";
        CI: "CI";
        PASSPORT: "PASSPORT";
        DNI: "DNI";
        OTHER: "OTHER";
    }>;
    identification_type_natural_language: z.ZodString;
    identification_dv: z.ZodString;
    colombia_iva_condition: z.ZodString;
    email: z.ZodString;
    email_secondary: z.ZodString;
    phone_primary: z.ZodString;
    phone_secondary: z.ZodString;
    mobile: z.ZodString;
    contact_kind: z.ZodEnum<{
        client: "client";
        provider: "provider";
        both: "both";
    }>;
    address_line: z.ZodString;
    address_department: z.ZodString;
    address_city: z.ZodString;
    address_country: z.ZodString;
    address_zip: z.ZodString;
    observations: z.ZodString;
}, z.core.$strip>, string>;
/**
 * GET /contacts/{id} — detalle de un contacto.
 * https://developer.alegra.com/reference/contactsdetails-1
 */
export declare function createAlegraGetContactTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    contact_id: z.ZodString;
    fields_extra: z.ZodEnum<{
        "": "";
        url: "url";
        statementLink: "statementLink";
        "statementLink,url": "statementLink,url";
    }>;
}, z.core.$strip>, string>;
export declare function createContactExtractionValidationTool(): import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    use_chile_contact_schema: z.ZodEnum<{
        "": "";
        yes: "yes";
    }>;
    chile_facturacion_electronica: z.ZodEnum<{
        "": "";
        yes: "yes";
        no: "no";
    }>;
    chile_giro: z.ZodString;
    chile_address_region: z.ZodString;
    chile_address_commune: z.ZodString;
    chile_address_city: z.ZodString;
    kind_of_person: z.ZodEnum<{
        "": "";
        LEGAL_ENTITY: "LEGAL_ENTITY";
        PERSON_ENTITY: "PERSON_ENTITY";
        OTHER_ENTITY: "OTHER_ENTITY";
    }>;
    regime: z.ZodEnum<{
        "": "";
        COMMON_REGIME: "COMMON_REGIME";
        SIMPLIFIED_REGIME: "SIMPLIFIED_REGIME";
        NATIONAL_CONSUMPTION_TAX: "NATIONAL_CONSUMPTION_TAX";
        NOT_REPONSIBLE_FOR_CONSUMPTION: "NOT_REPONSIBLE_FOR_CONSUMPTION";
        INC_IVA_RESPONSIBLE: "INC_IVA_RESPONSIBLE";
        SPECIAL_REGIME: "SPECIAL_REGIME";
    }>;
    name: z.ZodString;
    person_first_name: z.ZodString;
    person_second_name: z.ZodString;
    person_last_name: z.ZodString;
    identification: z.ZodString;
    identification_document_type: z.ZodEnum<{
        GENERIC: "GENERIC";
        CC: "CC";
        NIT: "NIT";
        TI: "TI";
        CE: "CE";
        PP: "PP";
        RC: "RC";
        DIE: "DIE";
        TE: "TE";
        FOREIGN_NIT: "FOREIGN_NIT";
        NUIP: "NUIP";
        CUIT: "CUIT";
        CDI: "CDI";
        CI: "CI";
        PASSPORT: "PASSPORT";
        DNI: "DNI";
        OTHER: "OTHER";
    }>;
    identification_type_natural_language: z.ZodString;
    identification_dv: z.ZodString;
    colombia_iva_condition: z.ZodString;
    email: z.ZodString;
    email_secondary: z.ZodString;
    phone_primary: z.ZodString;
    phone_secondary: z.ZodString;
    mobile: z.ZodString;
    contact_kind: z.ZodEnum<{
        client: "client";
        provider: "provider";
        both: "both";
    }>;
    address_line: z.ZodString;
    address_department: z.ZodString;
    address_city: z.ZodString;
    address_country: z.ZodString;
    address_zip: z.ZodString;
    observations: z.ZodString;
    notas_sobre_lectura: z.ZodString;
}, z.core.$strip>, string>;
export declare function createAlegraContactTools(): (import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    query: z.ZodString;
    type_filter: z.ZodEnum<{
        "": "";
        client: "client";
        provider: "provider";
    }>;
    limit: z.ZodNumber;
    start: z.ZodNumber;
    mode: z.ZodEnum<{
        "": "";
        simple: "simple";
        advanced: "advanced";
    }>;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    use_chile_contact_schema: z.ZodEnum<{
        "": "";
        yes: "yes";
    }>;
    chile_facturacion_electronica: z.ZodEnum<{
        "": "";
        yes: "yes";
        no: "no";
    }>;
    chile_giro: z.ZodString;
    chile_address_region: z.ZodString;
    chile_address_commune: z.ZodString;
    chile_address_city: z.ZodString;
    kind_of_person: z.ZodEnum<{
        "": "";
        LEGAL_ENTITY: "LEGAL_ENTITY";
        PERSON_ENTITY: "PERSON_ENTITY";
        OTHER_ENTITY: "OTHER_ENTITY";
    }>;
    regime: z.ZodEnum<{
        "": "";
        COMMON_REGIME: "COMMON_REGIME";
        SIMPLIFIED_REGIME: "SIMPLIFIED_REGIME";
        NATIONAL_CONSUMPTION_TAX: "NATIONAL_CONSUMPTION_TAX";
        NOT_REPONSIBLE_FOR_CONSUMPTION: "NOT_REPONSIBLE_FOR_CONSUMPTION";
        INC_IVA_RESPONSIBLE: "INC_IVA_RESPONSIBLE";
        SPECIAL_REGIME: "SPECIAL_REGIME";
    }>;
    name: z.ZodString;
    person_first_name: z.ZodString;
    person_second_name: z.ZodString;
    person_last_name: z.ZodString;
    identification: z.ZodString;
    identification_document_type: z.ZodEnum<{
        GENERIC: "GENERIC";
        CC: "CC";
        NIT: "NIT";
        TI: "TI";
        CE: "CE";
        PP: "PP";
        RC: "RC";
        DIE: "DIE";
        TE: "TE";
        FOREIGN_NIT: "FOREIGN_NIT";
        NUIP: "NUIP";
        CUIT: "CUIT";
        CDI: "CDI";
        CI: "CI";
        PASSPORT: "PASSPORT";
        DNI: "DNI";
        OTHER: "OTHER";
    }>;
    identification_type_natural_language: z.ZodString;
    identification_dv: z.ZodString;
    colombia_iva_condition: z.ZodString;
    email: z.ZodString;
    email_secondary: z.ZodString;
    phone_primary: z.ZodString;
    phone_secondary: z.ZodString;
    mobile: z.ZodString;
    contact_kind: z.ZodEnum<{
        client: "client";
        provider: "provider";
        both: "both";
    }>;
    address_line: z.ZodString;
    address_department: z.ZodString;
    address_city: z.ZodString;
    address_country: z.ZodString;
    address_zip: z.ZodString;
    observations: z.ZodString;
}, z.core.$strip>, string> | import("@openai/agents-core").FunctionTool<unknown, z.ZodObject<{
    contact_id: z.ZodString;
    fields_extra: z.ZodEnum<{
        "": "";
        url: "url";
        statementLink: "statementLink";
        "statementLink,url": "statementLink,url";
    }>;
}, z.core.$strip>, string>)[];
//# sourceMappingURL=alegraContacts.d.ts.map
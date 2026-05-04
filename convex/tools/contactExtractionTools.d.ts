import { z } from 'zod';
/**
 * Valida los campos extraídos de un PDF (p. ej. certificado RUT Chile) antes de
 * pedir confirmación al usuario o llamar **crear_contacto_alegra**.
 */
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
//# sourceMappingURL=contactExtractionTools.d.ts.map
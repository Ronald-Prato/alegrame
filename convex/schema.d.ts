/** Turnos de texto en la ventana del modelo. */
export declare const plainContextTurn: import("convex/values").VObject<{
    role: "user" | "assistant";
    content: string;
}, {
    role: import("convex/values").VUnion<"user" | "assistant", [import("convex/values").VLiteral<"user", "required">, import("convex/values").VLiteral<"assistant", "required">], "required", never>;
    content: import("convex/values").VString<string, "required">;
}, "required", "role" | "content">;
/** Resultado opaco de `responses.compact` (OpenAI Agents SDK). */
export declare const compactionContextTurn: import("convex/values").VObject<{
    kind: "compaction";
    payloadJson: string;
}, {
    kind: import("convex/values").VLiteral<"compaction", "required">;
    payloadJson: import("convex/values").VString<string, "required">;
}, "required", "kind" | "payloadJson">;
export declare const conversationContextTurn: import("convex/values").VUnion<{
    role: "user" | "assistant";
    content: string;
} | {
    kind: "compaction";
    payloadJson: string;
}, [import("convex/values").VObject<{
    role: "user" | "assistant";
    content: string;
}, {
    role: import("convex/values").VUnion<"user" | "assistant", [import("convex/values").VLiteral<"user", "required">, import("convex/values").VLiteral<"assistant", "required">], "required", never>;
    content: import("convex/values").VString<string, "required">;
}, "required", "role" | "content">, import("convex/values").VObject<{
    kind: "compaction";
    payloadJson: string;
}, {
    kind: import("convex/values").VLiteral<"compaction", "required">;
    payloadJson: import("convex/values").VString<string, "required">;
}, "required", "kind" | "payloadJson">], "required", "role" | "content" | "kind" | "payloadJson">;
declare const _default: import("convex/server").SchemaDefinition<{
    conversations: import("convex/server").TableDefinition<import("convex/values").VObject<{
        ownerSessionId: string;
        title: string;
        messages: ({
            role: "user" | "assistant";
            content: string;
        } | {
            kind: "compaction";
            payloadJson: string;
        })[];
    }, {
        /** Agrupa conversaciones por cliente (p. ej. localStorage) sin auth */
        ownerSessionId: import("convex/values").VString<string, "required">;
        title: import("convex/values").VString<string, "required">;
        /** Ventana enviada al agente; puede incluir items `responses.compact` (kind compaction). */
        messages: import("convex/values").VArray<({
            role: "user" | "assistant";
            content: string;
        } | {
            kind: "compaction";
            payloadJson: string;
        })[], import("convex/values").VUnion<{
            role: "user" | "assistant";
            content: string;
        } | {
            kind: "compaction";
            payloadJson: string;
        }, [import("convex/values").VObject<{
            role: "user" | "assistant";
            content: string;
        }, {
            role: import("convex/values").VUnion<"user" | "assistant", [import("convex/values").VLiteral<"user", "required">, import("convex/values").VLiteral<"assistant", "required">], "required", never>;
            content: import("convex/values").VString<string, "required">;
        }, "required", "role" | "content">, import("convex/values").VObject<{
            kind: "compaction";
            payloadJson: string;
        }, {
            kind: import("convex/values").VLiteral<"compaction", "required">;
            payloadJson: import("convex/values").VString<string, "required">;
        }, "required", "kind" | "payloadJson">], "required", "role" | "content" | "kind" | "payloadJson">, "required">;
    }, "required", "ownerSessionId" | "title" | "messages">, {
        by_owner: ["ownerSessionId", "_creationTime"];
    }, {}, {}>;
    /** Historial completo de la UI; cada turno usuario/asistente es una fila (no se compacta aquí). */
    messages: import("convex/server").TableDefinition<import("convex/values").VObject<{
        streaming?: boolean;
        toolEvents?: {
            inputSummary?: string;
            outputSummary?: string;
            errorMessage?: string;
            callId: string;
            toolName: string;
            status: "running" | "done" | "error";
        }[];
        uiLogKind?: "conversation_compacted";
        role: "user" | "assistant";
        content: string;
        conversationId: import("convex/values").GenericId<"conversations">;
    }, {
        conversationId: import("convex/values").VId<import("convex/values").GenericId<"conversations">, "required">;
        role: import("convex/values").VUnion<"user" | "assistant", [import("convex/values").VLiteral<"user", "required">, import("convex/values").VLiteral<"assistant", "required">], "required", never>;
        content: import("convex/values").VString<string, "required">;
        streaming: import("convex/values").VBoolean<boolean | undefined, "optional">;
        /** Llamadas a herramientas durante esta respuesta del asistente (telemetría UI). */
        toolEvents: import("convex/values").VArray<{
            inputSummary?: string;
            outputSummary?: string;
            errorMessage?: string;
            callId: string;
            toolName: string;
            status: "running" | "done" | "error";
        }[] | undefined, import("convex/values").VObject<{
            inputSummary?: string;
            outputSummary?: string;
            errorMessage?: string;
            callId: string;
            toolName: string;
            status: "running" | "done" | "error";
        }, {
            callId: import("convex/values").VString<string, "required">;
            toolName: import("convex/values").VString<string, "required">;
            status: import("convex/values").VUnion<"running" | "done" | "error", [import("convex/values").VLiteral<"running", "required">, import("convex/values").VLiteral<"done", "required">, import("convex/values").VLiteral<"error", "required">], "required", never>;
            inputSummary: import("convex/values").VString<string | undefined, "optional">;
            outputSummary: import("convex/values").VString<string | undefined, "optional">;
            errorMessage: import("convex/values").VString<string | undefined, "optional">;
        }, "required", "callId" | "toolName" | "status" | "inputSummary" | "outputSummary" | "errorMessage">, "optional">;
        /** Marcador solo para líneas de sistema en el hilo visible. */
        uiLogKind: import("convex/values").VUnion<"conversation_compacted" | undefined, [import("convex/values").VLiteral<"conversation_compacted", "required">], "optional", never>;
    }, "required", "role" | "content" | "conversationId" | "streaming" | "toolEvents" | "uiLogKind">, {
        by_conversation: ["conversationId", "_creationTime"];
    }, {}, {}>;
}, true>;
export default _default;
//# sourceMappingURL=schema.d.ts.map
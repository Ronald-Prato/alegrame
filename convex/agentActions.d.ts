import type { Id } from "./_generated/dataModel";
export declare const sendMessage: import("convex/server").RegisteredAction<"public", {
    rutPdf?: {
        filename: string;
        dataUrl: string;
    };
    content: string;
    ownerSessionId: string;
    conversationId: import("convex/values").GenericId<"conversations">;
}, Promise<{
    ok: true;
    messageId: Id<"messages">;
    error?: never;
} | {
    ok: false;
    messageId: Id<"messages">;
    error: string;
}>>;
//# sourceMappingURL=agentActions.d.ts.map
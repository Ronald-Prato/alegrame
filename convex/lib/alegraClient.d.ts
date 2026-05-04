/** HTTP helpers para la API REST Alegra (https://developer.alegra.com/reference/get_items). */
export declare function basicAuthHeader(email: string, token: string): string;
export declare function getAlegraCredentials(): {
    ok: true;
    email: string;
    token: string;
} | {
    ok: false;
    error: string;
};
export declare function alegraJsonRequest(method: 'GET' | 'POST' | 'PUT', path: string, body?: Record<string, unknown>): Promise<unknown>;
//# sourceMappingURL=alegraClient.d.ts.map
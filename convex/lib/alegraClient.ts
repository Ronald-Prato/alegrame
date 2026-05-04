/** HTTP helpers para la API REST Alegra (https://developer.alegra.com/reference/get_items). */

export function basicAuthHeader(email: string, token: string): string {
  const raw = `${email.trim()}:${token.trim()}`
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`
}

export function getAlegraCredentials():
  | { ok: true; email: string; token: string }
  | { ok: false; error: string } {
  const email = process.env.ALEGRA_API_EMAIL ?? ''
  const token = process.env.ALEGRA_API_TOKEN ?? ''
  if (!email.trim() || !token.trim()) {
    return {
      ok: false,
      error:
        'Faltan ALEGRA_API_EMAIL o ALEGRA_API_TOKEN en las variables de entorno de Convex.',
    }
  }
  return { ok: true, email: email.trim(), token: token.trim() }
}

export async function alegraJsonRequest(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const cred = getAlegraCredentials()
  if (!cred.ok) return { error: cred.error }

  const url = `https://api.alegra.com/api/v1${path.startsWith('/') ? path : `/${path}`}`
  const init: RequestInit = {
    method,
    headers: {
      Authorization: basicAuthHeader(cred.email, cred.token),
      Accept: 'application/json',
      ...(body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }

  const res = await fetch(url, init)
  const parsed: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const errBody = parsed as Record<string, unknown> | null
    return {
      error:
        (typeof errBody?.error === 'string' && errBody.error) ||
        (typeof errBody?.message === 'string' && errBody.message) ||
        `HTTP ${res.status}`,
      status: res.status,
      details: parsed,
    }
  }

  return parsed
}

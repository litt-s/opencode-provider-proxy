import type { ProxyState } from "./config.js"

const PATCH_FLAG = "__opencodeProviderProxyPatched"

type Undici = {
  fetch: (input: unknown, init?: Record<string, unknown>) => Promise<Response>
  ProxyAgent: new (url: string) => unknown
}

let undiciPromise: Promise<Undici | null> | null = null

export function isBun(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
}

export function loadUndici(hint: string): Promise<Undici | null> {
  if (!undiciPromise) {
    undiciPromise = import("undici")
      .then((mod) => mod as unknown as Undici)
      .catch((error) => {
        console.error(`[provider-proxy] undici is required under Node. ${hint}`, error)
        return null
      })
  }
  return undiciPromise
}

const agents = new Map<string, unknown>()

function getAgent(undici: Undici, proxy: string): unknown {
  let agent = agents.get(proxy)
  if (!agent) {
    agent = new undici.ProxyAgent(proxy)
    agents.set(proxy, agent)
  }
  return agent
}

function log(state: ProxyState, ...args: unknown[]): void {
  if (state.debug) console.error("[provider-proxy]", ...args)
}

function modelFromBody(body: unknown): string | null {
  if (body == null) return null
  try {
    let text: string | null = null
    if (typeof body === "string") text = body
    else if (body instanceof Uint8Array) text = new TextDecoder().decode(body)
    else if (body instanceof ArrayBuffer) text = new TextDecoder().decode(body)
    if (!text) return null
    const parsed = JSON.parse(text) as { model?: unknown }
    return typeof parsed.model === "string" ? parsed.model : null
  } catch {
    return null
  }
}

async function modelFromRequest(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<string | null> {
  const fromInit = modelFromBody(init?.body)
  if (fromInit) return fromInit
  if (input instanceof Request && !input.bodyUsed) {
    try {
      return modelFromBody(await input.clone().text())
    } catch {
      return null
    }
  }
  return null
}

async function normalizeRequest(
  request: Request,
  init?: RequestInit,
): Promise<{ url: string; init: RequestInit }> {
  const headers = new Headers(request.headers)
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  }

  let body = init?.body ?? undefined
  if (
    body === undefined &&
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    !request.bodyUsed
  ) {
    try {
      body = await request.clone().arrayBuffer()
    } catch {
      body = undefined
    }
  }

  return {
    url: request.url,
    init: {
      ...init,
      method: init?.method ?? request.method,
      headers,
      body,
      signal: init?.signal ?? request.signal,
      redirect: init?.redirect ?? request.redirect,
    },
  }
}

export function installFetchPatch(state: ProxyState): void {
  const target = globalThis as typeof globalThis & Record<string, unknown>
  if (target[PATCH_FLAG]) return

  const bun = isBun()
  const original = globalThis.fetch.bind(globalThis) as typeof fetch

  target.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      input instanceof Request
        ? input.url
        : typeof input === "string"
          ? input
          : input.toString()

    const proxy = state.matchProxy(url)
    if (!proxy) return original(input, init)

    const model = await modelFromRequest(input, init)
    if (state.shouldBypassForModel(url, model)) {
      log(state, "direct by model", model, url.slice(0, 80))
      return original(input, init)
    }

    log(state, "proxy", url.slice(0, 90), "->", proxy)

    if (bun) {
      return original(input, { ...init, proxy } as RequestInit)
    }

    const undici = await loadUndici('Run "npm install undici" in your opencode config directory.')
    if (!undici) return original(input, init)

    const agent = getAgent(undici, proxy)

    if (input instanceof Request) {
      const normalized = await normalizeRequest(input, init)
      return undici.fetch(normalized.url, {
        ...(normalized.init as Record<string, unknown>),
        dispatcher: agent,
      })
    }

    return undici.fetch(input, { ...(init as Record<string, unknown>), dispatcher: agent })
  }) as typeof fetch

  target[PATCH_FLAG] = true
}

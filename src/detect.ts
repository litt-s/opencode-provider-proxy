import { execFile } from "node:child_process"
import { connect } from "node:net"

/** Well-known local proxy ports: Clash, Clash Verge, Mihomo, V2Ray/Xray, sing-box, ... */
export const COMMON_PROXY_PORTS = [
  7890, 7891, 7897, 7899, 10808, 10809, 1080, 2080, 8889, 8080, 20171,
]

export function toProxyUrl(value: string): string | null {
  let raw = value.trim()
  if (!raw) return null

  if (raw.includes("=")) {
    const entries = raw
      .split(";")
      .map((part) => part.split("="))
      .filter((pair) => pair.length === 2)
      .map(([key, val]) => [key.trim().toLowerCase(), (val ?? "").trim()] as const)
    raw = (entries.find(([key]) => key === "https") ?? entries.find(([key]) => key === "http"))?.[1] ?? ""
  }

  if (!raw) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `http://${raw}`

  try {
    new URL(raw)
    return raw
  } catch {
    return null
  }
}

function regQuery(name: string): Promise<string | null> {
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
  return new Promise((resolve) => {
    execFile("reg", ["query", key, "/v", name], { windowsHide: true }, (error, stdout) => {
      if (error || !stdout) return resolve(null)
      const match = stdout.match(new RegExp(`${name}\\s+REG_\\w+\\s+(.+)`))
      resolve(match?.[1]?.trim() ?? null)
    })
  })
}

/** Read the Windows system (WinINET) proxy, if enabled. */
export async function detectSystemProxy(): Promise<string | null> {
  if (process.platform !== "win32") return null
  const enabled = await regQuery("ProxyEnable")
  if (!enabled || enabled === "0x0") return null
  const server = await regQuery("ProxyServer")
  if (!server) return null
  return toProxyUrl(server)
}

/**
 * Check whether a local port speaks HTTP proxy. Sends a CONNECT for a discard
 * port and looks for an HTTP status line, so a random open service is not
 * mistaken for a proxy.
 */
function looksLikeHttpProxy(port: number, timeout = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port })
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }

    socket.setTimeout(timeout)
    socket.once("connect", () => {
      socket.write("CONNECT 127.0.0.1:9 HTTP/1.1\r\nHost: 127.0.0.1:9\r\n\r\n")
    })
    socket.once("data", (chunk) => finish(chunk.toString("utf8").startsWith("HTTP/")))
    socket.once("timeout", () => finish(false))
    socket.once("error", () => finish(false))
    socket.once("close", () => finish(false))
  })
}

/** Probe common local proxy ports, verifying each one actually speaks HTTP proxy. */
export async function detectLocalProxy(
  ports: number[] = COMMON_PROXY_PORTS,
): Promise<string | null> {
  const results = await Promise.all(
    ports.map(async (port) => ({ port, ok: await looksLikeHttpProxy(port) })),
  )
  const hit = results.find((result) => result.ok)
  return hit ? `http://127.0.0.1:${hit.port}` : null
}

export type DetectedProxy = {
  proxy: string
  source: string
}

/** Auto-detect a proxy from the Windows system settings, then common local ports. */
export async function detectProxy(ports?: number[]): Promise<DetectedProxy | null> {
  const system = await detectSystemProxy()
  if (system) return { proxy: system, source: "system proxy" }

  const local = await detectLocalProxy(ports)
  if (local) return { proxy: local, source: "local port probe" }

  return null
}

import { existsSync, readFileSync, watchFile } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import {
  DEFAULT_DIRECT_MODEL_HOSTS,
  DEFAULT_DIRECT_MODELS,
  DEFAULT_PROXIED_PROVIDERS,
  HOST_PATTERNS,
} from "./hosts.js"

export type ProxyOptions = {
  /** Proxy URL, e.g. `http://127.0.0.1:7890`. Falls back to HTTPS_PROXY/HTTP_PROXY/ALL_PROXY. */
  proxy?: string
  /** Provider ids that should go through the proxy. Defaults to the foreign providers. */
  providers?: string[]
  /** Extra hostname fragments to route through the proxy. */
  hosts?: string[]
  /** Model id fragments that should always connect directly. */
  directModels?: string[]
  /** Hosts the `directModels` rules apply to. Defaults to `["opencode.ai"]`. */
  directModelHosts?: string[]
  /** Explicit path to a JSON config file. */
  configFile?: string
  /** Auto-detect a proxy from system settings / common local ports when `proxy` is unset. Defaults to `true`. */
  autoDetect?: boolean
  /** Ports probed by auto-detection. Defaults to a list of well-known local proxy ports. */
  probePorts?: number[]
  /** Verbose logging. */
  debug?: boolean
}

export type Settings = ProxyOptions

export type Resolved = {
  settings: Settings
  file: string | null
}

export class ProxyState {
  rules = new Map<string, string>()
  directModels: string[] = []
  directModelHosts: string[] = []
  proxy: string | null = null
  debug = false
  active = false

  compile(settings: Settings): void {
    this.rules = new Map()
    this.directModels = []
    this.directModelHosts = []
    this.proxy = settings.proxy ?? null
    this.debug = settings.debug ?? false
    this.active = false

    if (this.proxy) {
      try {
        new URL(this.proxy)
      } catch {
        console.error(`[provider-proxy] invalid proxy URL: "${this.proxy}"`)
        this.proxy = null
      }
    }

    if (!this.proxy) return

    const seen = new Set<string>()
    const add = (pattern: string) => {
      const key = pattern.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      this.rules.set(key, this.proxy as string)
    }

    for (const provider of settings.providers ?? DEFAULT_PROXIED_PROVIDERS) {
      const patterns = HOST_PATTERNS[provider]
      if (!patterns) {
        console.error(
          `[provider-proxy] unknown provider "${provider}" - add its hosts to "hosts" instead`,
        )
        continue
      }
      for (const pattern of patterns) add(pattern)
    }

    for (const host of settings.hosts ?? []) add(host)

    this.directModels = (settings.directModels ?? DEFAULT_DIRECT_MODELS).map((model) =>
      model.toLowerCase(),
    )
    this.directModelHosts = (settings.directModelHosts ?? DEFAULT_DIRECT_MODEL_HOSTS).map((host) =>
      host.toLowerCase(),
    )

    this.active = this.rules.size > 0
  }

  matchProxy(url: string): string | null {
    if (!this.proxy) return null
    const lower = url.toLowerCase()
    for (const [pattern, proxy] of this.rules) {
      if (lower.includes(pattern)) return proxy
    }
    return null
  }

  shouldBypassForModel(url: string, model: string | null): boolean {
    if (!model || this.directModels.length === 0) return false
    const lowerUrl = url.toLowerCase()
    if (!this.directModelHosts.some((host) => lowerUrl.includes(host))) return false
    const lowerModel = model.toLowerCase()
    return this.directModels.some((pattern) => lowerModel.includes(pattern))
  }
}

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  return xdg ? join(xdg, "opencode") : join(homedir(), ".config", "opencode")
}

export function configCandidates(options: ProxyOptions): string[] {
  const paths: string[] = []
  if (options.configFile) {
    paths.push(isAbsolute(options.configFile) ? options.configFile : resolve(options.configFile))
  }
  if (process.env.OPENCODE_PROXY_CONFIG) paths.push(process.env.OPENCODE_PROXY_CONFIG)
  paths.push(join(configDir(), "provider-proxy.json"))
  paths.push(join(configDir(), "proxy.json"))
  return paths
}

export function readConfigFile(path: string): Settings | null {
  try {
    if (!existsSync(path)) return null
    const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    return JSON.parse(raw) as Settings
  } catch (error) {
    console.error(`[provider-proxy] failed to read ${path}`, error)
    return null
  }
}

function pick(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim() !== "")
}

export function resolveSettings(options: ProxyOptions): Resolved {
  let file: string | null = null
  let fromFile: Settings = {}

  for (const candidate of configCandidates(options)) {
    if (!existsSync(candidate)) continue
    const parsed = readConfigFile(candidate)
    if (parsed) {
      fromFile = parsed
      file = candidate
      break
    }
  }

  const envProxy =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy

  const settings: Settings = {
    proxy: pick(options.proxy, fromFile.proxy, envProxy),
    providers: options.providers ?? fromFile.providers,
    hosts: options.hosts ?? fromFile.hosts,
    directModels: options.directModels ?? fromFile.directModels,
    directModelHosts: options.directModelHosts ?? fromFile.directModelHosts,
    autoDetect: options.autoDetect ?? fromFile.autoDetect,
    probePorts: options.probePorts ?? fromFile.probePorts,
    debug: options.debug ?? fromFile.debug,
  }

  return { settings, file }
}

export function watchConfig(file: string, onChange: () => void): void {
  watchFile(file, { interval: 2000 }, () => onChange())
}

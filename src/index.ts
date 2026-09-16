import type { Plugin } from "@opencode-ai/plugin"
import {
  ProxyState,
  resolveSettings,
  watchConfig,
  type ProxyOptions,
  type Settings,
} from "./config.js"
import { detectProxy } from "./detect.js"
import { installFetchPatch, isBun, loadUndici } from "./proxy.js"

const plugin: Plugin = async (_input, rawOptions) => {
  const options = (rawOptions ?? {}) as ProxyOptions
  const state = new ProxyState()

  let detected: string | null = null

  const applySettings = (settings: Settings): void => {
    state.compile({ ...settings, proxy: settings.proxy ?? detected ?? undefined })
  }

  const ensureProxy = async (settings: Settings): Promise<void> => {
    if (settings.proxy) return
    if (settings.autoDetect === false) return

    const found = await detectProxy(settings.probePorts)
    if (!found) return

    detected = found.proxy
    console.error(`[provider-proxy] auto-detected ${found.source}: ${found.proxy}`)
  }

  const resolved = resolveSettings(options)
  await ensureProxy(resolved.settings)
  applySettings(resolved.settings)

  if (!state.proxy) {
    console.error(
      "[provider-proxy] no proxy configured; set `proxy` in the plugin options, a proxy.json file, HTTPS_PROXY, or keep autoDetect enabled",
    )
    return {}
  }

  if (state.rules.size === 0) {
    console.error("[provider-proxy] no matching provider hosts; plugin inactive")
    return {}
  }

  const bun = isBun()
  if (!bun) {
    const undici = await loadUndici(
      'Run "npm install undici" in your opencode config directory.',
    )
    if (!undici) {
      console.error("[provider-proxy] plugin inactive: undici unavailable")
      return {}
    }
  }

  installFetchPatch(state)

  if (resolved.file) {
    watchConfig(resolved.file, async () => {
      const next = resolveSettings(options)
      await ensureProxy(next.settings)
      applySettings(next.settings)
      if (state.debug) console.error("[provider-proxy] config reloaded from", resolved.file)
    })
  }

  console.error(
    `[provider-proxy] active: ${state.rules.size} host rules via ${bun ? "bun" : "undici"}` +
      (state.proxy ? ` (proxy: ${state.proxy})` : "") +
      (resolved.file ? ` (config: ${resolved.file})` : ""),
  )

  return {}
}

export default plugin

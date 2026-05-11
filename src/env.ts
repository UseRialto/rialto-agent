import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let loaded = false

export function loadLocalEnv() {
  if (loaded) return
  loaded = true

  for (const file of [join(process.cwd(), '.env.local'), join(process.cwd(), '.env'), join(process.cwd(), 'apps/web/.env.local')]) {
    if (!existsSync(file)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const index = line.indexOf('=')
      if (index <= 0) continue
      const key = line.slice(0, index).trim()
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key && process.env[key] == null) process.env[key] = value
    }
  }
}

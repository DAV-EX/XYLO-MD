import { getConfig, persistDefault } from './lib/configdb.ts'

interface ConfigCache {
  [key: string]: any
  SESSION_ID?: string
  PREFIX?: string
  MODE?: string
  CREATOR?: string
  OWNER_NUMBERS?: string[]
  MONGODB_URI?: string
  BOT_NAME?: string
  FOOTER?: string
  ANTIDELETE_MODE?: string
  AUTOVIEW_STATUS?: boolean
  AUTOLIKE_STATUS?: boolean
}

const defaults: Record<string, any> = {
  PREFIX: 'N',
  MODE: 'public',
  CREATOR: '2349133354644t',
  OWNER_NUMBERS: ['2349133354644'],
  MONGODB_URI: '',
  BOT_NAME: 'Xylo-MD',
  FOOTER: '© Powered by DavidX',
  ANTIDELETE_MODE: 'off',
  AUTOVIEW_STATUS: false,
  AUTOLIKE_STATUS: false
}

let cache: ConfigCache = {}

const SESSION_ID = process.env.SESSION_ID || ''
cache.SESSION_ID = SESSION_ID 

async function initConfig() {
  for (const [key, defValue] of Object.entries(defaults)) {
    let value = await getConfig(key.toLowerCase())
    if (value === undefined) {
      value = defValue
      await persistDefault(key, value)
      console.log(`[Config ✅] ${key} = ${value} (default → saved)`)
    } else {
      console.log(`[Config ✅] ${key} = ${value} (DB)`)
    }
    cache[key.toUpperCase()] = value
  }
}

export function updateCache(key: string, value: any) {
  cache[key.toUpperCase()] = value
}

const config: ConfigCache = new Proxy({} as ConfigCache, {
  get(_, prop: string) {
    return cache[prop.toUpperCase()]
  },
  set() {
    throw new Error('Use setConfig() to change values, not direct assignment')
  }
})

export default config

initConfig().catch(err => {
  console.error('🚫 Failed to initialize config:', err)
})
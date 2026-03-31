import { getConfig, persistDefault, isDbConnected } from './lib/configdb.ts'

interface ConfigCache {
  [key: string]: any
  SESSION_ID?: string
  PREFIX?: string
  MODE?: string
  CREATOR?: string
  OWNER_NUMBERS?: string[]
  BOT_NAME?: string
  FOOTER?: string
  ANTIDELETE_MODE?: string
  AUTOVIEW_STATUS?: boolean
  AUTOLIKE_STATUS?: boolean
  AUTOREACT?: boolean
  CUSTOM_REACT_EMOJIS?: string
  BOT_IMAGE?: string
}

const defaults: Record<string, any> = {
  PREFIX: '.',
  MODE: 'public',
  CREATOR: '2349133354644',
  OWNER_NUMBERS: ['2349133354644'],
  BOT_NAME: '𝐗𝐘𝐋𝐎-𝐌𝐃',
  FOOTER: '© 𝒑𝒐𝒘𝒆𝒓𝒆𝒅 𝒃𝒚 𝑫𝒂𝒗𝒊𝒅𝑿𝑻𝒆𝒄𝒉',
  ANTIDELETE_MODE: 'off',
  ANTIDELETE_SCOPE: 'all',
  ANTIDSTATUS_MODE: 'off',
  AUTOVIEW_STATUS: false,
  AUTOLIKE_STATUS: false,
  AUTOREACT: false,
  CUSTOM_REACT_EMOJIS: '',
  MENU_THEME: 'random',
  ALWAYS_ONLINE: false,
  AUTO_TYPING: false,
  AUTO_RECORDING: false,
  BOT_IMAGE: ''
}

let cache: ConfigCache = {}

const SESSION_ID = process.env.SESSION_ID || ''
cache.SESSION_ID = SESSION_ID

async function initConfig() {
  if (!isDbConnected()) {
    console.warn('[Config ⚠️] DB not connected — loading all defaults instantly')
    for (const [key, defValue] of Object.entries(defaults)) {
      cache[key.toUpperCase()] = defValue
    }
    return
  }

  let loaded = 0
  let defaulted = 0
  for (const [key, defValue] of Object.entries(defaults)) {
    try {
      let value = await getConfig(key.toLowerCase())
      if (value === undefined) {
        value = defValue
        await persistDefault(key, value)
        defaulted++
      } else {
        if (key === 'FOOTER' && typeof value === 'string' && value.startsWith(' ')) {
          value = value.trimStart()
          await persistDefault(key, value)
        }
        loaded++
      }
      cache[key.toUpperCase()] = value
    } catch (err: any) {
      cache[key.toUpperCase()] = defValue
      defaulted++
    }
  }
  const total = loaded + defaulted
  console.log(`  \x1b[90m${new Date().toTimeString().slice(0,8)}\x1b[0m  \x1b[32m✔\x1b[0m  \x1b[1m${'Config'.padEnd(12)}\x1b[0m  \x1b[32m${total} keys loaded\x1b[0m  \x1b[90m(${loaded} from DB, ${defaulted} defaults)\x1b[0m`)
}

export function updateCache(key: string, value: any) {
  cache[key.toUpperCase()] = value
}

export async function initConfigFromDB() {
  await initConfig()
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

import config from '../config.ts'
import os from 'os'
import moment from 'moment'
import ms from 'ms'

import mongoose from 'mongoose'
import { lidToPhone } from '../lib/lidUtils.ts'
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({ userId: String, coins: { type: Number, default: 100 }, spouse: String, customTag: String }))

const prefix = config.PREFIX
const startTime = Date.now()

export default [
  {
    name: 'botinfo',
    description: 'Get info about the bot',
    category: 'info',
    handler: async ({ msg, Dave, from }) => {
      const uptime = ms(Date.now() - startTime, { long: true })
      const text = `🤖 *Bot Info*\n\n• Name: XYLO-MD\n• Mode: ${config.MODE}\n• Prefix: ${config.PREFIX}\n• Platform: ${os.platform()}\n• Uptime: ${uptime}\n• Memory: ${(os.totalmem() / 1024 / 1024).toFixed(2)} MB`
      await Dave.sendMessage(from, { text }, { quoted: msg })
    }
  },

  {
    name: 'groupinfo',
    description: 'Get info about the group',
    category: 'info',
    handler: async ({ msg, Dave, from, isGroup, groupMetadata }) => {
      if (!isGroup) {
        return Dave.sendMessage(from, { text: '❗ This command is for groups only.' }, { quoted: msg })
      }

      const { id, subject, creation, participants, owner } = groupMetadata
      const created = moment(creation * 1000).format('MMMM Do YYYY, h:mm:ss a')
      const size = participants.length
      
      const admins = participants.filter(p => p.admin)
      const adminList = admins.map(p => `@${Dave.decodeJid(p.id).split('@')[0]}`).join(', ')
      const ownerJid = owner ? Dave.decodeJid(owner) : 'Unknown'

      const info = `👥 *Group Info:*\n\n• *Name:* ${subject}\n• *ID:* ${id}\n• *Created:* ${created}\n• *Members:* ${size}\n• *Creator:* @${ownerJid.split('@')[0]}\n• *Admins:* ${adminList}`
      
      await Dave.sendMessage(from, { 
        text: info, 
        mentions: [ownerJid, ...admins.map(p => p.id)] 
      }, { quoted: msg })
    }
  },
  {
    name: 'whois',
    description: 'Get info about a user',
    alias: ['user'],
    category: 'info',
    handler: async ({ msg, Dave, from, isGroup, groupMetadata, reply, args }) => {
        try {
            // 1. Identify Target
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant
            const inputArg = args[0] ? args[0].replace(/[^0-9]/g, '') : null
            
            let rawTarget = mentioned || quoted || (inputArg ? `${inputArg}@s.whatsapp.net` : null) || msg.key.participant || msg.key.remoteJid
            
            // Standardize to @s.whatsapp.net (Crucial for Bio/Name)
            let targetJid = rawTarget.split(':')[0].split('@')[0] + '@s.whatsapp.net'
            const cleanPN = targetJid.split('@')[0]

            // 2. Force Fetch Name & Bio (The "Royboy" Fix)
            let userName = 'Unknown'
            let bio = 'No Bio / Private'

            // Check if it's the sender first
            if (targetJid === (msg.key.participant || msg.key.remoteJid)) {
                userName = msg.pushName || 'Unknown'
            } else {
                // Try to find the name in group metadata if in a group
                if (isGroup && groupMetadata?.participants) {
                    const p = groupMetadata.participants.find(v => v.id === targetJid)
                    // Note: Baileys usually doesn't store PushNames in groupMetadata 
                    // unless that person has spoken recently.
                }
                userName = `@${cleanPN}` // Default to @Number if name is cached nowhere
            }

            // 3. Fetch Bio (About) - Using the standardized JID
            try {
                const status = await Dave.fetchStatus(targetJid)
                if (status && status.status) {
                    bio = status.status
                }
            } catch (e) {
                // If it fails, it's 99% a privacy setting ("My Contacts" only)
                bio = '🔒 Private'
            }

            // 4. Fetch Profile Picture
            let pfp = 'https://i.ibb.co/j3pRQf6/user.png'
            try {
                pfp = await Dave.profilePictureUrl(targetJid, 'image')
            } catch {}

            // 5. Database Lookup
            const user = await User.findOne({ userId: targetJid })
            
            // 6. Role in group
            let role = 'N/A'
            if (isGroup && groupMetadata?.participants) {
                const uData = groupMetadata.participants.find(u => u.id === targetJid)
                if (uData) role = uData.admin ? '🛡 Admin' : '👤 Member'
            }

            const text = `👤 *User Info*\n\n• *Number:* ${cleanPN}\n• *Name:* ${userName}\n• *About:* ${bio}\n• *Role:* ${role}\n• *Coins:* ${user?.coins || 0}\n• *Tag:* ${user?.customTag || 'None'}`

            await Dave.sendMessage(from, { 
                image: { url: pfp }, 
                caption: text, 
                mentions: [targetJid] 
            }, { quoted: msg })

        } catch (e) {
            console.error(e)
            reply('❌ Error fetching info.')
        }
    }
},

  {

    name: 'admins',

    description: 'List all admins in the group',

    category: 'info',

    handler: async ({ msg, Dave, from, isGroup, groupMetadata, reply }) => {

      if (!isGroup) return reply('❗ This command is group-only.')

      const participants = groupMetadata?.participants

      if (!participants || !Array.isArray(participants)) {

        return reply('❗ Participants info not available.')

      }

      const admins = participants.filter(p => p.admin).map(p => `• @${p.id.split('@')[0]}`)

      if (admins.length === 0) return reply('No admins found.')

      await Dave.sendMessage(from, {

        text: `👮 *Group Admins:*\n\n${admins.join('\n')}`,

        mentions: participants.filter(p => p.admin).map(p => p.id)

      }, { quoted: msg })

    }

  }
    
]

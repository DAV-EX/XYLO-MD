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
    description: 'Get info about a user (works in groups and DMs)',
    alias: ['user'],
    category: 'info',
    handler: async ({ msg, Dave, from, isGroup, groupMetadata, reply, args }) => {
        try {
            // 1. Identify the target
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant
            // If user types numbers, strip non-numeric chars
            const inputArg = args[0] ? args[0].replace(/[^0-9]/g, '') : null
            
            // Priority: Mention > Quoted > Input Number > Sender
            let rawTarget = mentioned || quoted || (inputArg ? `${inputArg}@s.whatsapp.net` : null) || msg.key?.participant || msg.key?.remoteJid
            
            if (!rawTarget) return reply('❌ Could not identify user.')

            // 2. Normalize JID (Convert LID to Phone if needed)
            // We need the ID in format: 123456789@s.whatsapp.net
            let targetJid = rawTarget
            if (rawTarget.includes('lid')) {
                targetJid = await lidToPhone(Dave, rawTarget) // Ensure your lidUtils handles this
            }
            
            // Clean the JID to ensure no device identifiers (like :12@s.whatsapp.net)
            targetJid = targetJid.split(':')[0].split('@')[0] + '@s.whatsapp.net'
            const cleanPN = targetJid.split('@')[0]

            // 3. Resolve Name
            // If the target is the sender, we have their pushName.
            // If target is someone else, we likely DON'T have their name unless using a contact store.
            // Fallback: Use the phone number as the name.
            let userName = 'Unknown'
            
            if (targetJid === (msg.key.participant || msg.key.remoteJid)) {
                userName = msg.pushName || 'Unknown' 
            } else {
                // Try to get name from contact store (if your bot has one)
                // Otherwise use the formatted number
                userName = `@${cleanPN}` 
            }

            // 4. Fetch Bio (About)
            let bio = '🔒 Private / No Bio'
            try {
                // This request fails if user privacy is "My Contacts" or "Nobody"
                const statusData = await Dave.fetchStatus(targetJid)
                if (statusData && statusData.status) {
                    bio = statusData.status
                }
            } catch (e) {
                // 401 Unauthorized is common here due to privacy
                // console.log(`Privacy blocked bio for ${targetJid}`)
            }

            // 5. Database & PFP
            const user = await User.findOne({ userId: targetJid })
            
            let pfp
            try {
                pfp = await Dave.profilePictureUrl(targetJid, 'image')
            } catch {
                pfp = 'https://i.ibb.co/j3pRQf6/user.png'
            }

            // 6. Resolve Group Role
            let role = 'N/A'
            if (isGroup && groupMetadata?.participants) {
                const uData = groupMetadata.participants.find(u => u.id === targetJid)
                if (uData) role = uData.admin ? '🛡 Admin' : '👤 Member'
            }

            // 7. Resolve Spouse
            const spousePn = user?.spouse ? await lidToPhone(Dave, user.spouse) : null
            const spouseDisplay = spousePn ? '@' + spousePn.split('@')[0] : 'Single'

            const text = `👤 *User Info*\n\n• *Name:* ${userName}\n• *PN:* ${cleanPN}\n• *JID:* ${targetJid}\n• *Bio:* ${bio}\n• *Role:* ${role}\n• *Coins:* ${user?.coins || 0}\n• *Spouse:* ${spouseDisplay}\n• *Tag:* ${user?.customTag || 'None'}`

            await Dave.sendMessage(from, { 
                image: { url: pfp }, 
                caption: text, 
                mentions: spousePn ? [user.spouse] : [] 
            }, { quoted: msg })

        } catch (e) {
            console.error('Whois Error:', e)
            reply('❌ Failed to get user info.')
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

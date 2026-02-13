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
            // 1. Identify the target user (Mentioned -> Quoted -> Input -> Sender)
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
            const inputJid = args[0] ? (args[0].includes('@') ? args[0] : args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net') : null
            const sender = msg.key?.participant || msg.key?.remoteJid || ''
            
            const rawTarget = mentioned || quotedParticipant || inputJid || sender
            
            if (!rawTarget) return reply('❌ Could not identify user.')

            // 2. Resolve JID and Phone Number
            // Ensure we have the standardized format @s.whatsapp.net
            const pnResult = await lidToPhone(Dave, rawTarget)
            const targetJid = pnResult.includes('@') ? pnResult : pnResult + '@s.whatsapp.net'
            const cleanPN = targetJid.split('@')[0] // FIX: Get only the number

            // 3. Database Lookup
            const user = await User.findOne({ userId: targetJid }) || await User.findOne({ userId: rawTarget })

            // 4. Fetch Profile Picture
            let pfp
            try {
                pfp = await Dave.profilePictureUrl(targetJid, 'image')
            } catch {
                pfp = 'https://i.ibb.co/j3pRQf6/user.png'
            }

            // 5. Fetch Bio/Status (FIX)
            let bio = 'No bio'
            try {
                // We must use the standardized targetJid (s.whatsapp.net)
                const statusData = await Dave.fetchStatus(targetJid)
                bio = statusData?.status || 'No bio'
            } catch (e) {
                // Privacy settings often block this, keep 'No bio'
                console.log('Bio fetch failed (likely privacy):', e.message)
            }

            // 6. Resolve Name (FIX)
            // If target is the sender, use the pushName from the message. 
            // If target is someone else, Baileys cannot fetch the name directly unless they are in your contacts.
            let userName = 'Unknown'
            if (targetJid === sender || rawTarget === sender) {
                userName = msg.pushName || 'Unknown'
            } else {
                // Optional: You can try to find them in the group metadata if you really need a name
                // but usually, it defaults to Unknown for strangers.
                userName = 'Unknown (User)'
            }

            // 7. Resolve Group Role
            let role = 'N/A'
            if (isGroup && groupMetadata?.participants) {
                const uData = groupMetadata.participants.find(u => u.id === targetJid || u.id === rawTarget)
                if (uData) role = uData.admin ? '🛡 Admin' : '👤 Member'
            }

            // 8. Resolve Spouse
            const spousePn = user?.spouse ? await lidToPhone(Dave, user.spouse) : null
            const spouseDisplay = spousePn ? '@' + spousePn.split('@')[0] : 'Single'

            const text = `👤 *User Info*\n\n• *Name:* ${userName}\n• *PN:* ${cleanPN}\n• *JID:* ${targetJid}\n• *Bio:* ${bio}\n• *Role:* ${role}\n• *Coins:* ${user?.coins || 0}\n• *Spouse:* ${spouseDisplay}\n• *Tag:* ${user?.customTag || 'None'}`

            await Dave.sendMessage(from, { 
                image: { url: pfp }, 
                caption: text, 
                mentions: spousePn ? [user.spouse] : [] 
            }, { quoted: msg })

        } catch (e) {
            console.error(e)
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

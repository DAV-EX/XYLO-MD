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
      // 1. Get the Raw ID (could be LID or JID)
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
      const inputJid = args[0] ? (args[0].includes('@') ? args[0] : args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net') : null
      const sender = msg.key?.participant || msg.key?.remoteJid || ''

      const rawTarget = Dave.decodeJid(quotedParticipant || mentioned || inputJid || sender)
      if (!rawTarget) return reply('❌ Could not identify user.')

      // 2. Convert LID to Phone JID
      // This is crucial for Bio and matching in group lists
      const pnResult = await lidToPhone(Dave, rawTarget)
      const targetJid = Dave.decodeJid(pnResult.includes('@') ? pnResult : pnResult + '@s.whatsapp.net')
      const cleanPn = targetJid.split('@')[0]

      // 3. Fetch Bio (MUST use the Phone JID, not LID)
      let bio = 'No bio'
      try {
        const statusData = await Dave.fetchStatus(targetJid)
        if (statusData && statusData.status) bio = statusData.status
      } catch {
        bio = 'Bio Hidden'
      }

      // 4. Role & Name logic
      let role = 'N/A'
      let targetName = cleanPn // Default to PN

      // If user is the sender, we already have their name
      if (rawTarget === Dave.decodeJid(sender)) {
        targetName = msg.pushName || 'You'
      }

      if (isGroup && groupMetadata?.participants) {
        // We find the user by checking both their LID and their JID 
        // because group lists can contain either depending on the version
        const uData = groupMetadata.participants.find(u => 
          Dave.decodeJid(u.id) === rawTarget || 
          Dave.decodeJid(u.id) === targetJid
        )

        if (uData) {
          // Identify Role
          role = uData.admin ? (uData.admin === 'superadmin' ? '👑 Owner' : '🛡️ Admin') : '👤 Member'
          
          // Get Name from group metadata (Notify name or Verified name)
          if (rawTarget !== Dave.decodeJid(sender)) {
            targetName = uData.notify || uData.name || uData.verifiedName || cleanPn
          }
        }
      }

      // 5. Database & Spouse logic
      const user = await User.findOne({ userId: targetJid }) || await User.findOne({ userId: rawTarget })
      const spousePn = user?.spouse ? await lidToPhone(Dave, user.spouse) : null
      const spouseJid = spousePn ? Dave.decodeJid(spousePn.includes('@') ? spousePn : spousePn + '@s.whatsapp.net') : null

      // 6. Profile Picture
      let pfp
      try {
        pfp = await Dave.profilePictureUrl(targetJid, 'image')
      } catch {
        pfp = 'https://i.ibb.co/j3pRQf6/user.png'
      }

      const text = `👤 *User Info*\n\n` +
                   `• *Name:* ${targetName}\n` +
                   `• *PN:* ${cleanPn}\n` +
                   `• *JID:* ${targetJid}\n` +
                   `• *Bio:* ${bio}\n` +
                   `• *Role:* ${role}\n` +
                   `• *Coins:* ${user?.coins || 0}\n` +
                   `• *Spouse:* ${spouseJid ? '@' + spouseJid.split('@')[0] : 'Single'}\n` +
                   `• *Tag:* ${user?.customTag || 'None'}`

      await Dave.sendMessage(from, { 
        image: { url: pfp }, 
        caption: text, 
        mentions: spouseJid ? [spouseJid, targetJid] : [targetJid] 
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

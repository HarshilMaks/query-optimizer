import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY ?? 'querysage-default-key-change-me!!'
  return Buffer.from(key.padEnd(32, '!').slice(0, 32))
}

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':')
  if (parts.length !== 3) return encryptedText // not encrypted (legacy)
  const [ivHex, authTagHex, encrypted] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

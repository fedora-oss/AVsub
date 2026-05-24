import { createError } from 'h3'

const qbUrl = (process.env.QBITTORRENT_URL || 'http://qbittorrent').replace(/\/$/, '')
const username = process.env.QBITTORRENT_USERNAME || 'admin'
const password = process.env.QBITTORRENT_PASSWORD || 'Qu4chuo!'

/**
 * Logs in to qBittorrent and returns the SID cookie value.
 */
export async function getQBitSession(): Promise<string> {
  const loginUrl = `${qbUrl}/api/v2/auth/login`
  try {
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': qbUrl,
      },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    })

    if (!loginResponse.ok) {
      throw new Error(`Login failed with HTTP status ${loginResponse.status}`)
    }

    const responseText = await loginResponse.text()
    if (responseText.trim().toLowerCase() === 'fails') {
      throw new Error('Invalid credentials provided for qBittorrent WebUI')
    }

    const setCookie = loginResponse.headers.get('set-cookie')
    if (!setCookie) {
      throw new Error('Did not receive a Set-Cookie header from qBittorrent login')
    }

    const sidMatch = setCookie.match(/SID=([^;]+)/)
    if (!sidMatch) {
      throw new Error('Could not find SID session cookie in qBittorrent login response')
    }

    return sidMatch[1]
  } catch (err: any) {
    console.error('[QBit-Utils] Authentication failed:', err.message)
    throw err
  }
}

/**
 * Sends a POST request to qBittorrent API with auth session.
 */
export async function qbitPost(endpoint: string, bodyString: string): Promise<Response> {
  const sid = await getQBitSession()
  const url = `${qbUrl}${endpoint}`
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `SID=${sid}`,
      'Referer': qbUrl,
    },
    body: bodyString,
  })
}

/**
 * Sends a GET request to qBittorrent API with auth session.
 */
export async function qbitGet(endpoint: string): Promise<Response> {
  const sid = await getQBitSession()
  const url = `${qbUrl}${endpoint}`
  return fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': `SID=${sid}`,
      'Referer': qbUrl,
    },
  })
}

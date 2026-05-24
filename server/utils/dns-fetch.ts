import https from 'node:https'
import dns from 'node:dns'

// Custom secure DNS lookup that resolves using Cloudflare public DNS (1.1.1.1)
export const secureLookup = (
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
) => {
  const resolver = new dns.promises.Resolver()
  resolver.setServers(['1.1.1.1'])

  resolver.resolve4(hostname)
    .then((addresses) => {
      if (addresses && addresses.length > 0) {
        if (options && options.all) {
          callback(null, [{ address: addresses[0], family: 4 }])
        } else {
          callback(null, addresses[0], 4)
        }
      } else {
        dns.lookup(hostname, options, callback)
      }
    })
    .catch(() => {
      dns.lookup(hostname, options, callback)
    })
}

export const secureHttpsAgent = new https.Agent({ lookup: secureLookup })

export function fetchWithCustomDns(urlStr: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      agent: secureHttpsAgent
    }

    const req = https.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, urlStr).toString()
        }
        fetchWithCustomDns(redirectUrl).then(resolve).catch(reject)
        return
      }

      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP status code ${res.statusCode}`))
        return
      }

      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve(data)
      })
    })

    req.on('error', (err) => {
      reject(err)
    })

    req.end()
  })
}

export function fetchBufferWithCustomDns(urlStr: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      agent: secureHttpsAgent
    }

    const req = https.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, urlStr).toString()
        }
        fetchBufferWithCustomDns(redirectUrl).then(resolve).catch(reject)
        return
      }

      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP status code ${res.statusCode}`))
        return
      }

      const chunks: Buffer[] = []
      res.on('data', (chunk) => {
        chunks.push(chunk)
      })
      res.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
    })

    req.on('error', (err) => {
      reject(err)
    })

    req.end()
  })
}

import server from '../dist/server/server.js';

// Adapts TanStack Start's Web Fetch handler to Vercel's Node.js serverless format
export default async function handler(req, res) {
  const protocol = req.headers['x-forwarded-proto'] ?? 'https';
  const host = req.headers.host;
  const url = `${protocol}://${host}${req.url}`;

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (typeof req.body === 'string') {
        body = Buffer.from(req.body);
      } else {
        body = Buffer.from(JSON.stringify(req.body));
      }
    } else {
      body = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
    }
  }

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value != null) headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body: body?.length ? body : undefined,
  });

  const response = await server.fetch(request);

  if (typeof res.status === 'function') {
    res.status(response.status);
  } else {
    res.statusCode = response.status;
  }

  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie' && typeof response.headers.getSetCookie === 'function') {
      res.setHeader('set-cookie', response.headers.getSetCookie());
    } else {
      res.setHeader(key, value);
    }
  }

  res.end(Buffer.from(await response.arrayBuffer()));
}


import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// تحميل ملف .env يدوياً للعمليات المحلية
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0) {
      process.env[key.trim()] = value.join('=').trim();
    }
  });
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-server',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url.startsWith('/api/')) {
            const url = new URL(req.url, `http://${req.headers.host}`)
            const apiName = url.pathname.slice(5) // remove /api/
            const filePath = path.join(process.cwd(), 'api', apiName + '.js')
            
            if (fs.existsSync(filePath)) {
              try {
                // Load the module
                const mod = await server.ssrLoadModule(filePath)
                const handler = mod.default
                
                if (handler) {
                  // Handle body parsing for POST
                  let body = ''
                  req.on('data', chunk => {
                    body += chunk
                  })
                  
                  req.on('end', async () => {
                    try {
                      req.body = body ? JSON.parse(body) : {}
                    } catch (e) {
                      req.body = {}
                    }
                    
                    // Add helper methods expected by Vercel handlers
                    res.status = (code) => {
                      res.statusCode = code
                      return res
                    }
                    res.json = (data) => {
                      res.setHeader('Content-Type', 'application/json')
                      res.end(JSON.stringify(data))
                      return res
                    }
                    
                    try {
                      await handler(req, res)
                    } catch (err) {
                      console.error(err)
                      res.statusCode = 500
                      res.end(JSON.stringify({ error: err.message }))
                    }
                  })
                  return
                }
              } catch (e) {
                console.error(e)
                res.statusCode = 500
                res.end(JSON.stringify({ error: e.message }))
                return
              }
            }
          }
          next()
        })
      }
    }
  ],
})

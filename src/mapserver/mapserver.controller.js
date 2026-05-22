import axios from "axios"
import prisma from "../config/db.js"
import https from "https"

const sanitizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "")
const DEFAULT_ARCGIS_TOKEN_EXPIRY_MIN = 60
const ARCGIS_TOKEN_EXPIRY_GRACE_MS = 60 * 1000
const arcGisTokenCache = new Map()
const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false })

const shouldAllowSelfSignedCerts = () =>
  ["1", "true", "yes", "on"].includes(
    String(process.env.ARCGIS_ALLOW_SELF_SIGNED || "").trim().toLowerCase(),
  )

const getHttpsAgentForUrl = (url) => {
  if (!shouldAllowSelfSignedCerts()) return undefined
  try {
    const parsed = new URL(String(url || ""))
    if (parsed.protocol === "https:") {
      return insecureHttpsAgent
    }
  } catch {
    return undefined
  }
  return undefined
}

const buildProxyHeaders = (headers) => {
  const out = {}
  if (headers.accept) out.accept = headers.accept
  if (headers["content-type"]) out["content-type"] = headers["content-type"]
  if (headers["user-agent"]) out["user-agent"] = headers["user-agent"]
  if (headers.referer) out.referer = headers.referer
  if (headers.origin) out.origin = headers.origin
  if (headers["x-esri-authorization"]) out["x-esri-authorization"] = headers["x-esri-authorization"]
  return out
}

const asPositiveInt = (value, fallback) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.round(n)
}

const parseArcGisExpiryMs = (value, fallbackMinutes) => {
  const fallback = Date.now() + asPositiveInt(fallbackMinutes, DEFAULT_ARCGIS_TOKEN_EXPIRY_MIN) * 60 * 1000
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  if (n > 1e12) return n
  if (n > 1e9) return n * 1000
  return fallback
}

const deriveTokenInfoUrlFromServiceUrl = (serviceUrl) => {
  try {
    const parsed = new URL(serviceUrl)
    const pathname = parsed.pathname || ""
    const marker = pathname.toLowerCase().indexOf("/rest/services")
    if (marker >= 0) {
      parsed.pathname = `${pathname.slice(0, marker)}/rest/info`
      parsed.search = ""
      parsed.hash = ""
      return parsed.toString()
    }
  } catch {
    // ignore
  }
  return ""
}

const deriveTokenUrlFromServiceUrl = (serviceUrl) => {
  try {
    const parsed = new URL(serviceUrl)
    const pathname = parsed.pathname || ""
    const marker = pathname.toLowerCase().indexOf("/rest/services")
    if (marker >= 0) {
      parsed.pathname = `${pathname.slice(0, marker)}/tokens/generateToken`
      parsed.search = ""
      parsed.hash = ""
      return parsed.toString()
    }
  } catch {
    // ignore
  }
  return ""
}

const deriveAdminGenerateTokenUrlFromServiceUrl = (serviceUrl) => {
  try {
    const parsed = new URL(serviceUrl)
    const pathname = parsed.pathname || ""
    const marker = pathname.toLowerCase().indexOf("/rest/services")
    if (marker >= 0) {
      parsed.pathname = `${pathname.slice(0, marker)}/admin/generateToken`
      parsed.search = ""
      parsed.hash = ""
      return parsed.toString()
    }
  } catch {
    // ignore
  }
  return ""
}

const tokenFromEsriAuthHeader = (headers) => {
  const raw = String(headers?.["x-esri-authorization"] || headers?.["x-arcgis-token"] || "").trim()
  if (!raw) return ""
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return (match ? match[1] : raw).trim()
}

const tokenCacheKey = (tokenUrl, username, client, referer) =>
  [tokenUrl, username, client, referer].join("|")

const normalizeArcGisClientMode = (value) => {
  const mode = String(value || "requestip").trim().toLowerCase()
  if (mode === "referer" || mode === "ip" || mode === "requestip") return mode
  return "requestip"
}

const resolveArcGisReferer = (req) => {
  const explicit = String(process.env.ARCGIS_TOKEN_REFERER || process.env.BASE_URL || "").trim()
  if (explicit) return explicit
  const fromReq =
    String(req?.headers?.origin || req?.headers?.referer || "").trim()
  return fromReq
}

const getCachedArcGisToken = (key) => {
  const cached = arcGisTokenCache.get(key)
  if (!cached) return ""
  if (!cached.token || !cached.expiresAt) return ""
  if (Date.now() >= cached.expiresAt - ARCGIS_TOKEN_EXPIRY_GRACE_MS) return ""
  return cached.token
}

const cacheArcGisToken = (key, token, expiresAt) => {
  if (!token) return
  arcGisTokenCache.set(key, { token, expiresAt })
}

const fetchTokenServicesUrlFromInfo = async (serviceUrl) => {
  const infoUrl = deriveTokenInfoUrlFromServiceUrl(serviceUrl)
  if (!infoUrl) return ""

  const response = await axios.get(infoUrl, {
    httpsAgent: getHttpsAgentForUrl(infoUrl),
    params: { f: "json" },
    timeout: 10000,
    validateStatus: () => true,
  })

  if (response?.status < 200 || response?.status >= 300) return ""
  const payload = response?.data && typeof response.data === "object" ? response.data : {}
  return sanitizeBaseUrl(payload?.authInfo?.tokenServicesUrl)
}

const buildTokenUrlCandidates = async (serviceUrl) => {
  const out = []
  const explicit = sanitizeBaseUrl(process.env.ARCGIS_TOKEN_URL)
  if (explicit) out.push(explicit)

  const fromInfo = await fetchTokenServicesUrlFromInfo(serviceUrl).catch(() => "")
  if (fromInfo) out.push(fromInfo)

  const guessed = deriveTokenUrlFromServiceUrl(serviceUrl)
  if (guessed) out.push(guessed)

  const admin = deriveAdminGenerateTokenUrlFromServiceUrl(serviceUrl)
  if (admin) out.push(admin)

  return Array.from(new Set(out.filter(Boolean)))
}

const generateArcGisToken = async (serviceUrl, req) => {
  const username = String(process.env.ARCGIS_TOKEN_USERNAME || "").trim()
  const password = String(process.env.ARCGIS_TOKEN_PASSWORD || "").trim()

  if (!username || !password) return ""

  const client = normalizeArcGisClientMode(process.env.ARCGIS_TOKEN_CLIENT)
  const referer = resolveArcGisReferer(req)
  const expiration = asPositiveInt(
    process.env.ARCGIS_TOKEN_EXPIRATION_MINUTES,
    DEFAULT_ARCGIS_TOKEN_EXPIRY_MIN,
  )

  const tokenUrls = await buildTokenUrlCandidates(serviceUrl)
  for (const tokenUrl of tokenUrls) {
    const cacheKey = tokenCacheKey(tokenUrl, username, client, referer)
    const cachedToken = getCachedArcGisToken(cacheKey)
    if (cachedToken) return cachedToken

    const form = new URLSearchParams()
    form.set("f", "json")
    form.set("username", username)
    form.set("password", password)
    form.set("client", client)
    form.set("expiration", String(expiration))
    if (client === "referer" && referer) {
      form.set("referer", referer)
    }

    const response = await axios.post(tokenUrl, form.toString(), {
      httpsAgent: getHttpsAgentForUrl(tokenUrl),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      timeout: 20000,
      validateStatus: () => true,
    })

    const payload =
      response?.data && typeof response.data === "object"
        ? response.data
        : {}

    const token = String(payload?.token || "").trim()
    if (token) {
      const expiresAt = parseArcGisExpiryMs(payload?.expires, expiration)
      cacheArcGisToken(cacheKey, token, expiresAt)
      return token
    }

    const errMessage =
      String(payload?.error?.message || payload?.messages?.[0] || payload?.message || "").trim()
    console.warn("ArcGIS token endpoint rejected request:", {
      tokenUrl,
      status: response?.status || null,
      client,
      hasReferer: Boolean(referer),
      errMessage: errMessage || "unknown",
    })
  }
  return ""
}

const resolveArcGisTokenForProxy = async (req, serviceUrl) => {
  const headerToken = tokenFromEsriAuthHeader(req?.headers)
  if (headerToken) return headerToken

  const envStaticToken = String(process.env.ARCGIS_SERVER_TOKEN || "").trim()
  if (envStaticToken) return envStaticToken

  try {
    return await generateArcGisToken(serviceUrl, req)
  } catch (err) {
    console.warn("ArcGIS token generation failed:", err?.message || err)
    return ""
  }
}

export const proxyMapserverRequest = async (req, res) => {
  let serviceKey = ""
  let targetUrl = ""

  try {
    const method = String(req.method || "GET").toUpperCase()
    if (!["GET", "POST"].includes(method)) {
      return res.status(405).json({ message: "Method not allowed" })
    }

    serviceKey = String(req.params.serviceKey || "").trim()
    if (!serviceKey) {
      return res.status(400).json({ message: "Invalid service key" })
    }

    const serviceConfig = await prisma.apiUrl.findFirst({
      where: {
        key: serviceKey,
        isActive: true,
      },
      select: {
        id: true,
        key: true,
        url: true,
      },
    })

    const baseUrl = sanitizeBaseUrl(serviceConfig?.url)
    if (!baseUrl) {
      return res.status(404).json({ message: `Service key not found: ${serviceKey}` })
    }
    const suffixPath = req.path && req.path !== "/" ? req.path : ""
    targetUrl = `${baseUrl}${suffixPath}`
    const upstreamQuery = { ...(req.query || {}) }

    if (!String(upstreamQuery.token || "").trim()) {
      const arcGisToken = await resolveArcGisTokenForProxy(req, baseUrl)
      if (arcGisToken) {
        upstreamQuery.token = arcGisToken
      }
    }

    const arcGisClientMode = normalizeArcGisClientMode(process.env.ARCGIS_TOKEN_CLIENT)
    const arcGisReferer = resolveArcGisReferer(req)
    const upstreamHeaders = {
      ...buildProxyHeaders(req.headers),
      ...(upstreamQuery.token
        ? { "x-esri-authorization": `Bearer ${String(upstreamQuery.token).trim()}` }
        : {}),
      ...(upstreamQuery.token && arcGisClientMode === "referer" && arcGisReferer
        ? { referer: arcGisReferer, origin: arcGisReferer }
        : {}),
    }

    const upstream = await axios({
      method,
      url: targetUrl,
      httpsAgent: getHttpsAgentForUrl(targetUrl),
      params: upstreamQuery,
      data: method === "POST" ? req.body : undefined,
      headers: upstreamHeaders,
      responseType: "arraybuffer",
      validateStatus: () => true,
      timeout: 45000,
    })

    const contentType = upstream.headers["content-type"]
    if (contentType) {
      res.setHeader("content-type", contentType)
    }

    const upstreamBodyText = Buffer.from(upstream.data || []).toString("utf8")
    if (upstream.status >= 400 && upstreamBodyText) {
      const looksLikeTokenError =
        /token required|invalid token|token.*expired|access denied/i.test(upstreamBodyText)
      if (looksLikeTokenError) {
        console.warn("ArcGIS upstream token rejection:", {
          serviceKey,
          targetUrl,
          status: upstream.status,
          clientMode: arcGisClientMode,
          hasTokenParam: Boolean(String(upstreamQuery.token || "").trim()),
          hasRefererHeader: Boolean(upstreamHeaders.referer),
        })
      }
    }

    res.status(upstream.status).send(Buffer.from(upstream.data))
  } catch (error) {
    const status = error?.response?.status
    const errorCode = error?.code
    const message = error?.message || "Map proxy failed"
    const upstreamContentType = error?.response?.headers?.["content-type"] || ""
    const upstreamBody = error?.response?.data
    let upstreamPreview = null

    if (upstreamBody) {
      try {
        if (Buffer.isBuffer(upstreamBody)) {
          upstreamPreview = upstreamBody.toString("utf8").slice(0, 500)
        } else if (typeof upstreamBody === "string") {
          upstreamPreview = upstreamBody.slice(0, 500)
        } else {
          upstreamPreview = JSON.stringify(upstreamBody).slice(0, 500)
        }
      } catch {
        upstreamPreview = null
      }
    }

    console.error("proxyMapserverRequest error:", {
      serviceKey,
      targetUrl,
      method: req.method,
      status,
      errorCode,
      message,
      upstreamContentType,
      upstreamPreview,
    })

    const responsePayload = {
      message: "Map proxy failed",
    }

    if (process.env.NODE_ENV !== "production") {
      responsePayload.details = {
        serviceKey,
        targetUrl,
        status: status || null,
        errorCode: errorCode || null,
        message,
      }
    }

    const failureStatus = status || (errorCode === "ECONNABORTED" ? 504 : 502)
    res.status(failureStatus).json(responsePayload)
  }
}

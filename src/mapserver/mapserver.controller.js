import axios from "axios"
import prisma from "../config/db.js"

const sanitizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "")

const buildProxyHeaders = (headers) => {
  const out = {}
  if (headers.accept) out.accept = headers.accept
  if (headers["content-type"]) out["content-type"] = headers["content-type"]
  if (headers["user-agent"]) out["user-agent"] = headers["user-agent"]
  return out
}

export const proxyMapserverRequest = async (req, res) => {
  try {
    const method = String(req.method || "GET").toUpperCase()
    if (!["GET", "POST"].includes(method)) {
      return res.status(405).json({ message: "Method not allowed" })
    }

    const serviceKey = String(req.params.serviceKey || "").trim()
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
    const targetUrl = `${baseUrl}${suffixPath}`

    const upstream = await axios({
      method,
      url: targetUrl,
      params: req.query,
      data: method === "POST" ? req.body : undefined,
      headers: buildProxyHeaders(req.headers),
      responseType: "arraybuffer",
      validateStatus: () => true,
      timeout: 45000,
    })

    const contentType = upstream.headers["content-type"]
    if (contentType) {
      res.setHeader("content-type", contentType)
    }

    res.status(upstream.status).send(Buffer.from(upstream.data))
  } catch (error) {
    console.error("proxyMapserverRequest error:", error?.message || error)
    res.status(502).json({ message: "Map proxy failed" })
  }
}

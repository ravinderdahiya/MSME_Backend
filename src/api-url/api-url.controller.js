import prisma from "../config/db.js"
import { FRONTEND_CONFIG_KEYS } from "./default-map-services.js"

const sanitizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "")
const prismaIdValidationRegex = /Argument\s+`?id`?.*Expected\s+(Int|String)/i

const parseIdCandidates = (value) => {
  const raw = String(value || "").trim()
  if (!raw) return []
  const asInt = Number(raw)
  const hasCanonicalInt = Number.isInteger(asInt) && String(asInt) === raw
  return hasCanonicalInt ? [asInt, raw] : [raw]
}

const isPrismaIdValidationError = (error) => {
  const name = String(error?.name || "")
  const message = String(error?.message || "")
  return name.includes("PrismaClientValidationError") || prismaIdValidationRegex.test(message)
}

export const getFrontendConfig = async (req, res) => {
  try {
    const rows = await prisma.apiUrl.findMany({
      where: {
        key: { in: FRONTEND_CONFIG_KEYS },
        isActive: true,
      },
      orderBy: { key: "asc" },
    })

    const map = {}
    rows.forEach((row) => {
      map[row.key] = sanitizeUrl(row.url)
    })

    const missingKeys = FRONTEND_CONFIG_KEYS.filter((key) => !map[key])

    res.json({
      source: "database",
      mapServices: map,
      missingKeys,
    })
  } catch (error) {
    console.error("getFrontendConfig error:", error)
    res.status(500).json({ message: "Failed to load frontend config" })
  }
}

export const listApiUrls = async (req, res) => {
  try {
    const rows = await prisma.apiUrl.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
    })
    res.json({ data: rows })
  } catch (error) {
    console.error("listApiUrls error:", error)
    res.status(500).json({ message: "Failed to fetch API URLs" })
  }
}

export const createApiUrl = async (req, res) => {
  try {
    const { key, name, url, description, category, isActive } = req.body || {}

    if (!key || !name || !url) {
      return res.status(400).json({ message: "key, name and url are required" })
    }

    const created = await prisma.apiUrl.create({
      data: {
        key: String(key).trim(),
        name: String(name).trim(),
        url: sanitizeUrl(url),
        description: description ? String(description).trim() : null,
        category: category ? String(category).trim() : "general",
        isActive: typeof isActive === "boolean" ? isActive : true,
      },
    })

    res.status(201).json({ message: "API URL created", data: created })
  } catch (error) {
    console.error("createApiUrl error:", error)
    if (error?.code === "P2002") {
      return res.status(409).json({ message: "Key already exists" })
    }
    res.status(500).json({ message: "Failed to create API URL" })
  }
}

export const updateApiUrl = async (req, res) => {
  try {
    const idCandidates = parseIdCandidates(req.params.id)
    if (!idCandidates.length) {
      return res.status(400).json({ message: "Invalid id" })
    }

    const { key, name, url, description, category, isActive } = req.body || {}
    const data = {}

    if (key !== undefined) data.key = String(key).trim()
    if (name !== undefined) data.name = String(name).trim()
    if (url !== undefined) data.url = sanitizeUrl(url)
    if (description !== undefined) data.description = description ? String(description).trim() : null
    if (category !== undefined) data.category = String(category).trim()
    if (isActive !== undefined) data.isActive = Boolean(isActive)

    let updated = null
    let lastError = null
    for (const id of idCandidates) {
      try {
        updated = await prisma.apiUrl.update({
          where: { id },
          data,
        })
        break
      } catch (error) {
        lastError = error
        if (error?.code === "P2002") {
          return res.status(409).json({ message: "Key already exists" })
        }
        if (error?.code === "P2025" || isPrismaIdValidationError(error)) {
          continue
        }
        throw error
      }
    }

    if (!updated) {
      if (lastError?.code === "P2025" || isPrismaIdValidationError(lastError)) {
        return res.status(404).json({ message: "API URL not found" })
      }
      throw lastError || new Error("Failed to update API URL")
    }

    res.json({ message: "API URL updated", data: updated })
  } catch (error) {
    console.error("updateApiUrl error:", error)
    if (error?.code === "P2025") {
      return res.status(404).json({ message: "API URL not found" })
    }
    if (error?.code === "P2002") {
      return res.status(409).json({ message: "Key already exists" })
    }
    res.status(500).json({ message: "Failed to update API URL" })
  }
}

export const deleteApiUrl = async (req, res) => {
  try {
    const idCandidates = parseIdCandidates(req.params.id)
    if (!idCandidates.length) {
      return res.status(400).json({ message: "Invalid id" })
    }

    let deleted = false
    let lastError = null
    for (const id of idCandidates) {
      try {
        await prisma.apiUrl.delete({ where: { id } })
        deleted = true
        break
      } catch (error) {
        lastError = error
        if (error?.code === "P2025" || isPrismaIdValidationError(error)) {
          continue
        }
        throw error
      }
    }

    if (!deleted) {
      if (lastError?.code === "P2025" || isPrismaIdValidationError(lastError)) {
        return res.status(404).json({ message: "API URL not found" })
      }
      throw lastError || new Error("Failed to delete API URL")
    }

    res.json({ message: "API URL deleted" })
  } catch (error) {
    console.error("deleteApiUrl error:", error)
    if (error?.code === "P2025") {
      return res.status(404).json({ message: "API URL not found" })
    }
    res.status(500).json({ message: "Failed to delete API URL" })
  }
}

import prisma from "../config/db.js"

const sanitizeEndpoint = (value) => String(value || "").trim().replace(/\/+$/, "")

const inferServiceType = (endpoint) => {
  const value = sanitizeEndpoint(endpoint).toLowerCase()
  if (value.includes("wms")) return "WMS"
  if (value.includes("wmts")) return "WMTS"
  if (value.includes("mapserver")) return "ArcGIS MapServer"
  if (value.includes("featureserver")) return "ArcGIS FeatureServer"
  if (value.includes("imageserver")) return "ArcGIS ImageServer"
  return "REST API"
}

export const listDataServices = async (_req, res) => {
  try {
    const rows = await prisma.dataService.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    })
    res.json({ data: rows })
  } catch (error) {
    console.error("listDataServices error:", error)
    res.status(500).json({ message: "Failed to fetch data services" })
  }
}

export const createDataService = async (req, res) => {
  try {
    const { key, name, endpoint, serviceType, description, isActive, lastChecked } = req.body || {}
    if (!key || !name || !endpoint) {
      return res.status(400).json({ message: "key, name and endpoint are required" })
    }

    const normalizedEndpoint = sanitizeEndpoint(endpoint)
    const created = await prisma.dataService.create({
      data: {
        key: String(key).trim(),
        name: String(name).trim(),
        endpoint: normalizedEndpoint,
        serviceType: serviceType ? String(serviceType).trim() : inferServiceType(normalizedEndpoint),
        description: description ? String(description).trim() : null,
        isActive: typeof isActive === "boolean" ? isActive : true,
        lastChecked: lastChecked ? new Date(lastChecked) : new Date(),
      },
    })

    res.status(201).json({ message: "Data service created", data: created })
  } catch (error) {
    console.error("createDataService error:", error)
    if (error?.code === "P2002") {
      return res.status(409).json({ message: "Key already exists" })
    }
    res.status(500).json({ message: "Failed to create data service" })
  }
}

export const updateDataService = async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid id" })
    }

    const { key, name, endpoint, serviceType, description, isActive, lastChecked } = req.body || {}
    const data = {}

    if (key !== undefined) data.key = String(key).trim()
    if (name !== undefined) data.name = String(name).trim()
    if (endpoint !== undefined) {
      const normalizedEndpoint = sanitizeEndpoint(endpoint)
      data.endpoint = normalizedEndpoint
      if (serviceType === undefined) {
        data.serviceType = inferServiceType(normalizedEndpoint)
      }
    }
    if (serviceType !== undefined) data.serviceType = String(serviceType).trim()
    if (description !== undefined) data.description = description ? String(description).trim() : null
    if (isActive !== undefined) data.isActive = Boolean(isActive)
    if (lastChecked !== undefined) data.lastChecked = lastChecked ? new Date(lastChecked) : new Date()
    if (!Object.prototype.hasOwnProperty.call(data, "lastChecked")) {
      data.lastChecked = new Date()
    }

    const updated = await prisma.dataService.update({
      where: { id },
      data,
    })

    res.json({ message: "Data service updated", data: updated })
  } catch (error) {
    console.error("updateDataService error:", error)
    if (error?.code === "P2025") {
      return res.status(404).json({ message: "Data service not found" })
    }
    if (error?.code === "P2002") {
      return res.status(409).json({ message: "Key already exists" })
    }
    res.status(500).json({ message: "Failed to update data service" })
  }
}

export const deleteDataService = async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid id" })
    }

    await prisma.dataService.delete({ where: { id } })
    res.json({ message: "Data service deleted" })
  } catch (error) {
    console.error("deleteDataService error:", error)
    if (error?.code === "P2025") {
      return res.status(404).json({ message: "Data service not found" })
    }
    res.status(500).json({ message: "Failed to delete data service" })
  }
}


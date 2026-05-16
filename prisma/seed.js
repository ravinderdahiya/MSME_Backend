import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import bcrypt from "bcrypt"
import { PrismaClient } from "@prisma/client"
import { getDefaultMapServiceEntriesFromEnv } from "../src/api-url/default-map-services.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, "../.env") })

const prisma = new PrismaClient()

const adminEmail = process.env.ADMIN_EMAIL
const adminPassword = process.env.ADMIN_PASSWORD
const adminFullname = process.env.ADMIN_FULLNAME
const adminMobile = process.env.ADMIN_MOBILE

const seedAdmin = async () => {
  if (!adminEmail || !adminPassword || !adminFullname || !adminMobile) {
    console.warn(
      "Skipping admin seed: missing ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULLNAME, or ADMIN_MOBILE."
    )
    return
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: { in: ["admin", "superadmin"] } }
  })

  if (existingAdmin) {
    console.log("Admin user already exists:", existingAdmin.email)
    return
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: adminEmail }
  })

  if (existingEmail) {
    throw new Error(
      `A user with email ${adminEmail} already exists but is not an admin. Please remove or change that user before seeding.`
    )
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  const admin = await prisma.user.create({
    data: {
      fullname: adminFullname,
      email: adminEmail,
      password: hashedPassword,
      mobile: adminMobile,
      role: "admin"
    }
  })

  console.log("Admin account seeded successfully:", admin.email)
}

const seedApiUrls = async () => {
  const entries = getDefaultMapServiceEntriesFromEnv(process.env)
  if (!entries.length) {
    console.warn("Skipping API URL seed: no MSME_*_URL env values found.")
    return
  }

  for (const entry of entries) {
    await prisma.apiUrl.upsert({
      where: { key: entry.key },
      create: {
        key: entry.key,
        name: entry.name,
        url: entry.url,
        description: entry.description,
        category: entry.category,
        isActive: entry.isActive,
      },
      update: {},
    })
  }
  console.log(`API URL seed complete: ${entries.length} entries ready.`)
}

const inferServiceType = (endpoint) => {
  const value = String(endpoint || "").toLowerCase()
  if (value.includes("wms")) return "WMS"
  if (value.includes("wmts")) return "WMTS"
  if (value.includes("mapserver")) return "ArcGIS MapServer"
  if (value.includes("featureserver")) return "ArcGIS FeatureServer"
  if (value.includes("imageserver")) return "ArcGIS ImageServer"
  return "REST API"
}

const seedDataServices = async () => {
  const existingCount = await prisma.dataService.count()
  if (existingCount > 0) {
    console.log("Data services already seeded.")
    return
  }

  const legacyServices = await prisma.apiUrl.findMany({
    where: { category: "service" },
    orderBy: [{ key: "asc" }],
  })

  if (!legacyServices.length) {
    console.log("No legacy ApiUrl service rows found for DataService seed.")
    return
  }

  for (const item of legacyServices) {
    await prisma.dataService.upsert({
      where: { key: item.key },
      create: {
        key: item.key,
        name: item.name,
        endpoint: item.url,
        serviceType: inferServiceType(item.url),
        description: item.description,
        isActive: item.isActive,
        lastChecked: item.updatedAt || item.createdAt || new Date(),
      },
      update: {},
    })
  }

  console.log(`Data service seed complete: ${legacyServices.length} entries ready.`)
}

const runSeed = async () => {
  try {
    await seedAdmin()
    await seedApiUrls()
    await seedDataServices()
  } catch (error) {
    console.error("Seed failed:", error)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

runSeed()

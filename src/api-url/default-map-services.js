export const FRONTEND_CONFIG_KEYS = [
  "MSME_BASE_REFERENCE",
  "MSME_ADMIN_BOUNDARIES",
  "MSME_ENVIRONMENT",
  "MSME_INVESTMENT",
  "MSME_SOCIAL",
  "MSME_TRANSPORT",
  "MSME_UTILITIES",
  "MSME_CADASTRAL",
  "MSME_CONSTITUENCY",
]

const sanitizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "")

export const DEFAULT_MAP_SERVICE_DEFINITIONS = [
  {
    key: "MSME_BASE_REFERENCE",
    name: "MSME Base Reference",
    description: "Base reference layers map service",
    envKey: "MSME_BASE_REFERENCE_URL",
  },
  {
    key: "MSME_ADMIN_BOUNDARIES",
    name: "MSME Administrative Boundaries",
    description: "Administrative boundaries map service",
    envKey: "MSME_ADMIN_BOUNDARIES_URL",
  },
  {
    key: "MSME_ENVIRONMENT",
    name: "MSME Environmental Constraints",
    description: "Environmental constraints map service",
    envKey: "MSME_ENVIRONMENT_URL",
  },
  {
    key: "MSME_INVESTMENT",
    name: "MSME Investment Zones",
    description: "Investment zones map service",
    envKey: "MSME_INVESTMENT_URL",
  },
  {
    key: "MSME_SOCIAL",
    name: "MSME Social Infrastructure",
    description: "Social infrastructure map service",
    envKey: "MSME_SOCIAL_URL",
  },
  {
    key: "MSME_TRANSPORT",
    name: "MSME Transportation Infrastructure",
    description: "Transportation infrastructure map service",
    envKey: "MSME_TRANSPORT_URL",
  },
  {
    key: "MSME_UTILITIES",
    name: "MSME Utilities",
    description: "Utilities map service",
    envKey: "MSME_UTILITIES_URL",
  },
  {
    key: "MSME_CADASTRAL",
    name: "MSME Haryana Cadastral",
    description: "Haryana cadastral map service",
    envKey: "MSME_CADASTRAL_URL",
  },
  {
    key: "MSME_CONSTITUENCY",
    name: "MSME Constituency Boundaries",
    description: "Constituency boundaries map service",
    envKey: "MSME_CONSTITUENCY_URL",
  },
]

export const getDefaultMapServiceEntriesFromEnv = (env = process.env) => {
  return DEFAULT_MAP_SERVICE_DEFINITIONS
    .map((item) => {
      const rawUrl = env[item.envKey]
      if (!rawUrl) return null
      return {
        key: item.key,
        name: item.name,
        description: item.description,
        url: sanitizeUrl(rawUrl),
        category: "map-service",
        isActive: true,
      }
    })
    .filter(Boolean)
}

const MSME_MAP_SERVICE_KEYS = [
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

const INVESTHRY_FEATURE_SERVICE_KEYS = [
  "VIDHANSABHA_CORE_AREA_VIEW",
  "VIDHANSABHA_CORE_AREA",
  "DISTRICT_WISE_AREA",
  "ASSEMBLY_DEMOGRAPHY",
  "NO_MSME_AREA",
  "ASSEMBLY_BND_WITH_BLOCK_HEAP",
  "BLOCK_BOUNDARY",
  "ASSEMBLY_BOUNDARY",
  "HARYANA_ASSEMBLY_BND",
  "VIDHANSABHA_MAP",
]

export const FRONTEND_CONFIG_KEYS = [
  ...MSME_MAP_SERVICE_KEYS,
  ...INVESTHRY_FEATURE_SERVICE_KEYS,
]

const sanitizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "")

export const DEFAULT_MAP_SERVICE_DEFINITIONS = [
  {
    key: "MSME_BASE_REFERENCE",
    name: "MSME Base Reference",
    description: "Base reference layers map service",
    envKey: "MSME_BASE_REFERENCE_URL",
    category: "map-service",
  },
  {
    key: "MSME_ADMIN_BOUNDARIES",
    name: "MSME Administrative Boundaries",
    description: "Administrative boundaries map service",
    envKey: "MSME_ADMIN_BOUNDARIES_URL",
    category: "map-service",
  },
  {
    key: "MSME_ENVIRONMENT",
    name: "MSME Environmental Constraints",
    description: "Environmental constraints map service",
    envKey: "MSME_ENVIRONMENT_URL",
    category: "map-service",
  },
  {
    key: "MSME_INVESTMENT",
    name: "MSME Investment Zones",
    description: "Investment zones map service",
    envKey: "MSME_INVESTMENT_URL",
    category: "map-service",
  },
  {
    key: "MSME_SOCIAL",
    name: "MSME Social Infrastructure",
    description: "Social infrastructure map service",
    envKey: "MSME_SOCIAL_URL",
    category: "map-service",
  },
  {
    key: "MSME_TRANSPORT",
    name: "MSME Transportation Infrastructure",
    description: "Transportation infrastructure map service",
    envKey: "MSME_TRANSPORT_URL",
    category: "map-service",
  },
  {
    key: "MSME_UTILITIES",
    name: "MSME Utilities",
    description: "Utilities map service",
    envKey: "MSME_UTILITIES_URL",
    category: "map-service",
  },
  {
    key: "MSME_CADASTRAL",
    name: "MSME Haryana Cadastral",
    description: "Haryana cadastral map service",
    envKey: "MSME_CADASTRAL_URL",
    category: "map-service",
  },
  {
    key: "MSME_CONSTITUENCY",
    name: "MSME Constituency Boundaries",
    description: "Constituency boundaries map service",
    envKey: "MSME_CONSTITUENCY_URL",
    category: "map-service",
  },
  {
    key: "VIDHANSABHA_CORE_AREA_VIEW",
    name: "Vidhan Sabha Core Area View",
    description: "Invest Haryana hosted layer for Vidhan Sabha core area view",
    envKey: "VIDHANSABHA_CORE_AREA_VIEW_URL",
    category: "feature-service",
  },
  {
    key: "VIDHANSABHA_CORE_AREA",
    name: "Vidhan Sabha Core Area",
    description: "Invest Haryana hosted layer for Vidhan Sabha core area",
    envKey: "VIDHANSABHA_CORE_AREA_URL",
    category: "feature-service",
  },
  {
    key: "DISTRICT_WISE_AREA",
    name: "District Wise Area",
    description: "Invest Haryana hosted district wise area layer",
    envKey: "DISTRICT_WISE_AREA_URL",
    category: "feature-service",
  },
  {
    key: "ASSEMBLY_DEMOGRAPHY",
    name: "Assembly Demography",
    description: "Invest Haryana hosted assembly demography layer",
    envKey: "ASSEMBLY_DEMOGRAPHY_URL",
    category: "feature-service",
  },
  {
    key: "NO_MSME_AREA",
    name: "No MSME Area",
    description: "Invest Haryana hosted no-MSME area layer",
    envKey: "NO_MSME_AREA_URL",
    category: "feature-service",
  },
  {
    key: "ASSEMBLY_BND_WITH_BLOCK_HEAP",
    name: "Assembly Boundary With Block Heap",
    description: "Invest Haryana hosted assembly boundary with block heap layer",
    envKey: "ASSEMBLY_BND_WITH_BLOCK_HEAP_URL",
    category: "feature-service",
  },
  {
    key: "BLOCK_BOUNDARY",
    name: "Block Boundary",
    description: "Invest Haryana hosted block boundary layer",
    envKey: "BLOCK_BOUNDARY_URL",
    category: "feature-service",
  },
  {
    key: "ASSEMBLY_BOUNDARY",
    name: "Assembly Boundary",
    description: "Invest Haryana hosted assembly boundary layer",
    envKey: "ASSEMBLY_BOUNDARY_URL",
    category: "feature-service",
  },
  {
    key: "HARYANA_ASSEMBLY_BND",
    name: "Haryana Assembly Boundary",
    description: "Invest Haryana hosted Haryana assembly boundary layer",
    envKey: "HARYANA_ASSEMBLY_BND_URL",
    category: "feature-service",
  },
  {
    key: "VIDHANSABHA_MAP",
    name: "Vidhan Sabha Map",
    description: "Invest Haryana Vidhan Sabha map layer",
    envKey: "VIDHANSABHA_MAP_URL",
    category: "feature-service",
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
        category: item.category || "general",
        isActive: true,
      }
    })
    .filter(Boolean)
}

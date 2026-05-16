import prisma from "../config/db.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { randomUUID } from "crypto"

const normalizeText = (value) => String(value || "").trim()
const normalizeRole = (value) => normalizeText(value).toLowerCase()

const toLabelCase = (value) => {
  const text = normalizeText(value)
  if (!text) return ""
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

const toUserStatus = ({ role, hasActiveSession }) => {
  const normalizedRole = normalizeRole(role)
  if (normalizedRole === "blocked") {
    return "Blocked"
  }
  return hasActiveSession ? "Active" : "Inactive"
}

const formatDateTime = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata"
  })
}

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"]

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim()
  }

  return req.ip || req.socket?.remoteAddress || null
}

// ================= SIGNUP =================
export const signup = async (req, res) => {
  try {
    let { fullname, email, password, mobile } = req.body

    fullname = fullname?.trim()
    email = email?.trim()
    mobile = mobile?.trim()

    if (!fullname || !email || !password || !mobile) {
      return res.status(400).json({ message: "All fields are required" })
    }

    if (fullname.length < 3) {
      return res.status(400).json({
        message: "Name must be at least 3 characters"
      })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format"
      })
    }

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({
        message: "Invalid mobile number"
      })
    }

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be at least 6 characters and include letters and numbers"
      })
    }

    const exist = await prisma.user.findUnique({
      where: { email }
    })

    if (exist) {
      return res.status(400).json({
        message: "User already exists"
      })
    }

    const hash = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        fullname,
        email,
        password: hash,
        mobile
      }
    })

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.AUTH_SECRET,
      { expiresIn: "1d" }
    )

    res.status(201).json({
      message: "Signup successful",
      token,
      user: {
        id: user.id,
        fullname: user.fullname,
        email: user.email
      }
    })
  } catch (error) {
    console.error("Signup Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// ================= LOGIN =================
export const login = async (req, res) => {
  try {
    let { email, password } = req.body

    email = email?.trim()

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required"
      })
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      })
    }

    const match = await bcrypt.compare(password, user.password)

    if (!match) {
      return res.status(401).json({
        message: "Wrong password"
      })
    }

    const session = await prisma.sessionLog.create({
      data: {
        userId: user.id,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"]?.slice(0, 255) || null
      }
    })

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        sessionId: session.id,
        jti: randomUUID()
      },
      process.env.AUTH_SECRET,
      { expiresIn: "1d" }
    )

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        fullname: user.fullname,
        email: user.email
      }
    })
  } catch (error) {
    console.error("Login Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

const verifyGoogleIdToken = async (idToken) => {
  try {
    const tokenInfoUrl = process.env.GOOGLE_TOKENINFO_URL
    if (!tokenInfoUrl) {
      console.warn("GOOGLE_TOKENINFO_URL is not configured.")
      return null
    }

    const separator = tokenInfoUrl.includes("?") ? "&" : "?"
    const response = await fetch(
      `${tokenInfoUrl}${separator}id_token=${encodeURIComponent(idToken)}`
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    if (data.aud !== process.env.GOOGLE_CLIENT_ID) {
      return null
    }

    return data
  } catch (error) {
    console.error("Google token verification failed:", error)
    return null
  }
}

export const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body

    if (!idToken) {
      return res.status(400).json({ message: "Google ID token required" })
    }

    const tokenData = await verifyGoogleIdToken(idToken)

    if (!tokenData || tokenData.email_verified !== "true") {
      return res.status(401).json({ message: "Invalid or unverified Google token" })
    }

    const email = tokenData.email?.trim()?.toLowerCase()
    const fullname = tokenData.name?.trim() || email

    if (!email) {
      return res.status(400).json({ message: "Google token did not return email" })
    }

    let user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      const generatedPassword = randomUUID()
      const hashedPassword = await bcrypt.hash(generatedPassword, 10)
      const fallbackMobile = process.env.GOOGLE_DEFAULT_MOBILE || `g_${Date.now()}`

      user = await prisma.user.create({
        data: {
          fullname,
          email,
          password: hashedPassword,
          mobile: fallbackMobile,
          role: "user"
        }
      })
    }

    const session = await prisma.sessionLog.create({
      data: {
        userId: user.id,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"]?.slice(0, 255) || null
      }
    })

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        sessionId: session.id,
        jti: randomUUID()
      },
      process.env.AUTH_SECRET,
      { expiresIn: "1d" }
    )

    res.json({
      message: "Google login successful",
      token,
      user: {
        id: user.id,
        fullname: user.fullname,
        email: user.email
      }
    })
  } catch (error) {
    console.error("Google Login Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// ================= LOGOUT =================
export const logout = async (req, res) => {
  try {
    const userId = req.user?.id
    const sessionId = req.user?.sessionId

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    let updated = 0

    if (sessionId) {
      const result = await prisma.sessionLog.updateMany({
        where: {
          id: sessionId,
          userId,
          isActive: true
        },
        data: {
          logoutAt: new Date(),
          isActive: false
        }
      })

      updated = result.count
    }

    if (!updated) {
      const latestActiveSession = await prisma.sessionLog.findFirst({
        where: {
          userId,
          isActive: true
        },
        orderBy: {
          loginAt: "desc"
        }
      })

      if (latestActiveSession) {
        await prisma.sessionLog.update({
          where: { id: latestActiveSession.id },
          data: {
            logoutAt: new Date(),
            isActive: false
          }
        })
      }
    }

    return res.json({ message: "Logout successful" })
  } catch (error) {
    console.error("Logout Error:", error)
    return res.status(500).json({ message: "Internal server error" })
  }
}

// ================= ADMIN LOGIN =================
export const adminLogin = async (req, res) => {
  try {
    const { adminId, password } = req.body

    if (!adminId || !password) {
      return res.status(400).json({ message: "Admin ID and password required" })
    }

    // Find admin user by email or fullname with admin/superadmin role
    const admin = await prisma.user.findFirst({
      where: {
        OR: [
          { email: adminId },
          { fullname: adminId }
        ],
        role: { in: ["admin", "superadmin"] }
      }
    })

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" })
    }

    const match = await bcrypt.compare(password, admin.password)

    if (!match) {
      return res.status(401).json({ message: "Wrong password" })
    }

    // Create session log
    const session = await prisma.sessionLog.create({
      data: {
        userId: admin.id,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"]?.slice(0, 255) || null
      }
    })

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        sessionId: session.id,
        jti: randomUUID()
      },
      process.env.AUTH_SECRET,
      { expiresIn: "1d" }
    )

    res.json({
      message: "Admin login success",
      token,
      user: {
        id: admin.id,
        email: admin.email,
        fullname: admin.fullname,
        role: admin.role
      }
    })
  } catch (error) {
    console.error("Admin Login Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// ================= GET ME (Current User) =================
export const getMe = async (req, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullname: true,
        email: true,
        mobile: true,
        role: true,
        createdAt: true
      }
    })

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.json({ user })
  } catch (error) {
    console.error("GetMe Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// ================= ADMIN SESSION LOGS =================
export const getSessionLogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100)
    const skip = (page - 1) * limit

    const [total, sessions] = await prisma.$transaction([
      prisma.sessionLog.count(),
      prisma.sessionLog.findMany({
        skip,
        take: limit,
        orderBy: { loginAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              fullname: true,
              email: true,
              role: true
            }
          }
        }
      })
    ])

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      sessions
    })
  } catch (error) {
    console.error("Get Session Logs Error:", error)
    return res.status(500).json({ message: "Internal server error" })
  }
}

// ================= ADMIN USERS (LIST + STATS) =================
export const getAdminUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 100)
    const skip = (page - 1) * limit

    const search = normalizeText(req.query.search)
    const roleFilter = normalizeRole(req.query.role)
    const statusFilter = normalizeRole(req.query.status)

    const where = {}

    if (search) {
      where.OR = [
        { fullname: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { mobile: { contains: search, mode: "insensitive" } }
      ]
    }

    if (roleFilter && roleFilter !== "all") {
      where.role = roleFilter
    }

    if (statusFilter === "active") {
      where.sessions = { some: { isActive: true } }
    } else if (statusFilter === "inactive") {
      where.AND = [...(where.AND || []), { sessions: { none: { isActive: true } }, role: { not: "blocked" } }]
    } else if (statusFilter === "blocked") {
      where.role = "blocked"
    }

    const [totalUsers, activeUsers, blockedUsers, totalFiltered, users] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { sessions: { some: { isActive: true } }, role: { not: "blocked" } } }),
      prisma.user.count({ where: { role: "blocked" } }),
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullname: true,
          email: true,
          role: true,
          mobile: true,
          createdAt: true,
          sessions: {
            orderBy: { loginAt: "desc" },
            take: 1,
            select: {
              loginAt: true,
              isActive: true
            }
          }
        }
      })
    ])

    const inactiveUsers = Math.max(totalUsers - activeUsers - blockedUsers, 0)

    const mappedUsers = users.map((user) => {
      const latestSession = user.sessions[0]
      const hasActiveSession = Boolean(latestSession?.isActive)
      const status = toUserStatus({ role: user.role, hasActiveSession })
      return {
        id: user.id,
        name: user.fullname,
        email: user.email,
        mobile: user.mobile,
        role: toLabelCase(user.role || "user"),
        status,
        lastActive: formatDateTime(latestSession?.loginAt || user.createdAt)
      }
    })

    const roleRows = await prisma.user.groupBy({
      by: ["role"],
      _count: { role: true }
    })

    const roleOptions = ["All", ...roleRows.map((row) => toLabelCase(row.role))]

    return res.json({
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        blockedUsers
      },
      filters: {
        roleOptions,
        statusOptions: ["All", "Active", "Inactive", "Blocked"]
      },
      users: mappedUsers,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.max(Math.ceil(totalFiltered / limit), 1)
      }
    })
  } catch (error) {
    console.error("Get Admin Users Error:", error)
    return res.status(500).json({ message: "Internal server error" })
  }
}

// ================= ADMIN USER STATUS UPDATE =================
export const updateAdminUserStatus = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10)
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" })
    }

    const requestedStatus = toLabelCase(req.body?.status)
    if (!["Active", "Inactive", "Blocked"].includes(requestedStatus)) {
      return res.status(400).json({ message: "Invalid status. Use Active, Inactive or Blocked." })
    }

    const actorId = Number(req.user?.id || 0)
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullname: true,
        email: true,
        role: true
      }
    })

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" })
    }

    if (targetUser.id === actorId) {
      return res.status(400).json({ message: "You cannot update your own status." })
    }

    const targetRole = normalizeRole(targetUser.role)
    if (["admin", "superadmin"].includes(targetRole)) {
      return res.status(403).json({ message: "Admin/Superadmin status cannot be changed from this action." })
    }

    const updateData = {}
    const sessionUpdateData = {}

    if (requestedStatus === "Blocked") {
      updateData.role = "blocked"
      sessionUpdateData.isActive = false
      sessionUpdateData.logoutAt = new Date()
    } else if (requestedStatus === "Inactive") {
      if (targetRole === "blocked") {
        updateData.role = "user"
      }
      sessionUpdateData.isActive = false
      sessionUpdateData.logoutAt = new Date()
    } else if (requestedStatus === "Active") {
      if (targetRole === "blocked") {
        const nextRole = normalizeRole(req.body?.role)
        updateData.role = nextRole && nextRole !== "blocked" ? nextRole : "user"
      }
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length) {
        await tx.user.update({
          where: { id: userId },
          data: updateData
        })
      }

      if (Object.keys(sessionUpdateData).length) {
        await tx.sessionLog.updateMany({
          where: {
            userId,
            isActive: true
          },
          data: sessionUpdateData
        })
      }
    })

    return res.json({
      message: `User status updated to ${requestedStatus}.`
    })
  } catch (error) {
    console.error("Update Admin User Status Error:", error)
    return res.status(500).json({ message: "Internal server error" })
  }
}

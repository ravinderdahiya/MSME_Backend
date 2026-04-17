import prisma from "../config/db.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

// ================= SIGNUP =================
export const signup = async (req, res) => {
  try {
    let { fullname, email, password, mobile } = req.body

    // 🔹 Trim inputs
    fullname = fullname?.trim()
    email = email?.trim()
    mobile = mobile?.trim()

    // 🔹 Required validation
    if (!fullname || !email || !password || !mobile) {
      return res.status(400).json({ message: "All fields are required" })
    }

    // 🔹 Name validation
    if (fullname.length < 3) {
      return res.status(400).json({
        message: "Name must be at least 3 characters"
      })
    }

    // 🔹 Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format"
      })
    }

    // 🔹 Mobile validation (India)
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({
        message: "Invalid mobile number"
      })
    }

    // 🔹 Password validation
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be at least 6 characters and include letters and numbers"
      })
    }

    // 🔹 Check existing user
    const exist = await prisma.user.findUnique({
      where: { email }
    })

    if (exist) {
      return res.status(400).json({
        message: "User already exists"
      })
    }

    // 🔹 Hash password
    const hash = await bcrypt.hash(password, 10)

    // 🔹 Create user
    const user = await prisma.user.create({
      data: {
        fullname,
        email,
        password: hash,
        mobile
      }
    })

    // 🔹 Generate token
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

    // 🔹 Required validation
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required"
      })
    }

    // 🔹 Find user
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      })
    }

    // 🔹 Compare password
    const match = await bcrypt.compare(password, user.password)

    if (!match) {
      return res.status(401).json({
        message: "Wrong password"
      })
    }

    // 🔹 Generate token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
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
```

import express from "express"
import dotenv from "dotenv"
import userRoutes from "./user/user.routes.js"
import cors from "cors"

dotenv.config()

const app = express()

// CORS
app.use(cors({
  origin:'http://localhost:3000'
}))

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Routes
app.use("/user", userRoutes)

// Server
app.listen(8080, () => {
  console.log("Server running on 8080")
})
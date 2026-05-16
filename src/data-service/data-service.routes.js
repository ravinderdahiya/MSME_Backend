import { Router } from "express"
import {
  createDataService,
  deleteDataService,
  listDataServices,
  updateDataService,
} from "./data-service.controller.js"
import { authMiddleware, isAdmin } from "../middleware/auth.middleware.js"

const router = Router()

router.get("/", authMiddleware, listDataServices)
router.post("/", authMiddleware, isAdmin, createDataService)
router.put("/:id", authMiddleware, isAdmin, updateDataService)
router.delete("/:id", authMiddleware, isAdmin, deleteDataService)

export default router

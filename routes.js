import express from "express"

const router = express.Router()

router.get("/" , (req,res)=>{
  res.status(200).json({
    "message" : "Nodejs server started",
    "status" : 200,
  })
})

export default router
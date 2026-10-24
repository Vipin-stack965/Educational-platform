import multer from "multer"
import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { extname } from "node:path"
import { fileURLToPath } from "node:url"

const uploadDirectory = fileURLToPath(new URL("../public/", import.meta.url))
mkdirSync(uploadDirectory, { recursive: true })

let storage = multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null , uploadDirectory)
    },
    filename:(req,file,cb)=>{
        cb(null , `${randomUUID()}${extname(file.originalname)}`)
    }

})
const upload = multer({storage})

export default upload
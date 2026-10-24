import { Server } from "socket.io"
import http from "http"
import express from "express"
const app = express()
const server = http.createServer(app)

const io = new Server(server,{
    cors:{
        origin:"http://localhost:5173",
        methods:["GET" , "POST" , "PUT" , "DELETE"]
    }
})

const userSocketMap = {}

io.on("connection" , (socket)=>{
    
    const userId=socket.handshake.query.userId
    if(userId!=undefined){
        userSocketMap[userId] = socket.id
    }

    

    socket.on('disconnect',()=>{
        delete userSocketMap[userId]
    })
})

export {app,io, server}
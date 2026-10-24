import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setAllChannelData, setChannelData } from '../redux/userSlice'
import axios from 'axios'
import { serverUrl } from '../config'

const UsegetChannel = () => {
  const dispatch = useDispatch()
  const isAuthLoading = useSelector(state => state.user.isAuthLoading)
  const userId = useSelector(state => state.user.userData?._id)
  useEffect(()=>{
   if (isAuthLoading || !userId) return
   const fetchChannel = async () => {
    try {
        const result = await axios.get(serverUrl + "/api/user/getchannel" , {withCredentials:true})
        dispatch(setChannelData(result.data))
        console.log(result.data)
    } catch (error) {
        console.log(error)
        dispatch(setChannelData(null))
    }
   }
   fetchChannel()
  },[dispatch, isAuthLoading, userId])

  useEffect(()=>{
   if (isAuthLoading) return
   const fetchAllChannel = async () => {
    try {
        const result = await axios.get(serverUrl + "/api/user/getallchannel" , {withCredentials:true})
        dispatch(setAllChannelData(result.data))
        console.log(result.data)
    } catch (error) {
        console.log(error)
        dispatch(setAllChannelData(null))
    }
   }
   fetchAllChannel()
  },[dispatch, isAuthLoading])
}

export default UsegetChannel

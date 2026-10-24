import axios from 'axios'
import React, { useEffect } from 'react'
import { serverUrl } from '../config'
import { useDispatch } from 'react-redux'
import { setAuthLoading, setUserData } from '../redux/userSlice'

let guestSessionRequest

const useGetCurrentUser = () => {
    const dispatch = useDispatch()

  useEffect(()=>{
   let isMounted = true
   const fetchUser = async () => {
    try {
        let result
        try {
          result = await axios.get(serverUrl + "/api/user/getcurrentuser", { withCredentials: true })
        } catch (error) {
          if (![401, 400].includes(error.response?.status)) throw error
          guestSessionRequest ||= axios.post(serverUrl + "/api/auth/guest-session", {}, { withCredentials: true })
          try {
            result = await guestSessionRequest
          } finally {
            guestSessionRequest = undefined
          }
        }
        if (isMounted) {
            dispatch(setUserData(result.data))
        }
    } catch (error) {
        console.log(error)
        if (isMounted) {
            dispatch(setUserData(null))
        }
    } finally {
        if (isMounted) {
            dispatch(setAuthLoading(false))
        }
    }
   }
   fetchUser()
   return () => {
    isMounted = false
   }
  },[dispatch])
}

export default useGetCurrentUser

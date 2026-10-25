import axios from 'axios'
import React, { useEffect } from 'react'
import { serverUrl } from '../config'
import { useDispatch } from 'react-redux'
import { setAuthLoading, setUserData } from '../redux/userSlice'
import { clearOfflineUser, getOfflineUser, saveOfflineUser } from '../utils/offlineStorage'

let guestSessionRequest
let agentReviewSessionRequest

const useGetCurrentUser = () => {
    const dispatch = useDispatch()

  useEffect(()=>{
   let isMounted = true
   const fetchUser = async () => {
    try {
        let result
        const requestedAgentReview = new URLSearchParams(window.location.search).get("agentReview") === "1"
        if (requestedAgentReview) {
          agentReviewSessionRequest ||= axios.post(
            serverUrl + "/api/auth/agent-guest-session",
            {},
            { withCredentials: true }
          ).finally(() => {
            agentReviewSessionRequest = undefined
          })
          result = await agentReviewSessionRequest
          const cleanUrl = new URL(window.location.href)
          cleanUrl.searchParams.delete("agentReview")
          window.history.replaceState(window.history.state, "", cleanUrl)
        } else {
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
        }
        if (result.data?.isGuest) clearOfflineUser()
        else saveOfflineUser(result.data)
        if (isMounted) dispatch(setUserData(result.data))
    } catch (error) {
        console.log(error)
        if (isMounted) {
            dispatch(setUserData(error.response ? null : getOfflineUser()))
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

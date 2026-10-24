import React, { useEffect } from 'react'
import { Route, Routes, Navigate, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Shorts from './pages/Shorts'
import YoutubeSignin from './pages/YoutubeSignin'
import CustomAlert, { showCustomAlert } from './component/CustomAlert'
import CreateAccount from './pages/CreateAccount'
import useGetCurrentUser from './customHooks/UsegetCurrentUser'
import { useSelector } from 'react-redux'
import ForgetPassword from './pages/ForgetPassword'
import CreateChannelFlow from './pages/CreateChannelFlow'
import ViewChannel from './pages/ViewChannel'
import UpdateChannel from './pages/UpdateChannel'
import MobileProfile from './pages/MobileProfile'
import UsegetChannel from './customHooks/UsegetChannel'
import CreatePage from './pages/CreatePage'
import CreateVideo from './pages/CreateVideo'
import CreatePost from './pages/CreatePost'
import CreateShorts from './pages/CreateShorts'
import CreatePlaylist from './pages/CreatePlaylist'
import UsegetChannelContent from './customHooks/UsegetChannelContent'
import UsegetAllContent from './customHooks/UsegetAllContentData'
import WatchVideoPage from './pages/WatchVideoPage'
import WatchShortPage from './pages/WatchShortPage'
import ChannelPage from './pages/ChannelPage'
import SubscribePage from './pages/SubscribePage'
import UseGetSubscribedContent from './customHooks/UseGetSubscribedContent'
import SavedPlaylistPage from './pages/SavedPlaylistPage'
import SavedContentPage from './pages/SavedContentPage'
import LikedContentPage from './pages/LikedContentPage'
import ScrollToTop from './component/ScrollToTop'
import HistoryPage from './pages/HistoryPage'
import UseGetHistory from './customHooks/UseGetHistroy'
import PTStudio from './pages/PTStudio'
import Dashboard from './component/Dashboard'
import ContentPage from './component/ContentPage'
import AnalyticsPage from './component/AnalyticsPage'
import ManageVideo from './pages/ManageVideo'
import ManageShort from './pages/ManageShort'
import ManagePlaylist from './pages/ManagePlaylist'
import UseGetRecommendation from './customHooks/UseGetRecommendation'
import RevenuePage from './component/RevenuePage'
import SettingsPage from './pages/SettingsPage'
import HelpPage from './pages/HelpPage'
import FeedbackPage from './pages/FeedbackPage'

const ProtectedRoute = ({ userData, isAuthLoading, children, accountOnly = false }) => {
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] text-white">
        Loading your session...
      </div>
    );
  }

  if (!userData) {
    showCustomAlert("Unable to start your session. Please try again.");
    return <Navigate to="/" replace />;
  }
  if (accountOnly && userData.isGuest) {
    showCustomAlert("Sign in to send feedback.");
    return <Navigate to="/signin" replace />;
  }
  return children;
};

function App() {
  useGetCurrentUser()
  UsegetChannel()
  UsegetChannelContent()
  UsegetAllContent()
  UseGetSubscribedContent()
  UseGetHistory()
  UseGetRecommendation()

  const { userData, isAuthLoading } = useSelector(state => state.user)
  const themePreference = userData?.preferences?.theme || "system"
  const languagePreference = userData?.preferences?.language || "en"

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
    const applyPreferences = () => {
      const theme = themePreference === "system"
        ? (systemTheme.matches ? "dark" : "light")
        : themePreference
      document.documentElement.dataset.theme = theme
      document.documentElement.lang = languagePreference
    }

    applyPreferences()
    if (themePreference === "system") {
      systemTheme.addEventListener("change", applyPreferences)
    }
    return () => systemTheme.removeEventListener("change", applyPreferences)
  }, [themePreference, languagePreference])

  const protect = (children, accountOnly = false) => (
    <ProtectedRoute userData={userData} isAuthLoading={isAuthLoading} accountOnly={accountOnly}>
      {children}
    </ProtectedRoute>
  )
  

 
  function ChannelPageWrapper() {
  const location = useLocation();
  return <ChannelPage key={location.pathname} />;
}

  return (
    <>
      <CustomAlert />
      <ScrollToTop/>
      <Routes>
        <Route path='/' element={<Home />}>
          <Route path='/shorts' element={protect(<Shorts />)} />
          <Route path='/viewchannel' element={protect(<ViewChannel />)} />
          <Route path='/updatechannel' element={protect(<UpdateChannel />)} />
          <Route path='/mobileprofile' element={<MobileProfile />} />
          <Route path='/settings' element={protect(<SettingsPage />)} />
          <Route path='/help' element={<HelpPage />} />
          <Route path='/send-feedback' element={protect(<FeedbackPage />, true)} />
        <Route path='/createpage' element={protect(<CreatePage />)} />
          <Route path='/create-video' element={protect(<CreateVideo />)} />
          <Route path='/create-post' element={protect(<CreatePost />)} />
          <Route path='/create-short' element={protect(<CreateShorts />)} />
          <Route path='/create-playlist' element={protect(<CreatePlaylist />)} />
          <Route path='/watch-short/:shortId' element={protect(<WatchShortPage />)} />
          <Route path='/channelpage/:channelId' element={protect(<ChannelPageWrapper />)} />
          <Route path='/subscribepage' element={protect(<SubscribePage />)} />
          <Route path='/saveplaylist' element={protect(<SavedPlaylistPage />)} />
          <Route path='/savevideos' element={protect(<SavedContentPage />)} />
          <Route path='/likedvideos' element={protect(<LikedContentPage />)} />
          <Route path='/history' element={protect(<HistoryPage />)} />

          
          
        </Route>

        {/* Routes outside Home */}
        <Route path='/signin' element={<YoutubeSignin />} />
        <Route path='/signup' element={<CreateAccount />} />
        <Route path='/forgetpassword' element={<ForgetPassword />}/>
        <Route path='/createchannel' element={protect(<CreateChannelFlow />)} />
        <Route path='/watch-video/:videoId' element={protect(<WatchVideoPage />)} />
        
       
       
       
       
     <Route path='/ptstudio' element={protect(<PTStudio />)} >
   <Route path='/ptstudio/dashboard' element={protect(<Dashboard />)} />
   <Route path='/ptstudio/content' element={protect(<ContentPage />)} />
   <Route path='/ptstudio/analytics' element={protect(<AnalyticsPage />)} />
   <Route path='/ptstudio/revenue' element={protect(<RevenuePage />)} />
   <Route path='/ptstudio/managevideo/:videoId' element={protect(<ManageVideo />)} />
   <Route path='/ptstudio/manageshort/:shortId' element={protect(<ManageShort />)} />
   <Route path='/ptstudio/manageplaylist/:playlistId' element={protect(<ManagePlaylist />)} />
    </Route>
    
   

        
        
      </Routes>
    </>
  )
}

export default App

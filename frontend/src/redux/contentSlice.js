import { createSlice } from "@reduxjs/toolkit";

const mergeVideos = (currentVideos, incomingVideos) => {
    const videosById = new Map(
        (Array.isArray(currentVideos) ? currentVideos : [])
            .filter((video) => video?._id)
            .map((video) => [video._id, video])
    );

    for (const video of incomingVideos) {
        if (video?._id) {
            videosById.set(video._id, video);
        }
    }

    return [...videosById.values()].sort(
        (first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0)
    );
};

const contentSlice = createSlice({
    name:"content",
    initialState:{
        videoData:null,
        allVideoData:null,
        allShortData:null,
        allPostData:null,
        recommendationData:null,
        contentRevenue:null
        
        
    },
    reducers:{
        setVideoData:(state,action)=>{
            state.videoData = action.payload
        },
        setAllVideoData:(state,action)=>{
            state.allVideoData = action.payload
        },
        mergeAllVideoData:(state,action)=>{
            state.allVideoData = mergeVideos(state.allVideoData, action.payload)
        },
        addVideoData:(state,action)=>{
            state.allVideoData = mergeVideos(state.allVideoData, [action.payload])
        },
        setAllShortData:(state,action)=>{
            state.allShortData = action.payload
        },
         setAllPostData:(state,action)=>{
            state.allPostData = action.payload
        },
        setRecommendationData:(state,action)=>{
            state.recommendationData = action.payload
        },
        setContentRevenue:(state,action)=>{
            state.contentRevenue = action.payload
        },
        
        
        
    }
})
 
export const {setVideoData} = contentSlice.actions
export const {setAllVideoData} = contentSlice.actions
export const {mergeAllVideoData, addVideoData} = contentSlice.actions
export const {setAllShortData} = contentSlice.actions
export const {setAllPostData} = contentSlice.actions
export const {setRecommendationData} = contentSlice.actions
export const {setContentRevenue} = contentSlice.actions

export default contentSlice.reducer

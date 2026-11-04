import Channel from "../model/channelModel.js";
import ChannelMembership from "../model/channelMembershipModel.js";
import CommerceOffering from "../model/commerceOfferingModel.js";
import CommerceTransaction from "../model/commerceTransactionModel.js";
import Playlist from "../model/playlistModel.js";
import Video from "../model/videoModel.js";

export const canAccessPaidVideo = async (userId, video) => {
  if (!userId || !video?.isPaidContent) return { entitled: false, owner: false };

  const channel = await Channel.findById(video.channel).select("owner").lean();
  if (channel && String(channel.owner) === String(userId)) {
    return { entitled: true, owner: true };
  }

  const [directOfferingIds, playlistsContainingVideo] = await Promise.all([
    CommerceOffering.find({
      type: "video",
      targetType: "Video",
      targetId: video._id,
      channel: video.channel,
    }).distinct("_id"),
    Playlist.find({ videos: video._id, channel: video.channel }).distinct("_id"),
  ]);
  const courseOfferingIds = playlistsContainingVideo.length
    ? await CommerceOffering.find({
        type: "course",
        targetType: "Playlist",
        targetId: { $in: playlistsContainingVideo },
        channel: video.channel,
      }).distinct("_id")
    : [];
  const [purchase, membership] = await Promise.all([
    CommerceTransaction.exists({
      user: userId,
      type: "purchase",
      status: "paid",
      offering: { $in: [...directOfferingIds, ...courseOfferingIds] },
    }),
    ChannelMembership.exists({
      user: userId,
      channel: video.channel,
      $or: [
        { status: "active", $or: [{ currentPeriodEnd: null }, { currentPeriodEnd: { $gt: new Date() } }] },
        { status: "cancelled", currentPeriodEnd: { $gt: new Date() } },
      ],
    }),
  ]);

  return { entitled: Boolean(purchase || membership), owner: false };
};

export const getPlaylistAccess = async (userId, playlist) => {
  if (!userId || !playlist) return { entitled: false, owner: false };
  const channel = await Channel.findById(playlist.channel).select("owner").lean();
  if (channel && String(channel.owner) === String(userId)) return { entitled: true, owner: true };
  if (!playlist.videos?.length) return { entitled: false, owner: false };
  const protectedVideoCount = await Video.countDocuments({
    _id: { $in: playlist.videos },
    channel: playlist.channel,
    isPaidContent: true,
    mediaDeliveryType: "authenticated",
    mediaPublicId: { $ne: "" },
  });
  if (protectedVideoCount !== playlist.videos.length) return { entitled: false, owner: false };

  const [courseOfferingIds, membership] = await Promise.all([
    CommerceOffering.find({
      type: "course",
      targetType: "Playlist",
      targetId: playlist._id,
      channel: playlist.channel,
    }).distinct("_id"),
    ChannelMembership.exists({
      user: userId,
      channel: playlist.channel,
      $or: [
        { status: "active", $or: [{ currentPeriodEnd: null }, { currentPeriodEnd: { $gt: new Date() } }] },
        { status: "cancelled", currentPeriodEnd: { $gt: new Date() } },
      ],
    }),
  ]);
  const purchase = courseOfferingIds.length
    ? await CommerceTransaction.exists({
        user: userId, offering: { $in: courseOfferingIds }, type: "purchase", status: "paid",
      })
    : false;
  return { entitled: Boolean(purchase || membership), owner: false };
};

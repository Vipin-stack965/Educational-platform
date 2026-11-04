import { v2 as cloudinary } from 'cloudinary'
import fs from "fs"

const normalizeConfigValue = (value) => typeof value === "string" ? value.trim() : ""
const isPlaceholderValue = (value) => {
  if (!value) return true
  return /add .*cloudinary|your .*cloudinary|placeholder|example/i.test(value)
}

export const getCloudinaryUploadErrorMessage = (error, resourceLabel = "file") => {
  const cloudinaryError = error?.error || error
  const statusCode = cloudinaryError?.http_code || error?.http_code

  if (statusCode === 403) {
    return `Cloudinary denied the ${resourceLabel} upload (HTTP 403). Check that the API key has upload permission and the Cloudinary account allows uploads.`
  }

  return cloudinaryError?.message || error?.message || "Unknown Cloudinary upload error"
}

const configureCloudinary = ({ requireAuthToken = false } = {}) => {
  const cloudName = normalizeConfigValue(process.env.CLOUDINARY_NAME)
  const apiKey = normalizeConfigValue(process.env.CLOUDINARY_API_KEY)
  const apiSecret = normalizeConfigValue(process.env.CLOUDINARY_API_SECRET)
  const authTokenKey = normalizeConfigValue(process.env.CLOUDINARY_AUTH_TOKEN_KEY)

  if (isPlaceholderValue(cloudName) || isPlaceholderValue(apiKey) || isPlaceholderValue(apiSecret)) {
    throw new Error(
      "Cloudinary is not configured. Add valid CLOUDINARY_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET values in backend/.env."
    )
  }
  if (requireAuthToken && isPlaceholderValue(authTokenKey)) {
    throw new Error(
      "Cloudinary authenticated delivery is not configured. Set CLOUDINARY_AUTH_TOKEN_KEY to the token key configured for your Cloudinary delivery domain."
    )
  }
  if (requireAuthToken && !/^[a-f0-9]{32,}$/i.test(authTokenKey)) {
    throw new Error("CLOUDINARY_AUTH_TOKEN_KEY must be the hexadecimal token key configured in Cloudinary.");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    ...(authTokenKey ? { auth_token: { key: authTokenKey } } : {}),
  })
}

const uploadOnCloudinary = async (
  filePath,
  { resourceType = "auto", large = false, folder, keepFile = false, returnDetails = false, deliveryType = "upload" } = {}
) => {
  try {
    if (!filePath) {
      return null
    }

    configureCloudinary({ requireAuthToken: deliveryType === "authenticated" })

    const uploadOptions = {
      resource_type: resourceType,
      ...(folder ? { folder } : {}),
      ...(deliveryType !== "upload" ? { type: deliveryType } : {}),
    }
    const uploadResult = large
      ? await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_large(
            filePath,
            { ...uploadOptions, chunk_size: 20 * 1024 * 1024 },
            (error, result) => {
              if (error) {
                reject(error)
                return
              }
              resolve(result)
            }
          )
          uploadStream.on("error", reject)
        })
      : await cloudinary.uploader.upload(filePath, uploadOptions)
    if (!uploadResult?.secure_url) {
      throw new Error("Cloudinary completed the upload without returning a secure URL.")
    }
    if (!returnDetails) return uploadResult.secure_url
    return {
      secureUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      resourceType: uploadResult.resource_type,
      deliveryType: uploadResult.type || deliveryType,
      version: uploadResult.version,
      format: uploadResult.format,
    }
  } finally {
    if (!keepFile && filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

export const deleteCloudinaryAsset = async ({ publicId, resourceType, deliveryType }) => {
  if (!publicId || !resourceType) return;
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    ...(deliveryType && deliveryType !== "upload" ? { type: deliveryType } : {}),
  });
};

export const createAuthenticatedPlaybackUrl = ({
  publicId,
  resourceType = "video",
  version,
  format,
  durationSeconds = 3600,
}) => {
  const authTokenKey = normalizeConfigValue(process.env.CLOUDINARY_AUTH_TOKEN_KEY)
  configureCloudinary({ requireAuthToken: true })
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    secure: true,
    sign_url: true,
    analytics: false,
    version,
    format,
    auth_token: {
      key: authTokenKey,
      duration: durationSeconds,
    },
  })
}

export default uploadOnCloudinary

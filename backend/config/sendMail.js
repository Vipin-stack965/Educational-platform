import nodemailer from "nodemailer"
import { fileURLToPath } from "node:url"

const createMailAuthError = (cause) => {
  const error = new Error(
    "Gmail rejected the email credentials. Set USER_EMAIL to the Gmail address and USER_PASSWORD to its 16-character Google App Password."
  )
  error.code = "EMAIL_AUTH_FAILED"
  error.cause = cause
  return error
}

const sendWithGmail = async (to, subject, html, attachments = []) => {
  const userEmail = process.env.USER_EMAIL?.trim()
  const userPassword = process.env.USER_PASSWORD?.replace(/\s/g, "")

  if (!userEmail || !userPassword || /example|placeholder|your_/i.test(userEmail + userPassword)) {
    const error = new Error("Email service is not configured.")
    error.code = "EMAIL_NOT_CONFIGURED"
    throw error
  }

  const transporter = nodemailer.createTransport({
    service: "Gmail",
    port: 465,
    secure: true,
    auth: { user: userEmail, pass: userPassword },
  })

  try {
    await transporter.sendMail({
      from: userEmail,
      to,
      subject,
      html,
      attachments,
    })
  } catch (error) {
    if (error.responseCode === 535 || error.code === "EAUTH") {
      throw createMailAuthError(error)
    }
    throw error
  } finally {
    transporter.close()
  }
}

const sendEduTubeBrandedEmail = (to, subject, html) => sendWithGmail(
  to,
  subject,
  `<div style="margin:0 0 20px"><img src="cid:edutube-logo" width="64" height="64" alt="EduTube" style="display:block;width:64px;height:64px"></div>${html}`,
  [{
    filename: "edutube-logo.png",
    path: fileURLToPath(new URL("./edutube-logo.png", import.meta.url)),
    contentType: "image/png",
    cid: "edutube-logo",
  }],
)

const sendMail = async (to, otp) => sendWithGmail(
  to,
  "Reset Your Password",
  `<p>Your OTP for Password Reset is <b>${otp}</b>. It expires in 5 minutes.</p>`
)

export const sendAgentPanelPasswordResetEmail = async (to, resetUrl) => sendWithGmail(
  to,
  "Reset your EduTube Agent Panel password",
  `<p>A password reset was requested for your Agent Panel account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This one-time link expires in 30 minutes. If you did not request this, ignore this email.</p>`
)

const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
}[character]));

export const sendAdminVerificationEmail = async (to, otp) => sendEduTubeBrandedEmail(
  to,
  "Your Admin Studio verification code",
  `<p>Your Admin Studio email verification code is <strong>${escapeHtml(otp)}</strong>.</p><p>This code expires in five minutes. If you did not request it, you can ignore this email.</p>`,
);

export const sendAdminUsernameEmail = async (to, { name, username }) => sendEduTubeBrandedEmail(
  to,
  "Your Admin Studio username",
  `<p>Hello ${escapeHtml(name)},</p><p>Your Admin Studio account has been created.</p><p>Your username is <strong>${escapeHtml(username)}</strong>.</p><p>Sign in using this username and the password you created.</p>`,
);

export const sendEmployeeUsernameEmail = async (to, { name, username, category }) => sendEduTubeBrandedEmail(
  to,
  "Your employee workspace username",
  `<p>Hello ${escapeHtml(name)},</p><p>Your employee account is ready for the <strong>${escapeHtml(category)}</strong> workspace.</p><p>Your username is <strong>${escapeHtml(username)}</strong>.</p><p>Sign in with this username, your email address, and the password you created.</p><p>EduTube</p>`,
);

export const sendEduTubeChannelBlockEmail = async (
  to,
  {
    channelName,
    blockType,
    reason = "",
    selfUnblockAvailable = false,
    recovery = null,
    username = "",
    blockDurationMinutes = 24 * 60,
    channelOnly = false,
  },
) => {
  const safeChannelName = escapeHtml(channelName);
  const attachments = [];
  let details;
  let subject;

  if (blockType === "temporary") {
    subject = "Your EduTube channel is temporarily blocked";
    details = channelOnly
      ? `<p>Your channel <strong>${safeChannelName}</strong> has been blocked for ${escapeHtml(blockDurationMinutes)} minutes after an educational-content policy violation. Your account is not blocked; only this channel is restricted.</p><p>Reason: ${escapeHtml(reason) || "The submitted content did not meet the educational-content requirements."}</p><p>The channel block will expire automatically.</p>`
      : `<p>Your channel <strong>${safeChannelName}</strong> has been blocked for 24 hours after an educational-content policy violation.</p><p>Reason: ${escapeHtml(reason) || "The submitted content did not meet the educational-content requirements."}</p><p>You can sign in again after the temporary block expires.</p>`;
  } else if (blockType === "permanent") {
    subject = "Your EduTube channel is permanently blocked";
    details = `<p>Your channel <strong>${safeChannelName}</strong> has been permanently blocked after five confirmed educational-content policy violations.</p><p>Reason: ${escapeHtml(reason) || "Repeated submissions did not meet the educational-content requirements."}</p>`;
    if (recovery) {
      details += `<p>One paid self-unblock is available. The fee is <strong>${new Intl.NumberFormat(undefined, { style: "currency", currency: recovery.currency }).format(recovery.amount)}</strong>. This amount is fixed for this recovery code.</p><p>Scan the attached QR code or <a href="${escapeHtml(recovery.recoveryUrl)}">open the secure recovery page</a> within five minutes, by ${escapeHtml(recovery.expiresAt.toISOString())}. The code expires after that time. The page will ask you to accept the educational-content terms before payment. Only a verified successful payment restores access.</p><p>By proceeding with payment, you agree to publish only genuinely educational content. If the channel is permanently blocked again, it cannot be self-unblocked again, even with another payment.</p><p><img src="cid:channel-unblock-qr" width="240" height="240" alt="Five-minute EduTube channel unblock payment QR code"></p>`;
      attachments.push({
        filename: "edutube-channel-unblock-qr.png",
        content: recovery.qrCode,
        contentType: "image/png",
        cid: "channel-unblock-qr",
      });
    } else if (selfUnblockAvailable) {
      details += "<p>A one-time paid self-unblock may be available. The recovery QR could not be created. Please sign in to EduTube to request a recovery session.</p>";
    } else {
      details += "<p>This channel has already used its one paid self-unblock and cannot be self-unblocked again.</p>";
    }
  } else {
    subject = "Your EduTube channel has been blocked";
    details = `<p>Your channel <strong>${safeChannelName}</strong> has been blocked by an EduTube administrator. Sign-in is disabled while the block is active. Contact EduTube support if you believe this is a mistake.</p>`;
  }

  await sendWithGmail(
    to,
    subject,
    `<p>Hello ${escapeHtml(username || "EduTube user")},</p>${details}<p>EduTube</p>`,
    attachments,
  );
};

export default sendMail
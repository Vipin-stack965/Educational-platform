import nodemailer from "nodemailer"

const createMailAuthError = (cause) => {
  const error = new Error(
    "Gmail rejected the email credentials. Set USER_EMAIL to the Gmail address and USER_PASSWORD to its 16-character Google App Password."
  )
  error.code = "EMAIL_AUTH_FAILED"
  error.cause = cause
  return error
}

const sendWithGmail = async (to, subject, html) => {
  const userEmail = process.env.USER_EMAIL?.trim()
  const userPassword = process.env.USER_PASSWORD?.replace(/\s/g, "")

  if (!userEmail || !userPassword || /example|placeholder|your_/i.test(userEmail + userPassword)) {
    throw new Error("Email service is not configured. Set USER_EMAIL and a Gmail App Password in backend/.env.")
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

export default sendMail
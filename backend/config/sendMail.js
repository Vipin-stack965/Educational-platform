import nodemailer from "nodemailer"

const createMailAuthError = (cause) => {
  const error = new Error(
    "Gmail rejected the email credentials. Set USER_EMAIL to the Gmail address and USER_PASSWORD to its 16-character Google App Password."
  )
  error.code = "EMAIL_AUTH_FAILED"
  error.cause = cause
  return error
}

const sendMail = async (to,otp) => {
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
      subject: "Reset Your Password",
      html: `<p>Your OTP for Password Reset is <b>${otp}</b>.
        It expires in 5 minutes.</p>` // HTML body
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

export default sendMail
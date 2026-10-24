import nodemailer from "nodemailer";

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[character]);

const sendFeedbackMail = async ({ feedbackId, category, message, username, email }) => {
  const userEmail = process.env.USER_EMAIL?.trim();
  const userPassword = process.env.USER_PASSWORD?.trim();

  if (!userEmail || !userPassword || /example|placeholder|your_/i.test(userEmail + userPassword)) {
    throw new Error("Support email credentials are not configured");
  }

  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: { user: userEmail, pass: userPassword }
  });
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

  await transporter.sendMail({
    from: userEmail,
    to: userEmail,
    replyTo: email,
    subject: `PlayTube feedback: ${category}`,
    text: `Feedback ${feedbackId} from ${username} (${email})\n\n${message}`,
    html: `<p>Feedback ID: ${escapeHtml(feedbackId)}</p><p>From: ${escapeHtml(username)} (${escapeHtml(email)})</p><p>Category: ${escapeHtml(category)}</p><p>${safeMessage}</p>`
  });
};

export default sendFeedbackMail;

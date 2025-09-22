import nodemailer from "nodemailer";

const sendEmailFunction = async (email, subject, message) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject,
      //   text: message,
      html: message,
    });
    console.log("Email send successfully.");
  } catch (err) {
    console.log("Error in sending mail : ", err);
  }
};

export default sendEmailFunction;

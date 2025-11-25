import nodemailer from "nodemailer";
import 'dotenv/config'; // Ensure this is loaded to read .env variables

export const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER, // from .env
        pass: process.env.EMAIL_PASS  // from .env (16-character App Password)
    },
    logger: true,   // logs info about SMTP connection
    debug: true     // logs raw SMTP messages
});

export async function sendEmail(to, subject, html) {
    console.log("Attempting to send email to:", to);

    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            html
        });

        console.log("Email sent successfully:", info);
        return { success: true, info };

    } catch (error) {
        console.error("Email sending failed:", error);

        if (error.response) console.error("SMTP Response:", error.response);
        if (error.responseCode) console.error("SMTP Response Code:", error.responseCode);

        return { success: false, error };
    }
}
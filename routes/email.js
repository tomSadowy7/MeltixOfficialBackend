import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  host: 'smtp.ionos.com',
  port: 587,          // Or 465 if needed
  secure: false,      // True for port 465
  auth: {
    user: process.env.IONOS_USER,
    pass: process.env.IONOS_PASS
  }
});

export async function sendVerificationEmail(to, code) {
    console.log(`Sending verification email to ${to} with code ${code}`);
    const mailOptions = {
    from: `"Meltix Home" <${process.env.IONOS_USER}>`,
    to: to,
    subject: 'Verify Your Meltix Account',
    html: `<p>Welcome to Meltix Home!</p>
            <p>Your verification code is:</p>
            <h2>${code}</h2>`
    };

  await transporter.sendMail(mailOptions);
}

export async function sendResetEmail(to, code) {
  console.log(`Sending password reset to ${to} with code ${code}`);
  const mailOptions = {
    from: `"Meltix Home" <${process.env.IONOS_USER}>`,
    to: to,
    subject: 'Reset Your Meltix Password',
    html: `<p>You requested to reset your password.</p>
           <p>Your reset code is:</p>
           <h2>${code}</h2>`
  };

  await transporter.sendMail(mailOptions);
}
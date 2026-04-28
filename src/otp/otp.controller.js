import prisma from "../config/db.js";
import otpGenerator from "otp-generator";
import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// âœ… Helper function to normalize phone number
const normalizePhone = (phone) => {
  if (!phone) return null;
  // Remove all non-digit characters
  const digitsOnly = String(phone).replace(/\D/g, '');
  // Add +91 if it's 10 digits (India)
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }
  // If it's 12 digits and starts with 91, add +
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  }
  // If it's 13 digits and starts with +91, return as is
  if (phone.startsWith('+91') && digitsOnly.length === 12) {
    return phone;
  }
  return phone; // Return as is if can't normalize
};

// âœ… Helper function to format phone for SMS API (remove +)
const formatSmsPhone = (phone) => {
  if (!phone) return null;
  return String(phone).replace(/\D/g, '');
};

export const sendOtp = async (req, res) => {
    try{
        let { phone , mobile } = req.body;

        phone = phone || mobile;

        if(!phone){
            return res.status(400).json({ message: "Phone number is required" });


        }

        phone = normalizePhone(phone);

        if(!phone){
            return res.status(400).json({ message: "Invalid phone number format" });
        }

        const otp = otpGenerator.generate(6, { upperCase: false, specialChars: false, alphabets: false });

        await prisma.otp.deleteMany({ where: { phone } });

        // Save OTP to database with expiration (e.g., 5 minutes)
        const otpEntry = await prisma.otp.create({
            data: {
                phone,
                otp,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
            }
        });

        console.log(`Generated OTP for ${phone}: ${otp}`);
         // ===================== SEND SMS VIA PIXABITS API =====================
    try {
      const message = `Your One Time Password is ${otp} for your application. Don't share OTP with anyone.HARSAC`;
      
      const smsResponse = await axios.post(
        "https://sms.pixabits.in/smsapi/sms/custom/send",
        {
          "key": process.env.SMS_API_KEY || "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI2OTc4ODkzZGE1OTFkNjVmNDZiMzQxYmM6Njk3ODg5M2RhNTkxZDY1ZjQ2YjM0MWJlOkhBUlNBQzo2NTJmYTQ0ZWYzMTc3NjdlOTdkYTMyNmYiLCJpYXQiOjE3Njk1MTA1NTV9.lqYYXdcDUada9lKBa07uJT2hNZzpWjr8D3QmTZzGP6M",
          "text": message,
          "senderId": process.env.SMS_SENDER_ID || "HARSAC",
          "tempDltId": process.env.SMS_TEMP_DLT_ID || "1407169838783023275",
          "route": "Domestic",
          "phoneno": formatSmsPhone(phone),
          "groupIds": [" "],
          "trans": 1,
          "unicode": 0,
          "flash": false,
          "tiny": false
        }
      );

      console.log("ðŸ“¨ SMS API Response:", { status: smsResponse.status, data: smsResponse.data });
      
      res.json({ 
        message: "OTP sent successfully",
        phone,
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
        smsSent: true,
        expiresIn: "5 minutes"
      });
    } catch (smsError) {
      console.error("âŒ SMS API Error:", smsError.message, smsError.response?.data || smsError.response || "No response body");
      // Still return success if SMS fails, OTP is saved in DB
      res.json({ 
        message: "OTP created successfully (SMS delivery pending)",
        phone,
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
        smsSent: false,
        warning: "OTP saved but SMS delivery failed. Contact support.",
        expiresIn: "5 minutes"
      });
    }

    }
    catch(error){
        console.error("Error sending OTP:", error);
        res.status(500).json({ message: "Failed to send OTP" });
    }
}   

export const verifyOtp = async (req, res) => {
    try{ 
        let { phone, mobile, otp } = req.body;

        phone = phone || mobile;

        // Validate required fields
        if(!phone){
            return res.status(400).json({ message: "Phone number is required" });
        }

        if(!otp){
            return res.status(400).json({ message: "OTP is required" });
        }

        phone = normalizePhone(phone);

        // Find the OTP entry
        const otpEntry = await prisma.otp.findFirst({
            where: { 
                phone,
                // Only consider non-expired OTPs
                expiresAt: {
                    gt: new Date()
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Check if OTP exists
        if(!otpEntry){
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        // Check if OTP matches
        if(otpEntry.otp !== otp){
            // Increment failed attempts
            await prisma.otp.update({
                where: { id: otpEntry.id },
                data: { failedAttempts: otpEntry.failedAttempts + 1 }
            });
            
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // Check if too many failed attempts
        if(otpEntry.failedAttempts >= 5){
            return res.status(400).json({ message: "Too many failed attempts. Please request a new OTP" });
        }

        // OTP is valid - delete the OTP entry
        await prisma.otp.delete({
            where: { id: otpEntry.id }
        });

        // Check if user exists
        let user = await prisma.user.findUnique({
            where: { mobile: phone }
        });

        // If user doesn't exist, create a new user
        if(!user){
            user = await prisma.user.create({
                data: {
                    mobile: phone,
                    fullname: "New User",
                    email: `${phone}@msme.com`,
                    password: "", // No password for OTP login
                    role: "user"
                }
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                phone: user.mobile,
                role: user.role 
            },
            process.env.JWT_SECRET || "your-secret-key",
            { expiresIn: "7d" }
        );

        // Return success response
        return res.status(200).json({
            success: true,
            message: "OTP verified successfully",
            token,
            user: {
                id: user.id,
                fullname: user.fullname,
                email: user.email,
                mobile: user.mobile,
                role: user.role
            }
        });
    }
    catch(error){
        console.error("Error verifying OTP:", error);
        res.status(500).json({ message: "Failed to verify OTP" });
    }                               
}
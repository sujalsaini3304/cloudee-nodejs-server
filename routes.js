import express from "express";
import mongoose from "mongoose";
import { configDotenv } from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { removeKey, convertToLocalTimezone } from "./utils/utils.js";
import dayjs from "dayjs"; // For timezone conversion
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import sendEmailFunction from "./utils/email.js";
import bcrypt from "bcryptjs";
import cloudinary from "cloudinary";
import formidable from "formidable";
import fs from "fs";
import { format } from "date-fns";

const router = express.Router();
dayjs.extend(utc);
dayjs.extend(timezone);

// .env file config
configDotenv({
  path: ".env",
});

// cloudinary config
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// connection to mongodb
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error(err));

// creating cursor and connection
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db("cloudStorageProject");

router.get("/", (req, res) => {
  res.status(200).json({
    message: "Nodejs server started.",
    status: 200,
  });
});

router.post("/api/get/data", (req, res) => {
  if (req.is("multipart/form-data")) {
    const form = formidable();
    form.parse(req, (err, fields, files) => {
      if (err) {
        return res.status(400).json({ error: "Form parsing error" });
      }
      const email = fields.email;
      const page = fields.page || 1;
      const limit = fields.limit || 50;
      handleDataRequest(email, page, limit, res);
    });
  } else {
    const email = req.body.email;
    const page = req.body.page || 1;
    const limit = req.body.limit || 50;
    handleDataRequest(email, page, limit, res);
  }
});

async function handleDataRequest(email, page, limit, res) {
  try {
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    email = email[0];
    page = page[0];
    limit = limit[0];
    const collection = db.collection("asset");
    const collectionUser = db.collection("user");
    const skip = (Number(page) - 1) * Number(limit);
    // Paginated documents
    const documents = await collection
      .find({ email })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .toArray();
    // User info (no pagination)
    const userDocs = await collectionUser.find({ email }).limit(1).toArray();
    console.log(userDocs);
    // Format documents
    for (const doc of documents) {
      doc._id = doc._id.toString();
      if (doc.created_at) {
        doc.created_at = convertToLocalTimezone(doc.created_at);
      }
    }
    // Format user
    let user = null;
    if (userDocs.length > 0) {
      user = userDocs[0];
      user._id = user._id.toString();
      if (user.created_at) {
        user.created_at = convertToLocalTimezone(user.created_at);
      }
      removeKey(user, "password");
    }
    // Debug point
    // console.log({
    //   data: documents,
    //   user_detail: user,
    // })
    return res.json({
      data: documents,
      user_detail: user,
      selection_limit: 5,
    });
  } catch (err) {
    console.error("Error fetching data:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Sending email to verify user.
router.post("/api/send/confirmation/email", async(req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const subject = "Confirmation email for varification";
    const code = Math.floor(1000 + Math.random() * 9000);
    const message = `
      <html>
        <body style="font-family: Arial, sans-serif; background-color: #f4f4f7; padding: 20px; color: #333;">
          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);"
          >
            <tr>
              <td>
                <h2 style="color: #2089dc; margin-top: 0;">
                  Verify Your Email Address
                </h2>
                <p style="font-size: 16px;">
                  Thank you for signing up for Cloudee. Please use the
                  verification code below to complete your signup:
                </p>
                <div style="font-size: 28px; font-weight: bold; margin: 30px 0; color: #2089dc; text-align: center; letter-spacing: 2px;">
                  ${code}
                </div>
                <p style="font-size: 14px; color: #666;">
                  If you did not request this email, you can safely ignore it.
                </p>
                <br />
                <p style="font-size: 14px;">
                  Best regards,
                  <br />
                  <strong>Cloudee Team</strong>
                </p>
              </td>
            </tr>
          </table>
        </body>
      </html>`;
    await sendEmailFunction(email, subject, message);
    res.status(200).json({
      message: "Verification email send successfully.",
      code: code,
    });
  } catch (error) {
    console.error("Error sending email : ", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

// Sending email to reset password.
router.post("/api/send/email/password/reset", async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const collection = db.collection("user");

    // Check if user exists
    const user = await collection.findOne({ email });
    if (!user) {
      return res.status(200).json({
        message: "User not found.",
        flag: false,
        data: null,
      });
    }

    // Remove password
    const userData = { ...user, _id: user._id.toString() };
    delete userData.password;

    const subject = "Confirmation email for password reset";
    const code = Math.floor(1000 + Math.random() * 9000);
    const message = `
      <html>
        <body style="font-family: Arial, sans-serif; background-color: #f4f4f7; padding: 20px; color: #333;">
          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);"
          >
            <tr>
              <td>
                <h2 style="color: #2089dc; margin-top: 0;">
                  Reset Your Password
                </h2>
                <p style="font-size: 16px;">Hi there,</p>
                <p style="font-size: 16px;">
                  We received a request to reset the password associated with
                  this email address. Use the verification code below to
                  proceed:
                </p>
                <div style="font-size: 28px; font-weight: bold; margin: 30px 0; color: #2089dc; text-align: center; letter-spacing: 2px;">
                  ${code}
                </div>
                <p style="font-size: 14px; color: #666;">
                  If you didn’t request a password reset, you can safely ignore
                  this email.
                </p>
                <br />
                <p style="font-size: 14px;">
                  Thanks,
                  <br />
                  <strong>Cloudee Team</strong>
                </p>
              </td>
            </tr>
          </table>
        </body>
      </html>`;
    await sendEmailFunction(email, subject, message);
    return res.status(200).json({
      message: "Password reset email sent successfully.",
      code,
      flag: true,
      data: userData,
    });
  } catch (error) {
    console.error("Error sending email : ", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

// Updating the password
router.post("/api/update/password", async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    const collection = db.collection("user");

    // Find user by email
    const user = await collection.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ status: "Failed", message: "User not found.", flag: false });
    }

    // Check if the new password is same as old password
    const isSamePassword = await bcrypt.compare(password, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        status: "Failed",
        message: "Using the old password.",
        flag: false,
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password
    const result = await collection.updateOne(
      { email },
      { $set: { password: hashedPassword } }
    );

    if (result.modifiedCount > 0) {
      return res.status(200).json({
        status: "Success",
        message: "Password updated successfully.",
        flag: true,
      });
    } else {
      return res.status(200).json({
        status: "Failed",
        message: "Password not changed.",
        flag: false,
      });
    }
  } catch (error) {
    console.error("Error updating password:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: error.message, flag: false });
  }
});

// Create user in database
router.post("/api/create/user", async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "username, email, and password are required" });
    }

    const collection = db.collection("user");

    // Check if the user already exists
    const existingUser = await collection.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    // Hash password (bcrypt with salt)
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      username: name,
      email,
      password: hashedPassword, // store as string
      is_email_verified: true,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19), // "YYYY-MM-DD HH:MM:SS"
    };

    const result = await collection.insertOne(newUser);

    return res.status(201).json({
      message: "User created successfully",
      id: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("Error creating user : ", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

// Verifying the user
router.post("/api/verify/user", async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    const collection = db.collection("user");

    // Find user by email
    const user = await collection.findOne({ email });

    if (!user) {
      return res.status(200).json({
        data: null,
        message: "User not found.",
        verify: false,
      });
    }

    // Compare password with stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    const safeUser = { ...user, _id: user._id.toString() };

    // Remove sensitive data ie. password
    removeKey(safeUser, "password");

    if (isMatch) {
      return res.status(200).json({
        data: safeUser,
        message: "Success",
        verify: true,
      });
    } else {
      return res.status(200).json({
        data: safeUser,
        message: "Password Mismatch.",
        verify: false,
      });
    }
  } catch (error) {
    console.error("Error verifying user:", error);
    return res.status(500).json({
      data: null,
      message: "Internal Server Error",
      verify: false,
    });
  }
});

// Developer info
router.get("/api/get/developer/detail", (req, res) => {
  return res.status(200).json({
    message: "Server is running",
    server_health_status: "ok",
    developer_detail: {
      name: "Sujal Kumar Saini",
      email: "sujalsaini3304@gmail.com",
    },
  });
});

// Health check
router.get("/ping", (req, res) => {
  return res.status(200).json({ status: "ok" });
});

// Media upload
router.post("/multiple/upload", async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const form = formidable({
    multiples: true, // allow multiple files
    keepExtensions: true, // keep file extensions
    maxFileSize: 5 * 1024 * 1024, // 5 MB limit
  });

  form.parse(req, async (err, fields, files) => {
    if (err)
      return res
        .status(400)
        .json({ message: "Error parsing form", error: err.message });

    const email = fields.email?.[0] || fields.email;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const uploaded_files = [];
    const db_items = [];

    try {
      const fileList = Array.isArray(files.files) ? files.files : [files.files];

      for (const file of fileList) {
        const result = await cloudinary.v2.uploader.upload(file.filepath, {
          resource_type: "auto",
          folder: `CloudStorageProject/User/Data/${email}/`,
        });

        uploaded_files.push({
          filename: file.originalFilename,
          url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type,
        });

        db_items.push({
          email,
          ...uploaded_files[uploaded_files.length - 1],
          created_at: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
        });

        // remove temp file
        fs.unlink(file.filepath, (err) => {
          if (err) console.error("Failed to delete temp file:", err);
        });
      }

      const collection = db.collection("asset");
      const result = await collection.insertMany(db_items);

      res.status(200).json({
        uploaded_files,
        inserted_ids: Object.values(result.insertedIds),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Upload failed", error: error.message });
    }
  });
});

// Deleting the images form cloudinary and it's info from mongodb
router.post("/api/delete/asset", async (req, res) => {
  const collection = db.collection("asset");

  const items = req.body; // [{ public_id: "...", mongo_id: "..." }, ...]

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Invalid or empty request body" });
  }

  const deleted_from_cloudinary = [];
  const deleted_from_db = [];

  for (const item of items) {
    try {
      // Delete from Cloudinary
      const cloudRes = await cloudinary.v2.uploader.destroy(item.public_id, {
        invalidate: true,
      });
      if (cloudRes.result === "ok") {
        deleted_from_cloudinary.push(item.public_id);
      }

      // Delete from MongoDB
      const dbRes = await collection.deleteOne({
        _id: new ObjectId(item._id),
      });
      if (dbRes.deletedCount > 0) {
        deleted_from_db.push(item._id);
      }
    } catch (err) {
      console.error(`Error deleting ${item.public_id} : `, err);
      continue;
    }
  }

  res.json({
    deleted_from_cloudinary,
    deleted_from_mongodb: deleted_from_db,
    total_requested: items.length,
    success_count: deleted_from_db.length,
  });
});

// Deleting the user from the recordbase
router.post("/api/delete/user", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const assetCollection = db.collection("asset");
  const userCollection = db.collection("user");

  const deleted_from_cloudinary = [];
  const deleted_from_db = [];

  try {
    // Find all assets belonging to this email
    const documents = await assetCollection.find({ email }).toArray();

    // Prepare list of Mongo IDs & Cloudinary public IDs
    const imageList = documents.map((doc) => ({
      mongo_id: doc._id.toString(),
      public_id: doc.public_id,
    }));

    // Delete each asset
    for (const item of imageList) {
      try {
        // Delete from Cloudinary
        const cloudRes = await cloudinary.v2.uploader.destroy(item.public_id, {
          invalidate: true,
        });
        if (cloudRes.result === "ok")
          deleted_from_cloudinary.push(item.public_id);

        // Delete from MongoDB
        const dbRes = await assetCollection.deleteOne({
          _id: new ObjectId(item.mongo_id),
        });
        if (dbRes.deletedCount > 0) deleted_from_db.push(item.mongo_id);
      } catch (err) {
        console.error(`Error deleting ${item.public_id} : `, err);
      }
    }

    // Attempt to remove the Cloudinary folder
    const folderName = `CloudStorageProject/User/Data/${email}`;
    try {
      await cloudinary.v2.api.delete_folder(folderName);
    } catch (err) {
      console.error(`Failed to delete folder '${folderName}':`, err);
    }

    // Finally delete the user document
    const userRes = await userCollection.deleteOne({ email });
    if (userRes.deletedCount === 0) {
      return res
        .status(404)
        .json({ message: `User with email '${email}' not found` });
    }

    return res.json({
      message: "success",
      detail: `User with email '${email}' deleted.`,
      deleted_from_cloudinary,
      deleted_from_mongodb: deleted_from_db,
      total_requested: imageList.length,
      success_count: deleted_from_db.length,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
});

export default router;

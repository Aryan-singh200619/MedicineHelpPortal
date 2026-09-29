require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET || (isProduction ? "" : "local-development-secret-change-before-deploy");

if (!jwtSecret) {
  throw new Error("JWT_SECRET must be configured in production.");
}
if (isProduction && Buffer.byteLength(jwtSecret) < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes in production.");
}

const allowedOrigins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    const localDevelopmentOrigin = !isProduction && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
    if (!origin || allowedOrigins.includes(origin) || localDevelopmentOrigin) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/medicineHelpPortal")
  .then(async () => {
    await User.createCollection().catch((error) => {
      if (error.codeName !== "NamespaceExists") {
        throw error;
      }
    });
    const existingUserIndexes = await User.collection.indexes();
    if (existingUserIndexes.some((index) => index.name === "email_1")) {
      await User.collection.dropIndex("email_1");
    }
    await User.syncIndexes();
    console.log("MongoDB connected successfully!");
  })
  .catch((error) => {
    console.log("MongoDB connection error:", error);
  });

// Models
const Medicine = require("./models/Medicine");
const Patient = require("./models/Patient");
const User = require("./models/User");
const MedicalReport = require("./models/MedicalReport");

const sessionCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};

const issueSession = (res, user) => {
  const token = jwt.sign({ sub: String(user._id) }, jwtSecret, { expiresIn: "7d" });
  res.cookie("medicine_session", token, {
    ...sessionCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  phoneNumber: user.phoneNumber,
});

const normalizePhoneNumber = (value) => {
  const compact = String(value || "").trim().replace(/[\s().-]/g, "");
  const normalized = /^\d{10}$/.test(compact)
    ? `+91${compact}`
    : compact.startsWith("+")
      ? compact
      : `+${compact}`;

  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
};

const requireAuth = (req, res, next) => {
  const token = req.cookies.medicine_session;
  if (!token) {
    return res.status(401).json({ message: "Please sign in to continue." });
  }

  try {
    const session = jwt.verify(token, jwtSecret);
    req.userId = session.sub;
    return next();
  } catch {
    return res.status(401).json({ message: "Your session has expired. Please sign in again." });
  }
};

const acceptedReportTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const uploadReport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!acceptedReportTypes.has(file.mimetype)) {
      return callback(new Error("Upload a PDF, JPEG, or PNG file."));
    }
    return callback(null, true);
  },
});

const parseReportUpload = (req, res, next) => {
  uploadReport.single("report")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: error.code === "LIMIT_FILE_SIZE"
          ? "Reports must be 10 MB or smaller."
          : error.message,
      });
    }
    return next();
  });
};

// Test route
app.get("/", (req, res) => {
  res.send("Medicine Help Portal Backend is running!");
});

// =========================
// ACCOUNT APIs
// =========================

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ message: "Enter a name between 2 and 80 characters." });
    }
    if (!phoneNumber) {
      return res.status(400).json({ message: "Enter a valid phone number with country code, or a 10-digit Indian mobile number." });
    }
    if (password.length < 10 || password.length > 128 || Buffer.byteLength(password) > 72) {
      return res.status(400).json({ message: "Use a password of at least 10 characters (maximum 72 bytes)." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, phoneNumber, passwordHash });
    issueSession(res, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "An account with this phone number already exists." });
    }
    return res.status(500).json({ message: "Could not create the account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
    const password = String(req.body.password || "");
    const user = phoneNumber
      ? await User.findOne({ phoneNumber }).select("+passwordHash")
      : null;

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Phone number or password is incorrect." });
    }

    issueSession(res, user);
    return res.json({ user: publicUser(user) });
  } catch {
    return res.status(500).json({ message: "Could not sign in right now." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("medicine_session", sessionCookieOptions);
  res.json({ message: "Signed out." });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.clearCookie("medicine_session", sessionCookieOptions);
      return res.status(401).json({ message: "Account not found." });
    }
    return res.json({ user: publicUser(user) });
  } catch {
    return res.status(500).json({ message: "Could not verify the session." });
  }
});

// =========================
// MEDICINE APIs
// =========================

// Add a medicine
app.post("/api/medicines", requireAuth, async (req, res) => {
  try {
    const medicine = new Medicine({ ...req.body, userId: req.userId });
    await medicine.save();

    res.status(201).json({
      message: "Medicine added successfully!",
      medicine,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error adding medicine",
      error: error.message,
    });
  }
});

// Get all medicines
app.get("/api/medicines", requireAuth, async (req, res) => {
  try {
    const medicines = await Medicine.find({ userId: req.userId });
    res.json(medicines);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching medicines",
      error: error.message,
    });
  }
});

// Delete a medicine
app.delete("/api/medicines/:id", requireAuth, async (req, res) => {
  try {
    const deletedMedicine = await Medicine.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!deletedMedicine) {
      return res.status(404).json({
        message: "Medicine not found",
      });
    }

    res.json({
      message: "Medicine deleted successfully!",
      medicine: deletedMedicine,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting medicine",
      error: error.message,
    });
  }
});
// Edit a medicine
app.put("/api/medicines/:id", requireAuth, async (req, res) => {
  try {
    const { name, time, dosage, notes } = req.body;
    const updates = { name, time };

    if (dosage !== undefined) {
      updates.dosage = dosage;
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    const updatedMedicine = await Medicine.findByIdAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updates,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedMedicine) {
      return res.status(404).json({
        message: "Medicine not found",
      });
    }

    res.json({
      message: "Medicine updated successfully!",
      medicine: updatedMedicine,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating medicine",
      error: error.message,
    });
  }
});
// =========================
// PATIENT APIs
// =========================

// Save patient profile
app.post("/api/patient", requireAuth, async (req, res) => {
  try {
    const { name, age, contact, familyContact } = req.body;
    const patient = await Patient.findOneAndUpdate(
      { userId: req.userId },
      {
        $set: {
          name: String(name || "").trim(),
          age: Number(age),
          contact: String(contact || "").trim(),
          familyContact: String(familyContact || "").trim(),
        },
        $setOnInsert: { userId: req.userId },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      message: "Patient profile saved successfully!",
      patient,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error saving patient profile",
      error: error.message,
    });
  }
});

// Update patient profile
app.put("/api/patient", requireAuth, async (req, res) => {
  try {
    const { name, age, contact, familyContact } = req.body;

    const patient = await Patient.findOne({ userId: req.userId });

    if (!patient) {
      return res.status(404).json({
        message: "Patient profile not found",
      });
    }

    patient.name = String(name || patient.name).trim();
    patient.age = Number(age ?? patient.age);
    patient.contact = String(contact || patient.contact).trim();
    if (familyContact !== undefined) {
      patient.familyContact = String(familyContact).trim();
    }

    await patient.save();

    res.json({
      message: "Patient profile updated successfully!",
      patient,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating patient profile",
      error: error.message,
    });
  }
});

// Get patient profile
app.get("/api/patient", requireAuth, async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.userId });

    if (!patient) {
      return res.json({ patient: null });
    }

    res.json({ patient });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching patient profile",
      error: error.message,
    });
  }
});

// =========================
// MEDICAL REPORT APIs
// =========================

app.get("/api/reports", requireAuth, async (req, res) => {
  try {
    const reports = await MedicalReport.find({ userId: req.userId })
      .select("-data")
      .sort({ createdAt: -1 });
    return res.json({ reports });
  } catch {
    return res.status(500).json({ message: "Could not load medical reports." });
  }
});

app.post("/api/reports", requireAuth, parseReportUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Choose a report file to upload." });
    }

    const originalName = String(req.file.originalname || "medical-report")
      .split(/[\\/]/)
      .pop()
      .replace(/[\u0000-\u001f]/g, "")
      .slice(0, 160) || "medical-report";

    const report = await MedicalReport.create({
      userId: req.userId,
      originalName,
      mimeType: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
    });

    return res.status(201).json({
      report: {
        id: report._id,
        originalName: report.originalName,
        mimeType: report.mimeType,
        size: report.size,
        createdAt: report.createdAt,
      },
    });
  } catch {
    return res.status(500).json({ message: "Could not store the medical report." });
  }
});

app.get("/api/reports/:id/download", requireAuth, async (req, res) => {
  try {
    const report = await MedicalReport.findOne({
      _id: req.params.id,
      userId: req.userId,
    }).select("+data");

    if (!report) {
      return res.status(404).json({ message: "Medical report not found." });
    }

    res.type(report.mimeType);
    res.attachment(report.originalName);
    return res.send(report.data);
  } catch {
    return res.status(404).json({ message: "Medical report not found." });
  }
});

app.delete("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const report = await MedicalReport.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!report) {
      return res.status(404).json({ message: "Medical report not found." });
    }

    return res.json({ message: "Medical report deleted." });
  } catch {
    return res.status(404).json({ message: "Medical report not found." });
  }
});

// =========================
// START SERVER
// =========================

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
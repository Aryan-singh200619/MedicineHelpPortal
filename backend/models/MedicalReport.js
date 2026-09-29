const mongoose = require("mongoose");

const medicalReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      maxlength: 160,
    },
    mimeType: {
      type: String,
      required: true,
      enum: ["application/pdf", "image/jpeg", "image/png"],
    },
    size: {
      type: Number,
      required: true,
    },
    data: {
      type: Buffer,
      required: true,
      select: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MedicalReport", medicalReportSchema);

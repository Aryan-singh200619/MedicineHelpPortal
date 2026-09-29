const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },

  age: {
    type: Number,
    required: true,
  },

  contact: {
    type: String,
    required: true,
  },

  familyContact: {
    type: String,
    default: "",
  },
});

patientSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } }
);

module.exports = mongoose.model("Patient", patientSchema);
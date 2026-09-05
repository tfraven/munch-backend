const mongoose = require('mongoose');

const choiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const optionGroupSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    choices: {
      type: [choiceSchema],
      validate: {
        validator: (choices) => Array.isArray(choices) && choices.length > 0,
        message: 'Option group must contain at least one choice',
      },
    },
  },
  { _id: true }
);

const menuItemSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorProfile', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    
    // Can link to Category model or store category name
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    
    imageUrl: { type: String, trim: true },
    isAvailable: { type: Boolean, default: true },
    options: [optionGroupSchema],
  },
  { timestamps: true }
);

// Performance & Constraint Indexes
menuItemSchema.index({ vendor: 1 });
menuItemSchema.index({ category: 1 });
menuItemSchema.index({ vendor: 1, name: 1 }, { unique: true }); // Prevents duplicate item names per vendor

module.exports = mongoose.model('MenuItem', menuItemSchema);
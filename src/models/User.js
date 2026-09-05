const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // never returned by default; use .select('+password') for login
    },
    role: {
      type: String,
      enum: ['admin', 'vendor', 'rider', 'customer'],
      default: 'customer',
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(12); // 12 rounds: a bit more headroom than 10
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (enteredPassword) {
  // Works whether `this.password` was freshly loaded via +password or not,
  // as long as the caller selected it explicitly.
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
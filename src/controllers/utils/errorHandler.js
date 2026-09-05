// Centralizes the "what status code does this Mongoose error deserve"
// decision so every controller doesn't reinvent it (and doesn't leak every
// error as a flat 500).
const handleControllerError = (res, error, context) => {
  console.error(`${context} Error:`, error);

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation failed.',
      errors: Object.values(error.errors).map((e) => e.message),
    });
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    return res.status(409).json({ message: `${field} is already in use.` });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${error.path}.` });
  }

  return res.status(500).json({ message: 'Internal server error.' });
};

module.exports = { handleControllerError };
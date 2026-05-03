const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
    username: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Approved'], default: 'Pending' },
}, { timestamps: true });

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
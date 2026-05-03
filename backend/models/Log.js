const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    adminName: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Log', logSchema);
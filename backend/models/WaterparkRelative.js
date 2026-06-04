const mongoose = require('mongoose');

const relativeSchema = new mongoose.Schema({
    username: { type: String, required: true }, 
    fullName: { type: String, required: true }, 
    idCardNumber: { type: String, required: true }, // เพิ่มเลขบัตร
    idCardExpiry: { type: Date, required: true },   // เพิ่มวันหมดอายุบัตร
    idCardImageUrl: { type: String, required: true }, 
    isActive: { type: Boolean, default: true } 
}, { timestamps: true });

module.exports = mongoose.model('WaterparkRelative', relativeSchema);
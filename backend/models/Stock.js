const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
    itemType: { type: String, required: true }, // เช่น เสื้อโปโล
    size: { type: String, required: true },     // เช่น S, M, L
    category: { type: String },                 // เช่น เสื้อ
    newStock: { type: Number, default: 0 },
    usedStock: { type: Number, default: 0 },
    damagedStock: { type: Number, default: 0 },
    imageUrl: { type: String, default: '' },
    lowStockThreshold: { type: Number, default: 5 }
}, { timestamps: true });

module.exports = mongoose.model('Stock', stockSchema);

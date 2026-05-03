const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    itemType: { type: String, required: true },
    size: { type: String, required: true },
    transactionType: { type: String, enum: ['IN', 'OUT', 'ADJUST', 'RETURN-USED', 'RETURN-DAMAGED'] },
    quantity: { type: Number, required: true },
    reason: { type: String },
    adminUser: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('StockTransaction', transactionSchema);


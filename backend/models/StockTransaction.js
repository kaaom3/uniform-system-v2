const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema({
    itemType: { type: String, required: true },
    size: { type: String, required: true },
    transactionType: { 
        type: String, 
        required: true, 
        // 💡 เพิ่ม 'OUT-USED' เข้าไปใน Enum (รายชื่อคำที่อนุญาตให้บันทึกได้)
        enum: ['IN', 'OUT', 'ADJUST', 'RETURN-USED', 'RETURN-DAMAGED', 'OUT-USED'] 
    },
    quantity: { type: Number, required: true },
    reason: { type: String },
    adminUser: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
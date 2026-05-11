const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
    itemType: { type: String, required: true }, 
    size: { type: String, required: true },     
    category: { type: String },                 
    newStock: { type: Number, default: 0 },
    usedStock: { type: Number, default: 0 },
    damagedStock: { type: Number, default: 0 },
    imageUrl: { type: String, default: '' },
    lowStockThreshold: { type: Number, default: 5 },
    isActive: { type: Boolean, default: true } // 💡 เพิ่มฟิลด์: เก็บสถานะว่าพัสดุนี้ยังให้เบิกอยู่หรือไม่ (Soft Delete)
}, { timestamps: true });

module.exports = mongoose.model('Stock', stockSchema);
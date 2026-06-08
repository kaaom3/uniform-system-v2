const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    idCardNumber: { type: String, default: '' },
    idCardExpiry: { type: Date }, 
    idCardImageUrl: { type: String, required: true },
    ticketType: { type: String, enum: ['FREE', '50_DISCOUNT'], required: true }
});

// 💡 สร้าง Schema ย่อยสำหรับเก็บประวัติแต่ละสเต็ป
const approvalHistorySchema = new mongoose.Schema({
    action: { type: String, required: true }, // เช่น CREATED, HEAD_APPROVED, HR_APPROVED, REJECTED, RETURNED, CANCELLED
    actor: { type: String, required: true },  // ชื่อ/รหัสพนักงานที่กด
    timestamp: { type: Date, default: Date.now }, // เวลาที่กด
    note: { type: String, default: '' }       // เหตุผลประกอบ (ถ้ามี)
});

const waterparkBookingSchema = new mongoose.Schema({
    bookingId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    visitDate: { type: Date, required: true },
    isEmployeeEntering: { type: Boolean, default: true },
    guests: [guestSchema],
    
    totalFreeGuestsUsed: { type: Number, default: 0 }, 
    totalDiscountGuestsUsed: { type: Number, default: 0 },
    
    isUrgent: { type: Boolean, default: false },
    urgentReason: { type: String, default: '' },

    bookingType: { type: String, enum: ['NORMAL', 'AFFILIATE'], default: 'NORMAL' },
    affiliateName: { type: String, default: '' },
    affiliateCompany: { type: String, default: '' },

    status: { 
        type: String, 
        enum: ['Pending_Head', 'Pending_HR', 'Approved', 'Rejected', 'Cancelled', 'Returned'], 
        default: 'Pending_Head' 
    },
    headApprover: { type: String, default: '' }, 
    hrApprover: { type: String, default: '' },   
    rejectReason: { type: String, default: '' },
    
    // 💡 ฟิลด์เก็บประวัติแบบ Array
    approvalHistory: [approvalHistorySchema]

}, { timestamps: true });

module.exports = mongoose.model('WaterparkBooking', waterparkBookingSchema);
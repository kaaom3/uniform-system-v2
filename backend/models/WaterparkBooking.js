const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    idCardNumber: { type: String, default: '' },
    idCardExpiry: { type: Date }, 
    idCardImageUrl: { type: String, required: true },
    ticketType: { type: String, enum: ['FREE', '50_DISCOUNT'], required: true }
});

const waterparkBookingSchema = new mongoose.Schema({
    bookingId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    visitDate: { type: Date, required: true },
    isEmployeeEntering: { type: Boolean, default: true },
    guests: [guestSchema],
    
    totalFreeGuestsUsed: { type: Number, default: 0 }, 
    totalDiscountGuestsUsed: { type: Number, default: 0 },
    
    // 💡 ฟิลด์สำหรับระบบจองด่วน
    isUrgent: { type: Boolean, default: false },
    urgentReason: { type: String, default: '' },

    status: { 
        type: String, 
        enum: ['Pending_Head', 'Pending_HR', 'Approved', 'Rejected', 'Cancelled', 'Returned'], 
        default: 'Pending_Head' 
    },
    headApprover: { type: String, default: '' }, 
    hrApprover: { type: String, default: '' },   
    rejectReason: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('WaterparkBooking', waterparkBookingSchema);
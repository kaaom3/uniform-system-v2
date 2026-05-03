const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    requestId: { type: String, required: true, unique: true },
    requesterName: { type: String, required: true },
    department: { type: String },
    itemType: { type: String, required: true },
    size: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String },
    status: { 
        type: String, 
        enum: ['Pending', 'Approved', 'Rejected', 'Pending Return', 'Returned'], 
        default: 'Pending' 
    },
    notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Request', requestSchema);

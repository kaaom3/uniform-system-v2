const mongoose = require('mongoose');

const { encrypt, decrypt, maskIdCard } = require('../utils/crypto');

const relativeSchema = new mongoose.Schema({
    username: { type: String, required: true }, 
    fullName: { type: String, required: true }, 
    idCardNumber: { 
        type: String, 
        required: true,
        get: decrypt,
        set: encrypt
    }, 
    idCardExpiry: { type: Date, required: true },   
    idCardImageUrl: { type: String, required: true }, 
    isActive: { type: Boolean, default: true } 
}, { 
    timestamps: true, 
    toJSON: { 
        getters: true,
        transform: function(doc, ret) {
            if (ret.idCardNumber) ret.idCardNumber = maskIdCard(ret.idCardNumber);
            return ret;
        }
    }, 
    toObject: { getters: true } 
});

// Pre-save hook just in case the setter didn't trigger
relativeSchema.pre('save', function(next) {
    if (this.isModified('idCardNumber')) {
        this.idCardNumber = encrypt(this.idCardNumber);
    }
    next();
});

module.exports = mongoose.model('WaterparkRelative', relativeSchema);
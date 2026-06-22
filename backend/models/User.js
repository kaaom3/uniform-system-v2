const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    department: { type: String },
    
    // 💡 เพิ่มฟิลด์สำหรับเก็บ Email
    email: { type: String, default: '' },
    
    // 💡 สำหรับผูกบัญชี LINE (LIFF / Messaging API)
    lineUserId: { type: String, default: '' },
    
    
    // ระดับสิทธิ์สวนน้ำ
    positionLevel: { 
        type: String, 
        enum: ['Tier1_Staff', 'Tier2_Manager', 'Tier3_Director'], 
        default: 'Tier1_Staff' 
    },
    // สิทธิ์การเป็นหัวหน้าผู้อนุมัติประจำแผนก (สวนน้ำ)
    isHeadApprover: { type: Boolean, default: false },
    // สถานะปลดล็อคการลงทะเบียนญาติ (สำหรับให้แอดมินเปิดให้ลงใหม่)
    waterparkRegUnlocked: { type: Boolean, default: false },
    
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    mustChangePassword: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
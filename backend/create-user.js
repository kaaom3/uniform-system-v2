require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

// เชื่อมต่อฐานข้อมูล
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        
        // ตรวจสอบว่ามี admin อยู่แล้วหรือไม่
        const existingUser = await User.findOne({ username: 'admin' });
        if (existingUser) {
            console.log('⚠️ มีผู้ใช้นี้ในระบบแล้วครับ');
            process.exit();
        }

        // สร้างผู้ใช้ใหม่
        const newUser = new User({
            username: 'admin',           // กำหนด Username สำหรับล็อกอิน
            password: 'password123',     // กำหนด รหัสผ่าน
            name: 'ผู้ดูแลระบบ',
            department: 'บริหาร',
            role: 'admin',
            status: 'active',
            mustChangePassword: false
        });

        await newUser.save();
        console.log('🎉 สร้างผู้ใช้สำเร็จ!');
        console.log('👉 Username: admin');
        console.log('👉 Password: password123');
        process.exit();
    })
    .catch(err => console.error('❌ Error:', err));
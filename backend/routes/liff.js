const express = require('express');
const router = express.Router();
const User = require('../models/User');

// POST /api/liff/login
// เข้าสู่ระบบด้วย LINE User ID
router.post('/login', async (req, res) => {
    try {
        const { lineUserId } = req.body;
        if (!lineUserId) return res.status(400).json({ error: 'Missing lineUserId' });

        const user = await User.findOne({ lineUserId });
        if (!user) {
            return res.status(404).json({ error: 'ไม่พบบัญชีที่ผูกกับ LINE นี้' });
        }

        if (user.status !== 'active') return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });

        res.json({ 
            username: user.username, 
            name: user.name, 
            department: user.department, 
            role: user.role, 
            isHeadApprover: user.isHeadApprover, 
            mustChangePassword: user.mustChangePassword 
        });
    } catch (err) {
        console.error('LIFF Login Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// POST /api/liff/bind
// ผูกบัญชี LINE กับบัญชีผู้ใช้งานเดิม
router.post('/bind', async (req, res) => {
    try {
        const { lineUserId, username, password } = req.body;
        if (!lineUserId || !username || !password) {
            return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
        }

        if (user.status !== 'active') return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });

        // ผูกบัญชี LINE
        user.lineUserId = lineUserId;
        await user.save();

        res.json({ 
            username: user.username, 
            name: user.name, 
            department: user.department, 
            role: user.role, 
            isHeadApprover: user.isHeadApprover, 
            mustChangePassword: user.mustChangePassword 
        });
    } catch (err) {
        console.error('LIFF Bind Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;

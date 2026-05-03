require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// นำเข้า Models 
// (ตรวจสอบให้แน่ใจว่าคุณสร้างไฟล์ StockTransaction.js ไว้ในโฟลเดอร์ models แล้ว)
const User = require('./models/User');
const Stock = require('./models/Stock');
const Request = require('./models/Request');
const Log = require('./models/Log');
const StockTransaction = require('./models/StockTransaction');
const { sendPushMessage } = require('./utils/lineNotify'); // 👈 เพิ่มการดึงไฟล์ LINE ตรงนี้

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 🔗 เชื่อมต่อ MongoDB
// ==========================================
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Helper Functions
const generateRequestId = () => 'REQ-' + Math.random().toString(36).substr(2, 9).toUpperCase();
const logAdminAction = async (adminName, action, details) => {
    try {
        await new Log({ adminName, action, details }).save();
    } catch (e) {
        console.error("Log Error:", e);
    }
};

// ==========================================
// 🔑 AUTHENTICATION & USERS
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || user.password !== password) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        if (user.status !== 'active') return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
        
        res.json({ 
            username: user.username, 
            name: user.name, 
            department: user.department, 
            role: user.role, 
            mustChangePassword: user.mustChangePassword 
        });
    } catch (err) { res.status(500).json({ error: 'Server Error' }); }
});

app.post('/api/auth/change-password', async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        await User.findOneAndUpdate({ username }, { password: newPassword, mustChangePassword: false });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'เปลี่ยนรหัสผ่านไม่สำเร็จ' }); }
});

app.get('/api/users', async (req, res) => {
    try { res.json(await User.find()); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const { userData, adminUser } = req.body;
        const existing = await User.findOne({ username: userData.username });
        if (existing) {
            await User.findOneAndUpdate({ username: userData.username }, userData);
            await logAdminAction(adminUser, 'User Management', `อัปเดตข้อมูลผู้ใช้: ${userData.username}`);
        } else {
            userData.mustChangePassword = true;
            await new User(userData).save();
            await logAdminAction(adminUser, 'User Management', `สร้างผู้ใช้ใหม่: ${userData.username}`);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:username', async (req, res) => {
    try {
        await User.findOneAndDelete({ username: req.params.username });
        await logAdminAction(req.body.adminUser, 'User Management', `ลบผู้ใช้: ${req.params.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 📦 STOCK MANAGEMENT (การจัดการสต๊อกแบบใหม่)
// ==========================================
app.get('/api/stock', async (req, res) => {
    try { res.json(await Stock.find()); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// สร้างรายการพัสดุใหม่ (Create New Stock Item)
app.post('/api/stock', async (req, res) => {
    try {
        const { itemType, size, adminUser, ...stockData } = req.body;
        const existing = await Stock.findOne({ itemType, size });
        
        if (existing) {
            await Stock.findOneAndUpdate({ itemType, size }, stockData);
            await logAdminAction(adminUser, 'Stock Management', `แก้ไขข้อมูลพื้นฐานพัสดุ: ${itemType} (${size})`);
        } else {
            await new Stock({ itemType, size, ...stockData }).save();
            await logAdminAction(adminUser, 'Stock Management', `สร้างรายการพัสดุใหม่: ${itemType} (${size})`);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// จัดการบัญชีสต๊อก (รับเข้า / ปรับปรุงยอด)
app.post('/api/stock/transaction', async (req, res) => {
    try {
        const { itemType, size, transactionType, quantity, newBalance, reason, adminUser } = req.body;
        const stock = await Stock.findOne({ itemType, size });
        if (!stock) return res.status(404).json({ error: 'ไม่พบรายการพัสดุนี้ในระบบ' });

        let diffQty = 0;
        if (transactionType === 'IN') {
            diffQty = quantity;
            stock.newStock += diffQty;
        } else if (transactionType === 'ADJUST') {
            diffQty = newBalance - stock.newStock;
            stock.newStock = newBalance;
        }
        await stock.save();

        // บันทึกประวัติลง StockTransaction
        await new StockTransaction({
            itemType, size, transactionType, quantity: diffQty, reason, adminUser
        }).save();
        
        await logAdminAction(adminUser, 'Stock Management', `ทำรายการ ${transactionType} พัสดุ: ${itemType} (${size}) | ยอดส่วนต่าง: ${diffQty}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// เรียกดูประวัติสต๊อก (Ledger History)
app.get('/api/stock/history', async (req, res) => {
    try {
        const { itemType, size } = req.query;
        // เรียงจากใหม่ไปเก่า
        const history = await StockTransaction.find({ itemType, size }).sort({ createdAt: -1 });
        res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 🛒 REQUESTS (การเบิก-คืน)
// ==========================================
app.get('/api/requests/me', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.query.username });
        if(!user) throw new Error("User not found");
        res.json(await Request.find({ requesterName: user.name }).sort({ createdAt: -1 }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/all', async (req, res) => {
    try { res.json(await Request.find().sort({ createdAt: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests/new', async (req, res) => {
    try {
        const data = req.body;
        data.requestId = generateRequestId();
        await new Request(data).save();
        
        // 👈 เพิ่มการส่งแจ้งเตือน LINE เมื่อมีการเบิกใหม่
        sendPushMessage(data, 'เบิกใหม่');
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests/return', async (req, res) => {
    try {
        const { originalRequestId, quantityToReturn, reasonDetails, requesterName } = req.body;
        const originalReq = await Request.findOne({ requestId: originalRequestId });
        if (!originalReq || originalReq.status !== 'Approved') throw new Error('ไม่พบรายการที่อนุมัติแล้ว');
        
        if (quantityToReturn < originalReq.quantity) {
            // หักลบจำนวนเดิม (Split Request)
            originalReq.quantity -= quantityToReturn;
            await originalReq.save();
            
            // สร้างใบขอคืนใหม่แยกออกมา
            const returnReq = new Request({
                requestId: generateRequestId(),
                requesterName: originalReq.requesterName,
                department: originalReq.department,
                itemType: originalReq.itemType,
                size: originalReq.size,
                quantity: quantityToReturn,
                reason: `ขอคืนจากใบเบิก ${originalRequestId} (เหตุผล: ${reasonDetails})`,
                status: 'Pending Return'
            });
            await returnReq.save();
            
            // 👈 เพิ่มการส่งแจ้งเตือน LINE เมื่อขอคืน (บางส่วน)
            sendPushMessage(returnReq, 'ขอคืน/เปลี่ยน');
            
        } else {
            // คืนทั้งหมด อัปเดตสถานะใบเดิม
            originalReq.status = 'Pending Return';
            originalReq.reason = `ขอคืนพัสดุทั้งหมด (เหตุผล: ${reasonDetails})`;
            await originalReq.save();
            
            // 👈 เพิ่มการส่งแจ้งเตือน LINE เมื่อขอคืน (ทั้งหมด)
            sendPushMessage(originalReq, 'ขอคืน/เปลี่ยน');
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/holdings', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.query.username });
        if(!user) return res.json({});
        const approved = await Request.find({ requesterName: user.name, status: 'Approved' });
        const holdings = {};
        approved.forEach(req => {
            const key = `${req.itemType} (ไซส์ ${req.size})`;
            holdings[key] = (holdings[key] || 0) + req.quantity;
        });
        res.json(holdings);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 🛡️ ADMIN ACTIONS (การพิจารณาอนุมัติ)
// ==========================================
app.get('/api/admin/pending-approvals', async (req, res) => {
    try { res.json(await Request.find({ status: { $in: ['Pending', 'Pending Return'] } }).sort({ createdAt: 1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/approve', async (req, res) => {
    try {
        const { requestId, approvedQuantity, reason, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        const stock = await Stock.findOne({ itemType: request.itemType, size: request.size });
        
        if (!stock || stock.newStock < approvedQuantity) throw new Error(`สต็อกของใหม่ไม่พอ (มีอยู่ ${stock ? stock.newStock : 0} ชิ้น)`);
        
        // ตัดสต๊อก
        stock.newStock -= approvedQuantity;
        await stock.save();

        // บันทึก Transaction การตัดสต๊อกเพื่อเบิก
        await new StockTransaction({
            itemType: request.itemType, size: request.size, transactionType: 'OUT', quantity: -Math.abs(approvedQuantity), 
            reason: `เบิกจ่ายให้ ${request.requesterName} (Ref: ${requestId})`, adminUser
        }).save();

        // อัปเดตใบเบิก
        request.status = 'Approved';
        request.quantity = approvedQuantity;
        request.notes = `อนุมัติโดย ${adminUser} ${reason ? '(' + reason + ')' : ''}`;
        await request.save();

        await logAdminAction(adminUser, 'Approval', `อนุมัติใบเบิก ${requestId} จำนวน ${approvedQuantity} ชิ้น`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/reject', async (req, res) => {
    try {
        const { requestId, reason, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        request.status = 'Rejected';
        request.notes = `ปฏิเสธโดย ${adminUser}: ${reason}`;
        await request.save();
        await logAdminAction(adminUser, 'Approval', `ปฏิเสธคำขอ ${requestId}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// รับคืนอย่างเดียว (ไม่เบิกจ่ายของใหม่ให้)
app.post('/api/admin/return-only', async (req, res) => {
    try {
        const { requestId, returnCondition, damageReason, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        const stock = await Stock.findOne({ itemType: request.itemType, size: request.size });
        
        if (returnCondition === 'Used') {
            stock.usedStock += request.quantity;
        } else {
            stock.damagedStock += request.quantity;
        }
        await stock.save();

        // บันทึก Transaction การคืน
        const transType = returnCondition === 'Used' ? 'RETURN-USED' : 'RETURN-DAMAGED';
        await new StockTransaction({
            itemType: request.itemType, size: request.size, transactionType: transType, quantity: request.quantity, 
            reason: `รับคืนจาก ${request.requesterName} (Ref: ${requestId}) ${damageReason ? '- ' + damageReason : ''}`, adminUser
        }).save();

        request.status = 'Returned';
        request.notes = `รับคืนโดย ${adminUser} (สภาพ: ${returnCondition}) ${damageReason ? 'เหตุผล: ' + damageReason : ''}`;
        await request.save();
        
        await logAdminAction(adminUser, 'Approval', `รับคืนสินค้า ${requestId} สถานะ: ${returnCondition}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// รับคืน และ เบิกจ่ายของใหม่ให้ (Replacement)
app.post('/api/admin/return-disburse', async (req, res) => {
    try {
        const { requestId, returnCondition, disbursementType, damageReason, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        const stock = await Stock.findOne({ itemType: request.itemType, size: request.size });
        
        // ตรวจสอบสต๊อกของใหม่ก่อน ว่าพอที่จะเบิกให้หรือไม่
        if (disbursementType === 'New' && stock.newStock < request.quantity) {
            throw new Error(`สต็อกของใหม่ไม่พอสำหรับเปลี่ยน (มีอยู่ ${stock.newStock} ชิ้น)`);
        }

        // 1. กระบวนการรับคืน (คืนเข้าสต๊อกมือสอง หรือ ชำรุด)
        if (returnCondition === 'Used') stock.usedStock += request.quantity;
        else stock.damagedStock += request.quantity;
        
        const transType = returnCondition === 'Used' ? 'RETURN-USED' : 'RETURN-DAMAGED';
        await new StockTransaction({
            itemType: request.itemType, size: request.size, transactionType: transType, quantity: request.quantity, 
            reason: `รับคืนจาก ${request.requesterName} (Ref: ${requestId}) ${damageReason ? '- ' + damageReason : ''}`, adminUser
        }).save();

        // 2. กระบวนการเบิกของใหม่ให้ (ตัดสต๊อก)
        stock.newStock -= request.quantity;
        await stock.save();

        await new StockTransaction({
            itemType: request.itemType, size: request.size, transactionType: 'OUT', quantity: -Math.abs(request.quantity), 
            reason: `เบิกจ่ายทดแทนของชำรุดให้ ${request.requesterName} (Ref: ${requestId})`, adminUser
        }).save();

        // 3. ปิดสถานะใบขอคืนเดิม
        request.status = 'Returned';
        request.notes = `รับคืน(${returnCondition}) และเบิกจ่ายของใหม่ทดแทนแล้ว โดย ${adminUser}`;
        await request.save();

        // 4. สร้างใบเบิกใหม่ที่เป็นตัวแทนของของใหม่ที่เพิ่งให้ไป
        await new Request({
            requestId: generateRequestId(),
            requesterName: request.requesterName,
            department: request.department,
            itemType: request.itemType,
            size: request.size,
            quantity: request.quantity,
            reason: `ทดแทนของชำรุดจากใบเบิก ${requestId}`,
            status: 'Approved',
            notes: `สร้างอัตโนมัติจากการเปลี่ยนสินค้าชำรุด โดย ${adminUser}`
        }).save();
        
        await logAdminAction(adminUser, 'Approval', `รับคืนและเปลี่ยนพัสดุใหม่ให้คำขอ ${requestId}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 📊 LOGS
// ==========================================
app.get('/api/logs', async (req, res) => {
    try { res.json(await Log.find().sort({ createdAt: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// เริ่มการทำงานของ Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
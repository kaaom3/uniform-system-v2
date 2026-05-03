require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Models
const User = require('./models/User');
const Stock = require('./models/Stock');
const Request = require('./models/Request');
const Log = require('./models/Log');
const StockTransaction = require('./models/StockTransaction');
const PasswordReset = require('./models/PasswordReset');

// Utils (ไฟล์นี้อยู่ในโฟลเดอร์ backend โดยตรงตามที่คุณตั้งค่าไว้)
const { sendPushMessage } = require('./lineNotify'); 

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 📂 FILE UPLOAD CONFIG (Multer)
// ==========================================
// สร้างโฟลเดอร์สำหรับเก็บไฟล์อัปโหลดหากยังไม่มี
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}
// เปิดให้หน้าเว็บสามารถดึงไฟล์รูปภาพไปแสดงผลได้
app.use('/uploads', express.static('uploads')); 

// ตั้งค่า Multer (ระบบอัปโหลดไฟล์)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// ==========================================
// 🔗 เชื่อมต่อ MongoDB
// ==========================================
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Helper Functions
const generateRequestId = () => 'REQ-' + Math.random().toString(36).substr(2, 9).toUpperCase();
const logAdminAction = async (adminName, action, details) => {
    try { await new Log({ adminName, action, details }).save(); } catch (e) { console.error("Log Error:", e); }
};

// ==========================================
// 🔑 AUTHENTICATION & USERS & PASSWORD RESET
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

// ส่งคำขอรีเซ็ตรหัสผ่าน (ฝั่ง User)
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'ไม่พบรหัสพนักงานนี้ในระบบ' });
        await new PasswordReset({ username, status: 'Pending' }).save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ดูคำขอรีเซ็ต (ฝั่ง Admin)
app.get('/api/admin/password-resets', async (req, res) => {
    try { res.json(await PasswordReset.find({ status: 'Pending' }).sort({ createdAt: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// อนุมัติคำขอรีเซ็ต (ฝั่ง Admin)
app.post('/api/admin/approve-reset', async (req, res) => {
    try {
        const { resetId, username, newPassword, adminUser } = req.body;
        await User.findOneAndUpdate({ username }, { password: newPassword, mustChangePassword: true });
        await PasswordReset.findByIdAndUpdate(resetId, { status: 'Approved' });
        await logAdminAction(adminUser, 'Password Reset', `อนุมัติรีเซ็ตรหัสผ่านให้: ${username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users', async (req, res) => {
    try { res.json(await User.find()); } catch (err) { res.status(500).json({ error: err.message }); }
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
// 📂 API: FILE UPLOAD & CSV IMPORT/EXPORT
// ==========================================
// อัปโหลดรูปภาพ
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์ที่อัปโหลด" });
    // ส่ง URL กลับไปให้หน้าเว็บเซฟลงฐานข้อมูล
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// นำเข้าผู้ใช้จาก CSV
app.post('/api/users/import', upload.single('csvfile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์ CSV" });
        const content = fs.readFileSync(req.file.path, 'utf8');
        const lines = content.split(/\r?\n/);
        let importedCount = 0;
        
        for(let i = 1; i < lines.length; i++) { // ข้ามบรรทัด Header (บรรทัดแรก)
            if (!lines[i].trim()) continue;
            const [username, password, name, department, role, status] = lines[i].split(',');
            if (username && password && name) {
                const exist = await User.findOne({ username: username.trim() });
                if (!exist) {
                    await new User({ 
                        username: username.trim(), 
                        password: password.trim(), 
                        name: name.trim(), 
                        department: department ? department.trim() : '-', 
                        role: role ? role.trim() : 'user', 
                        status: status ? status.trim() : 'active',
                        mustChangePassword: true
                    }).save();
                    importedCount++;
                }
            }
        }
        // ลบไฟล์ CSV ชั่วคราวออกจากเครื่องเซิร์ฟเวอร์
        fs.unlinkSync(req.file.path); 
        res.json({ success: true, count: importedCount });
    } catch (err) { res.status(500).json({ error: "รูปแบบไฟล์ CSV ไม่ถูกต้อง" }); }
});

// ส่งออกประวัติเป็น CSV
app.get('/api/export/history', async (req, res) => {
    try {
        const requests = await Request.find().sort({ createdAt: -1 });
        // ใส่ \uFEFF ด้านหน้าเพื่อให้ Excel อ่านภาษาไทยได้ (BOM)
        let csv = '\uFEFFเวลา,ผู้เบิก,แผนก,ประเภท,ไซส์,จำนวน,สถานะ,หมายเหตุ\n';
        requests.forEach(r => {
            csv += `"${new Date(r.createdAt).toLocaleString()}","${r.requesterName}","${r.department}","${r.itemType}","${r.size}",${r.quantity},"${r.status}","${r.notes || r.reason || '-'}"\n`;
        });
        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.attachment(`History_Export_${Date.now()}.csv`);
        res.send(csv);
    } catch (err) { res.status(500).send("Export Error"); }
});

// ==========================================
// 📦 STOCK MANAGEMENT
// ==========================================
app.get('/api/stock', async (req, res) => {
    try { res.json(await Stock.find()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock', async (req, res) => {
    try {
        const { itemType, size, adminUser, ...stockData } = req.body;
        const existing = await Stock.findOne({ itemType, size });
        if (existing) {
            await Stock.findOneAndUpdate({ itemType, size }, stockData);
            await logAdminAction(adminUser, 'Stock Management', `แก้ไขข้อมูลพัสดุ: ${itemType} (${size})`);
        } else {
            await new Stock({ itemType, size, ...stockData }).save();
            await logAdminAction(adminUser, 'Stock Management', `สร้างรายการพัสดุใหม่: ${itemType} (${size})`);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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

        await new StockTransaction({ itemType, size, transactionType, quantity: diffQty, reason, adminUser }).save();
        await logAdminAction(adminUser, 'Stock Management', `ทำรายการ ${transactionType} พัสดุ: ${itemType} (${size})`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stock/history', async (req, res) => {
    try { res.json(await StockTransaction.find({ itemType: req.query.itemType, size: req.query.size }).sort({ createdAt: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 🛒 REQUESTS (การเบิก-คืน)
// ==========================================
app.get('/api/requests/me', async (req, res) => {
    try { 
        const user = await User.findOne({ username: req.query.username });
        if (!user) return res.json([]);
        res.json(await Request.find({ requesterName: user.name }).sort({ createdAt: -1 })); 
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/all', async (req, res) => {
    try { res.json(await Request.find().sort({ createdAt: -1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests/new', async (req, res) => {
    try {
        const data = req.body;
        data.requestId = generateRequestId();
        const newReq = await new Request(data).save();
        
        // แจ้งเตือนผ่าน LINE
        sendPushMessage(newReq, 'เบิกใหม่');
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests/return', async (req, res) => {
    try {
        const { originalRequestId, quantityToReturn, reasonDetails, requesterName } = req.body;
        const originalReq = await Request.findOne({ requestId: originalRequestId });
        if (!originalReq || originalReq.status !== 'Approved') throw new Error('ไม่พบรายการที่อนุมัติแล้ว');
        
        if (quantityToReturn < originalReq.quantity) {
            originalReq.quantity -= quantityToReturn;
            await originalReq.save();
            const returnReq = await new Request({
                requestId: generateRequestId(), 
                requesterName: originalReq.requesterName, 
                department: originalReq.department,
                itemType: originalReq.itemType, 
                size: originalReq.size, 
                quantity: quantityToReturn,
                reason: `ขอคืนจากใบเบิก ${originalRequestId} (เหตุผล: ${reasonDetails})`, 
                status: 'Pending Return'
            }).save();
            
            // แจ้งเตือนผ่าน LINE
            sendPushMessage(returnReq, 'ขอคืน/เปลี่ยน');
        } else {
            originalReq.status = 'Pending Return';
            originalReq.reason = `ขอคืนพัสดุทั้งหมด (เหตุผล: ${reasonDetails})`;
            await originalReq.save();
            
            // แจ้งเตือนผ่าน LINE
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
// 🛡️ ADMIN ACTIONS
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
        if (!stock || stock.newStock < approvedQuantity) throw new Error('สต็อกของใหม่ไม่พอ');
        
        stock.newStock -= approvedQuantity;
        await stock.save();
        await new StockTransaction({ 
            itemType: request.itemType, size: request.size, transactionType: 'OUT', 
            quantity: -Math.abs(approvedQuantity), reason: `เบิกจ่ายให้ ${request.requesterName}`, adminUser 
        }).save();

        request.status = 'Approved'; 
        request.quantity = approvedQuantity; 
        request.notes = `อนุมัติโดย ${adminUser} ${reason ? '(' + reason + ')' : ''}`;
        await request.save();
        
        await logAdminAction(adminUser, 'Approval', `อนุมัติใบเบิก ${requestId}`);
        
        // แจ้งผลการอนุมัติให้ผู้ใช้ทราบผ่าน LINE
        sendPushMessage(request, 'อนุมัติคำขอ'); 
        
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
        
        // แจ้งผลการปฏิเสธให้ผู้ใช้ทราบผ่าน LINE
        sendPushMessage(request, 'ปฏิเสธคำขอ'); 
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/return-only', async (req, res) => {
    try {
        const { requestId, returnCondition, damageReason, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        const stock = await Stock.findOne({ itemType: request.itemType, size: request.size });
        
        if (returnCondition === 'Used') stock.usedStock += request.quantity; 
        else stock.damagedStock += request.quantity;
        await stock.save();

        await new StockTransaction({ 
            itemType: request.itemType, size: request.size, 
            transactionType: returnCondition === 'Used' ? 'RETURN-USED' : 'RETURN-DAMAGED', 
            quantity: request.quantity, reason: `รับคืนจาก ${request.requesterName}`, adminUser 
        }).save();
        
        request.status = 'Returned'; 
        request.notes = `รับคืนโดย ${adminUser} (สภาพ: ${returnCondition})`;
        await request.save();
        
        // แจ้งเตือน LINE (กรณีรับคืนอย่างเดียว)
        sendPushMessage(request, 'อนุมัติคำขอ'); 
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/return-disburse', async (req, res) => {
    try {
        const { requestId, returnCondition, disbursementType, damageReason, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        const stock = await Stock.findOne({ itemType: request.itemType, size: request.size });
        
        if (disbursementType === 'New' && stock.newStock < request.quantity) throw new Error('สต็อกของใหม่ไม่พอสำหรับเปลี่ยน');

        if (returnCondition === 'Used') stock.usedStock += request.quantity; 
        else stock.damagedStock += request.quantity;
        
        await new StockTransaction({ 
            itemType: request.itemType, size: request.size, 
            transactionType: returnCondition === 'Used' ? 'RETURN-USED' : 'RETURN-DAMAGED', 
            quantity: request.quantity, reason: `รับคืนจาก ${request.requesterName}`, adminUser 
        }).save();

        stock.newStock -= request.quantity; 
        await stock.save();
        
        await new StockTransaction({ 
            itemType: request.itemType, size: request.size, 
            transactionType: 'OUT', quantity: -Math.abs(request.quantity), reason: `เบิกจ่ายทดแทน`, adminUser 
        }).save();

        request.status = 'Returned'; 
        request.notes = `รับคืน(${returnCondition}) และเบิกของใหม่ให้แล้ว`; 
        await request.save();
        
        const newReq = await new Request({ 
            requestId: generateRequestId(), requesterName: request.requesterName, 
            department: request.department, itemType: request.itemType, size: request.size, 
            quantity: request.quantity, reason: `ทดแทนของชำรุด`, status: 'Approved' 
        }).save();
        
        // แจ้งเตือน LINE ว่าได้รับของทดแทน
        sendPushMessage(newReq, 'อนุมัติคำขอ'); 
        
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
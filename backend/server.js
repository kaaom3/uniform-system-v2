require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const https = require('https'); 

// Models
const User = require('./models/User');
const Stock = require('./models/Stock');
const Request = require('./models/Request');
const Log = require('./models/Log');
const StockTransaction = require('./models/StockTransaction');
const PasswordReset = require('./models/PasswordReset');

// Utils (หรือ ./utils/lineNotify ขึ้นอยู่กับตำแหน่งไฟล์ของคุณ)
const { sendPushMessage } = require('./lineNotify'); 

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 📂 FILE UPLOAD CONFIG (Multer)
// ==========================================
if (!fs.existsSync('./uploads')) { fs.mkdirSync('./uploads'); }
app.use('/uploads', express.static('uploads')); 

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

const generateRequestId = () => 'REQ-' + Math.random().toString(36).substr(2, 9).toUpperCase();
const logAdminAction = async (adminName, action, details) => {
    try { await new Log({ adminName, action, details }).save(); } catch (e) {}
};

// ==========================================
// 🤖 LINE WEBHOOK (ระบบตอบโต้อัตโนมัติ)
// ==========================================
const LINE_TOKEN = "dCnA72Q1lQkAo6W2wY4q/3JLZiUJ0UqF3r/5H/kYLVylWAaab2u3FRxeNmJN536psAEbkV56INlKAoCMSfD9wF0CTxZ7x/WAgUKVv0warZ5lbiA1BTIdtwG26FuNFudDcHun6BslptbMbk6xpk5QdQdB04t89/1O/w1cDnyilFU=";

async function replyLineMessage(replyToken, text) {
    return new Promise((resolve, reject) => {
        if (replyToken === '00000000000000000000000000000000' || replyToken === 'ffffffffffffffffffffffffffffffff') {
            return resolve();
        }

        const payload = JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] });

        const options = {
            hostname: 'api.line.me',
            path: '/v2/bot/message/reply',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_TOKEN}`,
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                console.log(`📤 [LINE Reply Result]: HTTP ${res.statusCode}`, body);
                resolve(body);
            });
        });

        req.on('error', (e) => {
            console.error('❌ [LINE Reply Error]:', e.message);
            reject(e);
        });

        req.write(payload);
        req.end();
    });
}

app.post('/api/webhook/line', async (req, res) => {
    try {
        const events = req.body.events;
        res.status(200).send('OK'); // ตอบกลับ LINE ทันที

        if (!events || events.length === 0) return;

        for (const event of events) {
            const replyToken = event.replyToken;

            if (event.type === 'follow') {
                const welcomeText = "สวัสดีครับ! 🙏 ยินดีต้อนรับสู่ระบบเบิก-คืนชุดยูนิฟอร์ม\n\n🔑 หากคุณลืมรหัสผ่าน ให้พิมพ์ข้อความส่งมาหาเราตามนี้ครับ:\n👉 ลืมรหัส [รหัสพนักงาน]\n\nตัวอย่างเช่น: ลืมรหัส 1001";
                await replyLineMessage(replyToken, welcomeText);
            }

            if (event.type === 'message' && event.message.type === 'text') {
                const text = event.message.text.trim();

                if (text.startsWith('ลืมรหัส')) {
                    const username = text.replace('ลืมรหัส', '').trim();
                    
                    if (username) {
                        const user = await User.findOne({ username });
                        if (user) {
                            await new PasswordReset({ username, status: 'Pending' }).save();
                            await replyLineMessage(replyToken, `รับเรื่องแล้ว! ⏳\nระบบได้ส่งคำขอรีเซ็ตรหัสผ่านของพนักงาน "${username}" ให้แอดมินแล้วครับ กรุณารอแอดมินแจ้งรหัสผ่านชั่วคราวให้ทราบครับ`);
                            
                            // ส่งแจ้งเตือนเข้าไปที่กลุ่มไลน์แอดมิน
                            sendPushMessage({ username: username }, 'รีเซ็ตรหัสผ่าน');
                        } else {
                            await replyLineMessage(replyToken, `❌ ขออภัยครับ ไม่พบรหัสพนักงาน "${username}" ในระบบ กรุณาตรวจสอบอีกครั้ง`);
                        }
                    } else {
                        await replyLineMessage(replyToken, `พิมพ์คำสั่งไม่ถูกต้องครับ 😅\nกรุณาพิมพ์ "ลืมรหัส [รหัสพนักงาน]" \nตัวอย่าง: ลืมรหัส 1001`);
                    }
                }
            }
        }
    } catch (err) {
        console.error("❌ [Webhook Critical Error]:", err);
        if (!res.headersSent) res.status(500).send('Error');
    }
});


// ==========================================
// 🔑 AUTHENTICATION & USERS & PASSWORD RESET
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || user.password !== password) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        if (user.status !== 'active') return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
        res.json({ username: user.username, name: user.name, department: user.department, role: user.role, mustChangePassword: user.mustChangePassword });
    } catch (err) { res.status(500).json({ error: 'Server Error' }); }
});

app.post('/api/auth/change-password', async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        await User.findOneAndUpdate({ username }, { password: newPassword, mustChangePassword: false });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'เปลี่ยนรหัสผ่านไม่สำเร็จ' }); }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'ไม่พบรหัสพนักงานนี้ในระบบ' });
        await new PasswordReset({ username, status: 'Pending' }).save();
        
        // ส่งแจ้งเตือนเข้าไปที่กลุ่มไลน์แอดมิน
        sendPushMessage({ username: username }, 'รีเซ็ตรหัสผ่าน');
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/password-resets', async (req, res) => {
    try { res.json(await PasswordReset.find({ status: 'Pending' }).sort({ createdAt: -1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

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
// 📂 API: FILE UPLOAD & CSV
// ==========================================
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์ที่อัปโหลด" });
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

app.post('/api/users/import', upload.single('csvfile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์ CSV" });
        const content = fs.readFileSync(req.file.path, 'utf8');
        const lines = content.split(/\r?\n/);
        let importedCount = 0;
        for(let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const [username, password, name, department, role, status] = lines[i].split(',');
            if (username && password && name) {
                const exist = await User.findOne({ username: username.trim() });
                if (!exist) {
                    await new User({ username: username.trim(), password: password.trim(), name: name.trim(), department: department ? department.trim() : '-', role: role ? role.trim() : 'user', status: status ? status.trim() : 'active', mustChangePassword: true }).save();
                    importedCount++;
                }
            }
        }
        fs.unlinkSync(req.file.path); 
        res.json({ success: true, count: importedCount });
    } catch (err) { res.status(500).json({ error: "รูปแบบไฟล์ CSV ไม่ถูกต้อง" }); }
});

app.get('/api/export/history', async (req, res) => {
    try {
        const requests = await Request.find().sort({ createdAt: -1 });
        let csv = '\uFEFFเวลา,ผู้เบิก,แผนก,ประเภท,ไซส์,จำนวน,สถานะ,หมายเหตุ\n';
        requests.forEach(r => { csv += `"${new Date(r.createdAt).toLocaleString()}","${r.requesterName}","${r.department}","${r.itemType}","${r.size}",${r.quantity},"${r.status}","${r.notes || r.reason || '-'}"\n`; });
        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.attachment(`History_Export_${Date.now()}.csv`);
        res.send(csv);
    } catch (err) { res.status(500).send("Export Error"); }
});

// API: ดาวน์โหลดประวัติความเคลื่อนไหวสต๊อก (เฉพาะไอเทม)
app.get('/api/export/stock-history', async (req, res) => {
    try {
        const { itemType, size } = req.query;
        let query = {};
        if (itemType) query.itemType = itemType;
        if (size) query.size = size;
        
        const history = await StockTransaction.find(query).sort({ createdAt: -1 });
        let csv = '\uFEFFเวลา,พัสดุ,ไซส์,ประเภทรายการ,จำนวน(ชิ้น),เหตุผล,ผู้ทำรายการ\n';
        history.forEach(log => { 
            csv += `"${new Date(log.createdAt).toLocaleString()}","${log.itemType}","${log.size}","${log.transactionType}",${log.quantity},"${log.reason || '-'}","${log.adminUser}"\n`; 
        });
        
        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.attachment(`Stock_History_${itemType || 'All'}_${size || ''}_${Date.now()}.csv`);
        res.send(csv);
    } catch (err) { res.status(500).send("Export Error"); }
});

// ==========================================
// 📦 STOCK MANAGEMENT
// ==========================================
app.get('/api/stock', async (req, res) => {
    try {
        // ดึงข้อมูลสต๊อกทั้งหมดในคลัง
        const stocks = await Stock.find().lean();
        
        // ดึงข้อมูลคำขอเบิกที่ของยังอยู่กับพนักงาน (อนุมัติแล้ว หรือ กำลังส่งคืน)
        const activeRequests = await Request.find({ status: { $in: ['Approved', 'Pending Return'] } });
        
        // คำนวณว่าแต่ละประเภท/ไซส์ ถูกเบิกไปกี่ตัว
        const dispensedMap = {};
        activeRequests.forEach(req => {
            const key = `${req.itemType}_${req.size}`;
            dispensedMap[key] = (dispensedMap[key] || 0) + req.quantity;
        });

        // ประกอบร่างข้อมูลสต๊อกในคลัง + จำนวนที่ถูกเบิกไป
        const enrichedStocks = stocks.map(stock => ({
            ...stock,
            dispensedStock: dispensedMap[`${stock.itemType}_${stock.size}`] || 0
        }));

        res.json(enrichedStocks);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
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
        if (transactionType === 'IN') { diffQty = quantity; stock.newStock += diffQty; } 
        else if (transactionType === 'ADJUST') { diffQty = newBalance - stock.newStock; stock.newStock = newBalance; }
        await stock.save();

        await new StockTransaction({ itemType, size, transactionType, quantity: diffQty, reason, adminUser }).save();
        await logAdminAction(adminUser, 'Stock Management', `ทำรายการ ${transactionType} พัสดุ: ${itemType} (${size})`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Advanced Adjustment API
app.post('/api/stock/advanced-adjust', async (req, res) => {
    try {
        const { itemType, size, condition, mode, qty, reason, adminUser } = req.body;
        const stock = await Stock.findOne({ itemType, size });
        if (!stock) return res.status(404).json({ error: 'ไม่พบรายการพัสดุนี้ในระบบ' });

        let diffQty = 0;
        let conditionText = '';

        // 1. ตรวจสอบว่ากำลังปรับปรุงสภาพไหน
        let currentStockQty = 0;
        if (condition === 'New') { currentStockQty = stock.newStock; conditionText = 'ของใหม่'; }
        else if (condition === 'Used') { currentStockQty = stock.usedStock; conditionText = 'มือสอง'; }
        else if (condition === 'Damaged') { currentStockQty = stock.damagedStock; conditionText = 'ชำรุด'; }

        // 2. คำนวณส่วนต่างตามโหมดที่เลือก (SET, ADD, DEDUCT)
        if (mode === 'SET') {
            diffQty = qty - currentStockQty; 
        } else if (mode === 'ADD') {
            diffQty = qty;
        } else if (mode === 'DEDUCT') {
            diffQty = -Math.abs(qty); // บังคับติดลบ
        }

        // ตรวจสอบว่าพยายามลดยอดจนติดลบหรือไม่
        if (currentStockQty + diffQty < 0) {
            throw new Error(`ไม่สามารถลดยอดได้ (สต๊อกปัจจุบันมีเพียง ${currentStockQty})`);
        }

        // 3. ถ้าไม่มีการเปลี่ยนแปลง ให้ข้ามไปเลย
        if (diffQty === 0) return res.json({ success: true });

        // 4. บันทึกค่ายอดใหม่ลง Database
        if (condition === 'New') stock.newStock += diffQty;
        else if (condition === 'Used') stock.usedStock += diffQty;
        else if (condition === 'Damaged') stock.damagedStock += diffQty;
        
        await stock.save();

        // 5. บันทึกลงสมุดบัญชี (Ledger)
        const detailedReason = `ปรับปรุงยอด(${conditionText}): ${diffQty > 0 ? '+' : ''}${diffQty} ชิ้น - ${reason}`;
        await new StockTransaction({ 
            itemType, size, 
            transactionType: 'ADJUST', 
            quantity: diffQty, 
            reason: detailedReason, 
            adminUser 
        }).save();

        await logAdminAction(adminUser, 'Stock Adjustment', `ปรับปรุงสต๊อก: ${itemType}(${size}) ${detailedReason}`);
        res.json({ success: true });

    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
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
            const returnReq = await new Request({ requestId: generateRequestId(), requesterName: originalReq.requesterName, department: originalReq.department, itemType: originalReq.itemType, size: originalReq.size, quantity: quantityToReturn, reason: `ขอคืนจากใบเบิก ${originalRequestId} (เหตุผล: ${reasonDetails})`, status: 'Pending Return' }).save();
            sendPushMessage(returnReq, 'ขอคืน/เปลี่ยน');
        } else {
            originalReq.status = 'Pending Return'; originalReq.reason = `ขอคืนพัสดุทั้งหมด (เหตุผล: ${reasonDetails})`; await originalReq.save();
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
        approved.forEach(req => { const key = `${req.itemType} (ไซส์ ${req.size})`; holdings[key] = (holdings[key] || 0) + req.quantity; });
        res.json(holdings);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 🛡️ ADMIN ACTIONS
// ==========================================
app.get('/api/admin/pending-approvals', async (req, res) => {
    try { res.json(await Request.find({ status: { $in: ['Pending', 'Pending Return'] } }).sort({ createdAt: 1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/approve', async (req, res) => {
    try {
        const { requestId, approvedQuantity, reason, stockType, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        const stock = await Stock.findOne({ itemType: request.itemType, size: request.size });
        if (!stock) throw new Error('ไม่พบพัสดุในระบบ');
        
        const isUsed = stockType === 'Used';

        // เช็คว่าสต๊อกพอมั้ย และลดสต๊อก
        if (isUsed) {
            if (stock.usedStock < approvedQuantity) throw new Error('สต็อกของมือสองไม่พอ');
            stock.usedStock -= approvedQuantity;
        } else {
            if (stock.newStock < approvedQuantity) throw new Error('สต็อกของใหม่ไม่พอ');
            stock.newStock -= approvedQuantity;
        }
        await stock.save();

        const transactionType = isUsed ? 'OUT-USED' : 'OUT';
        const reasonText = isUsed ? `เบิกจ่ายให้ ${request.requesterName} (มือสอง)` : `เบิกจ่ายให้ ${request.requesterName}`;

        await new StockTransaction({ 
            itemType: request.itemType, size: request.size, transactionType: transactionType, 
            quantity: -Math.abs(approvedQuantity), reason: reasonText, adminUser 
        }).save();

        request.status = 'Approved'; 
        request.quantity = approvedQuantity; 
        request.notes = `อนุมัติโดย ${adminUser} ${isUsed ? '[จ่ายมือสอง]' : ''} ${reason ? '(' + reason + ')' : ''}`; 
        await request.save();
        
        await logAdminAction(adminUser, 'Approval', `อนุมัติใบเบิก ${requestId} ${isUsed ? '(ของมือสอง)' : ''}`);
        sendPushMessage(request, 'อนุมัติคำขอ'); 
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/reject', async (req, res) => {
    try {
        const { requestId, reason, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        request.status = 'Rejected'; request.notes = `ปฏิเสธโดย ${adminUser}: ${reason}`; await request.save();
        await logAdminAction(adminUser, 'Approval', `ปฏิเสธคำขอ ${requestId}`);
        sendPushMessage(request, 'ปฏิเสธคำขอ'); 
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/return-only', async (req, res) => {
    try {
        const { requestId, returnCondition, damageReason, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        const stock = await Stock.findOne({ itemType: request.itemType, size: request.size });
        
        if (returnCondition === 'Used') stock.usedStock += request.quantity; else stock.damagedStock += request.quantity;
        await stock.save();

        await new StockTransaction({ itemType: request.itemType, size: request.size, transactionType: returnCondition === 'Used' ? 'RETURN-USED' : 'RETURN-DAMAGED', quantity: request.quantity, reason: `รับคืนจาก ${request.requesterName}`, adminUser }).save();
        request.status = 'Returned'; request.notes = `รับคืนโดย ${adminUser} (สภาพ: ${returnCondition})`; await request.save();
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

        if (returnCondition === 'Used') stock.usedStock += request.quantity; else stock.damagedStock += request.quantity;
        await new StockTransaction({ itemType: request.itemType, size: request.size, transactionType: returnCondition === 'Used' ? 'RETURN-USED' : 'RETURN-DAMAGED', quantity: request.quantity, reason: `รับคืนจาก ${request.requesterName}`, adminUser }).save();

        stock.newStock -= request.quantity; await stock.save();
        await new StockTransaction({ itemType: request.itemType, size: request.size, transactionType: 'OUT', quantity: -Math.abs(request.quantity), reason: `เบิกจ่ายทดแทน`, adminUser }).save();

        request.status = 'Returned'; request.notes = `รับคืน(${returnCondition}) และเบิกของใหม่ให้แล้ว`; await request.save();
        const newReq = await new Request({ requestId: generateRequestId(), requesterName: request.requesterName, department: request.department, itemType: request.itemType, size: request.size, quantity: request.quantity, reason: `ทดแทนของชำรุด`, status: 'Approved' }).save();
        sendPushMessage(newReq, 'อนุมัติคำขอ'); 
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 📊 LOGS
// ==========================================
app.get('/api/logs', async (req, res) => {
    try { res.json(await Log.find().sort({ createdAt: -1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
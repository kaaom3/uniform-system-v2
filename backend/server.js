require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
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

// Utils
const { sendPushMessage } = require('./lineNotify'); 

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 📂 FILE UPLOAD CONFIG (Cloudinary)
// ==========================================
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
    console.error("⚠️ คำเตือน: ยังไม่ได้ตั้งค่าคีย์ Cloudinary ในไฟล์ .env หรือ บนเว็บ Render");
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uniform_system', 
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
    }
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
// 🤖 LINE WEBHOOK
// ==========================================
const LINE_TOKEN = "dCnA72Q1lQkAo6W2wY4q/3JLZiUJ0UqF3r/5H/kYLVylWAaab2u3FRxeNmJN536psAEbkV56INlKAoCMSfD9wF0CTxZ7x/WAgUKVv0warZ5lbiA1BTIdtwG26FuNFudDcHun6BslptbMbk6xpk5QdQdB04t89/1O/w1cDnyilFU=";

async function replyLineMessage(replyToken, text) {
    return new Promise((resolve, reject) => {
        if (replyToken === '00000000000000000000000000000000' || replyToken === 'ffffffffffffffffffffffffffffffff') return resolve();

        const payload = JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] });
        const options = {
            hostname: 'api.line.me', path: '/v2/bot/message/reply', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}`, 'Content-Length': Buffer.byteLength(payload) }
        };

        const req = https.request(options, (res) => {
            let body = ''; res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(body));
        });

        req.on('error', (e) => reject(e));
        req.write(payload); req.end();
    });
}

app.post('/api/webhook/line', async (req, res) => {
    try {
        const events = req.body.events;
        res.status(200).send('OK');

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
    } catch (err) { console.error("❌ [Webhook Error]:", err); }
});

// ==========================================
// 🔑 AUTHENTICATION & USERS
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
        const { userData, adminUser, originalUsername } = req.body;
        
        if (originalUsername) {
            if (originalUsername !== userData.username) {
                const duplicate = await User.findOne({ username: userData.username });
                if (duplicate) return res.status(400).json({ error: 'Username นี้มีผู้ใช้งานแล้ว' });
            }
            await User.findOneAndUpdate({ username: originalUsername }, userData);
            await logAdminAction(adminUser, 'User Management', `อัปเดตข้อมูลผู้ใช้: ${originalUsername} -> ${userData.username}`);
            return res.json({ success: true });
        }

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
// 📂 API: FILE UPLOAD & CSV EXPORT
// ==========================================
const csvUpload = multer({ dest: 'uploads/' });

app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์ที่อัปโหลด" });
        console.log("✅ รูปถูกอัปโหลดไปที่ Cloudinary สำเร็จ:", req.file.path);
        res.json({ imageUrl: req.file.path });
    } catch (err) {
        console.error("❌ อัปโหลดรูปล้มเหลว:", err);
        res.status(500).json({ error: "อัปโหลดรูปล้มเหลว" });
    }
});

// นำเข้า User
app.post('/api/users/import', csvUpload.single('csvfile'), async (req, res) => {
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

// 💡 นำเข้าประวัติเบิกย้อนหลัง (และตัดสต๊อกอัตโนมัติ)
app.post('/api/requests/import', csvUpload.single('csvfile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์ CSV" });
        const content = fs.readFileSync(req.file.path, 'utf8');
        const lines = content.split(/\r?\n/);
        let importedCount = 0;

        for(let i = 1; i < lines.length; i++) { // ข้าม Header บรรทัดที่ 1
            if (!lines[i].trim()) continue;
            
            // รูปแบบ CSV ที่คาดหวัง: Username,ItemType,Size,Quantity,Condition
            const [username, itemType, size, quantityStr, condition] = lines[i].split(',');

            if (username && itemType && size && quantityStr) {
                const user = await User.findOne({ username: username.trim() });
                if (user) {
                    const qty = parseInt(quantityStr.trim()) || 1;
                    const reqCondition = (condition && condition.trim().toUpperCase() === 'USED') ? 'Used' : 'New';

                    // 1. สร้างประวัติเบิก (สถานะ Approved ทันที)
                    const newReq = new Request({
                        requestId: generateRequestId(),
                        requesterName: user.name,
                        department: user.department || '-',
                        itemType: itemType.trim(),
                        size: size.trim(),
                        quantity: qty,
                        reason: 'นำเข้าข้อมูลย้อนหลัง (Import CSV)',
                        status: 'Approved',
                        notes: `นำเข้าอัตโนมัติ (${reqCondition === 'Used' ? 'มือสอง' : 'ของใหม่'})`
                    });
                    await newReq.save();

                    // 2. ปรับหักสต๊อกอัตโนมัติ (ถ้ามีของในระบบ)
                    const stock = await Stock.findOne({ itemType: itemType.trim(), size: size.trim() });
                    if (stock) {
                        if (reqCondition === 'Used') {
                            stock.usedStock = Math.max(0, stock.usedStock - qty);
                        } else {
                            stock.newStock = Math.max(0, stock.newStock - qty);
                        }
                        await stock.save();

                        // 3. สร้างประวัติ (Log) ของสต๊อก
                        await new StockTransaction({
                            itemType: itemType.trim(),
                            size: size.trim(),
                            transactionType: reqCondition === 'Used' ? 'OUT-USED' : 'OUT',
                            quantity: -Math.abs(qty),
                            reason: `ตัดสต๊อกอัตโนมัติ (นำเข้า CSV ย้อนหลังให้: ${user.name})`,
                            adminUser: req.body.adminUser || 'System'
                        }).save();
                    }

                    importedCount++;
                }
            }
        }
        fs.unlinkSync(req.file.path); 
        res.json({ success: true, count: importedCount });
    } catch (err) { 
        console.error("Import Requests Error:", err);
        res.status(500).json({ error: "รูปแบบไฟล์ CSV ไม่ถูกต้อง" }); 
    }
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
// 📦 STOCK MANAGEMENT (ระบบจัดการสต๊อกแบบใหม่)
// ==========================================

app.get('/api/stock', async (req, res) => {
    try {
        const stocks = await Stock.find().lean();
        
        const activeRequests = await Request.find({ status: { $in: ['Approved', 'Pending Return'] } }, 'itemType size quantity');
        
        const dispensedMap = activeRequests.reduce((acc, req) => {
            const key = `${req.itemType}_${req.size}`;
            acc[key] = (acc[key] || 0) + req.quantity;
            return acc;
        }, {});

        const enrichedStocks = stocks.map(stock => ({
            ...stock,
            dispensedStock: dispensedMap[`${stock.itemType}_${stock.size}`] || 0
        }));

        res.json(enrichedStocks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock', async (req, res) => {
    try {
        const { itemType, size, originalItemType, originalSize, adminUser, imageUrl, category, newStock, usedStock, damagedStock, lowStockThreshold } = req.body;
        
        if (originalItemType && originalSize) {
            const stock = await Stock.findOne({ itemType: originalItemType, size: originalSize });
            if (!stock) return res.status(404).json({ error: 'ไม่พบพัสดุรายการนี้' });

            if (imageUrl !== undefined) stock.imageUrl = imageUrl; 
            if (lowStockThreshold !== undefined) stock.lowStockThreshold = lowStockThreshold; 
            await stock.save();
            
            await logAdminAction(adminUser, 'Stock Management', `อัปเดตข้อมูลพัสดุ: ${originalItemType}(${originalSize})`);
            return res.json({ success: true });
        }

        const existing = await Stock.findOne({ itemType, size });
        if (existing) return res.status(400).json({ error: 'พัสดุชื่อและไซส์นี้ มีข้อมูลอยู่ในระบบแล้ว' });

        await new Stock({ itemType, size, category, newStock, usedStock, damagedStock, lowStockThreshold, imageUrl }).save();
        await logAdminAction(adminUser, 'Stock Management', `สร้างพัสดุใหม่: ${itemType} (${size})`);
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock/transaction', async (req, res) => {
    try {
        const { itemType, size, transactionType, quantity, reason, adminUser } = req.body;
        const stock = await Stock.findOne({ itemType, size });
        if (!stock) return res.status(404).json({ error: 'ไม่พบรายการพัสดุนี้ในระบบ' });

        if (transactionType === 'IN') {
            stock.newStock += quantity;
            await stock.save();

            await new StockTransaction({ itemType, size, transactionType, quantity, reason, adminUser }).save();
            await logAdminAction(adminUser, 'Stock Management', `รับเข้าพัสดุ: ${itemType}(${size}) +${quantity} ชิ้น`);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock/advanced-adjust', async (req, res) => {
    try {
        const { itemType, size, condition, mode, qty, reason, adminUser } = req.body;
        const stock = await Stock.findOne({ itemType, size });
        if (!stock) return res.status(404).json({ error: 'ไม่พบรายการพัสดุนี้ในระบบ' });

        const conditionFieldMap = { 'New': 'newStock', 'Used': 'usedStock', 'Damaged': 'damagedStock' };
        const conditionNameMap = { 'New': 'ของใหม่', 'Used': 'มือสอง', 'Damaged': 'ชำรุด' };
        
        const targetField = conditionFieldMap[condition];
        if (!targetField) return res.status(400).json({ error: 'ประเภทสภาพพัสดุไม่ถูกต้อง' });

        const currentQty = stock[targetField];
        let diffQty = 0;

        if (mode === 'SET') diffQty = qty - currentQty; 
        else if (mode === 'ADD') diffQty = qty;
        else if (mode === 'DEDUCT') diffQty = -Math.abs(qty);

        if (currentQty + diffQty < 0) return res.status(400).json({ error: `ไม่สามารถลดยอดได้ (ปัจจุบันมีเพียง ${currentQty})` });
        if (diffQty === 0) return res.json({ success: true });

        stock[targetField] += diffQty;
        await stock.save();

        const detailedReason = `ปรับปรุงยอด(${conditionNameMap[condition]}): ${diffQty > 0 ? '+' : ''}${diffQty} ชิ้น - ${reason}`;
        await new StockTransaction({ itemType, size, transactionType: 'ADJUST', quantity: diffQty, reason: detailedReason, adminUser }).save();
        await logAdminAction(adminUser, 'Stock Adjustment', `ปรับปรุงพัสดุ: ${itemType}(${size}) ${detailedReason}`);
        
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
// 🛡️ ADMIN ACTIONS (อนุมัติ / ปฏิเสธ / รับคืน)
// ==========================================
app.get('/api/admin/pending-approvals', async (req, res) => {
    try { res.json(await Request.find({ status: { $in: ['Pending', 'Pending Return'] } }).sort({ createdAt: 1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/approve', async (req, res) => {
    try {
        const { requestId, approvedQuantity, reason, stockType, adminUser } = req.body;
        const request = await Request.findOne({ requestId });
        const stock = await Stock.findOne({ itemType: request.itemType, size: request.size });
        if (!stock) return res.status(404).json({ error: 'ไม่พบพัสดุในระบบ' });
        
        const targetField = stockType === 'Used' ? 'usedStock' : 'newStock';
        if (stock[targetField] < approvedQuantity) {
            return res.status(400).json({ error: `สต๊อก${stockType === 'Used' ? 'มือสอง' : 'ของใหม่'} ไม่เพียงพอ` });
        }

        stock[targetField] -= approvedQuantity;
        await stock.save();

        const transactionType = stockType === 'Used' ? 'OUT-USED' : 'OUT';
        const logReason = `เบิกจ่ายให้ ${request.requesterName} ${stockType === 'Used' ? '(มือสอง)' : ''}`;
        await new StockTransaction({ itemType: request.itemType, size: request.size, transactionType, quantity: -Math.abs(approvedQuantity), reason: logReason, adminUser }).save();

        request.status = 'Approved'; 
        request.quantity = approvedQuantity; 
        request.notes = `อนุมัติโดย ${adminUser} ${stockType === 'Used' ? '[จ่ายมือสอง]' : ''} ${reason ? '(' + reason + ')' : ''}`; 
        await request.save();
        
        await logAdminAction(adminUser, 'Approval', `อนุมัติใบเบิก ${requestId}`);
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
        
        const targetField = returnCondition === 'Used' ? 'usedStock' : 'damagedStock';
        const transactionType = returnCondition === 'Used' ? 'RETURN-USED' : 'RETURN-DAMAGED';

        stock[targetField] += request.quantity;
        await stock.save();

        await new StockTransaction({ itemType: request.itemType, size: request.size, transactionType, quantity: request.quantity, reason: `รับคืนจาก ${request.requesterName}`, adminUser }).save();
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
        
        if (disbursementType === 'New' && stock.newStock < request.quantity) return res.status(400).json({ error: 'สต๊อกของใหม่ไม่พอสำหรับเปลี่ยน' });

        const targetField = returnCondition === 'Used' ? 'usedStock' : 'damagedStock';
        const tTypeIn = returnCondition === 'Used' ? 'RETURN-USED' : 'RETURN-DAMAGED';
        stock[targetField] += request.quantity;
        await new StockTransaction({ itemType: request.itemType, size: request.size, transactionType: tTypeIn, quantity: request.quantity, reason: `รับคืนจาก ${request.requesterName}`, adminUser }).save();

        stock.newStock -= request.quantity;
        await stock.save();
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
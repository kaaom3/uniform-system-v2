const express = require('express');
const router = express.Router();
const User = require('../models/User');
const WaterparkRelative = require('../models/WaterparkRelative');
const WaterparkBooking = require('../models/WaterparkBooking');

const cloudinary = require('cloudinary').v2;
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const https = require('https');
const path = require('path'); 
const fs = require('fs');     

const tierMaxFree = {
    'Tier1_Staff': 4,
    'Tier2_Manager': 5,
    'Tier3_Director': 999999 
};

const deleteCloudinaryImage = async (imageUrl) => {
    if (!imageUrl || !imageUrl.includes('cloudinary.com')) return;
    try {
        const regex = /\/upload\/(?:v\d+\/)?([^.]+)/;
        const match = imageUrl.match(regex);
        if (match && match[1]) {
            const publicId = match[1];
            await cloudinary.uploader.destroy(publicId);
            console.log(`[Cloudinary] Deleted image: ${publicId}`);
        }
    } catch (err) {
        console.error('[Cloudinary] Delete Error:', err.message);
    }
};

const fetchImageBuffer = (url) => {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) return resolve(null);
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', () => resolve(null));
    });
};

// 1. ดึงข้อมูล Dashboard สวนน้ำของพนักงาน
router.get('/dashboard/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

        const tier = user.positionLevel || 'Tier1_Staff';
        const maxFree = tierMaxFree[tier];
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const bookingsThisMonth = await WaterparkBooking.find({ 
            username: user.username, 
            visitDate: { $gte: startOfMonth, $lte: endOfMonth },
            status: { $in: ['Pending_Head', 'Pending_HR', 'Approved'] } 
        });

        let freeUsed = 0;
        bookingsThisMonth.forEach(b => freeUsed += b.totalFreeGuestsUsed);

        let relatives = [];
        if (tier === 'Tier1_Staff') {
            relatives = await WaterparkRelative.find({ username: user.username, isActive: true });
        }

        const allBookings = await WaterparkBooking.find({ username: user.username }).sort({ createdAt: -1 });

        res.json({
            tier, maxFree, freeUsed,
            freeRemaining: Math.max(0, maxFree - freeUsed),
            relatives,
            regUnlocked: user.waterparkRegUnlocked,
            allBookings
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. ลงทะเบียนญาติใหม่
router.post('/relatives', async (req, res) => {
    try {
        const { username, fullName, idCardNumber, idCardExpiry, idCardImageUrl } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

        const count = await WaterparkRelative.countDocuments({ username, isActive: true });
        if (count >= 8 && !user.waterparkRegUnlocked) return res.status(400).json({ error: 'ลงทะเบียนญาติครบ 8 คนแล้ว (ติดล็อค)' });

        const relative = new WaterparkRelative({ username, fullName, idCardNumber, idCardExpiry, idCardImageUrl });
        await relative.save();
        res.json({ success: true, relative });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. ระงับและลบรูปญาติ
router.delete('/relatives/:id', async (req, res) => {
    try {
        const relative = await WaterparkRelative.findById(req.params.id);
        if (!relative) return res.status(404).json({ error: 'ไม่พบข้อมูลญาติ' });
        
        if (relative.idCardImageUrl && relative.idCardImageUrl !== 'DELETED') {
            await deleteCloudinaryImage(relative.idCardImageUrl);
        }

        await WaterparkRelative.updateOne(
            { _id: req.params.id },
            { $set: { isActive: false, idCardImageUrl: 'DELETED' } }
        );
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. จองสิทธิ์เข้าสวนน้ำ (สร้างใหม่)
router.post('/book', async (req, res) => {
    try {
        const { username, visitDate, isEmployeeEntering, guests, urgentReason } = req.body;
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const visit = new Date(visitDate);
        visit.setHours(0,0,0,0);
        
        if (visit < today) return res.status(400).json({ error: 'ไม่สามารถทำรายการจองย้อนหลังได้' });

        const diffDays = Math.floor((visit - today) / (1000 * 60 * 60 * 24));
        let isUrgent = false;
        if (diffDays < 3) {
            isUrgent = true;
            if (!urgentReason || urgentReason.trim() === '') {
                return res.status(400).json({ error: 'กรุณาระบุเหตุผลสำหรับการจองด่วน (ล่วงหน้าน้อยกว่า 3 วัน)' });
            }
        }

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

        const tier = user.positionLevel || 'Tier1_Staff';
        const maxFree = tierMaxFree[tier];

        const startOfMonth = new Date(visit.getFullYear(), visit.getMonth(), 1);
        const endOfMonth = new Date(visit.getFullYear(), visit.getMonth() + 1, 0, 23, 59, 59);

        const bookingsThisMonth = await WaterparkBooking.find({ 
            username, 
            visitDate: { $gte: startOfMonth, $lte: endOfMonth },
            status: { $in: ['Pending_Head', 'Pending_HR', 'Approved'] } 
        });

        let freeUsedThisMonth = 0;
        bookingsThisMonth.forEach(b => freeUsedThisMonth += b.totalFreeGuestsUsed);
        
        let freeSpotsLeft = Math.max(0, maxFree - freeUsedThisMonth);
        
        let processedGuests = [];
        let totalFreeGuestsUsed = 0;
        let totalDiscountGuestsUsed = 0;

        for (const guest of guests) {
            let ticketType = '50_DISCOUNT';
            if (!guest.forceDiscount && freeSpotsLeft > 0) {
                ticketType = 'FREE';
                freeSpotsLeft--;
                totalFreeGuestsUsed++;
            } else {
                totalDiscountGuestsUsed++;
            }

            processedGuests.push({
                fullName: guest.fullName,
                idCardNumber: guest.idCardNumber || '', 
                idCardExpiry: guest.idCardExpiry || null, 
                idCardImageUrl: guest.idCardImageUrl,
                ticketType
            });
        }

        const headUsers = await User.find({ department: user.department, isHeadApprover: true });
        let initialStatus = 'Pending_HR';
        let headApproversList = [];
        
        headUsers.forEach(hu => {
            headApproversList.push(hu.username);
        });

        let headUsername = '';
        if (headApproversList.length > 0) {
            initialStatus = 'Pending_Head';
            headUsername = headApproversList.join(','); 
        }

        const bookingId = 'WP-' + Math.random().toString(36).substr(2, 8).toUpperCase();
        const booking = new WaterparkBooking({
            bookingId, username, visitDate, isEmployeeEntering, guests: processedGuests,
            totalFreeGuestsUsed, totalDiscountGuestsUsed,
            isUrgent, urgentReason, 
            status: initialStatus,
            headApprover: headUsername
        });

        await booking.save();
        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. แก้ไขคำขอเข้าสวนน้ำ (อัปเดตคำขอเดิมที่โดนตีกลับ)
router.put('/book/:id', async (req, res) => {
    try {
        const { username, visitDate, isEmployeeEntering, guests, urgentReason } = req.body;
        
        const booking = await WaterparkBooking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });
        if (booking.status !== 'Returned') return res.status(400).json({ error: 'คำขอนี้ไม่ได้อยู่ในสถานะที่แก้ไขได้' });

        const today = new Date();
        today.setHours(0,0,0,0);
        const visit = new Date(visitDate);
        visit.setHours(0,0,0,0);
        
        if (visit < today) return res.status(400).json({ error: 'ไม่สามารถทำรายการจองย้อนหลังได้' });

        const diffDays = Math.floor((visit - today) / (1000 * 60 * 60 * 24));
        let isUrgent = false;
        if (diffDays < 3) {
            isUrgent = true;
            if (!urgentReason || urgentReason.trim() === '') {
                return res.status(400).json({ error: 'กรุณาระบุเหตุผลสำหรับการจองด่วน (ล่วงหน้าน้อยกว่า 3 วัน)' });
            }
        }

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

        const tier = user.positionLevel || 'Tier1_Staff';
        const maxFree = tierMaxFree[tier];

        const startOfMonth = new Date(visit.getFullYear(), visit.getMonth(), 1);
        const endOfMonth = new Date(visit.getFullYear(), visit.getMonth() + 1, 0, 23, 59, 59);

        const bookingsThisMonth = await WaterparkBooking.find({ 
            username, 
            _id: { $ne: booking._id }, 
            visitDate: { $gte: startOfMonth, $lte: endOfMonth },
            status: { $in: ['Pending_Head', 'Pending_HR', 'Approved'] } 
        });

        let freeUsedThisMonth = 0;
        bookingsThisMonth.forEach(b => freeUsedThisMonth += b.totalFreeGuestsUsed);
        
        let freeSpotsLeft = Math.max(0, maxFree - freeUsedThisMonth);
        
        let processedGuests = [];
        let totalFreeGuestsUsed = 0;
        let totalDiscountGuestsUsed = 0;

        for (const guest of guests) {
            let ticketType = '50_DISCOUNT';
            if (!guest.forceDiscount && freeSpotsLeft > 0) {
                ticketType = 'FREE';
                freeSpotsLeft--;
                totalFreeGuestsUsed++;
            } else {
                totalDiscountGuestsUsed++;
            }

            processedGuests.push({
                fullName: guest.fullName,
                idCardNumber: guest.idCardNumber || '', 
                idCardExpiry: guest.idCardExpiry || null, 
                idCardImageUrl: guest.idCardImageUrl,
                ticketType
            });
        }

        const headUsers = await User.find({ department: user.department, isHeadApprover: true });
        let initialStatus = 'Pending_HR';
        let headApproversList = [];
        headUsers.forEach(hu => headApproversList.push(hu.username));
        let headUsername = '';
        if (headApproversList.length > 0) {
            initialStatus = 'Pending_Head';
            headUsername = headApproversList.join(','); 
        }

        booking.visitDate = visitDate;
        booking.isEmployeeEntering = isEmployeeEntering;
        booking.guests = processedGuests;
        booking.totalFreeGuestsUsed = totalFreeGuestsUsed;
        booking.totalDiscountGuestsUsed = totalDiscountGuestsUsed;
        booking.isUrgent = isUrgent;
        booking.urgentReason = isUrgent ? urgentReason : '';
        booking.status = initialStatus;
        booking.headApprover = headUsername;
        booking.rejectReason = ''; 

        await booking.save();
        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. ยกเลิกคำขอเข้าสวนน้ำ
router.put('/cancel/:id', async (req, res) => {
    try {
        const booking = await WaterparkBooking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });
        
        if (booking.status !== 'Pending_Head' && booking.status !== 'Pending_HR' && booking.status !== 'Returned') {
            return res.status(400).json({ error: 'ไม่สามารถยกเลิกได้ เนื่องจากรายการถูกดำเนินการไปแล้ว' });
        }

        booking.status = 'Cancelled';
        await booking.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. ดึงรายการรออนุมัติ
router.get('/approvals/pending', async (req, res) => {
    try {
        const { username, role } = req.query;
        let query = {};
        
        if (role === 'admin') {
            query.status = { $in: ['Pending_Head', 'Pending_HR'] };
        } else { 
            query.status = 'Pending_Head'; 
            query.headApprover = { $regex: new RegExp(`\\b${username}\\b`) };
        }

        const bookings = await WaterparkBooking.find(query).sort({ createdAt: 1 }).lean();
        
        const today = new Date();
        today.setHours(0,0,0,0);

        for (let b of bookings) {
            for (let g of b.guests) {
                let expiryDateToCheck = g.idCardExpiry;
                
                if (!expiryDateToCheck) {
                    const rel = await WaterparkRelative.findOne({ username: b.username, fullName: g.fullName, isActive: true });
                    if (rel) expiryDateToCheck = rel.idCardExpiry;
                }

                if (expiryDateToCheck) {
                    const expDate = new Date(expiryDateToCheck);
                    expDate.setHours(0,0,0,0);
                    if (expDate < today) {
                        g.isExpired = true; 
                    } else {
                        g.isExpired = false;
                    }
                } else {
                    g.isExpired = false;
                }
            }
        }

        res.json(bookings);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8. อนุมัติ/ปฏิเสธ คำขอสวนน้ำ
router.post('/approvals/action', async (req, res) => {
    try {
        const { bookingId, action, reason, adminUser, role } = req.body;
        const booking = await WaterparkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });

        if (action === 'REJECT') {
            booking.status = 'Rejected';
            booking.rejectReason = `ปฏิเสธโดย ${adminUser}: ${reason}`;
        } else if (action === 'APPROVE') {
            
            const today = new Date();
            today.setHours(0,0,0,0);
            let hasExpired = false;
            
            for (let g of booking.guests) {
                let exp = g.idCardExpiry;
                if (!exp) {
                    const rel = await WaterparkRelative.findOne({ username: booking.username, fullName: g.fullName, isActive: true });
                    if (rel) exp = rel.idCardExpiry;
                }
                if (exp) {
                    const eDate = new Date(exp);
                    eDate.setHours(0,0,0,0);
                    if (eDate < today) {
                        hasExpired = true;
                        break;
                    }
                }
            }

            if (hasExpired) {
                return res.status(400).json({ error: 'ไม่อนุมัติ: มีผู้ติดตามที่บัตรประชาชนหมดอายุ กรุณาคลิก "ให้แก้ไขใหม่" แทน' });
            }

            if (role === 'admin') { booking.status = 'Approved'; booking.hrApprover = adminUser; } 
            else { booking.status = 'Pending_HR'; }
        }

        await booking.save();
        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 9. แอดมินตีกลับคำขอให้พนักงานแก้ไขใหม่
router.post('/approvals/return', async (req, res) => {
    try {
        const { bookingId, reason, adminUser } = req.body;
        const booking = await WaterparkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });

        booking.status = 'Returned';
        booking.rejectReason = `ให้แก้ไขใหม่โดย ${adminUser}: ${reason || 'ข้อมูลไม่ถูกต้อง'}`;
        await booking.save();
        
        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 10. ดึงข้อมูลรายงานตามวันที่
router.get('/reports/by-date', async (req, res) => {
    try {
        const dateParam = req.query.date;
        if (!dateParam) return res.status(400).json({ error: 'กรุณาระบุวันที่' });

        const targetDate = new Date(dateParam);
        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
        const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

        const bookings = await WaterparkBooking.find({
            visitDate: { $gte: startOfDay, $lte: endOfDay },
            status: 'Approved'
        });

        let reportData = [];

        for (let b of bookings) {
            const user = await User.findOne({ username: b.username });
            if (!user) continue;

            const dept = user.department || 'ไม่ระบุแผนก';
            let guestList = [];

            for (let g of b.guests) {
                let idCard = g.idCardNumber || '';
                if (!idCard) {
                    const rel = await WaterparkRelative.findOne({ username: b.username, fullName: g.fullName, isActive: true });
                    if (rel && rel.idCardNumber) idCard = rel.idCardNumber;
                }

                guestList.push({
                    name: g.fullName,
                    idCard: idCard,
                    type: g.ticketType === 'FREE' ? 'ฟรี' : 'ลด 50%'
                });
            }

            reportData.push({
                _id: b._id,
                bookingId: b.bookingId,
                department: dept,
                employeeName: user.name,
                isEmployeeEntering: b.isEmployeeEntering,
                guests: guestList
            });
        }

        res.json({ date: startOfDay, data: reportData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. Admin: ยกเลิกรายการจองทั้งหมด
router.put('/admin/cancel/:id', async (req, res) => {
    try {
        const booking = await WaterparkBooking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const visit = new Date(booking.visitDate);
        visit.setHours(0,0,0,0);
        
        if (visit <= today) {
            return res.status(400).json({ error: 'ไม่สามารถยกเลิกได้ เนื่องจากถึงวันที่ขอเข้าใช้บริการแล้ว' });
        }

        booking.status = 'Cancelled';
        booking.rejectReason = `ยกเลิกโดยแอดมิน: ${req.body.adminUser}`;
        await booking.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 12. Admin: ลบผู้ติดตามออกทีละคน
router.put('/admin/remove-guest/:id', async (req, res) => {
    try {
        const { guestIndex, adminUser } = req.body;
        const booking = await WaterparkBooking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const visit = new Date(booking.visitDate);
        visit.setHours(0,0,0,0);
        
        if (visit <= today) {
            return res.status(400).json({ error: 'ไม่สามารถแก้ข้อมูลได้ เนื่องจากถึงวันที่ขอเข้าใช้บริการแล้ว' });
        }

        if (guestIndex < 0 || guestIndex >= booking.guests.length) {
            return res.status(400).json({ error: 'ไม่พบข้อมูลผู้ติดตามที่ต้องการลบ' });
        }

        const removedGuest = booking.guests[guestIndex];
        
        if (removedGuest.idCardImageUrl && removedGuest.idCardImageUrl !== 'DELETED') {
            const isRelative = await WaterparkRelative.exists({ idCardImageUrl: removedGuest.idCardImageUrl });
            if (!isRelative) {
                await deleteCloudinaryImage(removedGuest.idCardImageUrl);
            }
        }
        
        if (removedGuest.ticketType === 'FREE') {
            booking.totalFreeGuestsUsed = Math.max(0, booking.totalFreeGuestsUsed - 1);
        } else if (removedGuest.ticketType === '50_DISCOUNT') {
            booking.totalDiscountGuestsUsed = Math.max(0, booking.totalDiscountGuestsUsed - 1);
        }

        booking.guests.splice(guestIndex, 1);

        if (booking.guests.length === 0 && !booking.isEmployeeEntering) {
            booking.status = 'Cancelled';
            booking.rejectReason = `ยกเลิกอัตโนมัติ (ลบผู้ใช้สิทธิ์หมดแล้ว) โดยแอดมิน: ${adminUser}`;
        }

        await booking.save();
        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. Admin: ดึงข้อมูลประวัติการลงทะเบียนญาติ
router.get('/admin/relatives/:username', async (req, res) => {
    try {
        const relatives = await WaterparkRelative.find({ username: req.params.username }).sort({ createdAt: -1 });
        res.json(relatives);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 🧹 CRON JOB 1: เคลียร์รูปและส่งรายงานการลบรูปลง PDF (ทุกวันอาทิตย์ 17:00 น.)
// ==========================================
cron.schedule('0 17 * * 0', async () => {
    try {
        console.log('[Cron Job] Weekly PDF Report & Cleanup starting (Sunday 17:00)...');
        
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.REPORT_EMAIL_TO) {
            console.error('[Cron Job] ไม่ได้ตั้งค่า EMAIL ในระบบ (.env) ข้ามการส่งอีเมล');
            return;
        }

        const bookings = await WaterparkBooking.find({
            'guests.idCardImageUrl': { $regex: 'cloudinary.com' }
        });

        if (bookings.length === 0) {
            console.log('[Cron Job] สัปดาห์นี้ไม่มีรูปให้เคลียร์หรือรายงาน');
            return;
        }

        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));

        const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
        if (fs.existsSync(fontPath)) {
            doc.registerFont('THSarabunNew', fontPath);
            doc.font('THSarabunNew');
        } else {
            console.warn('[Cron Job] ⚠️ ไม่พบไฟล์ฟอนต์ THSarabunNew.ttf ในโฟลเดอร์ fonts/ จะใช้ฟอนต์เริ่มต้นแทน');
        }

        doc.fontSize(22).text('รายงานตรวจสอบรายชื่อบุคคลภายนอกเข้าสวนน้ำ', { align: 'center' });
        doc.fontSize(14).text(`สร้างรายงานเมื่อ: ${new Date().toLocaleString('th-TH')}`, { align: 'center' });
        doc.moveDown(2);

        let hasValidImages = false;
        const externalGuestImages = new Set(); 

        for (let b of bookings) {
            for (let g of b.guests) {
                if (g.idCardImageUrl && g.idCardImageUrl.includes('cloudinary.com')) {
                    
                    const isRelative = await WaterparkRelative.exists({ idCardImageUrl: g.idCardImageUrl });
                    
                    if (!isRelative) {
                        hasValidImages = true;
                        externalGuestImages.add(g.idCardImageUrl); 

                        doc.fontSize(16).text(`รหัสการจอง (Booking ID): ${b.bookingId}`);
                        doc.fontSize(14).text(`พนักงานที่ขอสิทธิ์: ${b.username}`);
                        doc.text(`ชื่อผู้ติดตาม: ${g.fullName}`);
                        doc.text(`เลขบัตรประชาชน: ${g.idCardNumber || 'ไม่ระบุ'}`);
                        doc.moveDown(0.5);

                        const imgBuffer = await fetchImageBuffer(g.idCardImageUrl);
                        if (imgBuffer) {
                            try {
                                doc.image(imgBuffer, { fit: [300, 200], align: 'left' });
                            } catch(e) {
                                doc.text('[ ไม่สามารถโหลดภาพลง PDF ได้ ]');
                            }
                        } else {
                            doc.text('[ ไม่พบไฟล์รูปภาพจาก URL ]');
                        }
                        doc.moveDown(2);
                    }
                }
            }
        }

        doc.end();

        const pdfBuffer = await new Promise((resolve) => {
            doc.on('end', () => {
                resolve(Buffer.concat(buffers));
            });
        });

        if (hasValidImages) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            await transporter.sendMail({
                from: `"Uniform & Waterpark System" <${process.env.EMAIL_USER}>`,
                to: process.env.REPORT_EMAIL_TO,
                subject: 'รายงานตรวจสอบและลบรูปบุคคลภายนอกสวนน้ำ (อัตโนมัติ)',
                text: 'นี่คืออีเมลอัตโนมัติจากระบบ\n\nแนบไฟล์รายงาน PDF ประจำสัปดาห์ สำหรับตรวจสอบรูปบัตรประชาชนบุคคลภายนอกที่เข้าใช้งานสวนน้ำ\nระบบได้ทำการส่งรูปและทำการ "ลบรูปออกจากฐานข้อมูล (Cloudinary)" เรียบร้อยแล้วเพื่อความปลอดภัยของข้อมูล (PDPA)',
                attachments: [
                    {
                        filename: `Waterpark_Report_${new Date().toISOString().split('T')[0]}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            });
            console.log('[Cron Job] Weekly report email sent successfully.');
        }

        let deletedCount = 0;
        for (let b of bookings) {
            let isModified = false;
            for (let g of b.guests) {
                if (g.idCardImageUrl && externalGuestImages.has(g.idCardImageUrl)) {
                    await deleteCloudinaryImage(g.idCardImageUrl);
                    g.idCardImageUrl = 'DELETED'; 
                    isModified = true;
                    deletedCount++;
                }
            }
            if (isModified) {
                await b.save();
            }
        }

        console.log(`[Cron Job] Cleanup complete. Deleted ${deletedCount} images from Cloudinary.`);

    } catch (error) {
        console.error('[Cron Job] Error during weekly cleanup:', error);
    }
});

// ==========================================
// ⏰ CRON JOB 2: ส่งใบลงนามให้ Admissions
// ⚠️ ตอนนี้ตั้งค่าเป็น '0 6 * * *' (รันทุกเช้าเวลา 06:00 น.) เพื่อทดสอบ
// ==========================================
cron.schedule('0 6 * * *', async () => {
    try {
        console.log('[Cron Job] Daily Admissions Report starting...');
        
        const targetEmail = process.env.ADMISSIONS_EMAIL_TO || process.env.REPORT_EMAIL_TO;

        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !targetEmail) {
            console.error('[Cron Job] ไม่ได้ตั้งค่า EMAIL ข้ามการส่งอีเมลรายวัน');
            return;
        }

        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        const bookings = await WaterparkBooking.find({
            visitDate: { $gte: startOfDay, $lte: endOfDay },
            status: 'Approved'
        });

        if (bookings.length === 0) {
            console.log('[Cron Job] วันนี้ไม่มีรายการจองเข้าสวนน้ำที่ได้รับการอนุมัติ');
            return;
        }

        const grouped = {};
        for (let b of bookings) {
            const user = await User.findOne({ username: b.username });
            const dept = user ? (user.department || 'ไม่ระบุแผนก') : 'ไม่ระบุแผนก';
            const empName = user ? user.name : b.username;
            
            if (!grouped[dept]) grouped[dept] = [];
            grouped[dept].push({ ...b.toObject(), employeeName: empName });
        }

        // 💡 สร้าง PDF เป็นกระดาษ A4 แนวนอน (Landscape) เพื่อให้เหมือนหน้าเว็บ
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));

        const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
        if (fs.existsSync(fontPath)) {
            doc.registerFont('THSarabunNew', fontPath);
            doc.font('THSarabunNew');
        }

        const dateStr = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

        let y = 30;

        // 💡 ฟังก์ชันสร้างเส้นประ
        function drawDottedLine(startX, startY, endX) {
            doc.moveTo(startX, startY).lineTo(endX, startY).dash(2, { space: 2 }).stroke('#cccccc').undash();
        }

        // 💡 ฟังก์ชันวาดหัวตาราง
        function drawTableHeader() {
            doc.rect(30, y, 780, 25).fillAndStroke('#f1f5f9', '#999999');
            doc.fillColor('#000000').fontSize(14).font('THSarabunNew');
            
            doc.text('ลำดับ', 30, y + 6, { width: 40, align: 'center' });
            doc.text('ชื่อพนักงาน', 70, y + 6, { width: 115, align: 'center' });
            doc.text('ชื่อผู้ใช้สิทธิ์', 185, y + 6, { width: 155, align: 'center' });
            doc.text('ประเภทสิทธิ์', 340, y + 6, { width: 80, align: 'center' });
            doc.text('เลขบัตรประชาชน', 420, y + 6, { width: 115, align: 'center' });
            doc.text('ลายเซ็นผู้ใช้สิทธิ์', 535, y + 6, { width: 115, align: 'center' });
            doc.text('รับทราบโดย (Admissions)', 650, y + 6, { width: 160, align: 'center' });

            doc.moveTo(70, y).lineTo(70, y + 25).stroke('#999999');
            doc.moveTo(185, y).lineTo(185, y + 25).stroke('#999999');
            doc.moveTo(340, y).lineTo(340, y + 25).stroke('#999999');
            doc.moveTo(420, y).lineTo(420, y + 25).stroke('#999999');
            doc.moveTo(535, y).lineTo(535, y + 25).stroke('#999999');
            doc.moveTo(650, y).lineTo(650, y + 25).stroke('#999999');
            
            y += 25;
        }

        // 💡 ฟังก์ชันขึ้นหน้าใหม่ถ้ายาวเกินไป
        function checkPageAdd(heightNeeded) {
            if (y + heightNeeded > 550) {
                doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
                y = 30;
                drawTableHeader();
            }
        }

        doc.fontSize(20).text('เอกสารลงนามผู้รับสิทธิ์สวัสดิการเข้าสวนน้ำ (สำหรับแผนก Admissions)', 30, y, { align: 'center' });
        y += 25;
        doc.fontSize(16).fillColor('#555555').text(`ประจำวันที่เข้าใช้บริการ: ${dateStr}`, 30, y, { align: 'center' });
        y += 35;

        drawTableHeader();

        let globalIndex = 1;
        const sortedDepts = Object.keys(grouped).sort();

        // 💡 ลูปวาดตารางเหมือนหน้าเว็บเป๊ะๆ
        for (const dept of sortedDepts) {
            checkPageAdd(25);
            doc.rect(30, y, 780, 25).fillAndStroke('#e2e8f0', '#999999');
            doc.fillColor('#000000').fontSize(14).font('THSarabunNew');
            doc.text(`แผนก: ${dept}`, 40, y + 6, { width: 760, align: 'left' });
            y += 25;

            for (const booking of grouped[dept]) {
                const totalRows = (booking.isEmployeeEntering ? 1 : 0) + booking.guests.length;
                if (totalRows === 0) continue;
                
                checkPageAdd(totalRows * 25);
                const empStartY = y;

                if (booking.isEmployeeEntering) {
                    const currentY = y;
                    // 💡 เปลี่ยนมาวาดเฉพาะคอลัมน์ขวา (เริ่มตั้งแต่พิกัด 185)
                    doc.rect(185, currentY, 625, 25).stroke('#999999');
                    
                    doc.fillColor('#000000').text(`${booking.employeeName} (พนักงาน)`, 195, currentY + 6, { width: 135 });
                    doc.fillColor('#2563eb').text(`เข้าฟรี`, 340, currentY + 6, { width: 80, align: 'center' });
                    doc.fillColor('#000000').text(`-`, 420, currentY + 6, { width: 115, align: 'center' });
                    
                    drawDottedLine(545, currentY + 18, 640);
                    drawDottedLine(660, currentY + 18, 800);

                    // วาดเส้นคั่นคอลัมน์ด้านใน
                    doc.moveTo(340, currentY).lineTo(340, currentY + 25).stroke('#999999');
                    doc.moveTo(420, currentY).lineTo(420, currentY + 25).stroke('#999999');
                    doc.moveTo(535, currentY).lineTo(535, currentY + 25).stroke('#999999');
                    doc.moveTo(650, currentY).lineTo(650, currentY + 25).stroke('#999999');

                    y += 25;
                }

                for (const guest of booking.guests) {
                    const currentY = y;
                    // 💡 เปลี่ยนมาวาดเฉพาะคอลัมน์ขวา (เริ่มตั้งแต่พิกัด 185)
                    doc.rect(185, currentY, 625, 25).stroke('#999999');
                    
                    let idCard = guest.idCardNumber || '';
                    if (!idCard) {
                        const rel = await WaterparkRelative.findOne({ username: booking.username, fullName: guest.fullName, isActive: true });
                        if (rel && rel.idCardNumber) idCard = rel.idCardNumber;
                    }
                    
                    const tType = guest.ticketType === 'FREE' ? 'ฟรี' : 'ลด 50%';
                    const typeColor = guest.ticketType === 'FREE' ? '#059669' : '#d97706';

                    doc.fillColor('#000000').text(guest.fullName, 195, currentY + 6, { width: 135 });
                    doc.fillColor(typeColor).text(tType, 340, currentY + 6, { width: 80, align: 'center' });
                    doc.fillColor('#000000').text(idCard || '-', 420, currentY + 6, { width: 115, align: 'center' });
                    
                    drawDottedLine(545, currentY + 18, 640);
                    drawDottedLine(660, currentY + 18, 800);

                    doc.moveTo(340, currentY).lineTo(340, currentY + 25).stroke('#999999');
                    doc.moveTo(420, currentY).lineTo(420, currentY + 25).stroke('#999999');
                    doc.moveTo(535, currentY).lineTo(535, currentY + 25).stroke('#999999');
                    doc.moveTo(650, currentY).lineTo(650, currentY + 25).stroke('#999999');

                    y += 25;
                }
                
                const empEndY = y;
                const empHeight = empEndY - empStartY;
                
                // 💡 วาดกรอบเปล่าๆ กล่องใหญ่ รวบยอดให้ "ลำดับ" และ "ชื่อพนักงาน" (เส้นแนวนอนจะไม่ไปตัดทับชื่อแล้ว)
                doc.rect(30, empStartY, 40, empHeight).stroke('#999999'); // ลำดับ
                doc.rect(70, empStartY, 115, empHeight).stroke('#999999'); // ชื่อพนักงาน

                // ผสานเซลล์ชื่อพนักงาน (Rowspan) ไว้ตรงกึ่งกลางแนวตั้ง
                const textY = empStartY + (empHeight / 2) - 8;
                doc.fillColor('#000000').text(`${globalIndex++}`, 30, textY, { width: 40, align: 'center' });
                doc.text(`${booking.employeeName}`, 75, textY, { width: 105, align: 'left' });
            }
        }

        // ใส่ Footer 
        doc.fontSize(12).fillColor('#666666').text(`พิมพ์โดย: ระบบอัตโนมัติ | เวลา: ${new Date().toLocaleString('th-TH')}`, 30, 560, { width: 780, align: 'right' });

        doc.end();

        const pdfBuffer = await new Promise((resolve) => {
            doc.on('end', () => resolve(Buffer.concat(buffers)));
        });

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: `"Uniform & Waterpark System" <${process.env.EMAIL_USER}>`,
            to: targetEmail,
            subject: `[อัตโนมัติ] ใบลงนามรับสิทธิ์เข้าสวนน้ำประจำวัน (${dateStr})`,
            text: `เรียน แผนก Admissions,\n\nระบบขอส่งไฟล์ "ใบลงนามผู้รับสิทธิ์สวัสดิการเข้าสวนน้ำ" ประจำวันนี้ (${dateStr})\nรูปแบบไฟล์ถูกจัดเตรียมในรูปแบบตาราง (แนวนอน) พร้อมให้สั่งพิมพ์ (Print) ทันทีครับ\n\n(อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ)`,
            attachments: [{
                filename: `Admissions_Signature_Form_${today.toISOString().split('T')[0]}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }]
        });
        
        console.log('[Cron Job] Daily Admissions Report email sent successfully.');

    } catch (error) {
        console.error('[Cron Job] Error during daily admissions report:', error);
    }
}, {
    scheduled: true,
    timezone: "Asia/Bangkok" 
});

module.exports = router;
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
const jwt = require('jsonwebtoken'); 

const tierMaxFree = {
    'Tier1_Staff': 4,
    'Tier2_Manager': 5,
    'Tier3_Director': 999999 
};

// 💡 ฟังก์ชันสร้างตัวส่งอีเมลแบบเจาะจงสำหรับ Cloud (แก้ปัญหา ENETUNREACH 100%)
const createTransporter = () => {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // บังคับใช้ SSL ทำให้ไม่ถูกบล็อกจาก Cloud Firewall
        auth: { 
            user: process.env.EMAIL_USER, 
            pass: process.env.EMAIL_PASS 
        },
        tls: {
            rejectUnauthorized: false // ป้องกันปัญหา Certificate ฝั่งเซิร์ฟเวอร์
        },
        family: 4 // 💡 คำสั่งสำคัญ: บังคับใช้ IPv4 เท่านั้น ป้องกันปัญหา IPv6 บน Render
    });
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

router.get('/email-action', async (req, res) => {
    const { token } = req.query;
    
    const renderHtml = (title, message, colorCode) => `
        <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
        <style>body{font-family:'Sarabun',sans-serif;background:#f3f4f6;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
        .card{background:#fff;padding:40px;border-radius:16px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);text-align:center;max-width:400px;border-top: 8px solid ${colorCode};}
        h2{color:${colorCode};margin-top:0;} p{color:#4b5563;font-size:16px;}</style></head>
        <body><div class="card"><h2>${title}</h2><p>${message}</p></div></body></html>
    `;

    if (!token) return res.send(renderHtml('❌ เกิดข้อผิดพลาด', 'ไม่พบ Token ยืนยันตัวตน', '#ef4444'));

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { bookingId, action, headUser } = decoded;

        const booking = await WaterparkBooking.findById(bookingId);
        if (!booking) return res.send(renderHtml('❌ เกิดข้อผิดพลาด', 'ไม่พบรายการจองนี้ในระบบ (อาจถูกลบไปแล้ว)', '#ef4444'));

        if (booking.status !== 'Pending_Head') {
            return res.send(renderHtml('⚠️ ทำรายการไปแล้ว', 'รายการนี้ได้รับการตรวจสอบไปเรียบร้อยแล้ว ไม่สามารถทำซ้ำได้', '#f59e0b'));
        }

        if (action === 'APPROVE') {
            booking.status = 'Pending_HR';
            booking.approvalHistory.push({ action: 'HEAD_APPROVED', actor: headUser, note: 'หัวหน้าอนุมัติผ่าน Email (One-Click)' });
            await booking.save();
            return res.send(renderHtml('✅ อนุมัติสำเร็จ!', `คุณได้อนุมัติคำขอของ <b>${booking.username}</b> เรียบร้อยแล้ว<br>ระบบได้ส่งเรื่องต่อให้ HR ดำเนินการ`, '#10b981'));
        } 
        else if (action === 'REJECT') {
            booking.status = 'Rejected';
            booking.rejectReason = `ไม่อนุมัติ (กดปฏิเสธผ่าน Email โดย ${headUser})`;
            booking.approvalHistory.push({ action: 'REJECTED', actor: headUser, note: 'หัวหน้าปฏิเสธผ่าน Email (One-Click)' });
            await booking.save();
            return res.send(renderHtml('❌ ปฏิเสธคำขอสำเร็จ', `คุณได้ปฏิเสธคำขอของ <b>${booking.username}</b> เรียบร้อยแล้ว`, '#ef4444'));
        }

    } catch (err) {
        return res.send(renderHtml('❌ ลิงก์หมดอายุหรือไม่ถูกต้อง', 'ลิงก์นี้หมดอายุหรือข้อมูลไม่ถูกต้อง กรุณาเข้าระบบเพื่อทำรายการแทน', '#ef4444'));
    }
});

router.get('/dashboard/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

        const tier = user.positionLevel || 'Tier1_Staff';
        const maxFree = tierMaxFree[tier] || 0;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const bookingsThisMonth = await WaterparkBooking.find({ 
            username: user.username, 
            visitDate: { $gte: startOfMonth, $lte: endOfMonth },
            status: { $in: ['Pending_Head', 'Pending_HR', 'Approved'] } 
        });

        let freeUsed = 0;
        bookingsThisMonth.forEach(b => {
            let count = 0;
            if (typeof b.totalFreeGuestsUsed === 'number') {
                count = b.totalFreeGuestsUsed;
            } else if (b.guests && Array.isArray(b.guests)) {
                count = b.guests.filter(g => g.ticketType === 'FREE').length;
            }
            freeUsed += count;
        });

        const freeRemaining = Math.max(0, maxFree - freeUsed);
        const isFreeQuotaLocked = freeRemaining <= 0;

        let relatives = [];
        if (tier === 'Tier1_Staff') {
            relatives = await WaterparkRelative.find({ username: user.username, isActive: true });
        }

        const allBookings = await WaterparkBooking.find({ username: user.username }).sort({ createdAt: -1 });

        res.json({
            tier, maxFree, freeUsed,
            freeRemaining,
            isFreeQuotaLocked,
            relatives,
            regUnlocked: user.waterparkRegUnlocked,
            allBookings
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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
        const maxFree = tierMaxFree[tier] || 0;

        const startOfMonth = new Date(visit.getFullYear(), visit.getMonth(), 1);
        const endOfMonth = new Date(visit.getFullYear(), visit.getMonth() + 1, 0, 23, 59, 59);

        const bookingsThisMonth = await WaterparkBooking.find({ 
            username, 
            visitDate: { $gte: startOfMonth, $lte: endOfMonth },
            status: { $in: ['Pending_Head', 'Pending_HR', 'Approved'] } 
        });

        let freeUsedThisMonth = 0;
        bookingsThisMonth.forEach(b => {
            let count = 0;
            if (typeof b.totalFreeGuestsUsed === 'number') {
                count = b.totalFreeGuestsUsed;
            } else if (b.guests && Array.isArray(b.guests)) {
                count = b.guests.filter(g => g.ticketType === 'FREE').length;
            }
            freeUsedThisMonth += count;
        });
        
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
            bookingId, username, employeeName: user.name, department: user.department || '-',
            visitDate, isEmployeeEntering, guests: processedGuests,
            totalFreeGuestsUsed, totalDiscountGuestsUsed,
            isUrgent, urgentReason, 
            status: initialStatus,
            headApprover: headUsername,
            approvalHistory: [{
                action: 'CREATED',
                actor: username,
                note: 'พนักงานส่งคำขอจองสิทธิ์เข้าสวนน้ำ'
            }]
        });

        await booking.save();
        try { sendPushMessage(booking, 'เบิกใหม่'); } catch(e) {}

        // 💡 ส่งอีเมลให้หัวหน้าแผนก (ใช้ createTransporter ที่บังคับ IPv4)
        if (initialStatus === 'Pending_Head') {
            if (process.env.EMAIL_USER && process.env.JWT_SECRET && process.env.BACKEND_URL) {
                console.log(`[Email System] เตรียมส่งอีเมลไปหาหัวหน้าแผนก: ${user.department}`);
                const transporter = createTransporter();
                const visitStr = new Date(visitDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
                
                let guestsTableHtml = '';
                if (processedGuests.length > 0) {
                    guestsTableHtml = `
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
                            <thead>
                                <tr style="background-color: #f1f5f9; text-align: left;">
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 14px;">ชื่อ-สกุล</th>
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 14px; text-align: center;">สิทธิ์ที่ได้รับ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${processedGuests.map(g => `
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #cbd5e1; font-size: 14px;">${g.fullName}</td>
                                        <td style="padding: 10px; border: 1px solid #cbd5e1; font-size: 14px; text-align: center; font-weight: bold; color: ${g.ticketType === 'FREE' ? '#059669' : '#d97706'};">${g.ticketType === 'FREE' ? 'ฟรี' : 'ลด 50%'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                } else {
                    guestsTableHtml = '<p style="color: #64748b; font-size: 14px; font-style: italic;">(ไม่มีผู้ติดตามเพิ่มเติม พนักงานขอเข้าใช้บริการเพียงคนเดียว)</p>';
                }
                
                const emailPromises = headUsers.map(async (hu) => {
                    const targetEmail = hu.email || `${hu.username}@yourcompany.com`; 
                    
                    const approveToken = jwt.sign({ bookingId: booking._id, action: 'APPROVE', headUser: hu.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
                    const rejectToken = jwt.sign({ bookingId: booking._id, action: 'REJECT', headUser: hu.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

                    const approveLink = `${process.env.BACKEND_URL}/api/waterpark/email-action?token=${approveToken}`;
                    const rejectLink = `${process.env.BACKEND_URL}/api/waterpark/email-action?token=${rejectToken}`;

                    const mailOptions = {
                        from: `"Uniform & Waterpark System" <${process.env.EMAIL_USER}>`,
                        to: targetEmail,
                        subject: `[รออนุมัติ] คำขอเข้าสวนน้ำจาก ${user.name} (${bookingId})`,
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
                                    <h2 style="margin: 0;">คำขออนุมัติเข้าสวนน้ำ</h2>
                                </div>
                                <div style="padding: 20px;">
                                    <p>เรียน คุณ${hu.name},</p>
                                    <p>มีการส่งคำขอจองสิทธิ์เข้าใช้บริการสวนน้ำ จากพนักงานในแผนกของคุณ:</p>
                                    <ul style="line-height: 1.8;">
                                        <li><b>ผู้ขอสิทธิ์:</b> ${user.name}</li>
                                        <li><b>วันที่เข้าใช้บริการ:</b> ${visitStr} ${isUrgent ? '<b><span style="color:red;">(จองด่วน!)</span></b>' : ''}</li>
                                        ${isUrgent ? `<li><b>เหตุผลจองด่วน:</b> <span style="color:red;">${urgentReason}</span></li>` : ''}
                                        <li><b>จำนวนผู้ติดตาม:</b> ${processedGuests.length} คน (ฟรี ${totalFreeGuestsUsed}, ลด 50% ${totalDiscountGuestsUsed})</li>
                                    </ul>
                                    
                                    <h3 style="margin-top: 25px; margin-bottom: 5px; color: #1e40af; border-left: 4px solid #1e40af; padding-left: 8px;">รายชื่อผู้ติดตาม</h3>
                                    ${guestsTableHtml}

                                    <p style="margin-top: 30px; text-align: center;">คุณสามารถกดอนุมัติหรือปฏิเสธได้ทันทีจากปุ่มด้านล่างนี้</p>
                                    <div style="text-align: center; margin-top: 20px;">
                                        <a href="${approveLink}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px; display: inline-block;">✅ อนุมัติคำขอ</a>
                                        <a href="${rejectLink}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">❌ ไม่อนุมัติ</a>
                                    </div>
                                </div>
                                <div style="background-color: #f1f5f9; color: #64748b; padding: 15px; text-align: center; font-size: 12px;">
                                    นี่คืออีเมลอัตโนมัติจากระบบ โปรดอย่าตอบกลับ
                                </div>
                            </div>
                        `
                    };
                    
                    try {
                        const info = await transporter.sendMail(mailOptions);
                        console.log(`✅ [Email System] ส่งอีเมลแจ้งเตือนถึง ${targetEmail} สำเร็จ (${info.messageId})`);
                    } catch (err) {
                        console.error(`❌ [Email System] ส่งอีเมลแจ้งเตือนถึง ${targetEmail} ล้มเหลว:`, err.message);
                    }
                });
                
                await Promise.all(emailPromises);

            } else {
                console.warn("⚠️ [Email System] ข้ามการส่งอีเมลขออนุมัติ: ไม่พบตั้งค่า Environment Variables");
            }
        }

        res.json({ success: true, booking });
    } catch (err) { 
        console.error("❌ [API Error] /book:", err);
        res.status(500).json({ error: err.message }); 
    }
});

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
        const maxFree = tierMaxFree[tier] || 0;

        const startOfMonth = new Date(visit.getFullYear(), visit.getMonth(), 1);
        const endOfMonth = new Date(visit.getFullYear(), visit.getMonth() + 1, 0, 23, 59, 59);

        const bookingsThisMonth = await WaterparkBooking.find({ 
            username, 
            _id: { $ne: booking._id }, 
            visitDate: { $gte: startOfMonth, $lte: endOfMonth },
            status: { $in: ['Pending_Head', 'Pending_HR', 'Approved'] } 
        });

        let freeUsedThisMonth = 0;
        bookingsThisMonth.forEach(b => {
            let count = 0;
            if (typeof b.totalFreeGuestsUsed === 'number') {
                count = b.totalFreeGuestsUsed;
            } else if (b.guests && Array.isArray(b.guests)) {
                count = b.guests.filter(g => g.ticketType === 'FREE').length;
            }
            freeUsedThisMonth += count;
        });
        
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
        
        booking.approvalHistory.push({ action: 'CREATED', actor: username, note: 'พนักงานแก้ไขคำขอและส่งใหม่' });

        await booking.save();

        if (initialStatus === 'Pending_Head') {
            if (process.env.EMAIL_USER && process.env.JWT_SECRET && process.env.BACKEND_URL) {
                console.log(`[Email System] เตรียมส่งอีเมล(หลังแก้ไข)ไปหาหัวหน้าแผนก: ${user.department}`);
                const transporter = createTransporter();
                const visitStr = new Date(visitDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
                
                let guestsTableHtml = '';
                if (processedGuests.length > 0) {
                    guestsTableHtml = `
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
                            <thead>
                                <tr style="background-color: #f1f5f9; text-align: left;">
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 14px;">ชื่อ-สกุล</th>
                                    <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 14px; text-align: center;">สิทธิ์ที่ได้รับ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${processedGuests.map(g => `
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #cbd5e1; font-size: 14px;">${g.fullName}</td>
                                        <td style="padding: 10px; border: 1px solid #cbd5e1; font-size: 14px; text-align: center; font-weight: bold; color: ${g.ticketType === 'FREE' ? '#059669' : '#d97706'};">${g.ticketType === 'FREE' ? 'ฟรี' : 'ลด 50%'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                } else {
                    guestsTableHtml = '<p style="color: #64748b; font-size: 14px; font-style: italic;">(ไม่มีผู้ติดตามเพิ่มเติม พนักงานขอเข้าใช้บริการเพียงคนเดียว)</p>';
                }
                
                const emailPromises = headUsers.map(async (hu) => {
                    const targetEmail = hu.email || `${hu.username}@yourcompany.com`; 
                    
                    const approveToken = jwt.sign({ bookingId: booking._id, action: 'APPROVE', headUser: hu.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
                    const rejectToken = jwt.sign({ bookingId: booking._id, action: 'REJECT', headUser: hu.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

                    const approveLink = `${process.env.BACKEND_URL}/api/waterpark/email-action?token=${approveToken}`;
                    const rejectLink = `${process.env.BACKEND_URL}/api/waterpark/email-action?token=${rejectToken}`;

                    const mailOptions = {
                        from: `"Uniform & Waterpark System" <${process.env.EMAIL_USER}>`,
                        to: targetEmail,
                        subject: `[รออนุมัติ] คำขอเข้าสวนน้ำ(ส่งใหม่) จาก ${user.name} (${booking.bookingId})`,
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
                                    <h2 style="margin: 0;">พนักงานได้ส่งคำขอมาใหม่อีกครั้ง</h2>
                                </div>
                                <div style="padding: 20px;">
                                    <p>เรียน คุณ${hu.name},</p>
                                    <p>มีการแก้ไขและส่งคำขอจองสิทธิ์เข้าสวนน้ำ จากพนักงานในแผนกของคุณ:</p>
                                    <ul style="line-height: 1.8;">
                                        <li><b>ผู้ขอสิทธิ์:</b> ${user.name}</li>
                                        <li><b>วันที่เข้าใช้บริการ:</b> ${visitStr} ${isUrgent ? '<b><span style="color:red;">(จองด่วน!)</span></b>' : ''}</li>
                                        ${isUrgent ? `<li><b>เหตุผลจองด่วน:</b> <span style="color:red;">${urgentReason}</span></li>` : ''}
                                        <li><b>จำนวนผู้ติดตาม:</b> ${processedGuests.length} คน (ฟรี ${totalFreeGuestsUsed}, ลด 50% ${totalDiscountGuestsUsed})</li>
                                    </ul>
                                    
                                    <h3 style="margin-top: 25px; margin-bottom: 5px; color: #1e40af; border-left: 4px solid #1e40af; padding-left: 8px;">รายชื่อผู้ติดตามใหม่</h3>
                                    ${guestsTableHtml}

                                    <p style="margin-top: 30px; text-align: center;">คุณสามารถกดอนุมัติหรือปฏิเสธได้ทันทีจากปุ่มด้านล่างนี้</p>
                                    <div style="text-align: center; margin-top: 20px;">
                                        <a href="${approveLink}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px; display: inline-block;">✅ อนุมัติคำขอ</a>
                                        <a href="${rejectLink}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">❌ ไม่อนุมัติ</a>
                                    </div>
                                </div>
                                <div style="background-color: #f1f5f9; color: #64748b; padding: 15px; text-align: center; font-size: 12px;">
                                    นี่คืออีเมลอัตโนมัติจากระบบ โปรดอย่าตอบกลับ
                                </div>
                            </div>
                        `
                    };
                    
                    try {
                        const info = await transporter.sendMail(mailOptions);
                        console.log(`✅ [Email System] ส่งอีเมลแจ้งเตือน(ส่งใหม่)ถึง ${targetEmail} สำเร็จ (${info.messageId})`);
                    } catch (err) {
                        console.error(`❌ [Email System] ส่งอีเมลแจ้งเตือน(ส่งใหม่)ถึง ${targetEmail} ล้มเหลว:`, err.message);
                    }
                });
                
                await Promise.all(emailPromises);
            }
        }

        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/affiliate-book', async (req, res) => {
    try {
        const { affiliateName, affiliateCompany, visitDate, guests, adminUser } = req.body;
        
        const visit = new Date(visitDate);
        visit.setHours(0,0,0,0);
        
        let processedGuests = [];
        for (const guest of guests) {
            processedGuests.push({
                fullName: guest.fullName,
                idCardNumber: guest.idCardNumber || '',
                idCardExpiry: guest.idCardExpiry || null,
                idCardImageUrl: guest.idCardImageUrl,
                ticketType: '50_DISCOUNT' 
            });
        }

        const bookingId = 'WP-AFF-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const booking = new WaterparkBooking({
            bookingId, 
            username: 'AFFILIATE', 
            bookingType: 'AFFILIATE', 
            affiliateName,
            affiliateCompany,
            visitDate, 
            isEmployeeEntering: true, 
            guests: processedGuests,
            totalFreeGuestsUsed: 0,
            totalDiscountGuestsUsed: processedGuests.length,
            status: 'Approved', 
            hrApprover: adminUser,
            approvalHistory: [
                { action: 'CREATED', actor: adminUser, note: 'สร้างรายการจองสำหรับพนักงานเครือ' },
                { action: 'HR_APPROVED', actor: adminUser, note: 'อนุมัติอัตโนมัติ (ทำรายการโดย Admin)' }
            ]
        });

        await booking.save();
        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cancel/:id', async (req, res) => {
    try {
        const booking = await WaterparkBooking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });
        
        if (booking.status !== 'Pending_Head' && booking.status !== 'Pending_HR' && booking.status !== 'Returned') {
            return res.status(400).json({ error: 'ไม่สามารถยกเลิกได้ เนื่องจากรายการถูกดำเนินการไปแล้ว' });
        }

        booking.status = 'Cancelled';
        booking.approvalHistory.push({ action: 'CANCELLED', actor: booking.username, note: 'พนักงานยกเลิกรายการด้วยตนเอง' });

        await booking.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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

router.post('/approvals/action', async (req, res) => {
    try {
        const { bookingId, action, reason, adminUser, role } = req.body;
        const booking = await WaterparkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });

        if (action === 'REJECT') {
            booking.status = 'Rejected';
            booking.rejectReason = `ปฏิเสธโดย ${adminUser}: ${reason}`;
            booking.approvalHistory.push({ action: 'REJECTED', actor: adminUser, note: `ปฏิเสธ: ${reason}` });
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

            if (role === 'admin') { 
                booking.status = 'Approved'; 
                booking.hrApprover = adminUser; 
                booking.approvalHistory.push({ action: 'HR_APPROVED', actor: adminUser, note: 'แอดมิน/บุคคล อนุมัติขั้นสุดท้าย' });
            } 
            else { 
                booking.status = 'Pending_HR'; 
                booking.approvalHistory.push({ action: 'HEAD_APPROVED', actor: adminUser, note: 'หัวหน้าแผนกตรวจสอบและอนุมัติแล้ว' });
            }
        }

        await booking.save();
        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/approvals/return', async (req, res) => {
    try {
        const { bookingId, reason, adminUser } = req.body;
        const booking = await WaterparkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });

        booking.status = 'Returned';
        booking.rejectReason = `ให้แก้ไขใหม่โดย ${adminUser}: ${reason || 'ข้อมูลไม่ถูกต้อง'}`;
        
        booking.approvalHistory.push({ action: 'RETURNED', actor: adminUser, note: `ตีกลับให้แก้ไข: ${reason}` });

        await booking.save();
        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/audit/:id', async (req, res) => {
    try {
        const booking = await WaterparkBooking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' });
        res.json(booking);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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
            let dept = 'ไม่ระบุแผนก';
            let empName = b.username;

            if (b.bookingType === 'AFFILIATE') {
                dept = `[เครือ] ${b.affiliateCompany || 'ไม่ระบุ'}`;
                empName = b.affiliateName;
            } else {
                const user = await User.findOne({ username: b.username });
                if (user) {
                    dept = user.department || 'ไม่ระบุแผนก';
                    empName = user.name;
                }
            }

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
                employeeName: empName,
                isEmployeeEntering: b.isEmployeeEntering,
                guests: guestList,
                bookingType: b.bookingType || 'NORMAL'
            });
        }

        res.json({ date: startOfDay, data: reportData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
        booking.approvalHistory.push({ action: 'CANCELLED', actor: req.body.adminUser, note: 'แอดมินยกเลิกรายการ' });

        await booking.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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
            booking.totalFreeGuestsUsed = Math.max(0, (booking.totalFreeGuestsUsed || 0) - 1);
        } else if (removedGuest.ticketType === '50_DISCOUNT') {
            booking.totalDiscountGuestsUsed = Math.max(0, (booking.totalDiscountGuestsUsed || 0) - 1);
        }

        const guestName = removedGuest.fullName;
        booking.guests.splice(guestIndex, 1);

        booking.approvalHistory.push({ action: 'EDITED', actor: adminUser, note: `แอดมินลบผู้ติดตาม: ${guestName}` });

        if (booking.guests.length === 0 && !booking.isEmployeeEntering) {
            booking.status = 'Cancelled';
            booking.rejectReason = `ยกเลิกอัตโนมัติ (ลบผู้ใช้สิทธิ์หมดแล้ว) โดยแอดมิน: ${adminUser}`;
            booking.approvalHistory.push({ action: 'CANCELLED', actor: 'SYSTEM', note: 'ยกเลิกอัตโนมัติเนื่องจากลบผู้ติดตามหมดแล้ว' });
        }

        await booking.save();
        res.json({ success: true, booking });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/relatives/:username', async (req, res) => {
    try {
        const relatives = await WaterparkRelative.find({ username: req.params.username }).sort({ createdAt: -1 });
        res.json(relatives);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
                        
                        const requesterText = b.bookingType === 'AFFILIATE' ? `${b.affiliateName} (เครือ ${b.affiliateCompany})` : b.username;
                        doc.fontSize(14).text(`พนักงานที่ขอสิทธิ์: ${requesterText}`);
                        
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
            const transporter = createTransporter();

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

cron.schedule('0 8 * * *', async () => {
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
            let dept = 'ไม่ระบุแผนก';
            let empName = b.username;
            
            if (b.bookingType === 'AFFILIATE') {
                dept = `[เครือ] ${b.affiliateCompany || 'ไม่ระบุ'}`;
                empName = b.affiliateName;
            } else {
                const user = await User.findOne({ username: b.username });
                dept = user ? (user.department || 'ไม่ระบุแผนก') : 'ไม่ระบุแผนก';
                empName = user ? user.name : b.username;
            }
            
            if (!grouped[dept]) grouped[dept] = [];
            grouped[dept].push({ ...b.toObject(), employeeName: empName, isAffiliate: b.bookingType === 'AFFILIATE' });
        }

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

        function drawDottedLine(startX, startY, endX) {
            doc.moveTo(startX, startY).lineTo(endX, startY).dash(2, { space: 2 }).stroke('#cccccc').undash();
        }

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
                    doc.rect(185, currentY, 625, 25).stroke('#999999');
                    
                    const empLabel = booking.isAffiliate ? '(พนักงานเครือ)' : '(พนักงาน)';
                    
                    doc.fillColor('#000000').text(`${booking.employeeName} ${empLabel}`, 195, currentY + 6, { width: 135 });
                    doc.fillColor('#2563eb').text(`เข้าฟรี`, 340, currentY + 6, { width: 80, align: 'center' });
                    doc.fillColor('#000000').text(`-`, 420, currentY + 6, { width: 115, align: 'center' });
                    
                    drawDottedLine(545, currentY + 18, 640);
                    drawDottedLine(660, currentY + 18, 800);

                    doc.moveTo(340, currentY).lineTo(340, currentY + 25).stroke('#999999');
                    doc.moveTo(420, currentY).lineTo(420, currentY + 25).stroke('#999999');
                    doc.moveTo(535, currentY).lineTo(535, currentY + 25).stroke('#999999');
                    doc.moveTo(650, currentY).lineTo(650, currentY + 25).stroke('#999999');

                    y += 25;
                }

                for (const guest of booking.guests) {
                    const currentY = y;
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
                
                doc.rect(30, empStartY, 40, empHeight).stroke('#999999'); 
                doc.rect(70, empStartY, 115, empHeight).stroke('#999999'); 

                const textY = empStartY + (empHeight / 2) - 8;
                doc.fillColor('#000000').text(`${globalIndex++}`, 30, textY, { width: 40, align: 'center' });
                doc.text(`${booking.employeeName}`, 75, textY, { width: 105, align: 'left' });
            }
        }

        doc.fontSize(12).fillColor('#666666').text(`พิมพ์โดย: ระบบอัตโนมัติ | เวลา: ${new Date().toLocaleString('th-TH')}`, 30, 560, { width: 780, align: 'right' });

        doc.end();

        const pdfBuffer = await new Promise((resolve) => {
            doc.on('end', () => resolve(Buffer.concat(buffers)));
        });

        const transporter = createTransporter();

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
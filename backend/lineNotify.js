const https = require('https');

// Token ใหม่ล่าสุดที่เพิ่งอัปเดต
const CHANNEL_ACCESS_TOKEN = "dCnA72Q1lQkAo6W2wY4q/3JLZiUJ0UqF3r/5H/kYLVylWAaab2u3FRxeNmJN536psAEbkV56INlKAoCMSfD9wF0CTxZ7x/WAgUKVv0warZ5lbiA1BTIdtwG26FuNFudDcHun6BslptbMbk6xpk5QdQdB04t89/1O/w1cDnyilFU=";
const TARGET_ID = "C3861e25e3cbe0ab282c2c43fa749e436";
const SYSTEM_URL = "https://uniform-system-hg0e.onrender.com"; 

function createRequestNotificationFlexMessage(data, type) {
  let headerText = 'มีการอัปเดตระบบ';
  let headerColor = '#64748B'; // Default Gray

  if (type === 'เบิกใหม่') { headerText = '🔔 มีคำขอเบิกพัสดุใหม่!'; headerColor = '#4F46E5'; }
  else if (type === 'ขอคืน/เปลี่ยน') { headerText = '🔄 มีคำขอคืน/เปลี่ยนพัสดุ!'; headerColor = '#F97316'; }
  else if (type === 'อนุมัติคำขอ') { headerText = '✅ อนุมัติคำขอแล้ว!'; headerColor = '#10B981'; }
  else if (type === 'ปฏิเสธคำขอ') { headerText = '❌ ปฏิเสธคำขอ'; headerColor = '#EF4444'; }

  return {
    "type": "flex",
    "altText": `แจ้งเตือน: ${type} - ${data.itemType || 'พัสดุ'}`,
    "contents": {
      "type": "bubble",
      "header": {
        "type": "box",
        "layout": "vertical",
        "contents": [{"type": "text", "text": headerText, "weight": "bold", "color": "#FFFFFF", "size": "md"}],
        "backgroundColor": headerColor,
        "paddingAll": "12px"
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          { "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": "ผู้ขอ:", "flex": 2, "size": "sm", "color": "#888888" }, { "type": "text", "text": data.requesterName || data.name || '-', "flex": 5, "size": "sm", "color": "#111111", "weight": "bold", "wrap": true } ] },
          { "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": "รายการ:", "flex": 2, "size": "sm", "color": "#888888" }, { "type": "text", "text": `${data.itemType || '-'} (ไซส์ ${data.size || '-'})`, "flex": 5, "size": "sm", "color": "#111111", "wrap": true } ] },
          { "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": "จำนวน:", "flex": 2, "size": "sm", "color": "#888888" }, { "type": "text", "text": `${data.quantity || 0} ชิ้น`, "flex": 5, "size": "sm", "color": "#111111" } ] },
          { "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": "สถานะ:", "flex": 2, "size": "sm", "color": "#888888" }, { "type": "text", "text": data.status || type, "flex": 5, "size": "sm", "color": "#111111", "wrap": true } ] },
          { "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": "หมายเหตุ:", "flex": 2, "size": "sm", "color": "#888888" }, { "type": "text", "text": data.notes || data.reason || '-', "flex": 5, "size": "sm", "color": "#111111", "wrap": true } ], "margin": "md" }
        ],
        "spacing": "sm",
        "paddingAll": "16px"
      }
    }
  };
}

async function sendPushMessage(requestData, requestType) {
  if (!CHANNEL_ACCESS_TOKEN || !TARGET_ID) {
      console.warn("⚠️ [LINE Push] ขาด LINE Token หรือ Target ID ไม่สามารถส่งแจ้งเตือนได้");
      return;
  }

  // ใช้ Promise ควบคู่กับ https module เพื่อให้ครอบคลุม Node.js ทุกเวอร์ชัน
  return new Promise((resolve) => {
      const flexMessage = createRequestNotificationFlexMessage(requestData, requestType);
      const payload = JSON.stringify({
          to: TARGET_ID,
          messages: [flexMessage]
      });

      const options = {
          hostname: 'api.line.me',
          path: '/v2/bot/message/push',
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
              'Content-Length': Buffer.byteLength(payload)
          }
      };

      const req = https.request(options, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                  console.log(`✅ [LINE Push Success]: ส่งการแจ้งเตือน ${requestType} สำเร็จ`);
              } else {
                  console.error(`❌ [LINE Push Failed]: HTTP ${res.statusCode}`, body);
              }
              // Resolve เสมอเพื่อให้ระบบเซิร์ฟเวอร์หลักทำงานต่อไปได้โดยไม่ค้าง
              resolve(body); 
          });
      });

      req.on('error', (e) => {
          console.error('❌ [LINE Push Critical Error]:', e.message);
          resolve(); 
      });

      req.write(payload);
      req.end();
  });
}

module.exports = { sendPushMessage };
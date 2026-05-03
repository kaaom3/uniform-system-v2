// === การตั้งค่า: LINE Messaging API ===
// 1. Channel Access Token (long-lived)
const CHANNEL_ACCESS_TOKEN = "Atb5cyLGBu82fm3ZXPdnZ3nNsoL5+KnpeVqv1expkFCsXb9bWX8LWrwc0keDtpjFJxYTkGp3+eyHLZM0GfK/lIhEjMzB97yVy4+M9oCYkuZEtBVBGU/GHMd3n9w09urwKcorN9VjfY2Px6sbTfvidAdB04t89/1O/w1cDnyilFU=";

// 2. Group ID หรือ User ID ที่จะรับการแจ้งเตือน
const TARGET_ID = "C3861e25e3cbe0ab282c2c43fa749e436";

// URL ของระบบจัดการ (ใส่ลิงก์หน้าเว็บจริงของคุณเมื่อนำขึ้นโฮสต์)
const SYSTEM_URL = "https://uniform-system-hg0e.onrender.com"; 

/**
 * Creates a Flex Message JSON object
 */
function createRequestNotificationFlexMessage(data, type) {
  const headerText = (type === 'เบิกใหม่') ? 'มีคำขอเบิกพัสดุใหม่!' : 'มีคำขอคืน/เปลี่ยนพัสดุ!';
  const headerColor = (type === 'เบิกใหม่') ? '#4F46E5' : '#F97316'; // เปลี่ยนสีให้เข้ากับธีมใหม่ (Indigo / Orange)

  return {
    "type": "flex",
    "altText": `มีคำขอใหม่: ${data.itemType}`,
    "contents": {
      "type": "bubble",
      "header": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": headerText,
            "weight": "bold",
            "color": "#FFFFFF",
            "size": "md"
          }
        ],
        "backgroundColor": headerColor,
        "paddingAll": "12px"
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              { "type": "text", "text": "ผู้ขอ:", "flex": 2, "size": "sm", "color": "#888888" },
              { "type": "text", "text": data.requesterName || data.name, "flex": 5, "size": "sm", "color": "#111111", "weight": "bold", "wrap": true }
            ]
          },
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              { "type": "text", "text": "รายการ:", "flex": 2, "size": "sm", "color": "#888888" },
              { "type": "text", "text": `${data.itemType} (ไซส์ ${data.size})`, "flex": 5, "size": "sm", "color": "#111111", "wrap": true }
            ]
          },
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              { "type": "text", "text": "จำนวน:", "flex": 2, "size": "sm", "color": "#888888" },
              { "type": "text", "text": `${data.quantity} ชิ้น`, "flex": 5, "size": "sm", "color": "#111111" }
            ]
          },
          {
            "type": "box",
            "layout": "horizontal",
            "contents": [
              { "type": "text", "text": "เหตุผล:", "flex": 2, "size": "sm", "color": "#888888" },
              { "type": "text", "text": data.reason || '-', "flex": 5, "size": "sm", "color": "#111111", "wrap": true }
            ],
            "margin": "md"
          }
        ],
        "spacing": "sm",
        "paddingAll": "16px"
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "button",
            "action": {
              "type": "uri",
              "label": "เปิดระบบจัดการ",
              "uri": SYSTEM_URL
            },
            "style": "primary",
            "color": headerColor,
            "height": "sm"
          }
        ],
        "paddingAll": "12px"
      }
    }
  };
}

/**
 * Sends a push message to a specific user or group
 */
async function sendPushMessage(requestData, requestType) {
  if (!CHANNEL_ACCESS_TOKEN || !TARGET_ID) {
    console.log("LINE Messaging API credentials are not set. Skipping.");
    return;
  }

  const url = "https://api.line.me/v2/bot/message/push";
  const flexMessage = createRequestNotificationFlexMessage(requestData, requestType);

  const payload = {
    "to": TARGET_ID,
    "messages": [flexMessage]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    console.log("✅ LINE Push Sent:", result);
  } catch (e) {
    console.error("❌ Failed to send LINE message:", e.message);
  }
}

module.exports = { sendPushMessage };
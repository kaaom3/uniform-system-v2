// รหัส LIFF ID ของคุณ (ต้องนำมาเปลี่ยนเมื่อพร้อมใช้งานจริง)
const LIFF_ID = "2010473003-HlDsHwtH"; 

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = isLocalhost ? 'http://localhost:3000' : 'https://uniform-system-v2.onrender.com';

document.addEventListener("DOMContentLoaded", () => {
    initializeLiff();
});

async function initializeLiff() {
    try {
        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
            liff.login();
            return;
        }

        const profile = await liff.getProfile();
        const lineUserId = profile.userId;

        // ตรวจสอบว่าเคยผูกบัญชีหรือยัง
        const response = await fetch(`${API_BASE_URL}/api/liff/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lineUserId })
        });

        const data = await response.json();

        if (response.ok) {
            // ผูกบัญชีแล้ว บันทึกข้อมูลลง sessionStorage แล้วพาไปหน้าจอง
            sessionStorage.setItem('currentUser', JSON.stringify(data));
            window.location.replace('waterpark.html');
        } else if (response.status === 404) {
            // ยังไม่เคยผูกบัญชี ให้แสดงฟอร์ม
            document.getElementById('liff-loading').classList.add('hidden');
            document.getElementById('bind-form-container').classList.remove('hidden');
            
            // ตั้งค่า Event Listener สำหรับฟอร์ม
            setupBindForm(lineUserId);
        } else {
            showError(data.error || 'เกิดข้อผิดพลาดในการตรวจสอบบัญชี');
        }
    } catch (err) {
        console.error('LIFF Init Error:', err);
        // Fallback for testing on desktop browser without valid LIFF ID
        if (err.message.includes('LIFF_ID')) {
            showError('ยังไม่ได้ตั้งค่า LIFF ID');
        } else {
            showError('ไม่สามารถเริ่มต้นระบบ LINE ได้');
        }
    }
}

function setupBindForm(lineUserId) {
    const bindForm = document.getElementById('bind-form');
    const bindBtn = document.getElementById('bind-btn');

    bindForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('bind-username').value.trim();
        const password = document.getElementById('bind-password').value.trim();

        if (!username || !password) return;

        // เปลี่ยนปุ่มเป็นสถานะโหลด
        const originalText = bindBtn.innerHTML;
        bindBtn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>';
        bindBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/liff/bind`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lineUserId, username, password })
            });

            const data = await response.json();

            if (response.ok) {
                // ผูกบัญชีสำเร็จ
                sessionStorage.setItem('currentUser', JSON.stringify(data));
                window.location.replace('waterpark.html');
            } else {
                showError(data.error || 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง');
                bindBtn.innerHTML = originalText;
                bindBtn.disabled = false;
            }
        } catch (err) {
            console.error('Bind Error:', err);
            showError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
            bindBtn.innerHTML = originalText;
            bindBtn.disabled = false;
        }
    });
}

function showError(msg) {
    const errorContainer = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    
    document.getElementById('liff-loading').classList.add('hidden');
    errorText.textContent = msg;
    errorContainer.classList.remove('hidden');
}

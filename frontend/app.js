const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = isLocalhost ? 'http://localhost:3000' : 'https://uniform-system-v2.onrender.com';

const AppState = { currentUser: null };

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    injectImageModal(); // 💡 เตรียม Modal สำหรับคลิกดูรูปบัตร
    setupEventListeners();
});

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = { method, headers: {} };
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    let data;
    try { data = await response.json(); } catch (e) { data = { error: 'ไม่สามารถอ่านข้อมูลจากเซิร์ฟเวอร์ได้' }; }
    if (!response.ok) throw new Error(data.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ API');
    return data;
}

function checkSession() {
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) {
        try { onLoginSuccess(JSON.parse(storedUser)); } 
        catch (e) { sessionStorage.removeItem('currentUser'); }
    }
}

async function handleLogin(e) {
    if (e && e.type === 'click') e.preventDefault();
    const loginBtn = document.getElementById('login-btn');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    if (!username || !password) return document.getElementById('login-error').textContent = "กรุณากรอกข้อมูลให้ครบถ้วน";

    if (loginBtn.dataset.isProcessing === 'true') return;
    loginBtn.dataset.isProcessing = 'true';
    showLoadingButton(loginBtn, true);

    try {
        const data = await apiCall('/api/auth/login', 'POST', { username, password });
        onLoginSuccess(data);
    } catch (error) {
        showLoadingButton(loginBtn, false, 'เข้าสู่ระบบ');
        loginBtn.dataset.isProcessing = 'false';
        document.getElementById('login-error').textContent = error.message;
    }
}

function onLoginSuccess(user) {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        showLoadingButton(loginBtn, false, 'เข้าสู่ระบบ');
        loginBtn.dataset.isProcessing = 'false';
    }

    if (user.mustChangePassword) { 
        openModalAnimation(document.getElementById('force-change-password-modal')); 
        sessionStorage.setItem('tempUser', JSON.stringify(user));
        return; 
    }

    AppState.currentUser = user;
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    
    document.getElementById('portal-user-initial').textContent = user.name.charAt(0).toUpperCase();
    document.getElementById('portal-user-name').textContent = user.name;
    
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('portal-view').classList.remove('hidden');

    // 💡 โชว์ปุ่มเข้าระบบหลังบ้าน เฉพาะ Admin ตัวจริงเท่านั้น (หัวหน้าจะมองไม่เห็น)
    const adminCard = document.getElementById('admin-portal-card');
    if (user.role === 'admin') {
        adminCard.classList.remove('hidden');
        adminCard.classList.add('block');
    } else {
        adminCard.classList.add('hidden');
        adminCard.classList.remove('block');
    }

    // 💡 แต่ถ้าเป็น Admin หรือ หัวหน้า ให้ดึงข้อมูลรออนุมัติมาโชว์ที่ Widget หน้าแรก
    if (user.role === 'admin' || user.isHeadApprover) {
        loadWaterparkApprovals();
    }
    
    // 💡 โหลดสถานะคำขอของผู้ใช้ (Tracker)
    loadUserRequestTracking();
}

function handleLogout() {
    sessionStorage.removeItem('currentUser');
    AppState.currentUser = null;
    document.getElementById('portal-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    
    const widget = document.getElementById('wp-dashboard-widget');
    if (widget) widget.innerHTML = '';
}

async function handleForceChangePassword() {
    const btn = document.getElementById('force-change-password-btn');
    if (btn.dataset.isProcessing === 'true') return;
    btn.dataset.isProcessing = 'true';

    const pwd = document.getElementById('new-password').value;
    if(pwd !== document.getElementById('confirm-password').value) {
        btn.dataset.isProcessing = 'false';
        return document.getElementById('password-change-error').textContent = 'รหัสผ่านไม่ตรงกัน';
    }
    if(pwd.length < 4) {
        btn.dataset.isProcessing = 'false';
        return document.getElementById('password-change-error').textContent = 'รหัสผ่านต้องมี 4 ตัวอักษรขึ้นไป';
    }

    const tempUser = JSON.parse(sessionStorage.getItem('tempUser'));
    showLoadingButton(btn, true);
    try {
        await apiCall('/api/auth/change-password', 'POST', { username: tempUser.username, newPassword: pwd });
        closeModalAnimation(document.getElementById('force-change-password-modal'));
        sessionStorage.removeItem('tempUser');
        showNotification('เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่', 'success');
    } catch(e) { 
        document.getElementById('password-change-error').textContent = e.message; 
    } finally {
        showLoadingButton(btn, false, 'ยืนยันและเข้าสู่ระบบ');
        btn.dataset.isProcessing = 'false';
    }
}

async function handleForgotPasswordRequest() {
    const btn = document.getElementById('check-reset-status-btn');
    if (btn.dataset.isProcessing === 'true') return;
    btn.dataset.isProcessing = 'true';
    const username = document.getElementById('forgot-username').value.trim();
    if(!username) {
        btn.dataset.isProcessing = 'false';
        return document.getElementById('forgot-password-error').textContent = 'กรุณากรอกรหัสพนักงาน';
    }
    showLoadingButton(btn, true);
    try {
        await apiCall('/api/auth/forgot-password', 'POST', { username });
        document.getElementById('forgot-password-view').innerHTML = '<div class="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center"><p class="text-green-600 font-bold mb-4">✅ ส่งคำขอรีเซ็ตรหัสผ่านแล้ว</p><button onclick="location.reload()" class="text-sm text-slate-700 underline">กลับไปหน้าล็อกอิน</button></div>';
    } catch(e) { document.getElementById('forgot-password-error').textContent = e.message; } 
    finally { showLoadingButton(btn, false, 'ส่งคำขอ'); btn.dataset.isProcessing = 'false'; }
}

// ==========================================
// 🌊 WIDGET สวนน้ำหน้า PORTAL (ดีไซน์ Table + Accordion)
// ==========================================
async function loadWaterparkApprovals() {
    try {
        const data = await apiCall(`/api/waterpark/approvals/pending?username=${AppState.currentUser.username}&role=${AppState.currentUser.role}`);
        renderWaterparkDashboardWidget(data);
    } catch (err) { console.error(err); }
}

function renderWaterparkDashboardWidget(requests) {
    let widget = document.getElementById('wp-dashboard-widget');
    if (!widget) return;

    if (!requests || requests.length === 0) {
        widget.innerHTML = ''; 
        return;
    }

    let html = `
        <div class="bg-white/80 backdrop-blur-xl shadow-lg rounded-[2rem] shadow-2xl border border-[#27aae1]/30 overflow-hidden mb-8">
            <div class="p-6 border-b border-[#27aae1]/20 bg-white/60 flex justify-between items-center flex-wrap gap-4">
                <h3 class="text-xl font-black text-[#0054a8] flex items-center gap-3">
                    <span class="text-3xl filter drop-shadow-md">💦</span> 
                    <span>รายการรออนุมัติด่วน <span class="text-vana-cyan text-sm font-medium ml-2">(เฉพาะสวนน้ำ)</span></span>
                </h3>
                <span class="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-sm font-bold px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse flex items-center gap-2">
                    <span class="w-2 h-2 bg-rose-400 rounded-full"></span>
                    ${requests.length} รายการ
                </span>
            </div>
            <div class="p-6">
                <div class="flex flex-col gap-3">
    `;

    requests.forEach(req => {
        const d = new Date(req.visitDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        const reqDate = new Date(req.createdAt).toLocaleDateString('th-TH');
        const freeCount = req.guests.filter(g => g.ticketType === 'FREE').length;
        const discountCount = req.guests.filter(g => g.ticketType === '50_DISCOUNT').length;

        let guestsHtml = req.guests.map(g => `
            <div class="flex items-center justify-between bg-white/60 px-3 py-2.5 rounded-xl border border-[#27aae1]/20 mb-2 last:mb-0 hover:bg-white/10 transition-colors">
                <span class="text-xs text-[#0054a8] font-bold flex items-center gap-3">
                    <img src="${getImageUrl(g.idCardImageUrl)}" class="w-10 h-6 object-cover rounded shadow-md border border-[#27aae1]/30 cursor-pointer hover:scale-110 transition-transform" onclick="openImageModal(this.src)" title="คลิกเพื่อขยายรูป">
                    ${g.fullName}
                </span>
                <span class="text-[10px] font-black px-2.5 py-1 rounded-md shadow-sm ${g.ticketType === 'FREE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">
                    ${g.ticketType === 'FREE' ? 'ฟรี' : 'ลด 50%'}
                </span>
            </div>
        `).join('');
        
        if (req.guests.length === 0) guestsHtml = '<p class="text-xs text-slate-600 italic text-center py-4 bg-white/60 rounded-xl border border-[#27aae1]/10">ไม่มีผู้ติดตาม</p>';

        let actionButtons = '';
        let canApprove = false;
        
        if (AppState.currentUser.role === 'admin') {
            if (req.status === 'Pending_HR') canApprove = true;
            if (req.status === 'Pending_Head' && req.headApprover && req.headApprover.split(',').includes(AppState.currentUser.username)) canApprove = true;
        } else {
            if (req.status === 'Pending_Head' && req.headApprover && req.headApprover.split(',').includes(AppState.currentUser.username)) canApprove = true;
        }

        if (canApprove) {
            actionButtons = `
                <div class="flex gap-2 w-full">
                    <button class="wp-reject-btn flex-1 bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-black py-2 px-3 rounded-lg transition-all shadow-sm" data-id="${req._id}">ปฏิเสธ</button>
                    <button class="wp-approve-btn flex-1 bg-gradient-to-r from-vana-pink to-vana-orange hover:from-cyan-400 hover:to-blue-400 text-white text-xs font-black py-2 px-3 rounded-lg shadow-[0_0_10px_rgba(6,182,212,0.4)] transition-all transform hover:-translate-y-0.5" data-id="${req._id}">อนุมัติ</button>
                </div>
            `;
        } else if (req.status === 'Pending_Head') {
            actionButtons = `<div class="text-center w-full"><span class="text-[10px] text-amber-300 font-bold bg-amber-500/20 px-2 py-1.5 rounded border border-amber-500/30 inline-block w-full">⏳ รอหัวหน้าพิจารณา</span></div>`;
        }

        html += `
            <div class="bg-white/90 rounded-xl p-4 border border-[#27aae1]/20 shadow-sm relative overflow-hidden hover:bg-white/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-blue-500"></div>
                
                <div class="flex-1 pl-2 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    <div>
                        <h4 class="text-sm font-black text-[#0054a8]">${req.username}</h4>
                        <p class="text-[10px] text-slate-600 mt-0.5">ส่ง: ${reqDate}</p>
                    </div>

                    <div>
                        <div class="text-[11px] text-vana-cyan font-bold bg-vana-cyan/10 px-2 py-1 rounded border border-vana-cyan/20 inline-flex items-center gap-1">
                            📅 เข้า: ${d}
                        </div>
                        <p class="text-[10px] mt-1 ${req.isEmployeeEntering ? 'text-emerald-400' : 'text-slate-700'}">
                            พนักงาน: ${req.isEmployeeEntering ? '✅ เข้า (ฟรี)' : '❌ ไม่เข้า'}
                        </p>
                    </div>

                    <div>
                        <p class="text-[11px] font-bold text-[#0054a8] mb-1">
                            👥 ผู้ติดตาม (${req.guests.length} คน)
                        </p>
                        <div class="flex gap-2 items-center text-[10px]">
                            <span class="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">ฟรี: ${freeCount}</span>
                            <span class="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">ลด50%: ${discountCount}</span>
                        </div>
                    </div>

                    <div class="flex flex-col gap-2 items-end md:items-center justify-center w-full">
                        ${actionButtons}
                        <button class="text-[10px] text-slate-600 hover:text-slate-800 underline transition-colors" onclick="document.getElementById('details-${req._id}').classList.toggle('hidden')">
                            ดูรายชื่อผู้ติดตาม ⬇️
                        </button>
                    </div>
                </div>
            </div>
            
            <div id="details-${req._id}" class="hidden bg-white/70 rounded-xl p-4 mt-1 border border-[#27aae1]/10 mx-2">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    ${guestsHtml}
                </div>
            </div>
        `;
    });

    html += `
                </div>
            </div>
        </div>
    `;
    widget.innerHTML = html;
}

function setupEventListeners() {
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
    const handleEnterPress = (e) => { if (e.key === 'Enter') handleLogin(); };
    document.getElementById('username')?.addEventListener('keyup', handleEnterPress);
    document.getElementById('password')?.addEventListener('keyup', handleEnterPress);
    document.getElementById('portal-logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('show-forgot-password-options')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-view').classList.add('hidden'); document.getElementById('forgot-password-view').classList.remove('hidden'); });
    document.getElementById('back-to-login-link')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('forgot-password-view').classList.add('hidden'); document.getElementById('login-view').classList.remove('hidden'); });
    document.getElementById('force-change-password-btn')?.addEventListener('click', handleForceChangePassword);
    document.getElementById('check-reset-status-btn')?.addEventListener('click', handleForgotPasswordRequest);

    // ดักจับปุ่มอนุมัติ/ปฏิเสธใน Widget
    document.addEventListener('click', async (e) => {
        if (!AppState.currentUser) return;
        
        if (e.target.matches('.wp-approve-btn') || e.target.closest('.wp-approve-btn')) {
            const btn = e.target.closest('.wp-approve-btn') || e.target;
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            showLoadingButton(btn, true);
            try {
                await apiCall('/api/waterpark/approvals/action', 'POST', { bookingId: btn.dataset.id, action: 'APPROVE', adminUser: AppState.currentUser.username, role: AppState.currentUser.role });
                showNotification('อนุมัติสำเร็จ', 'success');
                loadWaterparkApprovals();
            } catch(err) { showNotification(err.message, 'error'); }
            btn.dataset.isProcessing = 'false';
        }
        else if (e.target.matches('.wp-reject-btn') || e.target.closest('.wp-reject-btn')) {
            const btn = e.target.closest('.wp-reject-btn') || e.target;
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            
            const reason = prompt("กรุณาระบุเหตุผลที่ปฏิเสธคำขอเข้าสวนน้ำ:");
            if (reason !== null && reason.trim() !== "") {
                showLoadingButton(btn, true);
                try {
                    await apiCall('/api/waterpark/approvals/action', 'POST', { bookingId: btn.dataset.id, action: 'REJECT', reason: reason.trim(), adminUser: AppState.currentUser.username, role: AppState.currentUser.role });
                    showNotification('ปฏิเสธสำเร็จ', 'success');
                    loadWaterparkApprovals();
                } catch(err) { showNotification(err.message, 'error'); }
            }
            btn.dataset.isProcessing = 'false';
        }
    });
}

// ==========================================
// 📸 Image Zoom Modal Functions (Mini Size)
// ==========================================
function injectImageModal() {
    if (document.getElementById('image-zoom-modal')) return;
    const modalHTML = `
    <div id="image-zoom-modal" class="hidden fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center transition-opacity opacity-0 cursor-pointer" onclick="closeImageModal()">
        <div class="relative mx-4 flex flex-col items-center" onclick="event.stopPropagation()">
            <div class="relative">
                <button class="absolute -top-3 -right-3 bg-white text-white rounded-full p-1.5 shadow-lg hover:bg-rose-500 transition-colors z-10 border border-slate-600" onclick="closeImageModal()">
                    <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <img id="image-zoom-target" src="" class="max-w-[280px] sm:max-w-[350px] max-h-[40vh] object-contain rounded-xl shadow-2xl scale-95 transition-transform duration-300 bg-slate-100">
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

window.openImageModal = function(src) {
    const modal = document.getElementById('image-zoom-modal');
    const target = document.getElementById('image-zoom-target');
    if(!modal || !target) return;
    target.src = src;
    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    target.classList.remove('scale-95');
    target.classList.add('scale-100');
}

window.closeImageModal = function() {
    const modal = document.getElementById('image-zoom-modal');
    const target = document.getElementById('image-zoom-target');
    if(!modal) return;
    modal.classList.add('opacity-0');
    target.classList.remove('scale-100');
    target.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); target.src = ''; }, 300);
}

// Utils
function showNotification(msg, type='success') { 
    const el = document.getElementById('notification');
    if(!el) { alert(msg); return; }
    document.getElementById('notification-message').innerHTML = msg.replace(/\n/g, '<br>');
    el.classList.remove('bg-red-500', 'bg-emerald-500', 'hidden'); 
    el.classList.add(type === 'error' ? 'bg-red-500' : 'bg-emerald-500');
    setTimeout(() => el.classList.add('hidden'), 5000);
}
function showLoadingButton(btn, isLoading, text='') { 
    if(isLoading){ btn.dataset.original = btn.innerHTML; btn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>'; btn.disabled = true; } 
    else { btn.innerHTML = text || btn.dataset.original; btn.disabled = false; } 
}
function openModalAnimation(m) { m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10); }
function closeModalAnimation(m) { m.classList.add('opacity-0'); setTimeout(() => m.classList.add('hidden'), 300); }
function getImageUrl(url) { return url.startsWith('http') ? url : API_BASE_URL + '/' + url; }







// ==========================================
// 🚀 USER REQUEST TRACKING WIDGET (4 STEPS + ANIMATION)
// ==========================================
async function loadUserRequestTracking() {
    try {
        const trackingWidget = document.getElementById('user-tracking-widget');
        if(!trackingWidget) return;

        const data = await apiCall(`/api/waterpark/dashboard/${AppState.currentUser.username}`);
        if (!data || !data.allBookings) return;
        
        let html = '';
        const now = new Date();
        now.setHours(0,0,0,0);

        // Add advanced swimming animation styles if not exists
        if (!document.getElementById('advanced-swimmer-style')) {
            const style = document.createElement('style');
            style.id = 'advanced-swimmer-style';
            style.innerHTML = `
                @keyframes swim-body {
                    0% { transform: translateY(0) rotate(-10deg); }
                    50% { transform: translateY(-8px) rotate(15deg); }
                    100% { transform: translateY(0) rotate(-10deg); }
                }
                @keyframes splash-pulse {
                    0% { opacity: 0; transform: scale(0.2) translateY(5px) rotate(-20deg); }
                    50% { opacity: 1; transform: scale(1.3) translateY(-15px) rotate(10deg); }
                    100% { opacity: 0; transform: scale(0.5) translateY(10px) rotate(20deg); }
                }
                .swimmer-body { 
                    display: inline-block; 
                    animation: swim-body 1.2s infinite ease-in-out; 
                }
                .splash-left { 
                    display: inline-block; 
                    position: absolute;
                    animation: splash-pulse 1.2s infinite ease-in-out; 
                    animation-delay: 0.1s; 
                    left: -18px; top: 15px; font-size: 1.2rem; z-index: 10;
                }
                .splash-right { 
                    display: inline-block; 
                    position: absolute;
                    animation: splash-pulse 1.2s infinite ease-in-out; 
                    animation-delay: 0.6s; 
                    right: -10px; top: 20px; font-size: 1rem; z-index: 10;
                }
                .progress-line { transition: width 1.5s ease-in-out; }
                .swimmer-icon-container { transition: left 1.5s cubic-bezier(0.25, 0.8, 0.25, 1); }
            `;
            document.head.appendChild(style);
        }

        data.allBookings.forEach(booking => {
            const visitDate = new Date(booking.visitDate);
            visitDate.setHours(0,0,0,0);
            
            if (visitDate < now) return; 
            if (!['Pending_Head', 'Pending_HR', 'Approved'].includes(booking.status)) return;
            
            const visitDateStr = new Date(booking.visitDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
            
            // 4 Steps Logic
            // Step 1: Requested (0%)
            // Step 2: Head Approved (33.33%)
            // Step 3: HR Approved (66.66%)
            // Step 4: Visit (100%)
            
            let progressPercent = '0%'; // Pending_Head
            let step2Active = false;
            let step3Active = false;
            
            if (booking.status === 'Pending_HR') {
                progressPercent = '33.33%';
                step2Active = true;
            } else if (booking.status === 'Approved') {
                progressPercent = '66.66%';
                step2Active = true;
                step3Active = true;
            }
            
            const cyanBg = 'background-color: #27aae1; color: white; border-color: #27aae1;';
            const grayBg = 'background-color: white; color: #94a3b8; border-color: #cbd5e1;';
            const cyanText = 'color: #27aae1;';
            const grayText = 'color: #94a3b8;';

            html += `
            <div class="bg-white/90 backdrop-blur-md border border-[#27aae1]/30 p-6 rounded-3xl shadow-lg relative overflow-hidden mb-6">
                <div class="absolute bottom-0 left-0 right-0 h-16 opacity-20 pointer-events-none" style="background: radial-gradient(circle at 50% 100%, #27aae1 0%, transparent 70%);"></div>
                
                <div class="mb-8 relative z-10">
                    <h3 class="text-[#0054a8] font-bold text-xl flex items-center gap-2">🎟️ คำขอเข้าสวนน้ำ Vana Nava</h3>
                    <p class="text-slate-500 text-sm mt-1 ml-7">วันที่ต้องการเข้า: <span class="font-bold text-slate-700">${visitDateStr}</span></p>
                </div>
                
                <div class="relative w-full max-w-2xl mx-auto mt-12 mb-4 px-4">
                    
                    <div class="absolute top-4 left-4 right-4 h-1.5 bg-slate-200 rounded-full z-0"></div>
                    <div class="absolute top-4 left-4 h-1.5 bg-[#27aae1] rounded-full z-0 progress-line" style="width: ${progressPercent};"></div>
                    
                    <!-- Advanced Swimmer Animation -->
                    <div class="absolute top-[-28px] z-20 swimmer-icon-container drop-shadow-md" style="left: calc(${progressPercent} + 0px); margin-left: -15px;">
                        <span class="splash-left">💦</span>
                        <span class="swimmer-body text-4xl">🏊‍♂️</span>
                        <span class="splash-right">💦</span>
                    </div>

                    <div class="flex justify-between relative z-10">
                        <!-- Step 1 -->
                        <div class="flex flex-col items-center" style="width: 65px;">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-md border-2" style="${cyanBg}">1</div>
                            <div class="mt-3 text-xs font-bold text-center whitespace-nowrap" style="${cyanText}">ส่งคำขอ</div>
                        </div>
                        
                        <!-- Step 2 -->
                        <div class="flex flex-col items-center" style="width: 65px;">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-md border-2 transition-all duration-700 delay-300" style="${step2Active ? cyanBg : grayBg}">2</div>
                            <div class="mt-3 text-xs font-bold text-center whitespace-nowrap transition-all duration-700 delay-300" style="${step2Active ? cyanText : grayText}">หน.อนุมัติ</div>
                        </div>
                        
                        <!-- Step 3 -->
                        <div class="flex flex-col items-center" style="width: 65px;">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-md border-2 transition-all duration-700 delay-500" style="${step3Active ? cyanBg : grayBg}">3</div>
                            <div class="mt-3 text-xs font-bold text-center whitespace-nowrap transition-all duration-700 delay-500" style="${step3Active ? cyanText : grayText}">HR อนุมัติ</div>
                        </div>

                        <!-- Step 4 -->
                        <div class="flex flex-col items-center" style="width: 65px;">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-md border-2" style="${grayBg}">4</div>
                            <div class="mt-3 text-xs font-bold text-center whitespace-nowrap" style="${grayText}">เข้าสวนน้ำ</div>
                        </div>
                    </div>
                </div>
            </div>`;
        });
        
        if(html) {
            trackingWidget.innerHTML = `<h2 class="text-2xl font-black text-[#0054a8] mb-6 ml-2 flex items-center gap-3"><span class="w-2 h-8 bg-vana-pink rounded-full"></span> ติดตามสถานะคำขอสวัสดิการ</h2>
                                        <div>${html}</div>`;
            trackingWidget.classList.remove('hidden');
        } else {
            trackingWidget.innerHTML = '';
            trackingWidget.classList.add('hidden');
        }
    } catch(err) {
        console.error("Tracker Error:", err);
    }
}

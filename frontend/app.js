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
        document.getElementById('forgot-password-view').innerHTML = '<div class="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center"><p class="text-green-600 font-bold mb-4">✅ ส่งคำขอรีเซ็ตรหัสผ่านแล้ว</p><button onclick="location.reload()" class="text-sm text-slate-500 underline">กลับไปหน้าล็อกอิน</button></div>';
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
        <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mb-8">
            <div class="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
                    <span class="text-2xl">💦</span> รายการรออนุมัติ (สำหรับผู้พิจารณา)
                </h3>
                <span class="bg-rose-100 text-rose-700 text-xs font-bold px-3 py-1 rounded-full animate-pulse">${requests.length} รายการ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-200">
                    <thead class="bg-slate-100">
                        <tr>
                            <th class="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase w-12">ดูข้อมูล</th>
                            <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">วันที่ส่งคำขอ</th>
                            <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">ผู้ขอสิทธิ์</th>
                            <th class="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">วันเข้าใช้บริการ</th>
                            <th class="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase">ผู้ติดตาม</th>
                            <th class="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase">การจัดการ</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-slate-100">
    `;

    requests.forEach(req => {
        const d = new Date(req.visitDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        const reqDate = new Date(req.createdAt).toLocaleDateString('th-TH');
        const freeCount = req.guests.filter(g => g.ticketType === 'FREE').length;
        const discountCount = req.guests.filter(g => g.ticketType === '50_DISCOUNT').length;

        let guestsHtml = req.guests.map(g => `
            <div class="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-100 shadow-sm mb-1.5 last:mb-0">
                <span class="text-xs text-slate-700 font-bold flex items-center gap-2">
                    <img src="${getImageUrl(g.idCardImageUrl)}" class="w-8 h-5 object-cover rounded shadow-sm border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity" onclick="openImageModal(this.src)" title="คลิกเพื่อขยายรูป">
                    ${g.fullName}
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${g.ticketType === 'FREE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}">${g.ticketType === 'FREE' ? 'ฟรี' : 'ลด 50%'}</span>
            </div>
        `).join('');
        
        if (req.guests.length === 0) guestsHtml = '<p class="text-[11px] text-slate-400 italic text-center py-2">ไม่มีผู้ติดตาม</p>';

        const accordionId = `accordion-${req._id}`;
        const iconId = `icon-${req._id}`;

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
                <div class="flex justify-center gap-2">
                    <button class="wp-reject-btn bg-white hover:bg-rose-50 text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors" data-id="${req._id}">ปฏิเสธ</button>
                    <button class="wp-approve-btn bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg shadow-sm transition-all" data-id="${req._id}">อนุมัติ</button>
                </div>
            `;
        } else if (req.status === 'Pending_Head') {
            actionButtons = `<span class="text-[10px] text-yellow-600 font-bold bg-yellow-50 px-2 py-1 rounded border border-yellow-100">รอหัวหน้าแผนก</span>`;
        }

        html += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 text-center">
                    <!-- ปุ่มเปิด-ปิด ข้อมูล -->
                    <button onclick="document.getElementById('${accordionId}').classList.toggle('hidden'); document.getElementById('${iconId}').classList.toggle('-rotate-90');" class="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all border border-slate-200">
                        <svg id="${iconId}" class="w-4 h-4 transition-transform duration-300 transform -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                </td>
                <td class="px-4 py-3 text-xs text-slate-500 font-medium">${reqDate}</td>
                <td class="px-4 py-3 text-sm font-bold text-slate-800">${req.username}</td>
                <td class="px-4 py-3 text-sm font-bold text-cyan-600">${d}</td>
                <td class="px-4 py-3 text-center">
                    <span class="text-[10px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">${req.guests.length} คน</span>
                </td>
                <td class="px-4 py-3 text-center">
                    ${actionButtons}
                </td>
            </tr>
            <!-- ส่วนที่ซ่อนอยู่ (Accordion) -->
            <tr id="${accordionId}" class="hidden bg-slate-50/80 shadow-inner">
                <td colspan="6" class="px-6 py-4 border-b border-slate-200">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                            <p class="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-2">📋 ข้อมูลทั่วไป</p>
                            <p class="text-xs text-slate-700 mb-1.5">รหัสรายการ: <span class="font-bold text-slate-900">${req.bookingId}</span></p>
                            <p class="text-xs text-slate-700 mb-1.5">พนักงานเข้าสวนน้ำด้วย: <span class="font-bold ${req.isEmployeeEntering ? 'text-emerald-600' : 'text-slate-500'}">${req.isEmployeeEntering ? 'ใช่ (ฟรี)' : 'ไม่เข้า'}</span></p>
                            <div class="mt-3 flex gap-2">
                                <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 shadow-sm">สิทธิ์ฟรี: ${freeCount}</span>
                                <span class="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 shadow-sm">ลด 50%: ${discountCount}</span>
                            </div>
                        </div>
                        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                            <p class="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-2">👥 รายชื่อผู้ติดตาม</p>
                            <div class="max-h-32 overflow-y-auto pr-2 space-y-1.5">
                                ${guestsHtml}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
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
                <button class="absolute -top-3 -right-3 bg-slate-800 text-white rounded-full p-1.5 shadow-lg hover:bg-rose-500 transition-colors z-10 border border-slate-600" onclick="closeImageModal()">
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
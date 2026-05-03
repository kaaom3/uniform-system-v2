// --- Global variables ---
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = isLocalhost ? 'http://localhost:3000' : 'https://uniform-system-hg0e.onrender.com';

let currentUser = null;
let masterStock = [];
let userApprovedItems = []; 
let allRequestsData = [];
let allUsersData = [];
let allAdminLogData = [];
let currentHistoryPage = 1, currentLogPage = 1, currentUserPage = 1;
const rowsPerPage = 10;
let pollingInterval = null;
let currentPendingRequests = [];

// ==========================================
// 🚀 Helper: ฟังก์ชันสำหรับยิง API หลัก
// ==========================================
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = { method, headers: {} };
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    let data;
    try { data = await response.json(); } catch(e) { data = { error: 'ไม่สามารถอ่านข้อมูลจากเซิร์ฟเวอร์ได้' }; }
    if (!response.ok) throw new Error(data.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ API');
    return data;
}

// ==========================================
// 🏁 Event Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    checkSession();
    
    // Auth & Forgot Password
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    const handleEnterPress = (e) => { if (e.key === 'Enter') handleLogin(); };
    document.getElementById('username')?.addEventListener('keyup', handleEnterPress);
    document.getElementById('password')?.addEventListener('keyup', handleEnterPress);

    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('show-forgot-password-options')?.addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('forgot-password-options-container').classList.remove('hidden');
        document.getElementById('show-forgot-password-options').classList.add('hidden');
    });
    document.getElementById('forgot-password-link')?.addEventListener('click', showForgotPasswordView);
    document.getElementById('back-to-login-link')?.addEventListener('click', showLoginView);
    
    // ลืมรหัสผ่าน
    document.getElementById('check-reset-status-btn')?.addEventListener('click', handleForgotPasswordRequest);
    document.getElementById('force-change-password-btn')?.addEventListener('click', handleForceChangePassword);
    
    // Main App
    document.getElementById('request-btn')?.addEventListener('click', handleSubmitRequest);
    document.getElementById('request-reason-type')?.addEventListener('change', toggleRequestForm);
    document.getElementById('request-type')?.addEventListener('change', populateSizeDropdown);
    document.getElementById('request-size')?.addEventListener('change', displaySelectedItemImage); 
    document.getElementById('return-item-select')?.addEventListener('change', handleReturnableItemSelection);
    document.getElementById('my-history-header')?.addEventListener('click', toggleMyHistory);
    document.getElementById('my-requests-header')?.addEventListener('click', toggleMyRequests);

    // Admin Stock & Users
    document.getElementById('update-stock-btn')?.addEventListener('click', handleCreateNewStockItem);
    document.getElementById('clear-stock-form-btn')?.addEventListener('click', clearStockForm);
    
    // อัปโหลดไฟล์รูปภาพ
    document.getElementById('stock-image-upload')?.addEventListener('change', handleImageUpload);
    
    document.getElementById('save-user-btn')?.addEventListener('click', handleSaveUser);
    document.getElementById('clear-user-form-btn')?.addEventListener('click', clearUserForm);
    
    // นำเข้า CSV
    document.getElementById('import-users-btn')?.addEventListener('click', handleImportUsersCSV);
    
    document.getElementById('user-search-input')?.addEventListener('keyup', handleUserSearch);
    document.getElementById('prev-user-page-btn')?.addEventListener('click', () => changeUserPage(-1));
    document.getElementById('next-user-page-btn')?.addEventListener('click', () => changeUserPage(1));
    document.getElementById('toggle-stock-form-btn')?.addEventListener('click', () => toggleStockForm());
    document.getElementById('toggle-user-form-btn')?.addEventListener('click', () => toggleUserForm());

    // Admin Panel Tabs & History
    document.getElementById('admin-dashboard-panel')?.addEventListener('click', (e) => {
        const tabTarget = e.target.closest('.admin-tab');
        if (tabTarget) {
            const tabId = tabTarget.id;
            if (tabId === 'tab-approvals') handleTabClick('approvals');
            else if (tabId === 'tab-password-resets') handleTabClick('password-resets');
            else if (tabId === 'tab-stock') handleTabClick('stock');
            else if (tabId === 'tab-users') handleTabClick('users');
            else if (tabId === 'tab-history') handleTabClick('history');
        }
        const filterTarget = e.target.closest('.stock-filter-btn');
        if (filterTarget) handleStockFilter(filterTarget);
    });

    document.getElementById('history-view-selector')?.addEventListener('change', handleHistoryViewChange);
    document.getElementById('admin-history-search')?.addEventListener('keyup', handleHistorySearch);
    document.getElementById('prev-page-btn')?.addEventListener('click', () => changeHistoryPage(-1));
    document.getElementById('next-page-btn')?.addEventListener('click', () => changeHistoryPage(1));
    
    // ดาวน์โหลดประวัติ CSV
    document.getElementById('export-history-btn')?.addEventListener('click', () => {
        window.open(`${API_BASE_URL}/api/export/history`, '_blank');
    });

    document.getElementById('admin-log-search')?.addEventListener('keyup', handleLogSearch);
    document.getElementById('prev-log-page-btn')?.addEventListener('click', () => changeLogPage(-1));
    document.getElementById('next-log-page-btn')?.addEventListener('click', () => changeLogPage(1));
    
    // Modals
    document.getElementById('history-modal-close-btn')?.addEventListener('click', closeHistoryModal);
    document.getElementById('user-history-modal')?.addEventListener('click', (e) => { if (e.target.id === 'user-history-modal') closeHistoryModal(); });
});

// --- Event Delegation ---
document.addEventListener('click', async function(e) {
    if (!currentUser) return;

    // Admin: อนุมัติรีเซ็ตรหัสผ่าน
    if (e.target.matches('.approve-reset-btn')) {
        const id = e.target.dataset.id;
        const username = e.target.dataset.user;
        showPromptModal(`ตั้งรหัสผ่านชั่วคราวให้ ${username}:`, async (newPassword) => {
            if(newPassword.length < 4) return showNotification("รหัสผ่านต้องมี 4 ตัวอักษรขึ้นไป", "error");
            showLoadingButton(e.target, true);
            try {
                await apiCall('/api/admin/approve-reset', 'POST', { resetId: id, username, newPassword, adminUser: currentUser.username });
                onAdminActionSuccess(`อนุมัติรีเซ็ตรหัสผ่านสำหรับ ${username} สำเร็จ`);
            } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'อนุมัติ / ตั้งรหัสใหม่'); }
        });
    }

    // Admin: อนุมัติเบิกพัสดุ
    if (e.target.matches('.approve-btn')) {
        const id = e.target.dataset.id;
        const card = e.target.closest('.approval-card');
        const quantityInput = card.querySelector('.approval-quantity-input');
        const reasonInput = card.querySelector('.approval-reason-input');
        
        // 🔒 ตรวจสอบหาค่า Radio มือ 1 / มือ 2 ให้ชัวร์ 100%
        const stockTypeRadios = card.querySelectorAll(`input[name="approve-stock-type-${id}"]`);
        let stockType = 'New';
        stockTypeRadios.forEach(radio => {
            if (radio.checked) stockType = radio.value;
        });
        
        const approvedQuantity = parseInt(quantityInput.value);
        const originalQuantity = parseInt(quantityInput.max);
        const reason = reasonInput.value.trim();
        
        // ดึงค่ายอดคงเหลือล่าสุดที่ถูกฝังไว้ใน Dataset
        const newStock = parseInt(card.dataset.newStock) || 0;
        const usedStock = parseInt(card.dataset.usedStock) || 0;

        if (isNaN(approvedQuantity) || approvedQuantity <= 0 || approvedQuantity > originalQuantity) {
            return showNotification(`จำนวนที่อนุมัติต้องอยู่ระหว่าง 1 ถึง ${originalQuantity}`, 'error');
        }

        // 🔒 ตรวจสอบสต็อกฝั่งหน้าเว็บให้ครอบคลุมก่อนส่งไปหลังบ้าน
        if (stockType === 'Used' && approvedQuantity > usedStock) {
            return showNotification(`❌ สต็อกมือสองไม่เพียงพอ (เหลือ ${usedStock} ชิ้น)`, 'error');
        }
        if (stockType === 'New' && approvedQuantity > newStock) {
            return showNotification(`❌ สต็อกของใหม่ไม่เพียงพอ (เหลือ ${newStock} ชิ้น)`, 'error');
        }
        
        showLoadingButton(e.target, true);
        try {
            await apiCall('/api/admin/approve', 'POST', { requestId: id, approvedQuantity, reason, stockType, adminUser: currentUser.username });
            onAdminActionSuccess(`อนุมัติรายการสำเร็จ (ตัดสต็อก${stockType === 'Used' ? 'มือสอง' : 'ใหม่'})`);
        } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'อนุมัติคำขอ'); }
    }

    // Admin: ปฏิเสธการเบิก
    if (e.target.matches('.reject-btn')) {
        const id = e.target.dataset.id;
        showPromptModal("กรุณาระบุเหตุผลที่ปฏิเสธ:", async (reason) => {
            showLoadingButton(e.target, true);
            try {
                await apiCall('/api/admin/reject', 'POST', { requestId: id, reason, adminUser: currentUser.username });
                onAdminActionSuccess('ปฏิเสธรายการสำเร็จ');
            } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'ปฏิเสธ'); }
        });
    }

    // Admin: ดำเนินการรับคืน
    if (e.target.matches('.process-return-btn')) {
        const id = e.target.dataset.id;
        const returnConditionEl = document.querySelector(`input[name="return-condition-${id}"]:checked`);
        const disbursementTypeEl = document.querySelector(`input[name="disburse-type-${id}"]:checked`);
        if (!returnConditionEl || !disbursementTypeEl) return showNotification('กรุณาเลือกตัวเลือกให้ครบถ้วน', 'error');
        
        let damageReason = '';
        if (returnConditionEl.value === 'Damaged') {
            damageReason = document.getElementById(`damage-reason-${id}`).value.trim();
            if (!damageReason) return showNotification('กรุณากรอกเหตุผลที่ชำรุด', 'error');
        }
        
        showLoadingButton(e.target, true);
        try {
            if (disbursementTypeEl.value === 'None') {
                await apiCall('/api/admin/return-only', 'POST', { requestId: id, returnCondition: returnConditionEl.value, damageReason, adminUser: currentUser.username });
            } else {
                await apiCall('/api/admin/return-disburse', 'POST', { requestId: id, returnCondition: returnConditionEl.value, disbursementType: disbursementTypeEl.value, damageReason, adminUser: currentUser.username });
            }
            onAdminActionSuccess('ดำเนินการรับคืนสำเร็จ');
        } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'ยืนยันรับคืน'); }
    }
    
    // Admin: ปฏิเสธการคืนสินค้า
    if (e.target.matches('.reject-return-btn')) {
        const id = e.target.dataset.id;
        showPromptModal("กรุณาระบุเหตุผลที่ปฏิเสธการคืน:", async (reason) => {
            showLoadingButton(e.target, true);
            try {
                await apiCall('/api/admin/reject', 'POST', { requestId: id, reason, adminUser: currentUser.username });
                onAdminActionSuccess('ปฏิเสธการคืนสำเร็จ');
            } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'ปฏิเสธการคืน'); }
        });
    }

    // Admin: รับเข้าสต๊อก (Ledger)
    if (e.target.matches('.receive-stock-btn')) {
        const type = e.target.dataset.type; const size = e.target.dataset.size;
        showPromptModal(`รับของเข้า: ${type} (${size})\nกรอกจำนวนที่รับเข้า (ชิ้น):`, async (qtyStr) => {
            const qty = parseInt(qtyStr);
            if (isNaN(qty) || qty <= 0) return showNotification('กรุณากรอกจำนวนให้ถูกต้อง', 'error');
            showLoadingButton(e.target, true);
            try {
                await apiCall('/api/stock/transaction', 'POST', { itemType: type, size: size, transactionType: 'IN', quantity: qty, reason: 'รับพัสดุเข้าใหม่', adminUser: currentUser.username });
                onAdminActionSuccess(`รับเข้าสต๊อก ${type} จำนวน ${qty} ชิ้น สำเร็จ`);
            } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, '+ รับเข้า'); }
        });
    }

    // Admin: ปรับปรุงยอดสต๊อก (Ledger)
    if (e.target.matches('.adjust-stock-btn')) {
        const type = e.target.dataset.type; const size = e.target.dataset.size;
        showPromptModal(`ปรับปรุงยอดของใหม่: ${type} (${size})\nกรอก "ยอดคงเหลือสุทธิ" ที่นับได้:`, async (qtyStr) => {
            const qty = parseInt(qtyStr);
            if (isNaN(qty) || qty < 0) return showNotification('กรุณากรอกยอดคงเหลือสุทธิให้ถูกต้อง', 'error');
            setTimeout(() => {
                showPromptModal(`เหตุผลในการปรับปรุงยอด:`, async (reason) => {
                    showLoadingButton(e.target, true);
                    try {
                        await apiCall('/api/stock/transaction', 'POST', { itemType: type, size: size, transactionType: 'ADJUST', newBalance: qty, reason: reason, adminUser: currentUser.username });
                        onAdminActionSuccess(`ปรับปรุงยอดสต๊อกสำเร็จ`);
                    } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, '✎ ปรับปรุง'); }
                });
            }, 300);
        });
    }

    // Admin: ดูประวัติสต๊อก
    if (e.target.matches('.history-stock-btn')) {
        const type = e.target.dataset.type; const size = e.target.dataset.size;
        openHistoryModal(`ความเคลื่อนไหวสต๊อก: ${type} (${size})`);
        try {
            const history = await apiCall(`/api/stock/history?itemType=${encodeURIComponent(type)}&size=${encodeURIComponent(size)}`);
            let html = '<ul class="space-y-3 mt-4">';
            if(history.length === 0) html += '<p class="text-center text-slate-500">ไม่มีประวัติความเคลื่อนไหว</p>';
            history.forEach(log => {
                let badgeColor = log.transactionType === 'IN' ? 'bg-emerald-100 text-emerald-700' : log.transactionType === 'OUT' ? 'bg-rose-100 text-red-700' : 'bg-amber-100 text-amber-700';
                html += `<li class="p-3 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-start"><div><p class="font-bold text-slate-800 text-sm"><span class="px-2 py-0.5 rounded-md text-[10px] ${badgeColor}">${log.transactionType}</span> ${log.quantity > 0 ? '+'+log.quantity : log.quantity} ชิ้น</p><p class="text-xs text-slate-500 mt-1">เหตุผล: ${log.reason || '-'}</p><p class="text-[10px] text-slate-400 mt-1">ทำรายการโดย: ${log.adminUser}</p></div><span class="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded border">${new Date(log.createdAt).toLocaleString()}</span></li>`;
            });
            html += '</ul>';
            document.getElementById('history-modal-content').innerHTML = html;
        } catch(e) { document.getElementById('history-modal-content').innerHTML = '<p class="text-center text-red-500 mt-4">ไม่มี API รองรับ หรือ เกิดข้อผิดพลาด</p>'; }
    }

    // Admin: ผู้ใช้ (แก้ไข, ลบ, รีเซ็ตรหัสผ่าน)
    if (e.target.matches('.edit-user-btn')) populateUserForm(e.target.dataset.username);
    
    if (e.target.matches('.reset-password-btn')) {
        const username = e.target.dataset.username;
        showPromptModal(`กรอกรหัสผ่านชั่วคราวสำหรับ ${username}:`, async (newPassword) => {
            if (newPassword.length < 4) return showNotification("รหัสผ่านต้องมี 4 ตัวอักษรขึ้นไป", "error");
            showLoadingButton(e.target, true);
            try {
                await apiCall('/api/auth/change-password', 'POST', { username, newPassword, forceChange: true });
                onAdminActionSuccess(`รีเซ็ตรหัสผ่านสำหรับ ${username} สำเร็จ`);
            } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'รหัส'); }
        });
    }
    
    if (e.target.matches('.delete-user-btn')) {
        const username = e.target.dataset.username;
        if (username === currentUser.username) return showNotification('ไม่สามารถลบตัวเองได้', 'error');
        showConfirmModal(`ยืนยันการลบผู้ใช้ ${username}?`, async () => {
            showLoadingButton(e.target, true);
            try {
                await apiCall(`/api/users/${username}`, 'DELETE', { adminUser: currentUser.username });
                onAdminActionSuccess('ลบผู้ใช้สำเร็จ');
            } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'ลบ'); }
        });
    }

    // เปิด Modal ประวัติเบิกผู้ใช้
    if (e.target.matches('.view-history-btn') || e.target.matches('.clickable-username')) {
        e.preventDefault();
        const username = e.target.dataset.requesterName || e.target.dataset.username;
        openHistoryModal(username);
        try {
            const summary = await apiCall(`/api/requests/me?username=${username}`);
            const totalItems = summary.reduce((acc, req) => req.status === 'Approved' ? acc + req.quantity : acc, 0);
            document.getElementById('history-modal-content').innerHTML = `<div class="grid grid-cols-2 gap-4 text-center mt-4"><div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100"><p class="text-sm font-bold text-indigo-800">คำขอทั้งหมด</p><p class="text-3xl font-black text-indigo-600">${summary.length || 0}</p></div><div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100"><p class="text-sm font-bold text-emerald-800">พัสดุที่เคยเบิก</p><p class="text-3xl font-black text-emerald-600">${totalItems}</p></div></div>`;
        } catch(e) { document.getElementById('history-modal-content').innerHTML = '<p class="text-center text-red-500 mt-4">ไม่สามารถโหลดข้อมูลได้</p>'; }
    }
});

// ฟังชั่นการเปลี่ยนสถานะรับคืน
document.addEventListener('change', function(e) {
    if (e.target.matches('input[name^="return-condition-"]')) {
        const id = e.target.name.replace('return-condition-', '');
        const reasonDiv = document.getElementById(`damage-reason-div-${id}`);
        if (e.target.value === 'Damaged') reasonDiv.classList.remove('hidden');
        else reasonDiv.classList.add('hidden');
    }
});

// ==========================================
// 🔑 ระบบ Login / Logout / Change Password
// ==========================================
function checkSession() {
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) { try { onLoginSuccess(JSON.parse(storedUser)); } catch (e) { sessionStorage.removeItem('currentUser'); } }
}

async function handleLogin() {
    const loginBtn = document.getElementById('login-btn');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!username || !password) return document.getElementById('login-error').textContent = "กรุณากรอกข้อมูลให้ครบถ้วน";

    showLoadingButton(loginBtn, true);
    try {
        const data = await apiCall('/api/auth/login', 'POST', { username, password });
        onLoginSuccess(data);
    } catch (error) {
        showLoadingButton(loginBtn, false, 'เข้าสู่ระบบ');
        document.getElementById('login-error').textContent = error.message;
    }
}

function onLoginSuccess(user) {
    showLoadingButton(document.getElementById('login-btn'), false, 'เข้าสู่ระบบ');
    if (user.mustChangePassword) { currentUser = user; showForceChangePasswordModal(); return; }

    currentUser = user; sessionStorage.setItem('currentUser', JSON.stringify(user));
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-department').textContent = user.department || '-';
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    document.getElementById('login-error').textContent = '';

    if (user.role === 'admin') {
        document.getElementById('admin-dashboard-panel').classList.remove('hidden');
        document.getElementById('admin-dashboard-panel').classList.add('flex');
        startPollingForUpdates();
    } else {
        document.getElementById('admin-dashboard-panel').classList.add('hidden');
        document.getElementById('admin-dashboard-panel').classList.remove('flex');
    }
    loadInitialData();
}

function handleLogout() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    sessionStorage.removeItem('currentUser'); currentUser = null;
    document.getElementById('admin-dashboard-panel').classList.add('hidden');
    document.getElementById('admin-dashboard-panel').classList.remove('flex');
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

// ==========================================
// 📦 ดึงข้อมูลหลัก (Data Fetching) จาก Backend
// ==========================================
async function loadInitialData() {
    if (!currentUser) return;
    try {
        const [stockData, requestsData, holdingsData] = await Promise.all([
            apiCall('/api/stock'), apiCall(`/api/requests/me?username=${currentUser.username}`), apiCall(`/api/requests/holdings?username=${currentUser.username}`)
        ]);

        onStockReceived(stockData);
        displayRequests(requestsData, 'my-requests-table', false);
        displayCurrentUserHoldings(holdingsData);
        userApprovedItems = requestsData.filter(r => r.status === 'Approved' && r.quantity > 0);
        populateReturnableItemsDropdown();

        if (currentUser.role === 'admin') loadAdminData();
    } catch (error) { showNotification(error.message, 'error'); }
}

async function loadAdminData() {
    try {
        const [pendingReqs, users, logs, passwordResets] = await Promise.all([
            apiCall('/api/admin/pending-approvals'), apiCall('/api/users'), apiCall('/api/logs'), apiCall('/api/admin/password-resets')
        ]);
        displayPendingApprovals(pendingReqs);
        onUsersReceived(users);
        onAdminLogReceived(logs);
        displayPendingPasswordResets(passwordResets);
        
        const allReqs = await apiCall('/api/requests/all');
        allRequestsData = allReqs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderAllHistoryTable();
    } catch (error) { console.error("Admin Load Error:", error); }
}

function refreshData() { loadInitialData(); }

// ==========================================
// 🔄 รีเฟรชอัตโนมัติ (Polling) สำหรับ Admin
// ==========================================
function startPollingForUpdates() {
    if (pollingInterval) clearInterval(pollingInterval); 
    pollingInterval = setInterval(async () => {
        if (currentUser && currentUser.role === 'admin') {
            try {
                const newRequests = await apiCall('/api/admin/pending-approvals');
                const newRequestIds = newRequests.map(req => req.requestId);
                const currentRequestIds = currentPendingRequests.map(req => req.requestId);

                if (newRequestIds.length !== currentRequestIds.length || newRequestIds.some(id => !currentRequestIds.includes(id))) {
                    showNotification("มีรายการใหม่รออนุมัติ!", 'success');
                    displayPendingApprovals(newRequests); 
                }
            } catch(e) {}
        } else { clearInterval(pollingInterval); }
    }, 15000); 
}

// ==========================================
// 🛒 ระบบเบิก - คืน (User Requests Form)
// ==========================================
async function handleSubmitRequest() {
    const requestBtn = document.getElementById('request-btn');
    const reasonType = document.getElementById('request-reason-type').value;
    showLoadingButton(requestBtn, true);

    try {
        if (reasonType === 'Damaged/Lost') {
            const originalRequestId = document.getElementById('return-item-select').value;
            const quantityToReturn = parseInt(document.getElementById('return-quantity').value);
            const reasonDetails = document.getElementById('return-details').value.trim();
            if (!originalRequestId || !reasonDetails) throw new Error('กรุณาเลือกรายการและระบุเหตุผล');
            
            await apiCall('/api/requests/return', 'POST', { originalRequestId, quantityToReturn, reasonDetails, requesterName: currentUser.name });
            onActionSuccess('ส่งคำขอคืนสำเร็จ');
        } else {
            const requestData = {
                requesterName: currentUser.name, department: currentUser.department,
                itemType: document.getElementById('request-type').value, size: document.getElementById('request-size').value,
                quantity: parseInt(document.getElementById('request-quantity').value) || 0, reason: document.getElementById('request-details').value.trim()
            };
            if (!requestData.itemType || requestData.quantity < 1 || !requestData.reason) throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน');

            await apiCall('/api/requests/new', 'POST', requestData);
            onActionSuccess('ส่งคำขอเบิกสำเร็จ กำลังรอการอนุมัติ');
        }
    } catch (error) { onActionFailure(error); }
}

function onActionSuccess(message) {
    showNotification(message, 'success');
    document.getElementById('request-form')?.reset();
    document.getElementById('return-form')?.reset();
    toggleRequestForm(); resetActionButtons(); refreshData();
}

function onAdminActionSuccess(message) {
    showNotification(message, 'success');
    clearStockForm(); clearUserForm(); resetActionButtons(); refreshData();
}

function onActionFailure(error) { showNotification(error.message, 'error'); resetActionButtons(); }

// ==========================================
// 🏢 การแสดงผล (UI Rendering)
// ==========================================
function onStockReceived(newStockData) {
    masterStock = newStockData;
    populateTypeDropdown();
    if (currentUser && currentUser.role === 'admin') {
        const activeFilter = document.querySelector('.stock-filter-btn.bg-indigo-600');
        if(activeFilter) handleStockFilter(activeFilter); else displayStockSummary(masterStock);
        
        const lowStock = masterStock.filter(item => item.newStock > 0 && item.newStock <= (item.lowStockThreshold || 5));
        const alertList = document.getElementById('low-stock-alert-list');
        const alertBanner = document.getElementById('low-stock-alert-banner');
        if (alertList && alertBanner) {
            if (lowStock.length > 0) {
                alertList.innerHTML = lowStock.map(item => `<li>${item.itemType} (${item.size}) - เหลือ ${item.newStock} ชิ้น</li>`).join('');
                alertBanner.classList.remove('hidden'); document.getElementById('stock-alert-badge')?.classList.remove('hidden');
            } else {
                alertBanner.classList.add('hidden'); document.getElementById('stock-alert-badge')?.classList.add('hidden');
            }
        }
    }
}

function populateTypeDropdown() {
    const typeSelect = document.getElementById('request-type');
    if(!typeSelect) return;
    const uniqueTypes = [...new Set(masterStock.map(item => item.itemType))];
    typeSelect.innerHTML = '<option value="">-- เลือกประเภท --</option>';
    uniqueTypes.forEach(type => { if(type) typeSelect.add(new Option(type, type)); });
}

function populateSizeDropdown() {
    const typeSelect = document.getElementById('request-type');
    const sizeSelect = document.getElementById('request-size');
    const availableItems = masterStock.filter(item => item.itemType === typeSelect.value);
    sizeSelect.innerHTML = '<option value="">-- เลือกขนาด --</option>';
    availableItems.forEach(item => { if(item.size) sizeSelect.add(new Option(`${item.size} (คงเหลือ: ${item.newStock} ชิ้น)`, item.size)); });
    displaySelectedItemImage();
}

function displaySelectedItemImage() {
    const stockItem = masterStock.find(item => item.itemType === document.getElementById('request-type').value && item.size === document.getElementById('request-size').value);
    const previewContainer = document.getElementById('item-image-preview-container');
    if (stockItem && stockItem.imageUrl) {
        document.getElementById('item-image-preview').src = API_BASE_URL + stockItem.imageUrl; 
        previewContainer.classList.remove('hidden');
    } else { previewContainer.classList.add('hidden'); }
}

function populateReturnableItemsDropdown() {
    const select = document.getElementById('return-item-select');
    if(!select) return;
    select.innerHTML = ''; document.getElementById('return-quantity-wrapper')?.classList.add('hidden');
    if (userApprovedItems && userApprovedItems.length > 0) {
        select.disabled = false; select.innerHTML = '<option value="">-- เลือกรายการที่เคยเบิก --</option>';
        userApprovedItems.forEach(item => { select.add(new Option(`${item.itemType} (ไซส์ ${item.size}) - คงเหลือ ${item.quantity} ชิ้น`, item.requestId)); });
    } else { select.disabled = true; select.add(new Option('ไม่พบรายการที่สามารถคืนได้', '')); }
}

function handleReturnableItemSelection() {
    const select = document.getElementById('return-item-select');
    const quantityWrapper = document.getElementById('return-quantity-wrapper');
    const quantityInput = document.getElementById('return-quantity');
    const selectedItem = userApprovedItems.find(item => item.requestId === select.value);
    if (selectedItem) { quantityInput.value = 1; quantityInput.max = selectedItem.quantity; quantityWrapper.classList.remove('hidden'); } 
    else { quantityWrapper.classList.add('hidden'); }
}

function displayRequests(requests, tableId, isAdminView) {
    const tableBody = document.getElementById(tableId);
    if(!tableBody) return;
    tableBody.innerHTML = '';
    const colspan = isAdminView ? 6 : 5;
    if (!requests || requests.length === 0) return tableBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center p-4 text-gray-500">ไม่พบข้อมูล</td></tr>`;

    requests.forEach(req => {
        let actionButton = (!isAdminView && req.status === 'Approved' && req.quantity > 0) ? `<span>สามารถคืนได้ในฟอร์มซ้ายมือ</span>` : '-';
        const safeStatus = (req.status || 'unknown').replace(' ', '-').toLowerCase();
        const statusMap = {'pending':'status-pending','approved':'status-approved','rejected':'status-rejected','returned':'status-returned','pending-return':'status-pending-return'};
        const statusClass = statusMap[safeStatus] || 'bg-gray-200 text-gray-800';
        const requesterCell = isAdminView ? `<td class="p-2 text-sm text-gray-700 font-medium">${req.requesterName}</td>` : '';

        tableBody.innerHTML += `<tr>
            <td class="p-2 text-sm text-gray-600 whitespace-nowrap">${new Date(req.createdAt).toLocaleString()}</td>
            ${requesterCell}
            <td class="p-2 text-sm font-medium text-gray-800">${req.itemType} (ไซส์ ${req.size}) x ${req.quantity}</td>
            <td class="p-2 text-sm"><span class="px-2 py-1 font-semibold leading-tight text-xs rounded-full ${statusClass}">${req.status}</span></td>
            <td class="p-2 text-xs text-gray-500">${req.notes || '-'}</td>
            <td class="p-2 text-sm">${actionButton}</td>
        </tr>`;
    });
}

function displayCurrentUserHoldings(holdings) {
    const listDiv = document.getElementById('my-holdings-list');
    if(!listDiv) return;
    listDiv.innerHTML = '';
    if (!holdings || Object.keys(holdings).length === 0 || holdings.error) return listDiv.innerHTML = `<p class="text-center text-gray-500">คุณไม่มีพัสดุที่ถือครองอยู่</p>`;
    
    const ul = document.createElement('ul'); ul.className = 'space-y-2';
    for (const item in holdings) ul.innerHTML += `<li class="flex justify-between items-center text-sm bg-gray-50 p-2 rounded"><span class="font-medium text-gray-700">${item}</span><span class="font-bold text-gray-900">${holdings[item]} ชิ้น</span></li>`;
    listDiv.appendChild(ul);
}

function displayPendingApprovals(requests) {
    const list = document.getElementById('pending-approvals-list');
    if(!list) return;
    list.innerHTML = ''; currentPendingRequests = requests;
    if (!requests || requests.length === 0) return list.innerHTML = '<p class="text-center p-4 text-gray-500">ไม่มีรายการรออนุมัติ</p>';
    
    requests.forEach(req => {
        const { requestId: id, createdAt: time, requesterName: name, department: dept, itemType: type, size, quantity: qty, reason, status } = req;
        const card = document.createElement('div'); card.className = 'border rounded-lg p-4 bg-gray-50 approval-card shadow-sm border border-slate-200';
        let content;
        const historyButton = `<button class="view-history-btn text-xs text-indigo-500 hover:text-indigo-700 font-bold hover:underline" data-requester-name="${name}">ดูประวัติเบิก</button>`;
        
        if (status === 'Pending Return') {
            const stockItem = masterStock.find(stock => stock.itemType === type && stock.size === size);
            content = `<div class="flex justify-between items-start mb-3"><div><p class="font-bold text-slate-800">ขอคืน: ${type} (ไซส์ ${size}) x ${qty}</p><p class="text-xs text-slate-500 mt-1">ผู้ขอคืน: <span class="font-semibold text-slate-700">${name}</span> (${dept}) &middot; ${historyButton}</p><p class="text-xs text-slate-500 mt-1">เหตุผล: ${reason}</p></div><div class="text-xs font-semibold text-slate-400 whitespace-nowrap bg-white px-2 py-1 rounded-lg border">${new Date(time).toLocaleString()}</div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-200 pt-3 mt-2"><div class="bg-white p-3 rounded-lg border border-slate-100"><p class="font-bold text-xs text-indigo-700 mb-2 uppercase">1. ประเมินของที่รับคืน</p><div class="flex flex-col space-y-2"><label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="return-condition-${id}" value="Used" class="form-radio h-4 w-4 text-indigo-600"><span class="ml-2">คืนเป็นของมือสอง (ใช้ต่อได้)</span></label><label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="return-condition-${id}" value="Damaged" class="form-radio h-4 w-4 text-red-600"><span class="ml-2">คืนเป็นของชำรุด (ทิ้ง/ซ่อม)</span></label></div><div id="damage-reason-div-${id}" class="hidden mt-2"><input type="text" id="damage-reason-${id}" placeholder="ระบุเหตุผลที่ชำรุด..." class="w-full text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"></div></div><div class="bg-white p-3 rounded-lg border border-slate-100"><p class="font-bold text-xs text-indigo-700 mb-2 uppercase">2. เลือกการเบิกจ่ายทดแทน</p><div class="flex flex-col space-y-2"><label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="disburse-type-${id}" value="New" class="form-radio h-4 w-4 text-emerald-600"><span class="ml-2">เบิกของใหม่ให้ <span class="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded ml-1">เหลือ ${stockItem ? stockItem.newStock : 0}</span></span></label><label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="disburse-type-${id}" value="None" class="form-radio h-4 w-4 text-slate-500"><span class="ml-2">ไม่เบิกจ่าย (รับคืนอย่างเดียว)</span></label></div></div></div><div class="flex justify-end items-center gap-3 mt-4 border-t border-slate-200 pt-3"><button data-id="${id}" class="reject-return-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-lg transition-colors">ปฏิเสธการคืน</button><button data-id="${id}" class="process-return-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md shadow-indigo-200 transition-all">ยืนยันรับคืน</button></div>`;
        } else {
            const stockItem = masterStock.find(stock => stock.itemType === type && stock.size === size);
            const newStockQty = stockItem ? stockItem.newStock : 0;
            const usedStockQty = stockItem ? stockItem.usedStock : 0;
            
            // 🔒 ฝังข้อมูลยอดสต็อกปัจจุบันเข้าไปใน Card เพื่อใช้เช็คตอนกดอนุมัติ
            card.dataset.newStock = newStockQty;
            card.dataset.usedStock = usedStockQty;
            
            content = `<div class="flex justify-between items-start"><div><p class="font-bold text-slate-800 text-lg">ขอเบิก: ${type} (ไซส์ ${size})</p><p class="text-xs text-slate-500 mt-1">ผู้ขอเบิก: <span class="font-semibold text-slate-700">${name}</span> (${dept}) &middot; ${historyButton}</p><p class="text-xs text-slate-600 mt-2 bg-white p-2 rounded-lg border border-slate-100"><span class="font-bold">เหตุผล:</span> ${reason}</p></div><div class="text-xs font-semibold text-slate-400 whitespace-nowrap bg-white px-2 py-1 rounded-lg border">${new Date(time).toLocaleString()}</div></div><div class="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-slate-200"><div class="md:col-span-2"><label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">เลือกประเภทสต็อกที่จะตัด</label><div class="flex flex-col space-y-1 bg-white p-2 rounded-lg border border-slate-200"><label class="inline-flex items-center text-xs font-medium text-slate-700"><input type="radio" name="approve-stock-type-${id}" value="New" checked class="form-radio h-3 w-3 text-indigo-600"><span class="ml-2">ของใหม่ (เหลือ ${newStockQty})</span></label><label class="inline-flex items-center text-xs font-medium text-slate-700"><input type="radio" name="approve-stock-type-${id}" value="Used" class="form-radio h-3 w-3 text-blue-600"><span class="ml-2">มือสอง (เหลือ ${usedStockQty})</span></label></div></div><div class="md:col-span-1"><label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">จำนวนอนุมัติ</label><input type="number" value="${qty}" min="1" max="${qty}" class="approval-quantity-input w-full py-2 px-3 border border-slate-200 rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-indigo-500 outline-none"></div><div class="md:col-span-2"><label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">หมายเหตุให้ผู้เบิก</label><input type="text" placeholder="เช่น สต็อกไม่พอ..." class="approval-reason-input w-full py-2 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"></div></div><div class="flex justify-end items-center gap-3 mt-4 pt-2"><button data-id="${id}" class="reject-btn bg-rose-50 hover:bg-rose-100 text-red-600 text-xs font-bold py-2 px-4 rounded-lg transition-colors">ปฏิเสธ</button><button data-id="${id}" class="approve-btn bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md shadow-emerald-200 transition-all">อนุมัติคำขอ</button></div>`;
        }
        card.innerHTML = content; list.appendChild(card);
    });
}

function displayPendingPasswordResets(resets) {
    const list = document.getElementById('pending-password-resets-list');
    if(!list) return;
    list.innerHTML = '';
    if(resets.length === 0) { list.innerHTML = '<p class="text-gray-500 text-center p-4">ไม่มีคำขอรีเซ็ตรหัสผ่านในขณะนี้</p>'; return; }
    
    resets.forEach(req => {
        list.innerHTML += `<div class="p-4 bg-white border border-slate-200 shadow-sm rounded-xl mb-3 flex justify-between items-center">
            <div>
                <p class="font-bold text-slate-800 text-lg">รหัสพนักงาน: <span class="text-indigo-600">${req.username}</span></p>
                <p class="text-xs text-slate-500 mt-1">เวลาส่งคำขอ: ${new Date(req.createdAt).toLocaleString()}</p>
            </div>
            <button class="approve-reset-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-md shadow-indigo-200 transition-all" data-id="${req._id}" data-user="${req.username}">อนุมัติ / ตั้งรหัสใหม่</button>
        </div>`;
    });
}

// ==========================================
// 💡 Admin: New Stock UI & Functions 
// ==========================================
function displayStockSummary(stockData) {
    const container = document.getElementById('stock-summary-container');
    if(!container) return;
    container.innerHTML = '';
    if (!stockData || stockData.length === 0) return container.innerHTML = '<p class="text-center p-4 text-gray-500">ไม่พบข้อมูลสต็อก</p>';

    const groupedByCategory = stockData.reduce((acc, item) => {
        const cat = item.category || 'Uncategorized'; if (!acc[cat]) acc[cat] = []; acc[cat].push(item); return acc;
    }, {});

    for (const category in groupedByCategory) {
        container.innerHTML += `<h4 class="text-sm font-black text-slate-400 uppercase tracking-wider mb-2 mt-6 pl-1">${category}</h4>`;
        const table = document.createElement('table'); table.className = 'min-w-full divide-y divide-slate-200 mb-4 border bg-white';
        table.innerHTML = `<thead class="bg-slate-50"><tr><th class="w-16">รูป</th><th>รายการพัสดุ</th><th class="text-center">ยอดของใหม่</th><th class="text-center">ยอดรวมอื่นๆ</th><th class="text-center">จัดการสต๊อก (Ledger)</th></tr></thead><tbody class="divide-y divide-slate-100"></tbody>`;
        const tbody = table.querySelector('tbody');
        groupedByCategory[category].forEach(item => {
            const tr = document.createElement('tr'); if (item.newStock <= (item.lowStockThreshold || 5)) tr.classList.add('bg-red-50/50');
            const img = item.imageUrl ? (API_BASE_URL + item.imageUrl) : 'https://placehold.co/80x60/e2e8f0/64748b?text=N/A';
            tr.innerHTML = `<td class="p-2 text-center"><img src="${img}" class="w-12 h-12 object-cover rounded-lg mx-auto border shadow-sm"></td><td class="p-3"><p class="font-bold text-slate-800">${item.itemType}</p><p class="text-xs font-semibold text-slate-500 mt-0.5">Size: <span class="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">${item.size}</span></p></td><td class="p-3 text-center"><span class="text-lg font-black text-emerald-600">${item.newStock}</span></td><td class="p-3 text-center"><p class="text-[10px] text-slate-500 font-bold">มือสอง: <span class="text-blue-600 text-xs">${item.usedStock}</span></p><p class="text-[10px] text-slate-500 font-bold">ชำรุด: <span class="text-red-600 text-xs">${item.damagedStock}</span></p></td><td class="p-3 text-center"><div class="flex gap-1.5 justify-center"><button class="receive-stock-btn bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors" data-id="${item._id}" data-type="${item.itemType}" data-size="${item.size}">+ รับเข้า</button><button class="adjust-stock-btn bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors" data-id="${item._id}" data-type="${item.itemType}" data-size="${item.size}">✎ ปรับปรุง</button><button class="history-stock-btn bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors" data-id="${item._id}" data-type="${item.itemType}" data-size="${item.size}">⏱ ประวัติ</button></div></td>`;
            tbody.appendChild(tr);
        });
        container.appendChild(table);
    }
}

async function handleCreateNewStockItem() {
    const btn = document.getElementById('update-stock-btn');
    const data = {
        itemType: document.getElementById('stock-type').value.trim(), size: document.getElementById('stock-size').value.trim(),
        category: document.getElementById('stock-category').value.trim(), newStock: parseInt(document.getElementById('stock-new-qty').value) || 0,
        usedStock: parseInt(document.getElementById('stock-used-qty').value) || 0, damagedStock: parseInt(document.getElementById('stock-damaged-qty').value) || 0,
        lowStockThreshold: parseInt(document.getElementById('stock-threshold-qty').value) || 5, imageUrl: document.getElementById('stock-image-url').value,
        adminUser: currentUser.username
    };

    if (!data.itemType || !data.size || !data.category) return showNotification('กรุณากรอกข้อมูลหลักให้ครบ', 'error');
    showLoadingButton(btn, true);
    try { await apiCall('/api/stock', 'POST', data); onAdminActionSuccess('บันทึกรายการพัสดุสำเร็จ'); } 
    catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'บันทึกข้อมูล'); }
}

function handleStockFilter(clickedButton) {
    document.querySelectorAll('.stock-filter-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-200'); btn.classList.add('bg-white', 'text-slate-600', 'hover:bg-slate-50');
    });
    clickedButton.classList.add('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-200'); clickedButton.classList.remove('bg-white', 'text-slate-600', 'hover:bg-slate-50');
    displayStockSummary((clickedButton.id === 'stock-filter-low') ? masterStock.filter(item => item.newStock > 0 && item.newStock <= (item.lowStockThreshold || 5)) : masterStock);
}

function populateStockForm(type, size) {
    const item = masterStock.find(s => s.itemType === type && s.size === size);
    if (item) {
        document.getElementById('stock-type').value = item.itemType; document.getElementById('stock-size').value = item.size;
        document.getElementById('stock-category').value = item.category || ''; document.getElementById('stock-image-url').value = item.imageUrl || '';
        document.getElementById('stock-image-preview').src = item.imageUrl ? (API_BASE_URL + item.imageUrl) : 'https://placehold.co/128x128/e2e8f0/64748b?text=Preview';
        document.getElementById('stock-new-qty').value = item.newStock || 0; document.getElementById('stock-used-qty').value = item.usedStock || 0;
        document.getElementById('stock-damaged-qty').value = item.damagedStock || 0; document.getElementById('stock-threshold-qty').value = item.lowStockThreshold || 5;
        document.getElementById('stock-type').disabled = true; document.getElementById('stock-size').disabled = true;
        toggleStockForm(true);
    }
}

function clearStockForm() {
    document.getElementById('stock-management-form')?.reset();
    if(document.getElementById('stock-type')) document.getElementById('stock-type').disabled = false;
    if(document.getElementById('stock-size')) document.getElementById('stock-size').disabled = false;
    const preview = document.getElementById('stock-image-preview'); if(preview) preview.src = 'https://placehold.co/128x128/e2e8f0/64748b?text=Preview';
}

// 💡 อัปโหลดไฟล์รูปภาพด้วย Multer
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const preview = document.getElementById('stock-image-preview');
        preview.src = URL.createObjectURL(file); // แสดงรูปพรีวิวให้เห็นก่อน
        
        const formData = new FormData();
        formData.append('image', file);
        try {
            const response = await fetch(`${API_BASE_URL}/api/upload`, { method: 'POST', body: formData });
            const text = await response.text(); // อ่านผลลัพธ์เป็น Text ก่อนเพื่อป้องกันเว็บค้าง
            try {
                const result = JSON.parse(text);
                if(result.imageUrl) {
                    document.getElementById('stock-image-url').value = result.imageUrl; 
                    showNotification('อัปโหลดรูปภาพสำเร็จ', 'success');
                } else {
                    throw new Error(result.error || 'อัปโหลดรูปภาพไม่สำเร็จ');
                }
            } catch(err) {
                console.error("Server Error:", text);
                throw new Error('เซิร์ฟเวอร์ขัดข้อง (Server Error)');
            }
        } catch(e) { showNotification(e.message, 'error'); }
    }
}

// 💡 นำเข้าผู้ใช้งานด้วย CSV
async function handleImportUsersCSV() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    if (!file) return showNotification('กรุณาเลือกไฟล์ CSV ก่อน', 'error');

    const formData = new FormData();
    formData.append('csvfile', file);
    
    const btn = document.getElementById('import-users-btn');
    showLoadingButton(btn, true);
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/import`, { method: 'POST', body: formData });
        const text = await response.text(); // อ่านผลลัพธ์เป็น Text ก่อนเพื่อป้องกันเว็บค้าง
        try {
            const result = JSON.parse(text);
            if(result.success) {
                showNotification(`นำเข้าข้อมูลสำเร็จ ${result.count} รายการ`, 'success');
                refreshData(); 
            } else { throw new Error(result.error); }
        } catch(err) {
            console.error("Server Error:", text);
            throw new Error('เซิร์ฟเวอร์ขัดข้อง (ไฟล์อาจมีปัญหา หรือ API ผิดพลาด)');
        }
    } catch(e) { showNotification(e.message, 'error'); } 
    finally { showLoadingButton(btn, false, 'นำเข้าข้อมูล (Import)'); fileInput.value = ''; }
}

// ==========================================
// 🧑‍💻 การจัดการผู้ใช้งาน (Users Management)
// ==========================================
function onUsersReceived(users) { allUsersData = users; renderUsersTable(); }

function renderUsersTable() {
    const searchTerm = document.getElementById('user-search-input')?.value.toLowerCase() || '';
    const filteredData = allUsersData.filter(user => user.username.toLowerCase().includes(searchTerm) || user.name.toLowerCase().includes(searchTerm) || (user.department && user.department.toLowerCase().includes(searchTerm)));
    const totalPages = Math.ceil(filteredData.length / rowsPerPage); if (currentUserPage > totalPages) currentUserPage = Math.max(1, totalPages);
    const pageData = filteredData.slice((currentUserPage - 1) * rowsPerPage, currentUserPage * rowsPerPage);
    
    const container = document.getElementById('users-list-table');
    if(container) {
        container.innerHTML = `<table class="min-w-full divide-y divide-gray-200"><thead class="bg-slate-50"><tr><th class="px-3 py-3 text-left">Username</th><th class="px-3 py-3 text-left">ชื่อ-สกุล</th><th class="px-3 py-3 text-left">แผนก</th><th class="px-3 py-3 text-center">Role</th><th class="px-3 py-3 text-center">สถานะ</th><th class="px-3 py-3 text-center">Actions</th></tr></thead><tbody class="bg-white divide-y divide-slate-100"></tbody></table>`;
        const tbody = container.querySelector('tbody');
        pageData.forEach(user => {
            const stClass = user.status === 'active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-red-600 border border-red-200';
            const stText = user.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
            tbody.innerHTML += `<tr><td class="p-3 text-sm font-bold text-indigo-600"><a href="#" class="clickable-username hover:underline" data-username="${user.username}">${user.username}</a></td><td class="p-3 text-sm font-medium text-slate-700">${user.name}</td><td class="p-3 text-sm text-slate-500">${user.department || '-'}</td><td class="p-3 text-center"><span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">${user.role}</span></td><td class="p-3 text-center"><span class="px-2.5 py-1 font-bold text-[10px] rounded-lg ${stClass}">${stText}</span></td><td class="p-3 text-center space-x-1.5 whitespace-nowrap"><button class="edit-user-btn bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors" data-username="${user.username}">แก้ไข</button><button class="reset-password-btn bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors" data-username="${user.username}">รหัส</button><button class="delete-user-btn bg-rose-50 hover:bg-rose-100 border border-rose-200 text-red-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors" data-username="${user.username}">ลบ</button></td></tr>`;
        });
    }
    if(document.getElementById('user-page-info')) document.getElementById('user-page-info').textContent = `หน้า ${currentUserPage} จาก ${totalPages || 1}`;
    if(document.getElementById('prev-user-page-btn')) document.getElementById('prev-user-page-btn').disabled = currentUserPage <= 1;
    if(document.getElementById('next-user-page-btn')) document.getElementById('next-user-page-btn').disabled = currentUserPage >= totalPages;
}

function handleUserSearch() { currentUserPage = 1; renderUsersTable(); }
function changeUserPage(dir) { currentUserPage += dir; renderUsersTable(); }

async function handleSaveUser() {
    const userData = { name: document.getElementById('user-form-name').value.trim(), department: document.getElementById('user-form-department').value.trim(), username: document.getElementById('user-form-username').value.trim(), password: document.getElementById('user-form-password').value.trim(), role: document.getElementById('user-form-role').value, status: document.getElementById('user-form-status').value };
    if (!userData.name || !userData.username || !userData.password) return showNotification('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
    showLoadingButton(document.getElementById('save-user-btn'), true);
    try { await apiCall('/api/users', 'POST', { userData, adminUser: currentUser.username }); onAdminActionSuccess('บันทึกผู้ใช้สำเร็จ'); } 
    catch(err) { onActionFailure(err); showLoadingButton(document.getElementById('save-user-btn'), false, 'บันทึก'); }
}

function populateUserForm(username) {
    const user = allUsersData.find(u => u.username === username);
    if (user) {
        document.getElementById('user-form-name').value = user.name || ''; document.getElementById('user-form-department').value = user.department || '';
        document.getElementById('user-form-username').value = user.username || ''; document.getElementById('user-form-password').value = user.password || ''; 
        document.getElementById('user-form-role').value = user.role || 'user'; document.getElementById('user-form-status').value = user.status || 'active';
        document.getElementById('user-form-username').disabled = true; toggleUserForm(true);
    }
}
function clearUserForm() { document.getElementById('user-management-form')?.reset(); if(document.getElementById('user-form-username')) document.getElementById('user-form-username').disabled = false; }


function onAdminLogReceived(logs) { allAdminLogData = logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); handleHistoryViewChange(); }

function handleHistoryViewChange() {
    if (document.getElementById('history-view-selector')?.value === 'requests') {
        document.getElementById('all-requests-view')?.classList.remove('hidden'); document.getElementById('admin-log-view')?.classList.add('hidden'); renderAllHistoryTable();
    } else {
        document.getElementById('all-requests-view')?.classList.add('hidden'); document.getElementById('admin-log-view')?.classList.remove('hidden'); currentLogPage = 1; renderAdminLogTable();
    }
}

function renderAllHistoryTable() {
    const searchTerm = document.getElementById('admin-history-search')?.value.toLowerCase() || '';
    const filteredData = allRequestsData.filter(req => (req.requesterName && req.requesterName.toLowerCase().includes(searchTerm)) || (req.itemType && req.itemType.toLowerCase().includes(searchTerm)) || (req.status && req.status.toLowerCase().includes(searchTerm)));
    const totalPages = Math.ceil(filteredData.length / rowsPerPage); if (currentHistoryPage > totalPages) currentHistoryPage = Math.max(1, totalPages);
    const pageData = filteredData.slice((currentHistoryPage - 1) * rowsPerPage, currentHistoryPage * rowsPerPage);
    displayRequests(pageData, 'all-requests-table', true);
    if(document.getElementById('page-info')) document.getElementById('page-info').textContent = `หน้า ${currentHistoryPage} จาก ${totalPages || 1}`;
    if(document.getElementById('prev-page-btn')) document.getElementById('prev-page-btn').disabled = currentHistoryPage <= 1;
    if(document.getElementById('next-page-btn')) document.getElementById('next-page-btn').disabled = currentHistoryPage >= totalPages;
}

function renderAdminLogTable() {
    const searchTerm = document.getElementById('admin-log-search')?.value.toLowerCase() || '';
    const filteredData = allAdminLogData.filter(log => (log.adminName && log.adminName.toLowerCase().includes(searchTerm)) || (log.action && log.action.toLowerCase().includes(searchTerm)) || (log.details && log.details.toLowerCase().includes(searchTerm)));
    const totalPages = Math.ceil(filteredData.length / rowsPerPage); if (currentLogPage > totalPages) currentLogPage = Math.max(1, totalPages);
    const pageData = filteredData.slice((currentLogPage - 1) * rowsPerPage, currentLogPage * rowsPerPage);

    const tbody = document.getElementById('admin-log-table'); if(!tbody) return; tbody.innerHTML = '';
    pageData.forEach(log => { tbody.innerHTML += `<tr><td class="p-3 text-sm">${new Date(log.createdAt).toLocaleString()}</td><td class="p-3 text-sm font-bold text-indigo-600">${log.adminName}</td><td class="p-3 text-sm font-medium text-slate-700">${log.action}</td><td class="p-3 text-xs text-slate-500">${log.details}</td></tr>`; });
    if(document.getElementById('log-page-info')) document.getElementById('log-page-info').textContent = `หน้า ${currentLogPage} จาก ${totalPages || 1}`;
    if(document.getElementById('prev-log-page-btn')) document.getElementById('prev-log-page-btn').disabled = currentLogPage <= 1;
    if(document.getElementById('next-log-page-btn')) document.getElementById('next-log-page-btn').disabled = currentLogPage >= totalPages;
}

function handleHistorySearch() { currentHistoryPage = 1; renderAllHistoryTable(); }
function changeHistoryPage(dir) { currentHistoryPage += dir; renderAllHistoryTable(); }
function handleLogSearch() { currentLogPage = 1; renderAdminLogTable(); } 
function changeLogPage(dir) { currentLogPage += dir; renderAdminLogTable(); } 

// ==========================================
// 🔔 UI, Modals & Tabs Utilities
// ==========================================
function toggleRequestForm() {
    if (document.getElementById('request-reason-type').value === 'Damaged/Lost') {
        document.getElementById('new-request-form')?.classList.add('hidden'); document.getElementById('return-request-form')?.classList.remove('hidden');
        const btn = document.getElementById('request-btn'); btn.textContent = 'ส่งคำขอคืน'; btn.classList.replace('bg-indigo-600', 'bg-orange-500'); btn.classList.replace('hover:bg-indigo-700', 'hover:bg-orange-600'); btn.classList.replace('shadow-indigo-200', 'shadow-orange-200');
        populateReturnableItemsDropdown();
    } else {
        document.getElementById('new-request-form')?.classList.remove('hidden'); document.getElementById('return-request-form')?.classList.add('hidden');
        const btn = document.getElementById('request-btn'); btn.textContent = 'ส่งคำขอเบิก'; btn.classList.replace('bg-orange-500', 'bg-indigo-600'); btn.classList.replace('hover:bg-orange-600', 'hover:bg-indigo-700'); btn.classList.replace('shadow-orange-200', 'shadow-indigo-200');
    }
}
function toggleMyHistory() { const content = document.getElementById('my-history-content'); content?.classList.toggle('expanded'); content.style.maxHeight = content.classList.contains('expanded') ? content.scrollHeight + 'px' : '0px'; document.getElementById('my-history-toggle-icon').style.transform = content.classList.contains('expanded') ? 'rotate(0deg)' : 'rotate(-180deg)'; }
function toggleMyRequests() { const content = document.getElementById('my-requests-content'); content?.classList.toggle('expanded'); content.style.maxHeight = content.classList.contains('expanded') ? content.scrollHeight + 'px' : '0px'; document.getElementById('my-requests-toggle-icon').style.transform = content.classList.contains('expanded') ? 'rotate(0deg)' : 'rotate(-180deg)'; }
function toggleStockForm(forceOpen = false) { const content = document.getElementById('stock-form-content'); if (forceOpen) content.classList.add('expanded'); else content?.classList.toggle('expanded'); content.style.maxHeight = content.classList.contains('expanded') ? content.scrollHeight + 'px' : '0px'; document.getElementById('stock-form-toggle-icon').style.transform = content.classList.contains('expanded') ? 'rotate(0deg)' : 'rotate(-180deg)'; }
function toggleUserForm(forceOpen = false) { const content = document.getElementById('user-form-content'); if (forceOpen) content.classList.add('expanded'); else content?.classList.toggle('expanded'); content.style.maxHeight = content.classList.contains('expanded') ? content.scrollHeight + 'px' : '0px'; document.getElementById('user-form-toggle-icon').style.transform = content.classList.contains('expanded') ? 'rotate(0deg)' : 'rotate(-180deg)'; }

function handleTabClick(tabName) {
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.admin-tab').forEach(tab => { tab.classList.remove('bg-indigo-50', 'border-indigo-500', 'text-indigo-600'); tab.classList.add('border-transparent', 'text-slate-500'); });
    document.getElementById(`content-${tabName}`)?.classList.remove('hidden');
    const btn = document.getElementById(`tab-${tabName}`); if(btn) { btn.classList.add('bg-indigo-50', 'border-indigo-500', 'text-indigo-600'); btn.classList.remove('border-transparent', 'text-slate-500'); }
}

function showNotification(message, type = 'success') {
    const el = document.getElementById('notification');
    if(!el) return;
    document.getElementById('notification-message').textContent = message;
    el.classList.remove('bg-red-500', 'bg-emerald-500', 'hidden'); el.classList.add(type === 'error' ? 'bg-red-500' : 'bg-emerald-500');
    setTimeout(() => el.classList.add('hidden'), 4000);
}

function showLoadingButton(button, isLoading, originalText = '') {
    if (!button) return;
    if (isLoading) { if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML; button.disabled = true; button.innerHTML = `<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>`; } 
    else { button.disabled = false; button.innerHTML = originalText || button.dataset.originalText || 'Submit'; button.dataset.originalText = ''; }
}

function resetActionButtons() {
    showLoadingButton(document.getElementById('request-btn'), false); showLoadingButton(document.getElementById('update-stock-btn'), false, 'บันทึกข้อมูล'); showLoadingButton(document.getElementById('save-user-btn'), false, 'บันทึก'); document.querySelectorAll('button:disabled').forEach(btn => showLoadingButton(btn, false)); toggleRequestForm();
}

function openModalAnimation(modal) { if (!modal) return; modal.classList.remove('hidden'); setTimeout(() => { modal.classList.remove('opacity-0'); const c = modal.querySelector('.modal-container'); if (c) c.classList.remove('scale-95'); }, 10); }
function closeModalAnimation(modal) { if (!modal) return; modal.classList.add('opacity-0'); const c = modal.querySelector('.modal-container'); if (c) c.classList.add('scale-95'); setTimeout(() => modal.classList.add('hidden'), 300); }
function showPromptModal(title, callback) { const modal = document.getElementById('prompt-modal'); if(!modal) return; document.getElementById('prompt-modal-title').textContent = title; const input = document.getElementById('prompt-modal-input'); input.value = ''; document.getElementById('prompt-modal-submit-btn').onclick = () => { if(input.value.trim()) { closeModalAnimation(modal); callback(input.value.trim()); } }; document.getElementById('prompt-modal-cancel-btn').onclick = () => closeModalAnimation(modal); openModalAnimation(modal); setTimeout(() => input.focus(), 100); }
function showConfirmModal(message, callback) { const modal = document.getElementById('confirm-modal'); if(!modal) return; document.getElementById('confirm-modal-message').textContent = message; document.getElementById('confirm-modal-ok-btn').onclick = () => { closeModalAnimation(modal); callback(); }; document.getElementById('confirm-modal-cancel-btn').onclick = () => closeModalAnimation(modal); openModalAnimation(modal); }
async function openHistoryModal(title) { const modal = document.getElementById('user-history-modal'); if(!modal) return; document.getElementById('history-modal-username').textContent = title; openModalAnimation(modal); document.getElementById('history-modal-content').innerHTML = '<p class="text-center mt-6 text-slate-500">กำลังโหลดข้อมูล...</p>'; }
function closeHistoryModal() { closeModalAnimation(document.getElementById('user-history-modal')); }

// 💡 เพิ่มฟังก์ชันลืมรหัสผ่าน
function showForgotPasswordView(e) { e?.preventDefault(); document.getElementById('login-view')?.classList.add('hidden'); document.getElementById('forgot-password-view')?.classList.remove('hidden'); }
function showLoginView(e) { e?.preventDefault(); document.getElementById('login-view')?.classList.remove('hidden'); document.getElementById('forgot-password-view')?.classList.add('hidden'); }

async function handleForgotPasswordRequest() {
    const username = document.getElementById('forgot-username').value.trim();
    if(!username) return document.getElementById('forgot-password-error').textContent = 'กรุณากรอกรหัสพนักงาน (Username)';
    try {
        await apiCall('/api/auth/forgot-password', 'POST', { username });
        document.getElementById('forgot-password-stage-1').classList.add('hidden');
        document.getElementById('forgot-password-stage-2').classList.remove('hidden');
        document.getElementById('forgot-password-stage-2').innerHTML = '<div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-6"><p class="text-center text-sm text-green-700 font-medium">✅ ส่งคำขอรีเซ็ตรหัสผ่านไปยังแอดมินแล้ว<br>กรุณารอแอดมินแจ้งรหัสผ่านชั่วคราวให้คุณ</p></div>';
    } catch(e) { document.getElementById('forgot-password-error').textContent = e.message; }
}

async function handlePerformReset() {} // ไม่ใช้แล้วเพราะแอดมินจัดการให้
function showForceChangePasswordModal() { openModalAnimation(document.getElementById('force-change-password-modal')); }

async function handleForceChangePassword() {
    const pwd = document.getElementById('new-password').value;
    if(pwd !== document.getElementById('confirm-password').value) return document.getElementById('password-change-error').textContent = 'รหัสผ่านไม่ตรงกัน';
    if(pwd.length < 4) return document.getElementById('password-change-error').textContent = 'รหัสผ่านต้องมี 4 ตัวอักษรขึ้นไป';
    try {
        await apiCall('/api/auth/change-password', 'POST', { username: currentUser.username, newPassword: pwd });
        closeModalAnimation(document.getElementById('force-change-password-modal'));
        showNotification('เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่', 'success');
        handleLogout();
    } catch(e) { document.getElementById('password-change-error').textContent = e.message; }
}
// ==========================================
// 🌍 1. GLOBAL STATE & CONFIGURATIONS
// ==========================================
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = isLocalhost ? 'http://localhost:3000' : 'https://uniform-system-hg0e.onrender.com';

const AppState = {
    currentUser: null,
    masterStock: [],
    userApprovedItems: [],
    allRequestsData: [],
    allUsersData: [],
    allAdminLogData: [],
    currentPendingRequests: [],
    pagination: { history: 1, logs: 1, users: 1, rowsPerPage: 10 },
    pollingInterval: null,
    currentEditUser: null,
    currentEditStock: null
};

// ==========================================
// 🚀 2. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    injectSuperStockModal(); // สร้างหน้าต่าง Modal ใหม่สำหรับจัดการสต๊อก
    setupStaticEventListeners(); // 💡 ผูกปุ่มคลิกต่างๆ (ฟังก์ชันนี้สำคัญมาก)
});

// ==========================================
// 🌐 3. API WRAPPER
// ==========================================
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

// ==========================================
// 🔐 4. AUTHENTICATION & SESSION
// ==========================================
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
    if (user.mustChangePassword) { 
        AppState.currentUser = user; 
        openModalAnimation(document.getElementById('force-change-password-modal')); 
        return; 
    }

    AppState.currentUser = user;
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    
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
    if (AppState.pollingInterval) { clearInterval(AppState.pollingInterval); AppState.pollingInterval = null; }
    sessionStorage.removeItem('currentUser');
    AppState.currentUser = null;
    
    document.getElementById('admin-dashboard-panel').classList.add('hidden');
    document.getElementById('admin-dashboard-panel').classList.remove('flex');
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

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

async function handleForceChangePassword() {
    const pwd = document.getElementById('new-password').value;
    if(pwd !== document.getElementById('confirm-password').value) return document.getElementById('password-change-error').textContent = 'รหัสผ่านไม่ตรงกัน';
    if(pwd.length < 4) return document.getElementById('password-change-error').textContent = 'รหัสผ่านต้องมี 4 ตัวอักษรขึ้นไป';
    try {
        await apiCall('/api/auth/change-password', 'POST', { username: AppState.currentUser.username, newPassword: pwd });
        closeModalAnimation(document.getElementById('force-change-password-modal'));
        showNotification('เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่', 'success');
        handleLogout();
    } catch(e) { document.getElementById('password-change-error').textContent = e.message; }
}

// ==========================================
// 📦 5. DATA LOADING & POLLING
// ==========================================
async function loadInitialData() {
    if (!AppState.currentUser) return;
    try {
        const [stockData, requestsData, holdingsData] = await Promise.all([
            apiCall('/api/stock'), 
            apiCall(`/api/requests/me?username=${AppState.currentUser.username}`), 
            apiCall(`/api/requests/holdings?username=${AppState.currentUser.username}`)
        ]);

        onStockReceived(stockData);
        displayRequests(requestsData, 'my-requests-table', false);
        displayCurrentUserHoldings(holdingsData);
        
        AppState.userApprovedItems = requestsData.filter(r => r.status === 'Approved' && r.quantity > 0);
        populateReturnableItemsDropdown();

        if (AppState.currentUser.role === 'admin') loadAdminData();
    } catch (error) { showNotification(error.message, 'error'); }
}

async function loadAdminData() {
    try {
        const [pendingReqs, users, logs, passwordResets] = await Promise.all([
            apiCall('/api/admin/pending-approvals'), 
            apiCall('/api/users'), 
            apiCall('/api/logs'), 
            apiCall('/api/admin/password-resets')
        ]);
        displayPendingApprovals(pendingReqs);
        onUsersReceived(users);
        onAdminLogReceived(logs);
        displayPendingPasswordResets(passwordResets);
        
        const allReqs = await apiCall('/api/requests/all');
        AppState.allRequestsData = allReqs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderAllHistoryTable();
    } catch (error) { console.error("Admin Load Error:", error); }
}

function refreshData() { loadInitialData(); }

function startPollingForUpdates() {
    if (AppState.pollingInterval) clearInterval(AppState.pollingInterval); 
    AppState.pollingInterval = setInterval(async () => {
        if (AppState.currentUser && AppState.currentUser.role === 'admin') {
            try {
                const newRequests = await apiCall('/api/admin/pending-approvals');
                const newRequestIds = newRequests.map(req => req.requestId);
                const currentRequestIds = AppState.currentPendingRequests.map(req => req.requestId);

                if (newRequestIds.length !== currentRequestIds.length || newRequestIds.some(id => !currentRequestIds.includes(id))) {
                    showNotification("มีรายการใหม่รออนุมัติ!", 'success');
                    displayPendingApprovals(newRequests); 
                }
            } catch(e) {}
        } else { clearInterval(AppState.pollingInterval); }
    }, 15000); 
}

// ==========================================
// 👤 6. USER DASHBOARD (REQUESTS & RETURNS)
// ==========================================
function populateTypeDropdown() {
    const typeSelect = document.getElementById('request-type');
    if(!typeSelect) return;
    const uniqueTypes = [...new Set(AppState.masterStock.map(item => item.itemType))];
    typeSelect.innerHTML = '<option value="">-- เลือกประเภท --</option>';
    uniqueTypes.forEach(type => { if(type) typeSelect.add(new Option(type, type)); });
}

function populateSizeDropdown() {
    const typeSelect = document.getElementById('request-type');
    const sizeSelect = document.getElementById('request-size');
    if (!typeSelect || !sizeSelect) return;
    const availableItems = AppState.masterStock.filter(item => item.itemType === typeSelect.value);
    sizeSelect.innerHTML = '<option value="">-- เลือกขนาด --</option>';
    availableItems.forEach(item => { if(item.size) sizeSelect.add(new Option(`${item.size} (คงเหลือ: ${item.newStock} ชิ้น)`, item.size)); });
    displaySelectedItemImage();
}

function displaySelectedItemImage() {
    const typeInput = document.getElementById('request-type');
    const sizeInput = document.getElementById('request-size');
    if (!typeInput || !sizeInput) return;
    const stockItem = AppState.masterStock.find(item => item.itemType === typeInput.value && item.size === sizeInput.value);
    const previewContainer = document.getElementById('item-image-preview-container');
    if (stockItem && stockItem.imageUrl && previewContainer) {
        document.getElementById('item-image-preview').src = API_BASE_URL + stockItem.imageUrl; 
        previewContainer.classList.remove('hidden');
    } else if (previewContainer) { 
        previewContainer.classList.add('hidden'); 
    }
}

function populateReturnableItemsDropdown() {
    const select = document.getElementById('return-item-select');
    if(!select) return;
    select.innerHTML = ''; 
    document.getElementById('return-quantity-wrapper')?.classList.add('hidden');
    if (AppState.userApprovedItems && AppState.userApprovedItems.length > 0) {
        select.disabled = false; select.innerHTML = '<option value="">-- เลือกรายการที่เคยเบิก --</option>';
        AppState.userApprovedItems.forEach(item => { select.add(new Option(`${item.itemType} (ไซส์ ${item.size}) - คงเหลือ ${item.quantity} ชิ้น`, item.requestId)); });
    } else { 
        select.disabled = true; select.add(new Option('ไม่พบรายการที่สามารถคืนได้', '')); 
    }
}

function handleReturnableItemSelection() {
    const select = document.getElementById('return-item-select');
    const quantityWrapper = document.getElementById('return-quantity-wrapper');
    const quantityInput = document.getElementById('return-quantity');
    const selectedItem = AppState.userApprovedItems.find(item => item.requestId === select.value);
    if (selectedItem) { 
        quantityInput.value = 1; quantityInput.max = selectedItem.quantity; 
        quantityWrapper.classList.remove('hidden'); 
    } else { 
        quantityWrapper.classList.add('hidden'); 
    }
}

async function handleSubmitRequest(e) {
    if (e) e.preventDefault();
    const requestBtn = document.getElementById('request-btn');
    const reasonType = document.getElementById('request-reason-type').value;
    showLoadingButton(requestBtn, true);

    try {
        if (reasonType === 'Damaged/Lost') {
            const originalRequestId = document.getElementById('return-item-select').value;
            const quantityToReturn = parseInt(document.getElementById('return-quantity').value);
            const reasonDetails = document.getElementById('return-details').value.trim();
            if (!originalRequestId || !reasonDetails) throw new Error('กรุณาเลือกรายการและระบุเหตุผล');
            
            await apiCall('/api/requests/return', 'POST', { originalRequestId, quantityToReturn, reasonDetails, requesterName: AppState.currentUser.name });
            onActionSuccess('ส่งคำขอคืนสำเร็จ');
        } else {
            const requestData = {
                requesterName: AppState.currentUser.name, 
                department: AppState.currentUser.department,
                itemType: document.getElementById('request-type').value, 
                size: document.getElementById('request-size').value,
                quantity: parseInt(document.getElementById('request-quantity').value) || 0, 
                reason: document.getElementById('request-details').value.trim()
            };
            if (!requestData.itemType || requestData.quantity < 1 || !requestData.reason) throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน');

            await apiCall('/api/requests/new', 'POST', requestData);
            onActionSuccess('ส่งคำขอเบิกสำเร็จ กำลังรอการอนุมัติ');
        }
    } catch (error) { onActionFailure(error); }
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

// ==========================================
// 🛡️ 7. ADMIN APPROVALS & RETURNS
// ==========================================
function displayPendingApprovals(requests) {
    const list = document.getElementById('pending-approvals-list');
    if(!list) return;
    list.innerHTML = ''; 
    AppState.currentPendingRequests = requests;
    
    if (!requests || requests.length === 0) return list.innerHTML = '<p class="text-center p-4 text-gray-500">ไม่มีรายการรออนุมัติ</p>';
    
    requests.forEach(req => {
        const { requestId: id, createdAt: time, requesterName: name, department: dept, itemType: type, size, quantity: qty, reason, status } = req;
        const card = document.createElement('div'); card.className = 'border rounded-lg p-4 bg-gray-50 approval-card shadow-sm border border-slate-200';
        let content;
        const historyButton = `<button class="view-history-btn text-xs text-indigo-500 hover:text-indigo-700 font-bold hover:underline" data-requester-name="${name}">ดูประวัติเบิก</button>`;
        
        if (status === 'Pending Return') {
            const stockItem = AppState.masterStock.find(stock => stock.itemType === type && stock.size === size);
            content = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <p class="font-bold text-slate-800">ขอคืน: ${type} (ไซส์ ${size}) x ${qty}</p>
                    <p class="text-xs text-slate-500 mt-1">ผู้ขอคืน: <span class="font-semibold text-slate-700">${name}</span> (${dept}) &middot; ${historyButton}</p>
                    <p class="text-xs text-slate-500 mt-1">เหตุผล: ${reason}</p>
                </div>
                <div class="text-xs font-semibold text-slate-400 whitespace-nowrap bg-white px-2 py-1 rounded-lg border">${new Date(time).toLocaleString()}</div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-200 pt-3 mt-2">
                <div class="bg-white p-3 rounded-lg border border-slate-100">
                    <p class="font-bold text-xs text-indigo-700 mb-2 uppercase">1. ประเมินของที่รับคืน</p>
                    <div class="flex flex-col space-y-2">
                        <label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="return-condition-${id}" value="Used" class="form-radio h-4 w-4 text-indigo-600"><span class="ml-2">คืนเป็นของมือสอง (ใช้ต่อได้)</span></label>
                        <label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="return-condition-${id}" value="Damaged" class="form-radio h-4 w-4 text-red-600"><span class="ml-2">คืนเป็นของชำรุด (ทิ้ง/ซ่อม)</span></label>
                    </div>
                    <div id="damage-reason-div-${id}" class="hidden mt-2"><input type="text" id="damage-reason-${id}" placeholder="ระบุเหตุผลที่ชำรุด..." class="w-full text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"></div>
                </div>
                <div class="bg-white p-3 rounded-lg border border-slate-100">
                    <p class="font-bold text-xs text-indigo-700 mb-2 uppercase">2. เลือกการเบิกจ่ายทดแทน</p>
                    <div class="flex flex-col space-y-2">
                        <label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="disburse-type-${id}" value="New" class="form-radio h-4 w-4 text-emerald-600"><span class="ml-2">เบิกของใหม่ให้ <span class="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded ml-1">เหลือ ${stockItem ? stockItem.newStock : 0}</span></span></label>
                        <label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="disburse-type-${id}" value="None" class="form-radio h-4 w-4 text-slate-500"><span class="ml-2">ไม่เบิกจ่าย (รับคืนอย่างเดียว)</span></label>
                    </div>
                </div>
            </div>
            <div class="flex justify-end items-center gap-3 mt-4 border-t border-slate-200 pt-3">
                <button data-id="${id}" class="reject-return-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-lg transition-colors">ปฏิเสธการคืน</button>
                <button data-id="${id}" class="process-return-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md shadow-indigo-200 transition-all">ยืนยันรับคืน</button>
            </div>`;
        } else {
            const stockItem = AppState.masterStock.find(stock => stock.itemType === type && stock.size === size);
            const newStockQty = stockItem ? stockItem.newStock : 0;
            const usedStockQty = stockItem ? stockItem.usedStock : 0;
            
            card.dataset.newStock = newStockQty;
            card.dataset.usedStock = usedStockQty;
            
            content = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-slate-800 text-lg">ขอเบิก: ${type} (ไซส์ ${size})</p>
                    <p class="text-xs text-slate-500 mt-1">ผู้ขอเบิก: <span class="font-semibold text-slate-700">${name}</span> (${dept}) &middot; ${historyButton}</p>
                    <p class="text-xs text-slate-600 mt-2 bg-white p-2 rounded-lg border border-slate-100"><span class="font-bold">เหตุผล:</span> ${reason}</p>
                </div>
                <div class="text-xs font-semibold text-slate-400 whitespace-nowrap bg-white px-2 py-1 rounded-lg border">${new Date(time).toLocaleString()}</div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-slate-200">
                <div class="md:col-span-2">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">เลือกประเภทสต็อกที่จะตัด</label>
                    <div class="flex flex-col space-y-1 bg-white p-2 rounded-lg border border-slate-200">
                        <label class="inline-flex items-center text-xs font-medium text-slate-700"><input type="radio" name="approve-stock-type-${id}" value="New" checked class="form-radio h-3 w-3 text-indigo-600"><span class="ml-2">ของใหม่ (เหลือ ${newStockQty})</span></label>
                        <label class="inline-flex items-center text-xs font-medium text-slate-700"><input type="radio" name="approve-stock-type-${id}" value="Used" class="form-radio h-3 w-3 text-blue-600"><span class="ml-2">มือสอง (เหลือ ${usedStockQty})</span></label>
                    </div>
                </div>
                <div class="md:col-span-1">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">จำนวนอนุมัติ</label>
                    <input type="number" value="${qty}" min="1" max="${qty}" class="approval-quantity-input w-full py-2 px-3 border border-slate-200 rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>
                <div class="md:col-span-2">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">หมายเหตุให้ผู้เบิก</label>
                    <input type="text" placeholder="เช่น สต็อกไม่พอ..." class="approval-reason-input w-full py-2 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>
            </div>
            <div class="flex justify-end items-center gap-3 mt-4 pt-2">
                <button data-id="${id}" class="reject-btn bg-rose-50 hover:bg-rose-100 text-red-600 text-xs font-bold py-2 px-4 rounded-lg transition-colors">ปฏิเสธ</button>
                <button data-id="${id}" class="approve-btn bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md shadow-emerald-200 transition-all">อนุมัติคำขอ</button>
            </div>`;
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
        list.innerHTML += `
        <div class="p-4 bg-white border border-slate-200 shadow-sm rounded-xl mb-3 flex justify-between items-center">
            <div>
                <p class="font-bold text-slate-800 text-lg">รหัสพนักงาน: <span class="text-indigo-600">${req.username}</span></p>
                <p class="text-xs text-slate-500 mt-1">เวลาส่งคำขอ: ${new Date(req.createdAt).toLocaleString()}</p>
            </div>
            <button class="approve-reset-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-md shadow-indigo-200 transition-all" data-id="${req._id}" data-user="${req.username}">อนุมัติ / ตั้งรหัสใหม่</button>
        </div>`;
    });
}

async function handleApproveRequest(btn) {
    const id = btn.dataset.id;
    const card = btn.closest('.approval-card');
    const quantityInput = card.querySelector('.approval-quantity-input');
    const reasonInput = card.querySelector('.approval-reason-input');
    
    const stockTypeRadios = card.querySelectorAll(`input[name="approve-stock-type-${id}"]`);
    let stockType = 'New';
    stockTypeRadios.forEach(radio => { if (radio.checked) stockType = radio.value; });
    
    const approvedQuantity = parseInt(quantityInput.value);
    const originalQuantity = parseInt(quantityInput.max);
    const reason = reasonInput.value.trim();
    
    const newStock = parseInt(card.dataset.newStock) || 0;
    const usedStock = parseInt(card.dataset.usedStock) || 0;

    if (isNaN(approvedQuantity) || approvedQuantity <= 0 || approvedQuantity > originalQuantity) {
        return showNotification(`จำนวนที่อนุมัติต้องอยู่ระหว่าง 1 ถึง ${originalQuantity}`, 'error');
    }
    if (stockType === 'Used' && approvedQuantity > usedStock) return showNotification(`❌ สต็อกมือสองไม่เพียงพอ (เหลือ ${usedStock} ชิ้น)`, 'error');
    if (stockType === 'New' && approvedQuantity > newStock) return showNotification(`❌ สต็อกของใหม่ไม่เพียงพอ (เหลือ ${newStock} ชิ้น)`, 'error');
    
    showLoadingButton(btn, true);
    try {
        await apiCall('/api/admin/approve', 'POST', { requestId: id, approvedQuantity, reason, stockType, adminUser: AppState.currentUser.username });
        onAdminActionSuccess(`อนุมัติรายการสำเร็จ (ตัดสต็อก${stockType === 'Used' ? 'มือสอง' : 'ใหม่'})`);
    } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'อนุมัติคำขอ'); }
}

async function handleRejectRequest(btn) {
    const id = btn.dataset.id;
    showPromptModal("กรุณาระบุเหตุผลที่ปฏิเสธ:", async (reason) => {
        showLoadingButton(btn, true);
        try {
            await apiCall('/api/admin/reject', 'POST', { requestId: id, reason, adminUser: AppState.currentUser.username });
            onAdminActionSuccess('ปฏิเสธรายการสำเร็จ');
        } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'ปฏิเสธ'); }
    });
}

async function handleProcessReturn(btn) {
    const id = btn.dataset.id;
    const returnConditionEl = document.querySelector(`input[name="return-condition-${id}"]:checked`);
    const disbursementTypeEl = document.querySelector(`input[name="disburse-type-${id}"]:checked`);
    if (!returnConditionEl || !disbursementTypeEl) return showNotification('กรุณาเลือกตัวเลือกให้ครบถ้วน', 'error');
    
    let damageReason = '';
    if (returnConditionEl.value === 'Damaged') {
        damageReason = document.getElementById(`damage-reason-${id}`).value.trim();
        if (!damageReason) return showNotification('กรุณากรอกเหตุผลที่ชำรุด', 'error');
    }
    
    showLoadingButton(btn, true);
    try {
        if (disbursementTypeEl.value === 'None') {
            await apiCall('/api/admin/return-only', 'POST', { requestId: id, returnCondition: returnConditionEl.value, damageReason, adminUser: AppState.currentUser.username });
        } else {
            await apiCall('/api/admin/return-disburse', 'POST', { requestId: id, returnCondition: returnConditionEl.value, disbursementType: disbursementTypeEl.value, damageReason, adminUser: AppState.currentUser.username });
        }
        onAdminActionSuccess('ดำเนินการรับคืนสำเร็จ');
    } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'ยืนยันรับคืน'); }
}


// ==========================================
// 🏢 8. ADMIN: STOCK MANAGEMENT
// ==========================================
function onStockReceived(newStockData) {
    AppState.masterStock = newStockData;
    populateTypeDropdown();
    if (AppState.currentUser && AppState.currentUser.role === 'admin') {
        const activeFilter = document.querySelector('.stock-filter-btn.bg-indigo-600');
        if(activeFilter) handleStockFilter(activeFilter); else displayStockSummary(AppState.masterStock);
        updateLowStockAlerts();
    }
}

function displayStockSummary(stockData) {
    const container = document.getElementById('stock-summary-container');
    if(!container) return;
    container.innerHTML = '';
    if (!stockData || stockData.length === 0) return container.innerHTML = '<p class="text-center p-4 text-gray-500">ไม่พบข้อมูลสต็อก</p>';

    const groupedByCategory = stockData.reduce((acc, item) => {
        const cat = item.category || 'Uncategorized'; 
        if (!acc[cat]) acc[cat] = []; 
        acc[cat].push(item); 
        return acc;
    }, {});

    for (const category in groupedByCategory) {
        container.innerHTML += `<h4 class="text-sm font-black text-slate-400 uppercase tracking-wider mb-2 mt-6 pl-1">${category}</h4>`;
        const table = document.createElement('table'); 
        table.className = 'min-w-full divide-y divide-slate-200 mb-4 border bg-white';
        table.innerHTML = `<thead class="bg-slate-50"><tr><th class="w-16">รูป</th><th>รายการพัสดุ</th><th class="text-center w-64">จำนวนคงเหลือ (ในคลัง)</th><th class="text-center w-48">สถานะภาพรวมระบบ</th><th class="text-center">จัดการสต๊อก (Ledger)</th></tr></thead><tbody class="divide-y divide-slate-100"></tbody>`;
        
        const tbody = table.querySelector('tbody');
        groupedByCategory[category].forEach(item => {
            const tr = document.createElement('tr'); 
            if (item.newStock <= (item.lowStockThreshold || 5)) tr.classList.add('bg-red-50/50');
            
            const img = item.imageUrl ? (API_BASE_URL + item.imageUrl) : 'https://placehold.co/80x60/e2e8f0/64748b?text=N/A';
            const dispensed = item.dispensedStock || 0;
            const totalSystem = item.newStock + item.usedStock + item.damagedStock + dispensed;

            tr.innerHTML = `
            <td class="p-2 text-center"><img src="${img}" class="w-12 h-12 object-cover rounded-lg mx-auto border shadow-sm"></td>
            <td class="p-3"><p class="font-bold text-slate-800">${item.itemType}</p><p class="text-xs font-semibold text-slate-500 mt-0.5">Size: <span class="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">${item.size}</span></p></td>
            <td class="p-3">
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-emerald-50 p-1.5 rounded-lg border border-emerald-100 shadow-sm"><p class="text-[10px] font-bold text-emerald-600 mb-0.5">ใหม่</p><p class="text-lg font-black text-emerald-700 leading-none">${item.newStock}</p></div>
                    <div class="bg-blue-50 p-1.5 rounded-lg border border-blue-100 shadow-sm"><p class="text-[10px] font-bold text-blue-600 mb-0.5">มือสอง</p><p class="text-sm font-black text-blue-700 leading-none mt-1">${item.usedStock}</p></div>
                    <div class="bg-rose-50 p-1.5 rounded-lg border border-rose-100 shadow-sm"><p class="text-[10px] font-bold text-rose-600 mb-0.5">ชำรุด</p><p class="text-sm font-black text-rose-700 leading-none mt-1">${item.damagedStock}</p></div>
                </div>
            </td>
            <td class="p-3">
                <div class="flex flex-col gap-1.5 justify-center h-full">
                    <div class="flex justify-between items-center text-[11px] font-bold px-2 py-1.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100"><span>ถูกเบิกไป:</span><span class="text-sm">${dispensed} ชิ้น</span></div>
                    <div class="flex justify-between items-center text-[11px] font-bold px-2 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700 shadow-sm"><span>รวมทั้งระบบ:</span><span class="text-sm text-amber-300">${totalSystem} ชิ้น</span></div>
                </div>
            </td>
            <td class="p-3 text-center">
                <div class="grid grid-cols-2 gap-1.5 max-w-[160px] mx-auto">
                    <button class="edit-stock-btn bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-[10px] font-bold py-1.5 px-2 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}">⚙️ แก้ไขข้อมูล</button>
                    <button class="receive-stock-btn bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold py-1.5 px-2 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}">+ รับเข้า</button>
                    <button class="adjust-stock-btn bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 text-[10px] font-bold py-1.5 px-2 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}">✎ ปรับปรุง</button>
                    <button class="history-stock-btn bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 text-[10px] font-bold py-1.5 px-2 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}">⏱ ประวัติ</button>
                </div>
            </td>`;
            tbody.appendChild(tr);
        });
        container.appendChild(table);
    }
}

function handleStockFilter(clickedButton) {
    document.querySelectorAll('.stock-filter-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-200'); btn.classList.add('bg-white', 'text-slate-600', 'hover:bg-slate-50');
    });
    clickedButton.classList.add('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-200'); clickedButton.classList.remove('bg-white', 'text-slate-600', 'hover:bg-slate-50');
    displayStockSummary((clickedButton.id === 'stock-filter-low') ? AppState.masterStock.filter(item => item.newStock > 0 && item.newStock <= (item.lowStockThreshold || 5)) : AppState.masterStock);
}

function updateLowStockAlerts() {
    const lowStock = AppState.masterStock.filter(item => item.newStock > 0 && item.newStock <= (item.lowStockThreshold || 5));
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

function injectSuperStockModal() {
    if (document.getElementById('super-stock-modal')) return;
    const modalHTML = `
    <div id="super-stock-modal" class="hidden fixed inset-0 bg-slate-900 bg-opacity-60 backdrop-blur-sm overflow-y-auto h-full w-full z-[80] flex items-center justify-center transition-opacity opacity-0">
        <div class="relative mx-auto p-0 border border-slate-100 w-full max-w-2xl shadow-2xl rounded-2xl bg-white modal-container scale-95 transition-all overflow-hidden flex flex-col max-h-[95vh]">
            <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-600">
                <h3 class="text-lg font-black text-white flex items-center gap-2" id="super-stock-modal-title">
                    <span class="text-xl">📦</span> จัดการข้อมูลพัสดุ
                </h3>
                <button id="close-super-stock-modal" class="text-indigo-200 hover:text-white transition-colors bg-transparent border-0">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="p-6 overflow-y-auto bg-slate-50 flex-grow" id="super-stock-modal-body">
                <div class="space-y-4">
                    <input type="hidden" id="super-stock-original-type">
                    <input type="hidden" id="super-stock-original-size">

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="col-span-1 md:col-span-2 flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-xl bg-white">
                            <img id="super-stock-image-preview" src="https://placehold.co/128x128/e2e8f0/64748b?text=Image" class="w-32 h-32 object-cover rounded-lg shadow-sm mb-3 border border-slate-200">
                            <label class="cursor-pointer bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg text-xs font-bold transition-colors border border-indigo-200">
                                📸 อัปโหลดรูปภาพใหม่
                                <input type="file" id="super-stock-image-upload" class="hidden" accept="image/*">
                            </label>
                            <input type="hidden" id="super-stock-image-url">
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">ชื่อรายการพัสดุ <span class="text-red-500">*</span></label>
                            <input type="text" id="super-stock-type" class="w-full py-2.5 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 bg-white">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">ไซส์ / ขนาด <span class="text-red-500">*</span></label>
                            <input type="text" id="super-stock-size" class="w-full py-2.5 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 bg-white">
                        </div>
                        <div class="col-span-1 md:col-span-2">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">หมวดหมู่ <span class="text-red-500">*</span></label>
                            <input type="text" id="super-stock-category" class="w-full py-2.5 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 bg-white" placeholder="เช่น เสื้อ, กางเกง, อุปกรณ์">
                        </div>

                        <div class="bg-white p-3 rounded-xl border border-slate-200 col-span-1 md:col-span-2 grid grid-cols-3 gap-3 shadow-sm">
                            <div>
                                <label class="block text-[10px] font-bold text-emerald-600 uppercase mb-1 text-center">🌟 ของใหม่</label>
                                <input type="number" id="super-stock-new-qty" min="0" value="0" class="w-full py-2 px-3 border border-emerald-200 bg-emerald-50 rounded-lg text-lg font-black text-emerald-700 text-center focus:ring-2 focus:ring-emerald-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-blue-600 uppercase mb-1 text-center">♻️ มือสอง</label>
                                <input type="number" id="super-stock-used-qty" min="0" value="0" class="w-full py-2 px-3 border border-blue-200 bg-blue-50 rounded-lg text-lg font-black text-blue-700 text-center focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-rose-600 uppercase mb-1 text-center">🗑️ ชำรุด</label>
                                <input type="number" id="super-stock-damaged-qty" min="0" value="0" class="w-full py-2 px-3 border border-rose-200 bg-rose-50 rounded-lg text-lg font-black text-rose-700 text-center focus:ring-2 focus:ring-rose-500 outline-none">
                            </div>
                        </div>

                        <div class="col-span-1 md:col-span-2">
                            <label class="block text-xs font-bold text-amber-600 uppercase mb-1">แจ้งเตือนเมื่อสต๊อกต่ำกว่า (ชิ้น)</label>
                            <input type="number" id="super-stock-threshold-qty" min="0" value="5" class="w-full py-2 px-3 border border-amber-200 bg-amber-50 rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-amber-500 outline-none">
                        </div>
                    </div>
                </div>
            </div>
            <div class="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 rounded-b-2xl shadow-inner">
                <button id="cancel-super-stock" class="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">ยกเลิก</button>
                <button id="save-super-stock" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    บันทึกข้อมูล
                </button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const closeModal = () => closeModalAnimation(document.getElementById('super-stock-modal'));
    document.getElementById('close-super-stock-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-super-stock').addEventListener('click', closeModal);
    document.getElementById('super-stock-modal').addEventListener('click', (e) => { if(e.target.id === 'super-stock-modal') closeModal(); });

    document.getElementById('super-stock-image-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        document.getElementById('super-stock-image-preview').src = URL.createObjectURL(file); 
        const formData = new FormData(); formData.append('image', file);
        try {
            const response = await fetch(`${API_BASE_URL}/api/upload`, { method: 'POST', body: formData });
            const result = JSON.parse(await response.text());
            if(result.imageUrl) { 
                document.getElementById('super-stock-image-url').value = result.imageUrl; 
                showNotification('อัปโหลดรูปภาพสำเร็จ', 'success'); 
            }
        } catch(err) { showNotification('อัปโหลดรูปไม่สำเร็จ', 'error'); }
    });

    document.getElementById('save-super-stock').addEventListener('click', async (e) => {
        const btn = e.target;
        const data = {
            itemType: document.getElementById('super-stock-type').value.trim(), 
            size: document.getElementById('super-stock-size').value.trim(),
            originalItemType: document.getElementById('super-stock-original-type').value || null, 
            originalSize: document.getElementById('super-stock-original-size').value || null,
            category: document.getElementById('super-stock-category').value.trim(), 
            newStock: parseInt(document.getElementById('super-stock-new-qty').value) || 0,
            usedStock: parseInt(document.getElementById('super-stock-used-qty').value) || 0, 
            damagedStock: parseInt(document.getElementById('super-stock-damaged-qty').value) || 0,
            lowStockThreshold: parseInt(document.getElementById('super-stock-threshold-qty').value) || 5, 
            imageUrl: document.getElementById('super-stock-image-url').value,
            adminUser: AppState.currentUser.username
        };

        if (!data.itemType || !data.size || !data.category) return showNotification('กรุณากรอกข้อมูลหลักให้ครบ', 'error');
        showLoadingButton(btn, true);
        try { 
            await apiCall('/api/stock', 'POST', data); 
            onAdminActionSuccess('บันทึกพัสดุสำเร็จ'); 
            closeModal();
        } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'บันทึกข้อมูล'); }
    });
}

function openSuperStockModal(isEdit = false, item = null) {
    const modal = document.getElementById('super-stock-modal');
    if (!modal) return;

    const inputsToLock = [ 'super-stock-type', 'super-stock-size', 'super-stock-category', 'super-stock-new-qty', 'super-stock-used-qty', 'super-stock-damaged-qty' ];

    if (isEdit && item) {
        document.getElementById('super-stock-modal-title').innerHTML = '<span class="text-xl">📸</span> อัปเดตรูปภาพพัสดุ';
        document.getElementById('super-stock-original-type').value = item.itemType;
        document.getElementById('super-stock-original-size').value = item.size;
        
        document.getElementById('super-stock-type').value = item.itemType;
        document.getElementById('super-stock-size').value = item.size;
        document.getElementById('super-stock-category').value = item.category || '';
        document.getElementById('super-stock-image-url').value = item.imageUrl || '';
        document.getElementById('super-stock-image-preview').src = item.imageUrl ? (API_BASE_URL + item.imageUrl) : 'https://placehold.co/128x128/e2e8f0/64748b?text=Image';
        
        document.getElementById('super-stock-new-qty').value = item.newStock || 0;
        document.getElementById('super-stock-used-qty').value = item.usedStock || 0;
        document.getElementById('super-stock-damaged-qty').value = item.damagedStock || 0;
        document.getElementById('super-stock-threshold-qty').value = item.lowStockThreshold || 5;

        inputsToLock.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.disabled = true; el.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed'); }
        });

        let note = document.getElementById('edit-mode-note');
        if(!note) {
            note = document.createElement('div'); note.id = 'edit-mode-note';
            note.className = 'col-span-1 md:col-span-2 bg-blue-50 text-blue-700 border border-blue-200 p-3 rounded-lg text-sm font-bold text-center mb-2';
            note.innerHTML = '🔒 โหมดแก้ไข: อนุญาตให้อัปเดต <span class="text-blue-900 underline">เฉพาะรูปภาพและแจ้งเตือน</span> เท่านั้น';
            const formGrid = document.getElementById('super-stock-modal-body').querySelector('.grid');
            if (formGrid) formGrid.prepend(note);
        }
        if(note) note.style.display = 'block';

    } else {
        document.getElementById('super-stock-modal-title').innerHTML = '<span class="text-xl">➕</span> เพิ่มพัสดุใหม่';
        document.getElementById('super-stock-original-type').value = '';
        document.getElementById('super-stock-original-size').value = '';
        document.getElementById('super-stock-type').value = '';
        document.getElementById('super-stock-size').value = '';
        document.getElementById('super-stock-category').value = '';
        document.getElementById('super-stock-image-url').value = '';
        document.getElementById('super-stock-image-preview').src = 'https://placehold.co/128x128/e2e8f0/64748b?text=Image';
        document.getElementById('super-stock-new-qty').value = 0;
        document.getElementById('super-stock-used-qty').value = 0;
        document.getElementById('super-stock-damaged-qty').value = 0;
        document.getElementById('super-stock-threshold-qty').value = 5;

        inputsToLock.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.disabled = false; el.classList.remove('bg-slate-100', 'text-slate-500', 'cursor-not-allowed'); }
        });

        const note = document.getElementById('edit-mode-note');
        if (note) note.style.display = 'none';
    }
    openModalAnimation(modal);
}

// ==========================================
// 👥 9. ADMIN: USER MANAGEMENT
// ==========================================
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
        const text = await response.text(); 
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

function onUsersReceived(users) { AppState.allUsersData = users; renderUsersTable(); }

function renderUsersTable() {
    const searchTerm = document.getElementById('user-search-input')?.value.toLowerCase() || '';
    const filteredData = AppState.allUsersData.filter(user => user.username.toLowerCase().includes(searchTerm) || user.name.toLowerCase().includes(searchTerm) || (user.department && user.department.toLowerCase().includes(searchTerm)));
    const totalPages = Math.ceil(filteredData.length / AppState.pagination.rowsPerPage); 
    if (AppState.pagination.users > totalPages) AppState.pagination.users = Math.max(1, totalPages);
    const pageData = filteredData.slice((AppState.pagination.users - 1) * AppState.pagination.rowsPerPage, AppState.pagination.users * AppState.pagination.rowsPerPage);
    
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
    if(document.getElementById('user-page-info')) document.getElementById('user-page-info').textContent = `หน้า ${AppState.pagination.users} จาก ${totalPages || 1}`;
    if(document.getElementById('prev-user-page-btn')) document.getElementById('prev-user-page-btn').disabled = AppState.pagination.users <= 1;
    if(document.getElementById('next-user-page-btn')) document.getElementById('next-user-page-btn').disabled = AppState.pagination.users >= totalPages;
}

function handleUserSearch() { AppState.pagination.users = 1; renderUsersTable(); }
function changeUserPage(dir) { AppState.pagination.users += dir; renderUsersTable(); }

async function handleSaveUser(e) {
    if(e) e.preventDefault();
    const btn = document.getElementById('save-user-btn');
    const userData = { 
        name: document.getElementById('user-form-name').value.trim(), 
        department: document.getElementById('user-form-department').value.trim(), 
        username: document.getElementById('user-form-username').value.trim(), 
        password: document.getElementById('user-form-password').value.trim(), 
        role: document.getElementById('user-form-role').value, 
        status: document.getElementById('user-form-status').value 
    };
    
    if (!userData.name || !userData.username || !userData.password) return showNotification('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
    showLoadingButton(btn, true);
    try { 
        await apiCall('/api/users', 'POST', { userData, adminUser: AppState.currentUser.username, originalUsername: AppState.currentEditUser }); 
        onAdminActionSuccess('บันทึกผู้ใช้สำเร็จ'); 
    } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'บันทึก'); }
}

function populateUserForm(username) {
    const user = AppState.allUsersData.find(u => u.username === username);
    if (user) {
        document.getElementById('user-form-name').value = user.name || ''; 
        document.getElementById('user-form-department').value = user.department || '';
        document.getElementById('user-form-username').value = user.username || ''; 
        document.getElementById('user-form-password').value = user.password || ''; 
        document.getElementById('user-form-role').value = user.role || 'user'; 
        document.getElementById('user-form-status').value = user.status || 'active';
        
        document.getElementById('user-form-username').disabled = false; 
        AppState.currentEditUser = user.username;
        toggleUserForm(true);
    }
}

function clearUserForm() { 
    const form = document.getElementById('user-management-form');
    if (form && typeof form.reset === 'function') form.reset();
    AppState.currentEditUser = null;
    if(document.getElementById('user-form-username')) document.getElementById('user-form-username').disabled = false; 
}

// ==========================================
// 📜 10. ADMIN: LOGS & HISTORY
// ==========================================
function onAdminLogReceived(logs) { 
    AppState.allAdminLogData = logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); 
    handleHistoryViewChange(); 
}

function handleHistoryViewChange() {
    if (document.getElementById('history-view-selector')?.value === 'requests') {
        document.getElementById('all-requests-view')?.classList.remove('hidden'); 
        document.getElementById('admin-log-view')?.classList.add('hidden'); 
        renderAllHistoryTable();
    } else {
        document.getElementById('all-requests-view')?.classList.add('hidden'); 
        document.getElementById('admin-log-view')?.classList.remove('hidden'); 
        AppState.pagination.logs = 1; 
        renderAdminLogTable();
    }
}

function renderAllHistoryTable() {
    const searchTerm = document.getElementById('admin-history-search')?.value.toLowerCase() || '';
    const filteredData = AppState.allRequestsData.filter(req => (req.requesterName && req.requesterName.toLowerCase().includes(searchTerm)) || (req.itemType && req.itemType.toLowerCase().includes(searchTerm)) || (req.status && req.status.toLowerCase().includes(searchTerm)));
    const totalPages = Math.ceil(filteredData.length / AppState.pagination.rowsPerPage); 
    if (AppState.pagination.history > totalPages) AppState.pagination.history = Math.max(1, totalPages);
    const pageData = filteredData.slice((AppState.pagination.history - 1) * AppState.pagination.rowsPerPage, AppState.pagination.history * AppState.pagination.rowsPerPage);
    
    displayRequests(pageData, 'all-requests-table', true);
    if(document.getElementById('page-info')) document.getElementById('page-info').textContent = `หน้า ${AppState.pagination.history} จาก ${totalPages || 1}`;
    if(document.getElementById('prev-page-btn')) document.getElementById('prev-page-btn').disabled = AppState.pagination.history <= 1;
    if(document.getElementById('next-page-btn')) document.getElementById('next-page-btn').disabled = AppState.pagination.history >= totalPages;
}

function renderAdminLogTable() {
    const searchTerm = document.getElementById('admin-log-search')?.value.toLowerCase() || '';
    const filteredData = AppState.allAdminLogData.filter(log => (log.adminName && log.adminName.toLowerCase().includes(searchTerm)) || (log.action && log.action.toLowerCase().includes(searchTerm)) || (log.details && log.details.toLowerCase().includes(searchTerm)));
    const totalPages = Math.ceil(filteredData.length / AppState.pagination.rowsPerPage); 
    if (AppState.pagination.logs > totalPages) AppState.pagination.logs = Math.max(1, totalPages);
    const pageData = filteredData.slice((AppState.pagination.logs - 1) * AppState.pagination.rowsPerPage, AppState.pagination.logs * AppState.pagination.rowsPerPage);

    const tbody = document.getElementById('admin-log-table'); if(!tbody) return; tbody.innerHTML = '';
    pageData.forEach(log => { tbody.innerHTML += `<tr><td class="p-3 text-sm">${new Date(log.createdAt).toLocaleString()}</td><td class="p-3 text-sm font-bold text-indigo-600">${log.adminName}</td><td class="p-3 text-sm font-medium text-slate-700">${log.action}</td><td class="p-3 text-xs text-slate-500">${log.details}</td></tr>`; });
    if(document.getElementById('log-page-info')) document.getElementById('log-page-info').textContent = `หน้า ${AppState.pagination.logs} จาก ${totalPages || 1}`;
    if(document.getElementById('prev-log-page-btn')) document.getElementById('prev-log-page-btn').disabled = AppState.pagination.logs <= 1;
    if(document.getElementById('next-log-page-btn')) document.getElementById('next-log-page-btn').disabled = AppState.pagination.logs >= totalPages;
}

function handleHistorySearch() { AppState.pagination.history = 1; renderAllHistoryTable(); }
function changeHistoryPage(dir) { AppState.pagination.history += dir; renderAllHistoryTable(); }
function handleLogSearch() { AppState.pagination.logs = 1; renderAdminLogTable(); } 
function changeLogPage(dir) { AppState.pagination.logs += dir; renderAdminLogTable(); } 

// ==========================================
// 🎨 11. UI UTILITIES & EVENT DELEGATION
// ==========================================
function setupStaticEventListeners() {
    // ---- Auth & Modals Close ----
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
    const handleEnterPress = (e) => { if (e.key === 'Enter') handleLogin(); };
    document.getElementById('username')?.addEventListener('keyup', handleEnterPress);
    document.getElementById('password')?.addEventListener('keyup', handleEnterPress);

    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('show-forgot-password-options')?.addEventListener('click', showForgotPasswordView);
    document.getElementById('forgot-password-link')?.addEventListener('click', showForgotPasswordView);
    document.getElementById('back-to-login-link')?.addEventListener('click', showLoginView);
    document.getElementById('check-reset-status-btn')?.addEventListener('click', handleForgotPasswordRequest);
    document.getElementById('force-change-password-btn')?.addEventListener('click', handleForceChangePassword);

    document.getElementById('history-modal-close-btn')?.addEventListener('click', closeHistoryModal);
    document.getElementById('user-history-modal')?.addEventListener('click', (e) => { if (e.target.id === 'user-history-modal') closeHistoryModal(); });
    document.getElementById('stock-history-modal-close-btn')?.addEventListener('click', () => closeModalAnimation(document.getElementById('stock-history-modal')));
    document.getElementById('stock-history-modal')?.addEventListener('click', (e) => { if (e.target.id === 'stock-history-modal') closeModalAnimation(document.getElementById('stock-history-modal')); });
    document.getElementById('close-adjust-modal-btn')?.addEventListener('click', () => closeModalAnimation(document.getElementById('advanced-adjust-modal')));
    document.getElementById('advanced-adjust-modal')?.addEventListener('click', (e) => { if (e.target.id === 'advanced-adjust-modal') closeModalAnimation(document.getElementById('advanced-adjust-modal')); });

    // ---- User Dashboard ----
    document.getElementById('request-btn')?.addEventListener('click', handleSubmitRequest);
    document.getElementById('request-reason-type')?.addEventListener('change', toggleRequestForm);
    document.getElementById('request-type')?.addEventListener('change', populateSizeDropdown);
    document.getElementById('request-size')?.addEventListener('change', displaySelectedItemImage); 
    document.getElementById('return-item-select')?.addEventListener('change', handleReturnableItemSelection);
    document.getElementById('my-history-header')?.addEventListener('click', toggleMyHistory);
    document.getElementById('my-requests-header')?.addEventListener('click', toggleMyRequests);

    // ---- Admin Dashboard ----
    document.getElementById('save-user-btn')?.addEventListener('click', handleSaveUser);
    document.getElementById('clear-user-form-btn')?.addEventListener('click', clearUserForm);
    document.getElementById('import-users-btn')?.addEventListener('click', handleImportUsersCSV);
    document.getElementById('user-search-input')?.addEventListener('keyup', handleUserSearch);
    document.getElementById('prev-user-page-btn')?.addEventListener('click', () => changeUserPage(-1));
    document.getElementById('next-user-page-btn')?.addEventListener('click', () => changeUserPage(1));
    document.getElementById('toggle-user-form-btn')?.addEventListener('click', () => toggleUserForm());
    
    document.getElementById('admin-dashboard-panel')?.addEventListener('click', (e) => {
        const tabTarget = e.target.closest('.admin-tab');
        if (tabTarget) handleTabClick(tabTarget.id.replace('tab-', ''));
        const filterTarget = e.target.closest('.stock-filter-btn');
        if (filterTarget) handleStockFilter(filterTarget);
    });

    document.getElementById('history-view-selector')?.addEventListener('change', handleHistoryViewChange);
    document.getElementById('admin-history-search')?.addEventListener('keyup', handleHistorySearch);
    document.getElementById('prev-page-btn')?.addEventListener('click', () => changeHistoryPage(-1));
    document.getElementById('next-page-btn')?.addEventListener('click', () => changeHistoryPage(1));
    document.getElementById('admin-log-search')?.addEventListener('keyup', handleLogSearch);
    document.getElementById('prev-log-page-btn')?.addEventListener('click', () => changeLogPage(-1));
    document.getElementById('next-log-page-btn')?.addEventListener('click', () => changeLogPage(1));
    
    document.getElementById('export-history-btn')?.addEventListener('click', () => { window.open(`${API_BASE_URL}/api/export/history`, '_blank'); });
    document.getElementById('export-stock-history-btn')?.addEventListener('click', (e) => {
        const type = e.target.dataset.type; const size = e.target.dataset.size;
        if(type && size) window.open(`${API_BASE_URL}/api/export/stock-history?itemType=${encodeURIComponent(type)}&size=${encodeURIComponent(size)}`, '_blank');
    });

    const oldToggleBtn = document.getElementById('toggle-stock-form-btn');
    if (oldToggleBtn) {
        oldToggleBtn.innerHTML = '<span class="text-lg">➕</span> เพิ่มพัสดุใหม่ (ระบบใหม่)';
        oldToggleBtn.classList.replace('bg-indigo-50', 'bg-indigo-600');
        oldToggleBtn.classList.replace('text-indigo-600', 'text-white');
        oldToggleBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSuperStockModal(false); });
    }
    const oldFormArea = document.getElementById('stock-form-content');
    if (oldFormArea) oldFormArea.style.display = 'none';

    // ---- Event Delegation (ปุ่มที่ถูกสร้างมาทีหลังด้วย Javascript) ----
    document.addEventListener('click', async (e) => {
        if (!AppState.currentUser) return;
        
        if (e.target.matches('.approve-reset-btn')) {
            const id = e.target.dataset.id; const user = e.target.dataset.user;
            showPromptModal(`ตั้งรหัสผ่านชั่วคราวให้ ${user}:`, async (pwd) => {
                if(pwd.length < 4) return showNotification("รหัสผ่านต้องมี 4 ตัวอักษรขึ้นไป", "error");
                showLoadingButton(e.target, true);
                try {
                    await apiCall('/api/admin/approve-reset', 'POST', { resetId: id, username: user, newPassword: pwd, adminUser: AppState.currentUser.username });
                    onAdminActionSuccess(`อนุมัติรีเซ็ตรหัสผ่านสำเร็จ`);
                } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'อนุมัติ / ตั้งรหัสใหม่'); }
            });
        }
        else if (e.target.matches('.approve-btn')) handleApproveRequest(e.target);
        else if (e.target.matches('.reject-btn')) handleRejectRequest(e.target);
        else if (e.target.matches('.process-return-btn')) handleProcessReturn(e.target);
        else if (e.target.matches('.reject-return-btn')) {
            showPromptModal("เหตุผลที่ปฏิเสธการคืน:", async (reason) => {
                showLoadingButton(e.target, true);
                try {
                    await apiCall('/api/admin/reject', 'POST', { requestId: e.target.dataset.id, reason, adminUser: AppState.currentUser.username });
                    onAdminActionSuccess('ปฏิเสธการคืนสำเร็จ');
                } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'ปฏิเสธ'); }
            });
        }
        else if (e.target.matches('.edit-stock-btn')) {
            const item = AppState.masterStock.find(s => s.itemType === e.target.dataset.type && s.size === e.target.dataset.size);
            if (item) openSuperStockModal(true, item);
        }
        else if (e.target.matches('.receive-stock-btn')) {
            const type = e.target.dataset.type; const size = e.target.dataset.size;
            showPromptModal(`รับของเข้า: ${type} (${size})\nระบุจำนวน (ชิ้น):`, async (qty) => {
                const num = parseInt(qty);
                if (isNaN(num) || num <= 0) return showNotification('ระบุตัวเลขให้ถูกต้อง', 'error');
                showLoadingButton(e.target, true);
                try {
                    await apiCall('/api/stock/transaction', 'POST', { itemType: type, size, transactionType: 'IN', quantity: num, reason: 'รับเข้าใหม่', adminUser: AppState.currentUser.username });
                    onAdminActionSuccess(`รับเข้าสำเร็จ`);
                } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, '+ รับเข้า'); }
            });
        }
        else if (e.target.matches('.adjust-stock-btn')) {
            const item = AppState.masterStock.find(s => s.itemType === e.target.dataset.type && s.size === e.target.dataset.size);
            if(!item) return;
            document.getElementById('adjust-target-id').value = `${item.itemType}|${item.size}`;
            document.getElementById('adjust-item-name').textContent = item.itemType;
            document.getElementById('adjust-item-size').textContent = `ไซส์: ${item.size}`;
            
            const cond = document.getElementById('adjust-stock-condition');
            if (cond) {
                cond.options[0].text = `🌟 ของใหม่ (คงเหลือ: ${item.newStock})`;
                cond.options[1].text = `♻️ มือสอง (คงเหลือ: ${item.usedStock})`;
                cond.options[2].text = `🗑️ ชำรุด (คงเหลือ: ${item.damagedStock})`;
            }
            openModalAnimation(document.getElementById('advanced-adjust-modal'));
        }
        else if (e.target.closest('#confirm-advanced-adjust-btn')) {
            const btn = document.getElementById('confirm-advanced-adjust-btn');
            const target = document.getElementById('adjust-target-id').value.split('|');
            const qty = parseInt(document.getElementById('adjust-qty-input').value);
            if (isNaN(qty) || qty < 0) return showNotification('กรุณากรอกตัวเลข', 'error');

            showLoadingButton(btn, true);
            try {
                await apiCall('/api/stock/advanced-adjust', 'POST', { 
                    itemType: target[0], size: target[1], 
                    condition: document.getElementById('adjust-stock-condition').value, 
                    mode: document.getElementById('adjust-mode').value, qty, 
                    reason: `[${document.getElementById('adjust-reason-category').value}] ${document.getElementById('adjust-reason-note').value}`, 
                    adminUser: AppState.currentUser.username 
                });
                onAdminActionSuccess(`ปรับปรุงสต๊อกสำเร็จ`);
                closeModalAnimation(document.getElementById('advanced-adjust-modal'));
            } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'บันทึก'); }
        }
        else if (e.target.matches('.history-stock-btn')) {
            const type = e.target.dataset.type; const size = e.target.dataset.size;
            document.getElementById('export-stock-history-btn').dataset.type = type;
            document.getElementById('export-stock-history-btn').dataset.size = size;
            document.getElementById('stock-history-modal-title').textContent = `ความเคลื่อนไหวสต๊อก: ${type} (${size})`;
            openModalAnimation(document.getElementById('stock-history-modal'));
            document.getElementById('stock-history-modal-content').innerHTML = '<div class="text-center p-4">กำลังโหลด...</div>';
            
            try {
                const history = await apiCall(`/api/stock/history?itemType=${encodeURIComponent(type)}&size=${encodeURIComponent(size)}`);
                let html = '<div class="overflow-hidden border border-slate-200 rounded-xl shadow-sm"><table class="min-w-full divide-y divide-slate-200"><thead class="bg-slate-100"><tr><th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">เวลา</th><th class="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase">ประเภท</th><th class="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase">จำนวน</th><th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">เหตุผล</th><th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">แอดมิน</th></tr></thead><tbody class="bg-white divide-y divide-slate-100">';
                if(history.length === 0) html = '<div class="text-center p-8 bg-white border border-slate-200 rounded-xl"><p class="text-slate-500 font-medium">ไม่มีประวัติความเคลื่อนไหว</p></div>';
                else {
                    history.forEach(log => {
                        let badgeColor = log.transactionType === 'IN' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : log.transactionType.includes('OUT') ? 'bg-rose-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200';
                        let qtyColor = log.quantity > 0 ? 'text-emerald-600 bg-emerald-50' : log.quantity < 0 ? 'text-rose-600 bg-rose-50' : 'text-amber-600 bg-amber-50';
                        html += `<tr><td class="p-3 text-xs text-slate-500 whitespace-nowrap">${new Date(log.createdAt).toLocaleString()}</td><td class="p-3 text-center"><span class="px-2.5 py-1 rounded-md text-[10px] font-bold border ${badgeColor}">${log.transactionType}</span></td><td class="p-3 text-center"><span class="px-3 py-1 rounded-lg text-sm font-black ${qtyColor}">${log.quantity > 0 ? '+'+log.quantity : log.quantity}</span></td><td class="p-3 text-xs text-slate-700 font-medium">${log.reason || '-'}</td><td class="p-3 text-xs font-semibold text-indigo-600">${log.adminUser}</td></tr>`;
                    });
                    html += '</tbody></table></div>';
                }
                document.getElementById('stock-history-modal-content').innerHTML = html;
            } catch(e) { document.getElementById('stock-history-modal-content').innerHTML = '<p class="text-red-500 text-center">เกิดข้อผิดพลาด</p>'; }
        }
        else if (e.target.matches('.edit-user-btn')) populateUserForm(e.target.dataset.username);
        else if (e.target.matches('.reset-password-btn')) {
            showPromptModal(`กรอกรหัสผ่านใหม่:`, async (pwd) => {
                if (pwd.length < 4) return showNotification("รหัสผ่านต้องมี 4 ตัวอักษรขึ้นไป", "error");
                showLoadingButton(e.target, true);
                try {
                    await apiCall('/api/auth/change-password', 'POST', { username: e.target.dataset.username, newPassword: pwd, forceChange: true });
                    onAdminActionSuccess(`รีเซ็ตรหัสผ่านสำเร็จ`);
                } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'รหัส'); }
            });
        }
        else if (e.target.matches('.delete-user-btn')) {
            if (e.target.dataset.username === AppState.currentUser.username) return showNotification('ไม่สามารถลบตัวเองได้', 'error');
            showConfirmModal(`ยืนยันลบผู้ใช้?`, async () => {
                showLoadingButton(e.target, true);
                try {
                    await apiCall(`/api/users/${e.target.dataset.username}`, 'DELETE', { adminUser: AppState.currentUser.username });
                    onAdminActionSuccess('ลบสำเร็จ');
                } catch(err) { onActionFailure(err); showLoadingButton(e.target, false, 'ลบ'); }
            });
        }
        else if (e.target.matches('.view-history-btn') || e.target.matches('.clickable-username')) {
            e.preventDefault();
            const username = e.target.dataset.requesterName || e.target.dataset.username;
            openHistoryModal(username);
            try {
                const summary = await apiCall(`/api/requests/me?username=${username}`);
                const totalItems = summary.reduce((acc, req) => req.status === 'Approved' ? acc + req.quantity : acc, 0);
                document.getElementById('history-modal-content').innerHTML = `<div class="grid grid-cols-2 gap-4 text-center mt-4"><div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100"><p class="text-sm font-bold text-indigo-800">คำขอทั้งหมด</p><p class="text-3xl font-black text-indigo-600">${summary.length || 0}</p></div><div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100"><p class="text-sm font-bold text-emerald-800">พัสดุที่เคยเบิก</p><p class="text-3xl font-black text-emerald-600">${totalItems}</p></div></div>`;
            } catch(e) {}
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.matches('input[name^="return-condition-"]')) {
            const id = e.target.name.replace('return-condition-', '');
            const reasonDiv = document.getElementById(`damage-reason-div-${id}`);
            if (e.target.value === 'Damaged') reasonDiv.classList.remove('hidden');
            else reasonDiv.classList.add('hidden');
        }
    });
}

function showNotification(message, type = 'success') {
    const el = document.getElementById('notification');
    if(!el) return;
    document.getElementById('notification-message').textContent = message;
    el.classList.remove('bg-red-500', 'bg-emerald-500', 'hidden'); 
    el.classList.add(type === 'error' ? 'bg-red-500' : 'bg-emerald-500');
    setTimeout(() => el.classList.add('hidden'), 4000);
}

function showLoadingButton(button, isLoading, originalText = '') {
    if (!button) return;
    if (isLoading) { 
        if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML; 
        button.disabled = true; 
        button.innerHTML = `<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>`; 
    } else { 
        button.disabled = false; 
        button.innerHTML = originalText || button.dataset.originalText || 'Submit'; 
        button.dataset.originalText = ''; 
    }
}

function onActionSuccess(message) {
    showNotification(message, 'success');
    document.getElementById('request-form')?.reset();
    document.getElementById('return-form')?.reset();
    toggleRequestForm(); resetActionButtons(); refreshData();
}

function onAdminActionSuccess(message) {
    showNotification(message, 'success');
    clearUserForm(); resetActionButtons(); refreshData();
}

function onActionFailure(error) { 
    showNotification(error.message, 'error'); 
    resetActionButtons(); 
}

function resetActionButtons() {
    showLoadingButton(document.getElementById('request-btn'), false); 
    showLoadingButton(document.getElementById('save-user-btn'), false, 'บันทึก'); 
    document.querySelectorAll('button:disabled').forEach(btn => showLoadingButton(btn, false));
}

function openModalAnimation(modal) { 
    if (!modal) return; 
    modal.classList.remove('hidden'); 
    setTimeout(() => { 
        modal.classList.remove('opacity-0'); 
        const c = modal.querySelector('.modal-container'); 
        if (c) c.classList.remove('scale-95'); 
    }, 10); 
}

function closeModalAnimation(modal) { 
    if (!modal) return; 
    modal.classList.add('opacity-0'); 
    const c = modal.querySelector('.modal-container'); 
    if (c) c.classList.add('scale-95'); 
    setTimeout(() => modal.classList.add('hidden'), 300); 
}

function showPromptModal(title, callback) { 
    const modal = document.getElementById('prompt-modal'); 
    if(!modal) return; 
    document.getElementById('prompt-modal-title').textContent = title; 
    const input = document.getElementById('prompt-modal-input'); input.value = ''; 
    document.getElementById('prompt-modal-submit-btn').onclick = () => { if(input.value.trim()) { closeModalAnimation(modal); callback(input.value.trim()); } }; 
    document.getElementById('prompt-modal-cancel-btn').onclick = () => closeModalAnimation(modal); 
    openModalAnimation(modal); setTimeout(() => input.focus(), 100); 
}

function showConfirmModal(message, callback) { 
    const modal = document.getElementById('confirm-modal'); 
    if(!modal) return; 
    document.getElementById('confirm-modal-message').textContent = message; 
    document.getElementById('confirm-modal-ok-btn').onclick = () => { closeModalAnimation(modal); callback(); }; 
    document.getElementById('confirm-modal-cancel-btn').onclick = () => closeModalAnimation(modal); 
    openModalAnimation(modal); 
}

async function openHistoryModal(title) { 
    const modal = document.getElementById('user-history-modal'); 
    if(!modal) return; 
    document.getElementById('history-modal-username').textContent = title; 
    openModalAnimation(modal); 
    document.getElementById('history-modal-content').innerHTML = '<p class="text-center mt-6 text-slate-500">กำลังโหลดข้อมูล...</p>'; 
}
function closeHistoryModal() { closeModalAnimation(document.getElementById('user-history-modal')); }

function toggleRequestForm() {
    if (document.getElementById('request-reason-type').value === 'Damaged/Lost') {
        document.getElementById('new-request-form')?.classList.add('hidden'); 
        document.getElementById('return-request-form')?.classList.remove('hidden');
        const btn = document.getElementById('request-btn'); btn.textContent = 'ส่งคำขอคืน'; 
        btn.classList.replace('bg-indigo-600', 'bg-orange-500'); btn.classList.replace('hover:bg-indigo-700', 'hover:bg-orange-600'); btn.classList.replace('shadow-indigo-200', 'shadow-orange-200');
        populateReturnableItemsDropdown();
    } else {
        document.getElementById('new-request-form')?.classList.remove('hidden'); 
        document.getElementById('return-request-form')?.classList.add('hidden');
        const btn = document.getElementById('request-btn'); btn.textContent = 'ส่งคำขอเบิก'; 
        btn.classList.replace('bg-orange-500', 'bg-indigo-600'); btn.classList.replace('hover:bg-orange-600', 'hover:bg-indigo-700'); btn.classList.replace('shadow-orange-200', 'shadow-indigo-200');
    }
}
function toggleMyHistory() { const content = document.getElementById('my-history-content'); content?.classList.toggle('expanded'); content.style.maxHeight = content.classList.contains('expanded') ? content.scrollHeight + 'px' : '0px'; document.getElementById('my-history-toggle-icon').style.transform = content.classList.contains('expanded') ? 'rotate(0deg)' : 'rotate(-180deg)'; }
function toggleMyRequests() { const content = document.getElementById('my-requests-content'); content?.classList.toggle('expanded'); content.style.maxHeight = content.classList.contains('expanded') ? content.scrollHeight + 'px' : '0px'; document.getElementById('my-requests-toggle-icon').style.transform = content.classList.contains('expanded') ? 'rotate(0deg)' : 'rotate(-180deg)'; }
function toggleUserForm(forceOpen = false) { const content = document.getElementById('user-form-content'); if (forceOpen) content.classList.add('expanded'); else content?.classList.toggle('expanded'); content.style.maxHeight = content.classList.contains('expanded') ? content.scrollHeight + 'px' : '0px'; document.getElementById('user-form-toggle-icon').style.transform = content.classList.contains('expanded') ? 'rotate(0deg)' : 'rotate(-180deg)'; }

function handleTabClick(tabName) {
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.admin-tab').forEach(tab => { tab.classList.remove('bg-indigo-50', 'border-indigo-500', 'text-indigo-600'); tab.classList.add('border-transparent', 'text-slate-500'); });
    document.getElementById(`content-${tabName}`)?.classList.remove('hidden');
    const btn = document.getElementById(`tab-${tabName}`); if(btn) { btn.classList.add('bg-indigo-50', 'border-indigo-500', 'text-indigo-600'); btn.classList.remove('border-transparent', 'text-slate-500'); }
}

function showForgotPasswordView(e) { e?.preventDefault(); document.getElementById('login-view')?.classList.add('hidden'); document.getElementById('forgot-password-view')?.classList.remove('hidden'); }
function showLoginView(e) { e?.preventDefault(); document.getElementById('login-view')?.classList.remove('hidden'); document.getElementById('forgot-password-view')?.classList.add('hidden'); }
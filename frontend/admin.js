// ============================================================================
// 🌟 ADMIN MODULE: CORE & INIT
// ============================================================================
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = isLocalhost ? 'http://localhost:3000' : 'https://uniform-system-v2.onrender.com';

function getImageUrl(url) {
    if (!url) return 'https://placehold.co/128x128/e2e8f0/64748b?text=No+Image';
    return url.startsWith('http') ? url : API_BASE_URL + '/' + url;
}

const AppState = {
    currentUser: null,
    masterStock: [],
    allRequestsData: [],
    allUsersData: [],
    allAdminLogData: [],
    currentPendingRequests: [],
    pagination: { history: 1, logs: 1, users: 1, rowsPerPage: 10 },
    pollingInterval: null,
    currentEditUser: null,
    stockFilterMode: 'ALL', 
    stockSearchTerm: '',
    activeStockCategory: null,
    currentDailyReportData: null 
};

document.addEventListener('DOMContentLoaded', () => {
    checkAdminSession();
    injectSuperStockModal(); 
    injectResignModal(); 
    injectImageModal(); 
    injectReportDateModal(); 
    injectRelativesModal(); // 💡 Modal ดูประวัติรายชื่อญาติ
    setupAdminEventListeners(); 
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

function checkAdminSession() {
    const storedUser = sessionStorage.getItem('currentUser');
    if (!storedUser) {
        window.location.href = 'index.html';
        return;
    }
    const user = JSON.parse(storedUser);
    
    if (user.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    
    AppState.currentUser = user;
    document.getElementById('admin-user-name').textContent = user.name;

    if (user.role !== 'admin') {
        document.getElementById('tab-approvals').classList.add('hidden');
        document.getElementById('tab-password-resets').classList.add('hidden');
        document.getElementById('tab-stock').classList.add('hidden');
        document.getElementById('tab-users').classList.add('hidden');
        document.getElementById('tab-history').classList.add('hidden');
        document.getElementById('tab-logs').classList.add('hidden');
        document.getElementById('tab-wp-approvals').classList.remove('hidden');
        document.getElementById('tab-wp-reports').classList.add('hidden');
        handleTabClick('wp-approvals');
    } else {
        document.getElementById('tab-wp-approvals').classList.remove('hidden');
        document.getElementById('tab-wp-reports').classList.remove('hidden');
        handleTabClick('approvals');
    }

    loadAdminData();
    startPollingForUpdates();

    const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
    const tmrStr = tmr.toISOString().split('T')[0];
    if(document.getElementById('wp-report-date-input')) document.getElementById('wp-report-date-input').value = tmrStr;
}

// ============================================================================
// 🔄 POLLING & DATA LOADING
// ============================================================================
async function loadAdminData() {
    try {
        if (AppState.currentUser.role === 'admin') {
            const [pendingReqs, users, logs, passwordResets, allReqs, stockData] = await Promise.all([
                apiCall('/api/admin/pending-approvals'), 
                apiCall('/api/users'), 
                apiCall('/api/logs'), 
                apiCall('/api/admin/password-resets'),
                apiCall('/api/requests/all'),
                apiCall('/api/stock')
            ]);
            displayPendingApprovals(pendingReqs);
            onUsersReceived(users);
            onAdminLogReceived(logs);
            displayPendingPasswordResets(passwordResets);
            
            AppState.allRequestsData = allReqs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            renderAllHistoryTable();
            onStockReceived(stockData);
            initImportRequestsUI();
        }
        
        loadWaterparkApprovals();
    } catch (error) { console.error("Admin Load Error:", error); }
}

function refreshData() { loadAdminData(); }

function startPollingForUpdates() {
    if (AppState.pollingInterval) clearInterval(AppState.pollingInterval); 
    AppState.pollingInterval = setInterval(async () => {
        try {
            if (AppState.currentUser.role === 'admin') {
                const newRequests = await apiCall('/api/admin/pending-approvals');
                const newRequestIds = newRequests.map(req => req.requestId);
                const currentRequestIds = AppState.currentPendingRequests.map(req => req.requestId);
                if (newRequestIds.length !== currentRequestIds.length || newRequestIds.some(id => !currentRequestIds.includes(id))) {
                    showNotification("มีรายการเบิกชุดใหม่รออนุมัติ!", 'success');
                    displayPendingApprovals(newRequests); 
                }
            }
            loadWaterparkApprovals();
        } catch(e) {}
    }, 15000); 
}

// ============================================================================
// 🌊 WATERPARK APPROVALS & DAILY REPORT VIEW
// ============================================================================
function createWaterparkTimeline(status) {
    let progress = 0;
    if (status === 'Pending_Head') progress = 15;
    else if (status === 'Pending_HR') progress = 50;
    else if (status === 'Approved') progress = 100;
    else if (status === 'Rejected' || status === 'Cancelled' || status === 'Returned') progress = 100;

    const isRejected = status === 'Rejected' || status === 'Cancelled' || status === 'Returned';
    const barColor = isRejected ? (status === 'Returned' ? 'bg-amber-400' : 'bg-red-400') : 'bg-emerald-400';

    return `
    <div class="relative w-full mt-3 mb-5 px-3">
        <div class="absolute top-1/2 left-6 right-6 h-1 bg-slate-200 -translate-y-1/2 rounded-full z-0"></div>
        <div class="absolute top-1/2 left-6 h-1 ${barColor} -translate-y-1/2 rounded-full z-0 transition-all duration-1000 ease-out" style="width: calc(${progress}% - 12px);"></div>
        
        <div class="flex justify-between relative z-10">
            <div class="flex flex-col items-center">
                <div class="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px] shadow-sm ring-2 ring-white z-10">✓</div>
                <span class="text-[8px] font-bold text-slate-500 mt-1 absolute -bottom-4 whitespace-nowrap">ส่งคำขอ</span>
            </div>
            <div class="flex flex-col items-center relative">
                <div class="w-5 h-5 rounded-full ${status === 'Pending_Head' ? 'bg-yellow-400 text-white animate-pulse shadow-md shadow-yellow-200' : (progress >= 50 ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-200 text-slate-400')} flex items-center justify-center font-bold text-[10px] ring-2 ring-white z-10 transition-colors">
                    ${status === 'Pending_Head' ? '⏳' : (progress >= 50 ? '✓' : '2')}
                </div>
                <span class="text-[8px] font-bold ${status === 'Pending_Head' ? 'text-yellow-600' : 'text-slate-500'} mt-1 absolute -bottom-4 whitespace-nowrap">หัวหน้า</span>
            </div>
            <div class="flex flex-col items-center relative">
                <div class="w-5 h-5 rounded-full ${status === 'Pending_HR' ? 'bg-orange-400 text-white animate-pulse shadow-md shadow-orange-200' : (progress === 100 && !isRejected ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-200 text-slate-400')} flex items-center justify-center font-bold text-[10px] ring-2 ring-white z-10 transition-colors">
                    ${status === 'Pending_HR' ? '⏳' : (progress === 100 && !isRejected ? '✓' : '3')}
                </div>
                <span class="text-[8px] font-bold ${status === 'Pending_HR' ? 'text-orange-600' : 'text-slate-500'} mt-1 absolute -bottom-4 whitespace-nowrap">บุคคล</span>
            </div>
            <div class="flex flex-col items-center relative">
                <div class="w-5 h-5 rounded-full ${progress === 100 ? (isRejected ? (status === 'Returned' ? 'bg-amber-500 text-white shadow-sm' : 'bg-red-500 text-white shadow-sm') : 'bg-emerald-500 text-white shadow-sm') : 'bg-slate-200 text-slate-400'} flex items-center justify-center font-bold text-[10px] ring-2 ring-white z-10 transition-colors">
                    ${progress === 100 ? (isRejected ? (status === 'Returned' ? '↩️' : '✕') : '✓') : '4'}
                </div>
                <span class="text-[8px] font-bold ${progress === 100 ? (isRejected ? (status === 'Returned' ? 'text-amber-600' : 'text-red-600') : 'text-emerald-600') : 'text-slate-500'} mt-1 absolute -bottom-4 whitespace-nowrap">${status === 'Returned' ? 'แก้ไขใหม่' : 'เสร็จสิ้น'}</span>
            </div>
        </div>
    </div>
    `;
}

async function loadWaterparkApprovals() {
    try {
        const data = await apiCall(`/api/waterpark/approvals/pending?username=${AppState.currentUser.username}&role=${AppState.currentUser.role}`);
        const container = document.getElementById('wp-pending-approvals-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (data.length === 0) {
            container.innerHTML = '<div class="text-center p-8 bg-white rounded-2xl border border-slate-200"><p class="text-slate-500 font-medium text-lg">ไม่มีคำขอเข้าสวนน้ำรออนุมัติ</p></div>';
            return;
        }

        let html = `
        <div class="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
            <table class="min-w-full divide-y divide-slate-200">
                <thead class="bg-slate-50">
                    <tr>
                        <th class="px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase w-10">ดู</th>
                        <th class="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">วันที่เข้าใช้ / รหัส</th>
                        <th class="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">ผู้ขอสิทธิ์</th>
                        <th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">สิทธิ์ / ผู้ติดตาม</th>
                        <th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">สถานะ</th>
                        <th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">จัดการ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
        `;

        data.forEach(req => {
            const d = new Date(req.visitDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
            const reqDate = new Date(req.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
            const freeCount = req.guests.filter(g => g.ticketType === 'FREE').length;
            const discountCount = req.guests.filter(g => g.ticketType === '50_DISCOUNT').length;

            const today = new Date(); today.setHours(0,0,0,0);
            const visitDateObj = new Date(req.visitDate);
            visitDateObj.setHours(0,0,0,0); 
            const isEditable = visitDateObj > today && AppState.currentUser.role === 'admin';

            // 💡 เช็คว่ามีญาติที่บัตรหมดอายุหรือไม่
            const hasExpired = req.guests.some(g => g.isExpired);

            let canApprove = false;
            if (AppState.currentUser.role === 'admin') {
                if (req.status === 'Pending_HR') canApprove = true;
                if (req.status === 'Pending_Head' && req.headApprover && req.headApprover.split(',').includes(AppState.currentUser.username)) canApprove = true;
            } else {
                if (req.status === 'Pending_Head' && req.headApprover && req.headApprover.split(',').includes(AppState.currentUser.username)) canApprove = true;
            }

            let statusBadge = '';
            if (req.status === 'Pending_Head') statusBadge = '<span class="px-2 py-1 text-[10px] font-bold rounded-lg bg-yellow-100 text-yellow-800 border border-yellow-200 whitespace-nowrap">รอหัวหน้า</span>';
            else if (req.status === 'Pending_HR') statusBadge = '<span class="px-2 py-1 text-[10px] font-bold rounded-lg bg-orange-100 text-orange-800 border border-orange-200 whitespace-nowrap">รอ HR อนุมัติ</span>';

            let actionButtons = '';
            if (canApprove) {
                // 💡 ถ้าบัตรหมดอายุ ให้ปุ่มอนุมัติเป็นสีเทาและกดไม่ได้
                let approveBtn = hasExpired 
                    ? `<button disabled class="bg-slate-300 text-white text-[10px] font-bold py-1.5 px-2.5 rounded-lg shadow-sm cursor-not-allowed" title="มีบัตรหมดอายุ">ไม่อนุมัติ (บัตรหมดอายุ)</button>`
                    : `<button class="wp-approve-btn bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] font-bold py-1.5 px-2.5 rounded-lg shadow-sm transition-all" data-id="${req._id}">อนุมัติ</button>`;

                // 💡 ปุ่มสำหรับส่งกลับให้แก้ไข
                let returnBtn = `<button class="wp-return-btn w-full mt-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold py-1.5 px-2.5 rounded-lg shadow-sm transition-all" data-id="${req._id}">ให้แก้ไขใหม่</button>`;

                actionButtons = `
                    <div class="flex flex-col gap-1.5">
                        <div class="flex justify-center gap-1.5">
                            <button class="wp-reject-btn bg-white hover:bg-rose-50 text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 text-[10px] font-bold py-1.5 px-2.5 rounded-lg transition-colors" data-id="${req._id}">ปฏิเสธ</button>
                            ${approveBtn}
                        </div>
                        <div class="flex justify-center">
                            ${returnBtn}
                        </div>
                    </div>
                `;
            } else {
                actionButtons = `<span class="text-[10px] text-slate-400">รอตามสเต็ป</span>`;
            }

            const accordionId = `admin-wp-accordion-${req._id}`;
            const iconId = `admin-wp-icon-${req._id}`;

            let guestsHtml = req.guests.map((g, gIndex) => {
                const delBtn = isEditable ? `<button type="button" class="admin-remove-guest-btn text-rose-500 hover:bg-rose-100 p-1 rounded transition-colors" data-id="${req._id}" data-index="${gIndex}" title="ลบรายชื่อนี้"><svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';
                const expiredBadge = g.isExpired ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-red-100 text-red-700 border-red-200 animate-pulse ml-1 shadow-sm">⚠️ บัตรหมดอายุ</span>` : '';
                
                return `
                <div class="flex items-center justify-between bg-white px-2 py-1.5 rounded border border-slate-100 shadow-sm mb-1 last:mb-0">
                    <span class="text-[11px] text-slate-700 font-bold flex items-center gap-2">
                        <img src="${getImageUrl(g.idCardImageUrl)}" class="w-6 h-4 object-cover rounded shadow-sm border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity" onclick="openImageModal(this.src)" title="คลิกดูรูป">
                        ${g.fullName} ${expiredBadge}
                    </span>
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${g.ticketType === 'FREE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}">${g.ticketType === 'FREE' ? 'ฟรี' : 'ลด 50%'}</span>
                        ${delBtn}
                    </div>
                </div>`;
            }).join('');
            if (req.guests.length === 0) guestsHtml = '<p class="text-[10px] text-slate-400 italic text-center py-1">ไม่มีผู้ติดตาม</p>';

            const cancelBookingBtn = isEditable ? `<button class="admin-cancel-booking-btn w-full mt-3 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 text-[10px] font-bold py-1.5 rounded-lg transition-colors shadow-sm" data-id="${req._id}">🚫 ยกเลิกรายการจองนี้ทั้งหมด</button>` : '';

            html += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-3 py-3 text-center">
                        <button onclick="document.getElementById('${accordionId}').classList.toggle('hidden'); document.getElementById('${iconId}').classList.toggle('-rotate-90');" class="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-all">
                            <svg id="${iconId}" class="w-3.5 h-3.5 transition-transform duration-300 transform -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                    </td>
                    <td class="px-4 py-3">
                        <p class="font-bold text-cyan-600 text-sm whitespace-nowrap">${d}</p>
                        <p class="text-[9px] text-slate-400 mt-0.5">${req.bookingId}</p>
                    </td>
                    <td class="px-4 py-3">
                        <p class="font-bold text-slate-800 text-xs">${req.username}</p>
                        <p class="text-[9px] text-slate-500 mt-0.5">ส่งคำขอ: ${reqDate}</p>
                    </td>
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                        <div class="flex flex-col items-center gap-1">
                            <span class="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">${req.guests.length} ผู้ติดตาม</span>
                            ${req.isEmployeeEntering ? '<span class="text-[9px] font-bold text-emerald-600">พนักงานเข้าด้วย</span>' : ''}
                        </div>
                    </td>
                    <td class="px-4 py-3 text-center">${statusBadge}</td>
                    <td class="px-4 py-3 text-center">${actionButtons}</td>
                </tr>
                <tr id="${accordionId}" class="hidden bg-slate-50/80 shadow-inner">
                    <td colspan="6" class="px-4 py-3 border-b border-slate-200">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                            <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                <div>
                                    <p class="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-2">📋 สถานะการอนุมัติ</p>
                                    ${createWaterparkTimeline(req.status)}
                                </div>
                                ${cancelBookingBtn}
                            </div>
                            <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                <p class="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-2 flex justify-between">
                                    <span>👥 รายชื่อผู้ติดตาม</span>
                                    <span class="normal-case font-bold text-[9px] text-slate-500">ฟรี: ${freeCount} / ลด: ${discountCount}</span>
                                </p>
                                <div class="max-h-28 overflow-y-auto pr-1">${guestsHtml}</div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    } catch (err) { console.error(err); }
}

async function fetchDailyWaterparkReport() {
    const dateInput = document.getElementById('wp-report-date-input');
    const container = document.getElementById('wp-daily-report-container');
    const printBtn = document.getElementById('wp-print-report-btn');
    const fetchBtn = document.getElementById('wp-fetch-report-btn');
    
    const dateVal = dateInput.value;
    if(!dateVal) return showNotification('กรุณาเลือกวันที่', 'error');

    fetchBtn.disabled = true;
    fetchBtn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>';

    try {
        const res = await apiCall(`/api/waterpark/reports/by-date?date=${dateVal}`);
        AppState.currentDailyReportData = res.data;
        
        if (res.data.length === 0) {
            container.innerHTML = `
                <div class="p-12 text-center text-slate-400">
                    <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <p class="font-medium text-sm">ไม่มีผู้ได้รับอนุมัติเข้าสวนน้ำ ในวันที่เลือก</p>
                </div>
            `;
            printBtn.classList.add('hidden');
            return;
        }

        printBtn.classList.remove('hidden');

        const grouped = res.data.reduce((acc, curr) => {
            if(!acc[curr.department]) acc[curr.department] = [];
            acc[curr.department].push(curr);
            return acc;
        }, {});

        const sortedDepts = Object.keys(grouped).sort();

        const today = new Date(); today.setHours(0,0,0,0);
        const targetDate = new Date(dateVal);
        targetDate.setHours(0,0,0,0); 
        const isEditable = targetDate > today && AppState.currentUser.role === 'admin';

        let html = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-200">
                    <thead class="bg-slate-100">
                        <tr>
                            <th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase w-16">ลำดับ</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase w-48">ชื่อพนักงานที่เบิก</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">รายชื่อผู้ใช้สิทธิ์</th>
                            <th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase w-32">ประเภทสิทธิ์</th>
                            <th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase w-40">เลขบัตร ปชช.</th>
                            ${isEditable ? `<th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase w-20">จัดการ</th>` : ''}
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-slate-100">
        `;

        let globalIndex = 1;

        sortedDepts.forEach(dept => {
            html += `<tr class="bg-indigo-50/50"><td colspan="${isEditable ? 6 : 5}" class="px-4 py-2 text-sm font-black text-indigo-800 border-b border-indigo-100">📌 แผนก: ${dept}</td></tr>`;
            
            grouped[dept].forEach(booking => {
                const totalRows = (booking.isEmployeeEntering ? 1 : 0) + booking.guests.length;
                let isFirstRow = true;

                const cancelBtn = isEditable ? `<button class="admin-cancel-booking-btn text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg border border-transparent hover:border-rose-200 transition-colors text-[10px] font-bold w-full" data-id="${booking._id}">ยกเลิกทั้งคิว</button>` : '';

                if (booking.isEmployeeEntering) {
                    html += `<tr class="hover:bg-slate-50 transition-colors">
                        ${isFirstRow ? `<td rowspan="${totalRows}" class="px-4 py-3 text-center text-base font-black text-slate-400 align-top">${globalIndex++}</td>` : ''}
                        ${isFirstRow ? `<td rowspan="${totalRows}" class="px-4 py-3 text-sm font-bold text-slate-700 align-top border-r border-slate-100">${booking.employeeName}</td>` : ''}
                        <td class="px-4 py-2 text-sm font-medium text-slate-700 flex items-center gap-2">
                            ${booking.employeeName} <span class="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-100">(พนักงาน)</span>
                        </td>
                        <td class="px-4 py-2 text-center"><span class="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">เข้าฟรี</span></td>
                        <td class="px-4 py-2 text-center text-xs text-slate-400">-</td>
                        ${isEditable ? `<td class="px-2 py-2 text-center border-l border-slate-100">${isFirstRow ? cancelBtn : '-'}</td>` : ''}
                    </tr>`;
                    isFirstRow = false;
                }

                booking.guests.forEach((guest, gIndex) => {
                    const badgeClass = guest.type === 'ฟรี' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200';
                    const idCardHtml = guest.idCard ? `<span class="text-xs font-mono text-slate-600">${guest.idCard}</span>` : `<span class="text-[10px] text-slate-400 italic">ไม่ระบุ</span>`;
                    
                    const removeGuestBtn = isEditable ? `<button class="admin-remove-guest-btn text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg border border-transparent hover:border-rose-200 transition-colors text-[10px] font-bold w-full" data-id="${booking._id}" data-index="${gIndex}">ลบรายชื่อ</button>` : '';

                    html += `<tr class="hover:bg-slate-50 transition-colors">
                        ${isFirstRow ? `<td rowspan="${totalRows}" class="px-4 py-3 text-center text-base font-black text-slate-400 align-top">${globalIndex++}</td>` : ''}
                        ${isFirstRow ? `<td rowspan="${totalRows}" class="px-4 py-3 text-sm font-bold text-slate-700 align-top border-r border-slate-100">${booking.employeeName}</td>` : ''}
                        <td class="px-4 py-2 text-sm font-medium text-slate-700">${guest.name}</td>
                        <td class="px-4 py-2 text-center"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}">${guest.type}</span></td>
                        <td class="px-4 py-2 text-center">${idCardHtml}</td>
                        ${isEditable ? `<td class="px-2 py-2 text-center border-l border-slate-100">${isFirstRow ? cancelBtn : removeGuestBtn}</td>` : ''}
                    </tr>`;
                    isFirstRow = false;
                });
            });
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

    } catch (err) { showNotification(err.message, 'error'); } 
    finally {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            เรียกดูข้อมูล
        `;
    }
}

function handlePrintWaterparkReport() {
    if (!AppState.currentDailyReportData || AppState.currentDailyReportData.length === 0) {
        return showNotification('ไม่มีข้อมูลให้พิมพ์', 'error');
    }

    const dateVal = document.getElementById('wp-report-date-input').value;
    const targetDate = new Date(dateVal);
    const dateStr = targetDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    const grouped = AppState.currentDailyReportData.reduce((acc, curr) => {
        if(!acc[curr.department]) acc[curr.department] = [];
        acc[curr.department].push(curr);
        return acc;
    }, {});
    const sortedDepts = Object.keys(grouped).sort();

    let printHtml = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <title>รายงานเข้าสวนน้ำ - ${dateStr}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Sarabun', sans-serif; color: #333; margin: 0; padding: 20px; font-size: 13px; }
            .header-container { text-align: center; margin-bottom: 20px; }
            h1 { font-size: 20px; margin: 0 0 5px 0; }
            p.date { font-size: 16px; margin: 0 0 20px 0; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #999; padding: 10px 8px; text-align: left; vertical-align: middle; }
            th { background-color: #f1f5f9; font-weight: bold; text-align: center; font-size: 14px; }
            .dept-row { background-color: #e2e8f0; font-weight: bold; font-size: 14px; }
            .text-center { text-align: center; }
            .blank-line { display: inline-block; width: 100%; border-bottom: 1px dotted #ccc; height: 1em; }
            .badge-free { color: #059669; font-weight: bold; }
            .badge-half { color: #d97706; font-weight: bold; }
            
            @media print {
                @page { size: A4 landscape; margin: 10mm; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .print-btn-container { display: none; }
            }
        </style>
    </head>
    <body>
        <div class="print-btn-container" style="text-align: right; margin-bottom: 20px;">
            <button onclick="window.print()" style="background: #1e293b; color: white; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-family: 'Sarabun'; font-size: 14px;">🖨️ กดเพื่อพิมพ์เอกสาร (Print)</button>
        </div>
        <div class="header-container">
            <h1>เอกสารลงนามผู้รับสิทธิ์สวัสดิการเข้าสวนน้ำ (สำหรับแผนก Admissions)</h1>
            <p class="date">ประจำวันที่เข้าใช้บริการ: <b>${dateStr}</b></p>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th width="5%">ลำดับ</th>
                    <th width="15%">ชื่อพนักงาน</th>
                    <th width="20%">ชื่อผู้ใช้สิทธิ์</th>
                    <th width="10%">ประเภทสิทธิ์</th>
                    <th width="15%">เลขบัตรประชาชน</th>
                    <th width="15%">ลายเซ็นผู้ใช้สิทธิ์</th>
                    <th width="20%">รับทราบโดย (Admissions)</th>
                </tr>
            </thead>
            <tbody>
    `;

    let globalIndex = 1;

    sortedDepts.forEach(dept => {
        printHtml += `<tr><td colspan="7" class="dept-row">แผนก: ${dept}</td></tr>`;
        
        grouped[dept].forEach(booking => {
            const totalRows = (booking.isEmployeeEntering ? 1 : 0) + booking.guests.length;
            let isFirstRow = true;

            if (booking.isEmployeeEntering) {
                printHtml += `
                    <tr>
                        ${isFirstRow ? `<td rowspan="${totalRows}" class="text-center font-bold">${globalIndex++}</td>` : ''}
                        ${isFirstRow ? `<td rowspan="${totalRows}">${booking.employeeName}</td>` : ''}
                        <td>${booking.employeeName} (พนักงาน)</td>
                        <td class="text-center" style="color: #2563eb; font-weight: bold;">เข้าฟรี</td>
                        <td class="text-center">-</td>
                        <td><span class="blank-line"></span></td>
                        <td><span class="blank-line"></span></td>
                    </tr>
                `;
                isFirstRow = false;
            }

            booking.guests.forEach(guest => {
                const badgeClass = guest.type === 'ฟรี' ? 'badge-free' : 'badge-half';
                const idCardDisplay = guest.idCard ? guest.idCard : '<span class="blank-line"></span>';
                
                printHtml += `
                    <tr>
                        ${isFirstRow ? `<td rowspan="${totalRows}" class="text-center font-bold">${globalIndex++}</td>` : ''}
                        ${isFirstRow ? `<td rowspan="${totalRows}">${booking.employeeName}</td>` : ''}
                        <td>${guest.name}</td>
                        <td class="text-center ${badgeClass}">${guest.type}</td>
                        <td class="text-center">${idCardDisplay}</td>
                        <td><span class="blank-line"></span></td>
                        <td><span class="blank-line"></span></td>
                    </tr>
                `;
                isFirstRow = false;
            });
        });
    });

    printHtml += `
            </tbody>
        </table>
        <p style="text-align:right; font-size:12px; color:#666;">พิมพ์โดย: ${AppState.currentUser.name} | เวลา: ${new Date().toLocaleString('th-TH')}</p>
        <script>
            window.onload = function() {
                setTimeout(() => { window.print(); }, 800);
            }
        </script>
    </body>
    </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHtml);
    printWindow.document.close();
}


// ============================================================================
// 👕 UNIFORM APPROVALS
// ============================================================================
function displayPendingApprovals(requests) {
    const list = document.getElementById('pending-approvals-list');
    if(!list) return;
    list.innerHTML = ''; 
    AppState.currentPendingRequests = requests;
    
    if (!requests || requests.length === 0) return list.innerHTML = '<div class="text-center p-8 bg-white rounded-2xl border border-slate-200"><p class="text-slate-500 font-medium text-lg">ไม่มีรายการรออนุมัติ</p></div>';
    
    requests.forEach(req => {
        const { requestId: id, createdAt: time, requesterName: name, department: dept, itemType: type, size, quantity: qty, reason, status } = req;
        const card = document.createElement('div'); card.className = 'border rounded-xl p-5 bg-white approval-card shadow-sm border border-slate-200 mb-4 hover:shadow-md transition-shadow';
        let content;
        const historyButton = `<button class="view-history-btn text-xs text-indigo-500 hover:text-indigo-700 font-bold hover:underline" data-requester-name="${name}">ดูประวัติเบิก</button>`;
        
        if (status === 'Pending Return') {
            const stockItem = AppState.masterStock.find(stock => stock.itemType === type && stock.size === size);
            content = `
            <div class="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                <div>
                    <p class="font-black text-slate-800 text-lg">ขอคืน: ${type} (ไซส์ ${size}) x ${qty}</p>
                    <p class="text-xs text-slate-500 mt-1">ผู้ขอคืน: <span class="font-bold text-slate-700">${name}</span> (${dept}) &middot; ${historyButton}</p>
                    <p class="text-[11px] text-slate-600 mt-1.5 bg-slate-50 p-2 rounded-lg"><strong>เหตุผล:</strong> ${reason}</p>
                </div>
                <div class="text-[10px] font-bold text-slate-400 whitespace-nowrap bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">${new Date(time).toLocaleString()}</div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p class="font-bold text-[11px] text-indigo-700 mb-2 uppercase">1. ประเมินของที่รับคืน</p>
                    <div class="flex flex-col space-y-2">
                        <label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="return-condition-${id}" value="Used" class="form-radio h-4 w-4 text-indigo-600"><span class="ml-2">คืนเป็นของมือสอง (ใช้ต่อได้)</span></label>
                        <label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="return-condition-${id}" value="Damaged" class="form-radio h-4 w-4 text-red-600"><span class="ml-2">คืนเป็นของชำรุด (ทิ้ง/ซ่อม)</span></label>
                    </div>
                    <div id="damage-reason-div-${id}" class="hidden mt-3"><input type="text" id="damage-reason-${id}" placeholder="ระบุเหตุผลที่ชำรุด..." class="w-full text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"></div>
                </div>
                <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p class="font-bold text-[11px] text-indigo-700 mb-2 uppercase">2. เลือกการเบิกจ่ายทดแทน</p>
                    <div class="flex flex-col space-y-2">
                        <label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="disburse-type-${id}" value="New" class="form-radio h-4 w-4 text-emerald-600"><span class="ml-2">เบิกของใหม่ให้ <span class="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-bold">เหลือ ${stockItem ? stockItem.newStock : 0}</span></span></label>
                        <label class="inline-flex items-center text-sm font-medium text-slate-700"><input type="radio" name="disburse-type-${id}" value="None" class="form-radio h-4 w-4 text-slate-500"><span class="ml-2">ไม่เบิกจ่าย (รับคืนอย่างเดียว)</span></label>
                    </div>
                </div>
            </div>
            <div class="flex justify-end items-center gap-3 mt-4 border-t border-slate-100 pt-3">
                <button data-id="${id}" class="reject-return-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-lg transition-colors">ปฏิเสธการคืน</button>
                <button data-id="${id}" class="process-return-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-sm transition-all">ยืนยันรับคืน</button>
            </div>`;
        } else {
            const stockItem = AppState.masterStock.find(stock => stock.itemType === type && stock.size === size);
            const newStockQty = stockItem ? stockItem.newStock : 0;
            const usedStockQty = stockItem ? stockItem.usedStock : 0;
            
            card.dataset.newStock = newStockQty;
            card.dataset.usedStock = usedStockQty;
            
            content = `
            <div class="flex justify-between items-start border-b border-slate-100 pb-3">
                <div>
                    <p class="font-black text-slate-800 text-lg">ขอเบิก: ${type} (ไซส์ ${size})</p>
                    <p class="text-xs text-slate-500 mt-1">ผู้ขอเบิก: <span class="font-bold text-slate-700">${name}</span> (${dept}) &middot; ${historyButton}</p>
                    <p class="text-[11px] text-slate-600 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100"><strong>เหตุผล:</strong> ${reason}</p>
                </div>
                <div class="text-[10px] font-bold text-slate-400 whitespace-nowrap bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">${new Date(time).toLocaleString()}</div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mt-3">
                <div class="md:col-span-2">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">เลือกประเภทสต็อก</label>
                    <div class="flex flex-col space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <label class="inline-flex items-center text-xs font-medium text-slate-700"><input type="radio" name="approve-stock-type-${id}" value="New" checked class="form-radio h-3 w-3 text-indigo-600"><span class="ml-2">ของใหม่ (เหลือ ${newStockQty})</span></label>
                        <label class="inline-flex items-center text-xs font-medium text-slate-700"><input type="radio" name="approve-stock-type-${id}" value="Used" class="form-radio h-3 w-3 text-blue-600"><span class="ml-2">มือสอง (เหลือ ${usedStockQty})</span></label>
                    </div>
                </div>
                <div class="md:col-span-1">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">จำนวน</label>
                    <input type="number" value="${qty}" min="1" max="${qty}" class="approval-quantity-input w-full py-2 px-3 border border-slate-200 rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>
                <div class="md:col-span-2">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">หมายเหตุ</label>
                    <input type="text" placeholder="ระบุเหตุผล (ถ้ามี)..." class="approval-reason-input w-full py-2 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>
            </div>
            <div class="flex justify-end items-center gap-3 mt-4 border-t border-slate-100 pt-3">
                <button data-id="${id}" class="reject-btn bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-red-600 text-xs font-bold py-2 px-4 rounded-lg transition-colors border border-slate-200 hover:border-red-200">ปฏิเสธ</button>
                <button data-id="${id}" class="approve-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-sm transition-all">อนุมัติคำขอ</button>
            </div>`;
        }
        card.innerHTML = content; list.appendChild(card);
    });
}

async function handleApproveRequest(btn) {
    if (btn.disabled || btn.dataset.isProcessing === 'true') return;
    btn.dataset.isProcessing = 'true';
    btn.disabled = true;

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
        btn.dataset.isProcessing = 'false'; btn.disabled = false;
        return showNotification(`จำนวนที่อนุมัติต้องอยู่ระหว่าง 1 ถึง ${originalQuantity}`, 'error');
    }
    if (stockType === 'Used' && approvedQuantity > usedStock) {
        btn.dataset.isProcessing = 'false'; btn.disabled = false;
        return showNotification(`❌ สต็อกมือสองไม่เพียงพอ (เหลือ ${usedStock} ชิ้น)`, 'error');
    }
    if (stockType === 'New' && approvedQuantity > newStock) {
        btn.dataset.isProcessing = 'false'; btn.disabled = false;
        return showNotification(`❌ สต็อกของใหม่ไม่เพียงพอ (เหลือ ${newStock} ชิ้น)`, 'error');
    }
    
    showLoadingButton(btn, true);
    try {
        await apiCall('/api/admin/approve', 'POST', { requestId: id, approvedQuantity, reason, stockType, adminUser: AppState.currentUser.username });
        onAdminActionSuccess(`อนุมัติรายการสำเร็จ (ตัดสต็อก${stockType === 'Used' ? 'มือสอง' : 'ใหม่'})`);
    } catch(err) { 
        onActionFailure(err); showLoadingButton(btn, false, 'อนุมัติคำขอ'); 
        btn.dataset.isProcessing = 'false'; btn.disabled = false;
    }
}

async function handleRejectRequest(btn) {
    if (btn.disabled || btn.dataset.isProcessing === 'true') return;
    btn.dataset.isProcessing = 'true';
    const id = btn.dataset.id;
    showPromptModal("กรุณาระบุเหตุผลที่ปฏิเสธ:", async (reason) => {
        showLoadingButton(btn, true);
        try {
            await apiCall('/api/admin/reject', 'POST', { requestId: id, reason, adminUser: AppState.currentUser.username });
            onAdminActionSuccess('ปฏิเสธรายการสำเร็จ');
        } catch(err) { 
            onActionFailure(err); showLoadingButton(btn, false, 'ปฏิเสธ'); btn.dataset.isProcessing = 'false'; 
        }
    }, () => { btn.dataset.isProcessing = 'false'; });
}

async function handleProcessReturn(btn) {
    if (btn.disabled || btn.dataset.isProcessing === 'true') return;
    btn.dataset.isProcessing = 'true';
    btn.disabled = true;

    const id = btn.dataset.id;
    const returnConditionEl = document.querySelector(`input[name="return-condition-${id}"]:checked`);
    const disbursementTypeEl = document.querySelector(`input[name="disburse-type-${id}"]:checked`);
    
    if (!returnConditionEl || !disbursementTypeEl) {
        btn.dataset.isProcessing = 'false'; btn.disabled = false;
        return showNotification('กรุณาเลือกตัวเลือกให้ครบถ้วน', 'error');
    }
    
    let damageReason = '';
    if (returnConditionEl.value === 'Damaged') {
        damageReason = document.getElementById(`damage-reason-${id}`).value.trim();
        if (!damageReason) {
            btn.dataset.isProcessing = 'false'; btn.disabled = false;
            return showNotification('กรุณากรอกเหตุผลที่ชำรุด', 'error');
        }
    }
    
    showLoadingButton(btn, true);
    try {
        if (disbursementTypeEl.value === 'None') {
            await apiCall('/api/admin/return-only', 'POST', { requestId: id, returnCondition: returnConditionEl.value, damageReason, adminUser: AppState.currentUser.username });
        } else {
            await apiCall('/api/admin/return-disburse', 'POST', { requestId: id, returnCondition: returnConditionEl.value, disbursementType: disbursementTypeEl.value, damageReason, adminUser: AppState.currentUser.username });
        }
        onAdminActionSuccess('ดำเนินการรับคืนสำเร็จ');
    } catch(err) { 
        onActionFailure(err); showLoadingButton(btn, false, 'ยืนยันรับคืน'); 
        btn.dataset.isProcessing = 'false'; btn.disabled = false;
    }
}

function displayPendingPasswordResets(resets) {
    const list = document.getElementById('pending-password-resets-list');
    if(!list) return;
    list.innerHTML = '';
    if(resets.length === 0) { list.innerHTML = '<div class="text-center p-8 bg-white rounded-2xl border border-slate-200"><p class="text-slate-500 font-medium text-lg">ไม่มีคำขอรีเซ็ตรหัสผ่านในขณะนี้</p></div>'; return; }
    
    resets.forEach(req => {
        list.innerHTML += `
        <div class="p-5 bg-white border border-slate-200 shadow-sm rounded-xl mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
            <div>
                <p class="font-black text-slate-800 text-lg">รหัสพนักงาน: <span class="text-orange-600">${req.username}</span></p>
                <p class="text-[11px] font-medium text-slate-500 mt-1">เวลาส่งคำขอ: ${new Date(req.createdAt).toLocaleString()}</p>
            </div>
            <button class="approve-reset-btn w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-sm transition-all" data-id="${req._id}" data-user="${req.username}">ตั้งรหัสใหม่</button>
        </div>`;
    });
}

// ============================================================================
// 📦 STOCK MANAGEMENT (ADMIN)
// ============================================================================
function updateCategoryDatalist() {
    const datalist = document.getElementById('existing-categories');
    if (!datalist) return;
    const uniqueCategories = [...new Set(AppState.masterStock.map(item => item.category).filter(Boolean))];
    datalist.innerHTML = '';
    uniqueCategories.forEach(cat => { datalist.appendChild(new Option(cat, cat)); });
}

function initStockSearchUI() {
    const container = document.getElementById('stock-summary-container');
    if (container && !document.getElementById('stock-search-wrapper')) {
        const searchWrapper = document.createElement('div');
        searchWrapper.id = 'stock-search-wrapper';
        searchWrapper.className = 'mb-6 flex flex-col sm:flex-row gap-4 items-center relative z-10';
        searchWrapper.innerHTML = `
            <div class="relative w-full flex-1">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span class="text-xl opacity-60">🔍</span>
                </div>
                <input type="text" id="stock-search-input" placeholder="ค้นหาชื่อพัสดุ, ไซส์ หรือ หมวดหมู่..." class="w-full pl-12 pr-4 py-3.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all text-slate-700 font-bold text-sm bg-white hover:border-indigo-300">
            </div>
            <button id="compact-add-stock-btn" class="w-full sm:w-auto shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-xl font-bold shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 text-sm border border-indigo-600">
                <span class="text-lg leading-none">➕</span> เพิ่มพัสดุใหม่
            </button>
        `;
        container.parentNode.insertBefore(searchWrapper, container);

        document.getElementById('stock-search-input').addEventListener('input', (e) => {
            AppState.stockSearchTerm = e.target.value.toLowerCase();
            applyStockFilters();
        });

        document.getElementById('compact-add-stock-btn').addEventListener('click', (e) => {
            e.preventDefault(); openSuperStockModal(false);
        });
    }
}

function applyStockFilters() {
    let filtered = AppState.masterStock;
    if (AppState.stockFilterMode === 'LOW') filtered = filtered.filter(item => item.newStock <= (item.lowStockThreshold || 5));
    if (AppState.stockSearchTerm) {
        const term = AppState.stockSearchTerm;
        filtered = filtered.filter(item => item.itemType.toLowerCase().includes(term) || item.size.toLowerCase().includes(term) || (item.category && item.category.toLowerCase().includes(term)));
    }
    displayStockSummary(filtered);
}

function handleStockFilter(clickedButton) {
    document.querySelectorAll('.stock-filter-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-200'); 
        btn.classList.add('bg-white', 'text-slate-600', 'hover:bg-slate-50');
    });
    clickedButton.classList.add('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-200'); 
    clickedButton.classList.remove('bg-white', 'text-slate-600', 'hover:bg-slate-50');
    
    AppState.stockFilterMode = clickedButton.id === 'stock-filter-low' ? 'LOW' : 'ALL';
    applyStockFilters();
}

function onStockReceived(newStockData) {
    AppState.masterStock = newStockData;
    updateCategoryDatalist(); 
    initStockSearchUI(); 
    applyStockFilters(); 
    updateLowStockAlerts();
}

function displayStockSummary(stockData) {
    const container = document.getElementById('stock-summary-container');
    if(!container) return;
    container.innerHTML = '';
    
    if (!stockData || stockData.length === 0) {
        container.innerHTML = '<div class="text-center p-12 bg-white rounded-2xl border border-slate-200"><p class="text-slate-500 font-medium text-lg">ไม่พบพัสดุที่ค้นหาในระบบ</p></div>';
        const submenu = document.getElementById('stock-category-submenu');
        if (submenu) submenu.innerHTML = '';
        return;
    }

    const groupedByCategory = stockData.reduce((acc, item) => {
        const cat = item.category || 'หมวดหมู่ทั่วไป';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {});

    const categories = Object.keys(groupedByCategory);

    if (!AppState.activeStockCategory || !categories.includes(AppState.activeStockCategory)) {
        AppState.activeStockCategory = categories[0];
    }

    let submenu = document.getElementById('stock-category-submenu');
    if (!submenu) {
        submenu = document.createElement('div');
        submenu.id = 'stock-category-submenu';
        submenu.className = 'flex flex-col space-y-1 pl-4 mt-1 mb-2 border-l-2 border-indigo-100 ml-6 hidden transition-all duration-300';
        const tabStock = document.getElementById('tab-stock');
        if (tabStock) tabStock.parentNode.insertBefore(submenu, tabStock.nextSibling);
    }

    submenu.innerHTML = '';
    categories.forEach(cat => {
        const isActive = cat === AppState.activeStockCategory;
        const itemsInCat = groupedByCategory[cat];
        const hasAlert = itemsInCat.some(i => i.newStock <= (i.lowStockThreshold || 5));
        const alertDot = hasAlert ? '<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-sm"></span>' : '';

        const btn = document.createElement('button');
        btn.className = `text-left px-4 py-2.5 text-xs font-bold transition-all rounded-lg flex items-center justify-between ${isActive ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`;
        btn.innerHTML = `<span class="truncate pr-2">${cat} <span class="text-[10px] opacity-60 ml-1">(${itemsInCat.length})</span></span> ${alertDot}`;
        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); AppState.activeStockCategory = cat; applyStockFilters(); };
        submenu.appendChild(btn);
    });

    const tabStock = document.getElementById('tab-stock');
    if (tabStock && tabStock.classList.contains('text-indigo-600')) submenu.classList.remove('hidden');
    else submenu.classList.add('hidden');

    const contentArea = document.createElement('div');
    contentArea.className = 'w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0';

    const activeItems = groupedByCategory[AppState.activeStockCategory];
    let totalN = 0, totalU = 0, totalD = 0, totalDispensed = 0;
    activeItems.forEach(i => { totalN += i.newStock; totalU += i.usedStock; totalD += i.damagedStock; totalDispensed += (i.dispensedStock || 0); });

    const contentHeader = document.createElement('div');
    contentHeader.className = 'p-6 border-b border-slate-200 bg-slate-50 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between';
    contentHeader.innerHTML = `
        <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-xl border border-slate-200 shadow-sm bg-white flex items-center justify-center text-2xl text-indigo-500">📁</div>
            <div>
                <h2 class="text-2xl font-black text-slate-800">${AppState.activeStockCategory}</h2>
                <p class="text-xs text-slate-500 mt-1.5 font-medium">รวมพัสดุในหมวดหมู่นี้: <span class="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">${activeItems.length} รายการ</span></p>
            </div>
        </div>
        <div class="flex gap-2 sm:gap-6 text-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm w-full xl:w-auto justify-center flex-wrap">
            <div class="flex flex-col px-2 sm:px-4 border-r border-slate-100"><span class="text-[11px] text-slate-400 font-bold uppercase mb-2">ใหม่รวม</span><span class="text-3xl font-black text-emerald-600 leading-none">${totalN}</span></div>
            <div class="flex flex-col px-2 sm:px-4 border-r border-slate-100"><span class="text-[11px] text-slate-400 font-bold uppercase mb-2">มือสองรวม</span><span class="text-3xl font-black text-blue-600 leading-none">${totalU}</span></div>
            <div class="flex flex-col px-2 sm:px-4 border-r border-slate-100"><span class="text-[11px] text-slate-400 font-bold uppercase mb-2">ชำรุดรวม</span><span class="text-3xl font-black text-rose-600 leading-none">${totalD}</span></div>
            <div class="flex flex-col px-2 sm:px-4"><span class="text-[11px] text-slate-400 font-bold uppercase mb-2">เบิกไปรวม</span><span class="text-3xl font-black text-indigo-600 leading-none">${totalDispensed}</span></div>
        </div>
    `;
    contentArea.appendChild(contentHeader);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'p-6 bg-slate-50/50 space-y-6';

    const groupedByItemType = activeItems.reduce((acc, item) => {
        const type = item.itemType || 'ไม่ระบุชื่อรายการ';
        if (!acc[type]) acc[type] = [];
        acc[type].push(item);
        return acc;
    }, {});

    for (const typeName in groupedByItemType) {
        const itemsOfType = groupedByItemType[typeName];
        const typeId = 'type-' + typeName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '') + Math.floor(Math.random()*1000);
        const img = itemsOfType[0]?.imageUrl ? getImageUrl(itemsOfType[0].imageUrl) : 'https://placehold.co/80x80/e2e8f0/64748b?text=No+Img';
        
        const hasOutStock = itemsOfType.some(i => i.newStock === 0);
        const hasLowStock = itemsOfType.some(i => i.newStock > 0 && i.newStock <= (i.lowStockThreshold || 5));

        let typeTotalN = 0, typeTotalU = 0, typeTotalD = 0, typeTotalDispensed = 0;
        itemsOfType.forEach(i => { typeTotalN += i.newStock; typeTotalU += i.usedStock; typeTotalD += i.damagedStock; typeTotalDispensed += (i.dispensedStock || 0); });

        const typeWrapper = document.createElement('div');
        typeWrapper.className = `bg-white rounded-xl shadow-sm overflow-hidden border ${(hasLowStock || hasOutStock) ? 'border-red-300 ring-1 ring-red-100' : 'border-slate-200'}`;

        const typeHeader = document.createElement('div');
        typeHeader.className = 'flex items-center justify-between cursor-pointer p-4 hover:bg-slate-50 transition-colors select-none border-b border-slate-100';
        
        let alertBadge = '';
        if (hasOutStock) alertBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-600 text-white animate-pulse border border-red-700">สต๊อกหมด</span>';
        else if (hasLowStock) alertBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 animate-pulse border border-red-200">สต๊อกต่ำ</span>';
        
        typeHeader.innerHTML = `
            <div class="flex items-center gap-4">
                <img src="${img}" class="w-12 h-12 rounded-lg object-cover border border-slate-200 shadow-sm bg-white">
                <div>
                    <div class="flex items-center gap-2"><h4 class="text-base font-bold text-slate-800">${typeName}</h4>${alertBadge}</div>
                    <span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold mt-1 inline-block">${itemsOfType.length} ขนาดไซส์</span>
                </div>
            </div>
            <div class="flex items-center gap-4">
                <div class="hidden sm:flex gap-4 text-center mr-4">
                    <div class="flex flex-col px-3"><span class="text-[10px] text-slate-400 font-bold uppercase mb-1">ใหม่</span><span class="text-xl font-black text-emerald-600">${typeTotalN}</span></div>
                    <div class="flex flex-col px-3 border-l border-slate-200"><span class="text-[10px] text-slate-400 font-bold uppercase mb-1">มือสอง</span><span class="text-xl font-black text-blue-600">${typeTotalU}</span></div>
                    <div class="flex flex-col px-3 border-l border-slate-200"><span class="text-[10px] text-slate-400 font-bold uppercase mb-1">ชำรุด</span><span class="text-xl font-black text-rose-600">${typeTotalD}</span></div>
                    <div class="flex flex-col px-3 border-l border-slate-200"><span class="text-[10px] text-slate-400 font-bold uppercase mb-1">เบิกไป</span><span class="text-xl font-black text-indigo-600">${typeTotalDispensed}</span></div>
                </div>
                <div class="text-slate-400 p-2 rounded-full hover:bg-slate-100 transition-colors">
                    <svg class="w-6 h-6 transform transition-transform duration-300 rotate-180" id="icon-${typeId}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </div>
        `;

        const typeTableContainer = document.createElement('div');
        typeTableContainer.className = 'overflow-x-auto transition-all duration-300 origin-top';
        typeTableContainer.id = `table-${typeId}`;

        typeHeader.addEventListener('click', () => {
            const isHidden = typeTableContainer.classList.contains('hidden');
            if (isHidden) { typeTableContainer.classList.remove('hidden'); document.getElementById(`icon-${typeId}`).classList.add('rotate-180'); } 
            else { typeTableContainer.classList.add('hidden'); document.getElementById(`icon-${typeId}`).classList.remove('rotate-180'); }
        });

        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-slate-100';
        table.innerHTML = `
            <thead class="bg-slate-50/80">
                <tr>
                    <th class="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider w-1/4">ไซส์ / ขนาด</th>
                    <th class="px-4 py-4 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">คงเหลือ (ใหม่ / มือสอง / ชำรุด)</th>
                    <th class="px-4 py-4 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">สถิติระบบ</th>
                    <th class="px-6 py-4 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">จัดการสต๊อก</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-slate-50"></tbody>
        `;

        const tbody = table.querySelector('tbody');

        itemsOfType.forEach(item => {
            const isOut = item.newStock === 0;
            const isLow = item.newStock > 0 && item.newStock <= (item.lowStockThreshold || 5);
            const dispensed = item.dispensedStock || 0;
            const totalSystem = item.newStock + item.usedStock + item.damagedStock + dispensed;
            const isActive = item.isActive !== false;
            
            const tr = document.createElement('tr');
            tr.className = !isActive ? 'bg-slate-100 opacity-60 grayscale-[50%] transition-all hover:opacity-100' : `hover:bg-slate-50 transition-colors ${(isLow || isOut) ? 'bg-red-50/20' : ''}`;
            
            let rowAlertBadge = '';
            if (!isActive) rowAlertBadge = '<span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-300 text-slate-700 border border-slate-400">ระงับการเบิก</span>';
            else if (isOut) rowAlertBadge = '<span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-600 text-white border border-red-700">หมด</span>';
            else if (isLow) rowAlertBadge = '<span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200">ใกล้หมด</span>';
            
            let actionButtonsHTML = '';
            if (isActive) {
                actionButtonsHTML = `
                    <button title="รับเข้าสต๊อก" class="receive-stock-btn p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-700 border border-emerald-100 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 17l4 4 4-4m-4-5v9"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"></path></svg></button>
                    <button title="ปรับยอด" class="adjust-stock-btn p-2 text-amber-600 bg-amber-50 hover:bg-amber-100 hover:text-amber-700 border border-amber-100 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg></button>
                    <button title="อัปเดตรูป/แจ้งเตือน" class="edit-stock-btn p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 border border-indigo-100 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></button>
                    <button title="ประวัติ" class="history-stock-btn p-2 text-slate-500 bg-slate-50 hover:bg-slate-200 hover:text-slate-800 border border-slate-200 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></button>
                    <button title="ระงับการเบิกจ่ายพัสดุนี้" class="toggle-status-btn p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 border border-rose-100 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}" data-status="false"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.293M3 3l18 18M15.205 10.155a3 3 0 01-4.35 4.35m-1.745-6.81a9.97 9.97 0 013.918-1.488c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg></button>
                `;
            } else {
                actionButtonsHTML = `
                    <button title="ประวัติ" class="history-stock-btn p-2 text-slate-500 bg-slate-50 hover:bg-slate-200 hover:text-slate-800 border border-slate-200 rounded-md transition-colors" data-type="${item.itemType}" data-size="${item.size}"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></button>
                    <button title="เปิดการเบิกจ่ายอีกครั้ง" class="toggle-status-btn p-2 text-slate-600 bg-white hover:bg-emerald-50 hover:text-emerald-700 border border-slate-300 rounded-md transition-colors shadow-sm" data-type="${item.itemType}" data-size="${item.size}" data-status="true"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg></button>
                `;
            }
            
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="font-bold ${isActive ? 'text-slate-800' : 'text-slate-500'} text-[15px]">ไซส์ ${item.size}</span>
                    ${rowAlertBadge}
                </td>
                <td class="px-4 py-4">
                    <div class="flex justify-center gap-2">
                        <div class="flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded text-emerald-700 border border-emerald-100 min-w-[3.5rem] justify-center" title="ของใหม่"><span class="text-base font-black">${item.newStock}</span></div>
                        <div class="flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded text-blue-700 border border-blue-100 min-w-[3.5rem] justify-center" title="มือสอง"><span class="text-base font-black">${item.usedStock}</span></div>
                        <div class="flex items-center gap-1 bg-rose-50 px-3 py-1.5 rounded text-rose-700 border border-rose-100 min-w-[3.5rem] justify-center" title="ชำรุด"><span class="text-base font-black">${item.damagedStock}</span></div>
                    </div>
                </td>
                <td class="px-4 py-4 text-center">
                    <div class="flex flex-col items-center gap-1.5">
                        <div class="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 w-full max-w-[120px] flex justify-between items-center"><span>เบิกไป:</span> <span class="text-sm font-black text-indigo-600">${dispensed}</span></div>
                        <div class="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 w-full max-w-[120px] flex justify-between items-center"><span>รวมทั้งหมด:</span> <span class="text-sm font-black text-slate-800">${totalSystem}</span></div>
                    </div>
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end gap-1.5">
                        ${actionButtonsHTML}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        typeTableContainer.appendChild(table);
        typeWrapper.appendChild(typeHeader);
        typeWrapper.appendChild(typeTableContainer);
        itemsContainer.appendChild(typeWrapper);
    }

    contentArea.appendChild(itemsContainer);
    container.appendChild(contentArea);
}

function updateLowStockAlerts() {
    const lowStock = AppState.masterStock.filter(item => item.newStock <= (item.lowStockThreshold || 5));
    const alertList = document.getElementById('low-stock-alert-list');
    const alertBanner = document.getElementById('low-stock-alert-banner');
    if (alertList && alertBanner) {
        if (lowStock.length > 0) {
            alertList.innerHTML = lowStock.map(item => {
                if (item.newStock === 0) return `<li>${item.itemType} (${item.size}) - <span class="font-bold text-red-700">หมดแล้ว!</span></li>`;
                return `<li>${item.itemType} (${item.size}) - เหลือ ${item.newStock} ชิ้น</li>`;
            }).join('');
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
                            <input type="text" id="super-stock-size" list="standard-sizes" autocomplete="off" placeholder="เลือกหรือพิมพ์ขนาด..." class="w-full py-2.5 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 bg-white">
                            <datalist id="standard-sizes">
                                <option value="Free Size"></option>
                                <option value="SS"></option>
                                <option value="S"></option>
                                <option value="M"></option>
                                <option value="L"></option>
                                <option value="XL"></option>
                                <option value="2XL"></option>
                                <option value="3XL"></option>
                                <option value="4XL"></option>
                                <option value="5XL"></option>
                            </datalist>
                        </div>
                        
                        <div class="col-span-1 md:col-span-2">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">หมวดหมู่ <span class="text-red-500">*</span></label>
                            <input type="text" id="super-stock-category" list="existing-categories" autocomplete="off" placeholder="เลือกจากระบบ หรือ พิมพ์หมวดหมู่ใหม่..." class="w-full py-2.5 px-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 bg-white">
                            <datalist id="existing-categories"></datalist>
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
        if (btn.disabled || btn.dataset.isProcessing === 'true') return;
        btn.dataset.isProcessing = 'true';
        btn.disabled = true;

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

        if (!data.itemType || !data.size || !data.category) {
            btn.dataset.isProcessing = 'false'; btn.disabled = false;
            return showNotification('กรุณากรอกข้อมูลหลักให้ครบ', 'error');
        }
        showLoadingButton(btn, true);
        try { 
            await apiCall('/api/stock', 'POST', data); 
            onAdminActionSuccess('บันทึกพัสดุสำเร็จ'); 
            closeModal();
            btn.dataset.isProcessing = 'false'; btn.disabled = false;
        } catch(err) { 
            onActionFailure(err); showLoadingButton(btn, false, 'บันทึกข้อมูล'); 
            btn.dataset.isProcessing = 'false'; btn.disabled = false;
        }
    });
}

function openSuperStockModal(isEdit = false, item = null) {
    const modal = document.getElementById('super-stock-modal');
    if (!modal) return;
    updateCategoryDatalist(); 
    const inputsToLock = [ 'super-stock-type', 'super-stock-size', 'super-stock-category', 'super-stock-new-qty', 'super-stock-used-qty', 'super-stock-damaged-qty' ];

    if (isEdit && item) {
        document.getElementById('super-stock-modal-title').innerHTML = '<span class="text-xl">📸</span> อัปเดตรูปภาพและแจ้งเตือน';
        document.getElementById('super-stock-original-type').value = item.itemType;
        document.getElementById('super-stock-original-size').value = item.size;
        document.getElementById('super-stock-type').value = item.itemType;
        document.getElementById('super-stock-size').value = item.size;
        document.getElementById('super-stock-category').value = item.category || '';
        document.getElementById('super-stock-image-url').value = item.imageUrl || '';
        document.getElementById('super-stock-image-preview').src = item.imageUrl ? getImageUrl(item.imageUrl) : 'https://placehold.co/128x128/e2e8f0/64748b?text=Image';
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

// ============================================================================
// 👥 USER MANAGEMENT
// ============================================================================
async function handleImportUsersCSV() {
    const btn = document.getElementById('import-users-btn');
    if (btn.disabled || btn.dataset.isProcessing === 'true') return;
    btn.dataset.isProcessing = 'true'; btn.disabled = true;

    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    if (!file) {
        btn.dataset.isProcessing = 'false'; btn.disabled = false;
        return showNotification('กรุณาเลือกไฟล์ CSV ก่อน', 'error');
    }

    const formData = new FormData();
    formData.append('csvfile', file);
    
    showLoadingButton(btn, true);
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/import`, { method: 'POST', body: formData });
        const text = await response.text(); 
        try {
            const result = JSON.parse(text);
            if(result.success) { showNotification(`นำเข้าข้อมูลสำเร็จ ${result.count} รายการ`, 'success'); refreshData(); } 
            else { throw new Error(result.error); }
        } catch(err) { throw new Error('เซิร์ฟเวอร์ขัดข้อง (ไฟล์อาจมีปัญหา หรือ API ผิดพลาด)'); }
    } catch(e) { showNotification(e.message, 'error'); } 
    finally { showLoadingButton(btn, false, 'นำเข้าข้อมูล (Import)'); fileInput.value = ''; btn.dataset.isProcessing = 'false'; }
}

function onUsersReceived(users) { 
    AppState.allUsersData = users; 
    
    const deptSelect = document.getElementById('user-dept-filter');
    if (deptSelect) {
        const uniqueDepts = [...new Set(users.map(u => u.department || 'ไม่ระบุ').filter(Boolean))];
        const currentSelection = deptSelect.value;
        
        deptSelect.innerHTML = '<option value="ALL">ดูทุกแผนก</option>';
        uniqueDepts.sort().forEach(dept => { deptSelect.add(new Option(dept, dept)); });
        if (uniqueDepts.includes(currentSelection)) deptSelect.value = currentSelection;
    }
    renderUsersTable(); 
}

function renderUsersTable() {
    const searchTerm = document.getElementById('user-search-input')?.value.toLowerCase() || '';
    const deptFilter = document.getElementById('user-dept-filter')?.value || 'ALL';
    
    let filteredData = AppState.allUsersData.filter(user => {
        const matchSearch = user.username.toLowerCase().includes(searchTerm) || user.name.toLowerCase().includes(searchTerm);
        const userDept = user.department || 'ไม่ระบุ';
        const matchDept = deptFilter === 'ALL' || userDept === deptFilter;
        return matchSearch && matchDept;
    });

    const totalPages = Math.ceil(filteredData.length / AppState.pagination.rowsPerPage); 
    if (AppState.pagination.users > totalPages) AppState.pagination.users = Math.max(1, totalPages);
    const pageData = filteredData.slice((AppState.pagination.users - 1) * AppState.pagination.rowsPerPage, AppState.pagination.users * AppState.pagination.rowsPerPage);
    
    const container = document.getElementById('users-list-table');
    if(!container) return;

    const headerDiv = container.previousElementSibling;
    if (headerDiv && !document.getElementById('btn-unlock-all')) {
        const actionsContainer = headerDiv.querySelector('.flex.flex-col.sm\\:flex-row.gap-3');
        if (actionsContainer) {
            const bulkHtml = `
                <div class="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-inner w-full sm:w-auto order-last sm:order-first">
                    <button id="btn-unlock-all" class="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-white hover:shadow-sm rounded-md transition-all whitespace-nowrap flex items-center justify-center gap-1">🔓 เปิดสิทธิ์แก้ญาติ</button>
                    <button id="btn-lock-all" class="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-[11px] font-bold text-rose-700 hover:bg-white hover:shadow-sm rounded-md transition-all whitespace-nowrap ml-1 flex items-center justify-center gap-1">🔒 ปิดสิทธิ์</button>
                </div>
            `;
            actionsContainer.insertAdjacentHTML('afterbegin', bulkHtml);

            document.getElementById('btn-unlock-all').addEventListener('click', () => handleBulkWaterparkReg(true));
            document.getElementById('btn-lock-all').addEventListener('click', () => handleBulkWaterparkReg(false));
        }
    }
    
    container.innerHTML = `
    <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-slate-50">
            <tr>
                <th class="px-3 py-3 text-left">Username</th>
                <th class="px-3 py-3 text-left">ชื่อ-สกุล</th>
                <th class="px-3 py-3 text-left">แผนก</th>
                <th class="px-3 py-3 text-center">ระดับสวนน้ำ</th>
                <th class="px-3 py-3 text-center">สิทธิ์แก้ญาติ</th>
                <th class="px-3 py-3 text-center">สิทธิ์อนุมัติ</th>
                <th class="px-3 py-3 text-center">ระบบเบิกชุด</th>
                <th class="px-3 py-3 text-center">สถานะ</th>
                <th class="px-3 py-3 text-center">Actions</th>
            </tr>
        </thead>
        <tbody class="bg-white divide-y divide-slate-100"></tbody>
    </table>`;
    
    const tbody = container.querySelector('tbody');
    
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500 font-medium">ไม่พบผู้ใช้งานในหมวดหมู่นี้</td></tr>`;
    } else {
        pageData.forEach(user => {
            const stClass = user.status === 'active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-red-600 border border-red-200';
            const stText = user.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
            const roleBadge = user.role === 'admin' ? '<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-indigo-200">Admin</span>' : '<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-200">User</span>';
            
            let tierText = 'Tier 1 (Staff)'; let tierColor = 'bg-slate-100 text-slate-700';
            if (user.positionLevel === 'Tier2_Manager') { tierText = 'Tier 2 (Mgr)'; tierColor = 'bg-blue-100 text-blue-700'; }
            else if (user.positionLevel === 'Tier3_Director') { tierText = 'Tier 3 (Dir)'; tierColor = 'bg-purple-100 text-purple-700'; }

            const headBadge = user.isHeadApprover ? `<span class="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-[10px] font-bold border border-yellow-300">⭐ มีสิทธิ์อนุมัติ</span>` : `<span class="text-slate-400 text-[10px]">-</span>`;
            
            const regUnlockedBadge = user.waterparkRegUnlocked ? '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200">🔓 เปิด</span>' : '<span class="bg-slate-100 text-slate-400 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">🔒 ปิด</span>';

            tbody.innerHTML += `
            <tr>
                <td class="p-3 text-sm font-bold text-indigo-600"><a href="#" class="clickable-username hover:underline" data-username="${user.username}">${user.username}</a></td>
                <td class="p-3 text-sm font-medium text-slate-700">${user.name}</td>
                <td class="p-3 text-xs font-bold text-slate-500">${user.department || '-'}</td>
                <td class="p-3 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold ${tierColor}">${tierText}</span></td>
                <td class="p-3 text-center">${regUnlockedBadge}</td>
                <td class="p-3 text-center">${headBadge}</td>
                <td class="p-3 text-center">${roleBadge}</td>
                <td class="p-3 text-center"><span class="px-2.5 py-1 font-bold text-[10px] rounded-lg ${stClass}">${stText}</span></td>
                <td class="p-3 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1.5">
                        <button class="view-relatives-btn p-1.5 text-slate-500 hover:text-cyan-600 bg-slate-50 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-200 rounded-md transition-colors" data-username="${user.username}" title="ดูประวัติญาติ">
                            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        </button>
                        <button class="edit-user-btn p-1.5 text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-md transition-colors" data-username="${user.username}" title="แก้ไขผู้ใช้งาน">
                            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button class="reset-password-btn p-1.5 text-slate-500 hover:text-amber-600 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 rounded-md transition-colors" data-username="${user.username}" title="รีเซ็ตรหัสผ่าน">
                            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                        </button>
                        <button class="resign-user-btn p-1.5 text-slate-500 hover:text-orange-600 bg-slate-50 hover:bg-orange-50 border border-slate-200 hover:border-orange-200 rounded-md transition-colors" data-username="${user.username}" title="ทำรายการลาออก">
                            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        </button>
                        <button class="delete-user-btn p-1.5 text-slate-500 hover:text-red-600 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-md transition-colors" data-username="${user.username}" title="ลบผู้ใช้งาน">
                            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        });
    }
    if(document.getElementById('user-page-info')) document.getElementById('user-page-info').textContent = `หน้า ${AppState.pagination.users} จาก ${totalPages || 1}`;
    if(document.getElementById('prev-user-page-btn')) document.getElementById('prev-user-page-btn').disabled = AppState.pagination.users <= 1;
    if(document.getElementById('next-user-page-btn')) document.getElementById('next-user-page-btn').disabled = AppState.pagination.users >= totalPages;
}

function handleBulkWaterparkReg(isUnlock) {
    const actionText = isUnlock ? 'เปิดสิทธิ์' : 'ปิดสิทธิ์';
    showConfirmModal(`ยืนยันการ${actionText}ให้พนักงาน "ทุกคน" สามารถแก้ไข/ลบรายชื่อญาติได้ ใช่หรือไม่?\n\n(เมื่อเปิดสิทธิ์ พนักงานจะสามารถลบและเพิ่มรายชื่อญาติใหม่ได้จนครบโควต้า 8 คน)`, async () => {
        const btn = isUnlock ? document.getElementById('btn-unlock-all') : document.getElementById('btn-lock-all');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto"></div>';
        btn.disabled = true;

        showNotification(`กำลัง${actionText}ให้พนักงานทุกคน... อาจใช้เวลาสักครู่`, 'success');

        try {
            const usersToUpdate = AppState.allUsersData.filter(u => (u.waterparkRegUnlocked || false) !== isUnlock);
            
            for (let u of usersToUpdate) {
                const userData = { 
                    name: u.name, 
                    department: u.department, 
                    username: u.username, 
                    password: u.password, 
                    role: u.role, 
                    status: u.status,
                    positionLevel: u.positionLevel,
                    isHeadApprover: u.isHeadApprover, 
                    waterparkRegUnlocked: isUnlock
                };
                await apiCall('/api/users', 'POST', { userData, adminUser: AppState.currentUser.username, originalUsername: u.username });
            }
            
            showNotification(`ดำเนินการ${actionText}สำเร็จ (อัปเดต ${usersToUpdate.length} บัญชี)`, 'success');
            refreshData();
        } catch(e) {
            showNotification('เกิดข้อผิดพลาด: ' + e.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

function handleUserSearch() { AppState.pagination.users = 1; renderUsersTable(); }
function changeUserPage(dir) { AppState.pagination.users += dir; renderUsersTable(); }

async function handleSaveUser(e) {
    if(e) e.preventDefault();
    const btn = document.getElementById('save-user-btn');
    if (btn.disabled || btn.dataset.isProcessing === 'true') return;
    btn.dataset.isProcessing = 'true'; btn.disabled = true;

    const headCheckbox = document.getElementById('user-form-is-head');
    const unlockCheckbox = document.getElementById('user-form-reg-unlocked');

    const userData = { 
        name: document.getElementById('user-form-name').value.trim(), 
        department: document.getElementById('user-form-department').value.trim(), 
        username: document.getElementById('user-form-username').value.trim(), 
        password: document.getElementById('user-form-password').value.trim(), 
        role: document.getElementById('user-form-role').value, 
        status: document.getElementById('user-form-status').value,
        positionLevel: document.getElementById('user-form-position').value,
        isHeadApprover: headCheckbox ? headCheckbox.checked : false, 
        waterparkRegUnlocked: unlockCheckbox ? unlockCheckbox.checked : false
    };
    
    if (!userData.name || !userData.username || !userData.password) {
        btn.dataset.isProcessing = 'false'; btn.disabled = false;
        return showNotification('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
    }
    showLoadingButton(btn, true);
    try { 
        await apiCall('/api/users', 'POST', { userData, adminUser: AppState.currentUser.username, originalUsername: AppState.currentEditUser }); 
        onAdminActionSuccess('บันทึกผู้ใช้สำเร็จ'); 
    } catch(err) { 
        onActionFailure(err); showLoadingButton(btn, false, 'บันทึก'); btn.dataset.isProcessing = 'false';
    }
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
        document.getElementById('user-form-position').value = user.positionLevel || 'Tier1_Staff';
        
        const headCheckbox = document.getElementById('user-form-is-head');
        if(headCheckbox) headCheckbox.checked = user.isHeadApprover === true;
        
        const unlockCheckbox = document.getElementById('user-form-reg-unlocked');
        if(unlockCheckbox) unlockCheckbox.checked = user.waterparkRegUnlocked === true;
        
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
    if(document.getElementById('user-form-is-head')) document.getElementById('user-form-is-head').checked = false;
    if(document.getElementById('user-form-reg-unlocked')) document.getElementById('user-form-reg-unlocked').checked = false;
}

function toggleUserForm(forceOpen = false) { 
    const content = document.getElementById('user-form-content'); 
    if(!content) return;
    if (forceOpen) content.classList.add('expanded'); 
    else content.classList.toggle('expanded'); 
    content.style.maxHeight = content.classList.contains('expanded') ? content.scrollHeight + 'px' : '0px'; 
    document.getElementById('user-form-toggle-icon').style.transform = content.classList.contains('expanded') ? 'rotate(0deg)' : 'rotate(-180deg)'; 
}

// 💡 สร้าง Modal สำหรับกดดูประวัติญาติ
function injectRelativesModal() {
    if (document.getElementById('relatives-modal')) return;
    const modalHTML = `
    <div id="relatives-modal" class="hidden fixed inset-0 bg-slate-900 bg-opacity-60 backdrop-blur-sm overflow-y-auto h-full w-full z-[100] flex items-center justify-center opacity-0 transition-opacity">
        <div class="relative mx-auto p-0 border border-slate-100 w-full max-w-2xl shadow-2xl rounded-2xl bg-white modal-container scale-95 transition-all overflow-hidden flex flex-col max-h-[90vh]">
            <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-cyan-600">
                <h3 class="text-lg font-black text-white flex items-center gap-2" id="relatives-modal-title">
                    <span class="text-xl">👥</span> ประวัติรายชื่อญาติ
                </h3>
                <button id="close-relatives-modal-btn" class="text-cyan-100 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            
            <div class="p-6 overflow-y-auto bg-slate-50 flex-grow" id="relatives-modal-content">
                <p class="text-center text-slate-500 py-4">กำลังโหลดข้อมูล...</p>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('close-relatives-modal-btn').addEventListener('click', () => closeModalAnimation(document.getElementById('relatives-modal')));
}

// 💡 ดึงประวัติและวาดหน้าจอญาติ
async function openRelativesModal(username) {
    const modal = document.getElementById('relatives-modal');
    document.getElementById('relatives-modal-title').innerHTML = `<span class="text-xl">👥</span> ประวัติรายชื่อญาติ: ${username}`;
    const content = document.getElementById('relatives-modal-content');
    content.innerHTML = '<p class="text-center text-slate-500 py-4"><span class="animate-pulse">กำลังโหลดข้อมูล...</span></p>';
    openModalAnimation(modal);

    try {
        const relatives = await apiCall(`/api/waterpark/admin/relatives/${username}`);
        
        if (relatives.length === 0) {
            content.innerHTML = `
            <div class="text-center p-8 bg-white rounded-xl border border-slate-200">
                <p class="text-slate-500 font-medium">ไม่พบประวัติการลงทะเบียนญาติของพนักงานท่านนี้</p>
            </div>`;
            return;
        }

        let html = '<div class="space-y-3">';
        relatives.forEach(rel => {
            const regDate = new Date(rel.createdAt).toLocaleDateString('th-TH');
            const expDate = rel.idCardExpiry ? new Date(rel.idCardExpiry).toLocaleDateString('th-TH') : 'ไม่ระบุ';
            
            // เช็คว่าหมดอายุหรือยัง
            let isExpired = false;
            if (rel.idCardExpiry) {
                const today = new Date();
                today.setHours(0,0,0,0);
                if (new Date(rel.idCardExpiry) < today) isExpired = true;
            }

            const statusBadge = rel.isActive 
                ? '<span class="text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold text-[10px]">ใช้งานอยู่</span>' 
                : '<span class="text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-bold text-[10px]">ลบออกแล้ว</span>';
                
            const expBadge = isExpired 
                ? '<span class="text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded font-bold text-[10px] ml-2 animate-pulse shadow-sm">⚠️ บัตรหมดอายุ</span>' 
                : '';

            const imgHtml = (rel.idCardImageUrl === 'DELETED' || !rel.idCardImageUrl)
                ? `<div class="w-16 h-10 bg-slate-100 border border-slate-200 rounded flex items-center justify-center text-[8px] text-slate-400 font-bold">ถูกลบ</div>`
                : `<img src="${getImageUrl(rel.idCardImageUrl)}" class="w-16 h-10 object-cover rounded shadow-sm border border-slate-200 cursor-pointer hover:opacity-80" onclick="openImageModal(this.src)">`;

            html += `
            <div class="p-4 border border-slate-200 rounded-xl bg-white shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow ${!rel.isActive ? 'opacity-60' : ''}">
                ${imgHtml}
                <div class="flex-1">
                    <p class="font-bold text-sm text-slate-800">${rel.fullName} ${statusBadge}</p>
                    <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <p class="text-[11px] text-slate-500">เลขบัตร: <span class="font-bold text-slate-700">${rel.idCardNumber || 'ไม่ระบุ'}</span></p>
                        <p class="text-[11px] text-slate-500">วันที่ลงทะเบียน: <span class="font-bold text-cyan-600">${regDate}</span></p>
                    </div>
                    <p class="text-[11px] text-slate-500 mt-1">วันหมดอายุบัตร: <span class="font-bold text-slate-700">${expDate}</span> ${expBadge}</p>
                </div>
            </div>`;
        });
        html += '</div>';
        content.innerHTML = html;
        
    } catch (err) {
        content.innerHTML = `<p class="text-center text-red-500 py-4 font-bold">เกิดข้อผิดพลาด: ${err.message}</p>`;
    }
}

function injectResignModal() {
    if (document.getElementById('resign-user-modal')) return;
    const modalHTML = `
    <div id="resign-user-modal" class="hidden fixed inset-0 bg-slate-900 bg-opacity-60 backdrop-blur-sm overflow-y-auto h-full w-full z-[85] flex items-center justify-center transition-opacity opacity-0">
        <div class="relative mx-auto p-0 border border-slate-100 w-full max-w-4xl shadow-2xl rounded-2xl bg-white modal-container scale-95 transition-all overflow-hidden flex flex-col max-h-[95vh]">
            <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-orange-500">
                <h3 class="text-lg font-black text-white flex items-center gap-2"><span class="text-xl">🚪</span> ทำรายการพนักงานลาออก</h3>
                <button id="close-resign-modal-btn" class="text-orange-100 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            
            <div class="p-6 overflow-y-auto bg-slate-50 flex-grow">
                <div class="mb-4">
                    <h4 class="text-xl font-bold text-slate-800">รหัสพนักงาน: <span id="resign-username-display" class="text-orange-600"></span></h4>
                    <p class="text-sm text-slate-500 mt-1">ระบุจำนวนคืนแต่ละสภาพให้ตรงกับยอดที่เบิกไป ก่อนทำการปิดบัญชี</p>
                </div>
                <input type="hidden" id="resign-target-username">
                
                <div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div class="overflow-x-auto max-h-[50vh]">
                        <table class="min-w-full divide-y divide-slate-200">
                            <thead class="bg-slate-100 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">รายการพัสดุ (ไซส์)</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase w-24">เบิกไป</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase">ระบุยอดคืนแต่ละสภาพ</th>
                                </tr>
                            </thead>
                            <tbody id="resign-items-tbody" class="bg-white divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>
                <div id="resign-no-items-msg" class="hidden mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <p class="text-emerald-700 font-bold">พนักงานคนนี้ไม่มีพัสดุค้างในระบบ สามารถกดยืนยันปิดบัญชีได้ทันที</p>
                </div>
            </div>
            
            <div class="p-4 border-t border-slate-100 bg-white flex justify-between items-center rounded-b-2xl">
                <span class="text-xs font-bold text-slate-500">* เมื่อกดยืนยัน บัญชีจะถูกปิดใช้งาน (Inactive) ทันที</span>
                <div class="flex gap-3">
                    <button id="cancel-resign-btn" class="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">ยกเลิก</button>
                    <button id="confirm-resign-btn" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 shadow-md shadow-orange-200 flex items-center gap-2">ยืนยันการลาออก</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const closeModal = () => closeModalAnimation(document.getElementById('resign-user-modal'));
    document.getElementById('close-resign-modal-btn').addEventListener('click', closeModal);
    document.getElementById('cancel-resign-btn').addEventListener('click', closeModal);
    
    document.getElementById('confirm-resign-btn').addEventListener('click', async (e) => {
        const btn = e.target;
        if (btn.disabled || btn.dataset.isProcessing === 'true') return;

        const username = document.getElementById('resign-target-username').value;
        const resolutions = [];
        let isValid = true;
        
        document.querySelectorAll('.resign-item-row').forEach(row => {
            const reqId = row.dataset.id;
            const totalQty = parseInt(row.dataset.qty);
            const usedQty = parseInt(row.querySelector('.res-qty-used').value) || 0;
            const damagedQty = parseInt(row.querySelector('.res-qty-damaged').value) || 0;
            const lostQty = parseInt(row.querySelector('.res-qty-lost').value) || 0;
            
            if (usedQty + damagedQty + lostQty !== totalQty) { isValid = false; row.classList.add('bg-red-50'); } 
            else { row.classList.remove('bg-red-50'); resolutions.push({ requestId: reqId, usedQty, damagedQty, lostQty, totalQty }); }
        });

        if (!isValid) return showNotification('กรุณาระบุยอดรวมคืนแต่ละแถวให้ตรงกับจำนวนที่เบิกไป (ไฮไลต์สีแดง)', 'error');

        btn.dataset.isProcessing = 'true'; btn.disabled = true;
        showLoadingButton(btn, true);

        try {
            await apiCall(`/api/users/${username}/resign`, 'POST', { adminUser: AppState.currentUser.username, resolutions });
            onAdminActionSuccess(`ปิดบัญชีและจัดการพัสดุสำเร็จ`);
            closeModal();
        } catch(err) { 
            onActionFailure(err); showLoadingButton(btn, false, 'ยืนยันการลาออก'); 
            btn.dataset.isProcessing = 'false'; btn.disabled = false;
        }
    });
}

function openResignModal(username, holdings) {
    const modal = document.getElementById('resign-user-modal');
    if (!modal) return;
    
    document.getElementById('resign-username-display').textContent = username;
    document.getElementById('resign-target-username').value = username;
    
    const tbody = document.getElementById('resign-items-tbody');
    tbody.innerHTML = '';
    
    if (holdings.length === 0) {
        document.getElementById('resign-no-items-msg').classList.remove('hidden');
        tbody.closest('.bg-white.border').classList.add('hidden'); 
    } else {
        document.getElementById('resign-no-items-msg').classList.add('hidden');
        tbody.closest('.bg-white.border').classList.remove('hidden'); 
        
        holdings.forEach((req, index) => {
            const tr = document.createElement('tr');
            tr.className = 'resign-item-row hover:bg-slate-50 transition-colors';
            tr.dataset.id = req.requestId;
            tr.dataset.qty = req.quantity; 
            
            tr.innerHTML = `
                <td class="px-4 py-3 whitespace-nowrap">
                    <p class="font-bold text-slate-800 text-sm">${req.itemType}</p>
                    <p class="text-[11px] text-slate-500 font-medium">ไซส์: <span class="font-bold text-slate-700">${req.size}</span> | รหัส: ${req.requestId}</p>
                </td>
                <td class="px-4 py-3 text-center border-l border-slate-100">
                    <span class="text-base font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">${req.quantity}</span>
                </td>
                <td class="px-4 py-3 border-l border-slate-100">
                    <div class="flex items-center gap-2 justify-center">
                        <div class="flex flex-col items-center">
                            <span class="text-[10px] font-bold text-blue-600 mb-1">มือสอง</span>
                            <input type="number" min="0" max="${req.quantity}" value="${req.quantity}" class="res-qty-used w-16 py-1 px-1 text-center font-bold text-sm border border-blue-200 rounded focus:ring-1 focus:ring-blue-500 bg-blue-50 outline-none">
                        </div>
                        <span class="text-slate-300 font-bold mt-4">+</span>
                        <div class="flex flex-col items-center">
                            <span class="text-[10px] font-bold text-rose-600 mb-1">ชำรุด</span>
                            <input type="number" min="0" max="${req.quantity}" value="0" class="res-qty-damaged w-16 py-1 px-1 text-center font-bold text-sm border border-rose-200 rounded focus:ring-1 focus:ring-rose-500 bg-rose-50 outline-none">
                        </div>
                        <span class="text-slate-300 font-bold mt-4">+</span>
                        <div class="flex flex-col items-center">
                            <span class="text-[10px] font-bold text-slate-500 mb-1">สูญหาย</span>
                            <input type="number" min="0" max="${req.quantity}" value="0" class="res-qty-lost w-16 py-1 px-1 text-center font-bold text-sm border border-slate-200 rounded focus:ring-1 focus:ring-slate-500 bg-slate-50 outline-none">
                        </div>
                        <span class="text-slate-400 font-bold mt-4">=</span>
                        <div class="flex flex-col items-center">
                            <span class="text-[10px] font-bold text-indigo-600 mb-1">รวม</span>
                            <span class="res-qty-total text-base font-black text-indigo-600 mt-1">${req.quantity}</span>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);

            const inputs = tr.querySelectorAll('input[type="number"]');
            const totalSpan = tr.querySelector('.res-qty-total');
            inputs.forEach(input => {
                input.addEventListener('input', () => {
                    const u = parseInt(tr.querySelector('.res-qty-used').value) || 0;
                    const d = parseInt(tr.querySelector('.res-qty-damaged').value) || 0;
                    const l = parseInt(tr.querySelector('.res-qty-lost').value) || 0;
                    const total = u + d + l;
                    totalSpan.textContent = total;
                    if (total === req.quantity) { totalSpan.classList.replace('text-red-500', 'text-indigo-600'); tr.classList.remove('bg-red-50'); } 
                    else { totalSpan.classList.replace('text-indigo-600', 'text-red-500'); }
                });
            });
        });
    }
    openModalAnimation(modal);
}

// ============================================================================
// 📜 HISTORY & LOGS
// ============================================================================
function onAdminLogReceived(logs) { 
    AppState.allAdminLogData = logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); 
    renderAdminLogTable();
}

function renderAllHistoryTable() {
    const searchTerm = document.getElementById('admin-history-search')?.value.toLowerCase() || '';
    const filteredData = AppState.allRequestsData.filter(req => (req.requesterName && req.requesterName.toLowerCase().includes(searchTerm)) || (req.itemType && req.itemType.toLowerCase().includes(searchTerm)) || (req.status && req.status.toLowerCase().includes(searchTerm)));
    const totalPages = Math.ceil(filteredData.length / AppState.pagination.rowsPerPage); 
    if (AppState.pagination.history > totalPages) AppState.pagination.history = Math.max(1, totalPages);
    const pageData = filteredData.slice((AppState.pagination.history - 1) * AppState.pagination.rowsPerPage, AppState.pagination.history * AppState.pagination.rowsPerPage);
    
    const tableBody = document.getElementById('all-requests-table');
    if(!tableBody) return;
    tableBody.innerHTML = '';
    
    if (pageData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-slate-500">ไม่พบข้อมูล</td></tr>`;
        return;
    }

    pageData.forEach(req => {
        const safeStatus = (req.status || 'unknown').replace(' ', '-').toLowerCase();
        const statusMap = {'pending':'bg-yellow-100 text-yellow-800','approved':'bg-emerald-100 text-emerald-800','rejected':'bg-red-100 text-red-800','returned':'bg-indigo-100 text-indigo-800','pending-return':'bg-orange-100 text-orange-800'};
        const statusClass = statusMap[safeStatus] || 'bg-slate-100 text-slate-800';

        tableBody.innerHTML += `<tr class="hover:bg-slate-50 transition-colors">
            <td class="p-3 text-[11px] text-slate-500 whitespace-nowrap">${new Date(req.createdAt).toLocaleString()}</td>
            <td class="p-3 text-xs font-bold text-slate-700">${req.requesterName}</td>
            <td class="p-3 text-xs font-medium text-slate-800">${req.itemType} <span class="text-slate-500">(ไซส์ ${req.size}) x <span class="font-bold text-indigo-600">${req.quantity}</span></span></td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${statusClass}">${req.status}</span></td>
            <td class="p-3 text-[11px] text-slate-600">${req.notes || '-'}</td>
        </tr>`;
    });
    
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
    pageData.forEach(log => { tbody.innerHTML += `<tr><td class="p-3 text-xs text-slate-500">${new Date(log.createdAt).toLocaleString()}</td><td class="p-3 text-sm font-bold text-indigo-600">${log.adminName}</td><td class="p-3 text-sm font-medium text-slate-700">${log.action}</td><td class="p-3 text-xs text-slate-500">${log.details}</td></tr>`; });
    if(document.getElementById('log-page-info')) document.getElementById('log-page-info').textContent = `หน้า ${AppState.pagination.logs} จาก ${totalPages || 1}`;
    if(document.getElementById('prev-log-page-btn')) document.getElementById('prev-log-page-btn').disabled = AppState.pagination.logs <= 1;
    if(document.getElementById('next-log-page-btn')) document.getElementById('next-log-page-btn').disabled = AppState.pagination.logs >= totalPages;
}

function handleHistorySearch() { AppState.pagination.history = 1; renderAllHistoryTable(); }
function changeHistoryPage(dir) { AppState.pagination.history += dir; renderAllHistoryTable(); }
function handleLogSearch() { AppState.pagination.logs = 1; renderAdminLogTable(); } 
function changeLogPage(dir) { AppState.pagination.logs += dir; renderAdminLogTable(); } 

async function handleImportRequestsCSV() {
    const btn = document.getElementById('import-requests-btn');
    if (btn.disabled || btn.dataset.isProcessing === 'true') return;
    btn.dataset.isProcessing = 'true';
    btn.disabled = true;

    const fileInput = document.getElementById('csv-requests-input');
    const file = fileInput?.files[0];
    if (!file) {
        btn.dataset.isProcessing = 'false';
        btn.disabled = false;
        return showNotification('กรุณาเลือกไฟล์ CSV ก่อน', 'error');
    }

    const formData = new FormData();
    formData.append('csvfile', file);
    formData.append('adminUser', AppState.currentUser.username);
    
    showLoadingButton(btn, true);
    try {
        const response = await fetch(`${API_BASE_URL}/api/requests/import`, { method: 'POST', body: formData });
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
    } catch(e) { 
        showNotification(e.message, 'error'); 
    } finally { 
        showLoadingButton(btn, false, 'นำเข้าข้อมูล'); 
        if(fileInput) fileInput.value = ''; 
        btn.dataset.isProcessing = 'false';
        btn.disabled = false;
    }
}

function initImportRequestsUI() {
    document.getElementById('import-requests-btn')?.addEventListener('click', handleImportRequestsCSV);
}

// 💡 สร้าง Modal สำหรับเลือกวันที่ออกรายงาน
function injectReportDateModal() {
    if (document.getElementById('report-date-modal')) return;
    const modalHTML = `
    <div id="report-date-modal" class="hidden fixed inset-0 bg-slate-900 bg-opacity-60 backdrop-blur-sm overflow-y-auto h-full w-full z-[100] flex items-center justify-center opacity-0 transition-opacity">
        <div class="relative mx-auto p-6 border border-slate-100 w-96 shadow-2xl rounded-2xl bg-white modal-container scale-95 transition-all">
            <h3 class="text-lg font-black text-slate-800 mb-2">🖨️ เลือกวันที่ต้องการพิมพ์รายงาน</h3>
            <p class="text-xs text-slate-500 mb-4">ระบบจะดึงข้อมูลผู้ที่ได้รับอนุมัติให้เข้าสวนน้ำ ในวันที่เลือก</p>
            <input type="date" id="report-date-input" class="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-800 mb-6 font-medium">
            <div class="flex justify-end gap-3">
                <button id="report-date-cancel-btn" class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors">ยกเลิก</button>
                <button id="report-date-submit-btn" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-200 transition-all flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg> พิมพ์รายงาน
                </button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('report-date-cancel-btn').addEventListener('click', () => closeModalAnimation(document.getElementById('report-date-modal')));
    document.getElementById('report-date-submit-btn').addEventListener('click', () => {
        const dateVal = document.getElementById('report-date-input').value;
        if (!dateVal) return showNotification('กรุณาเลือกวันที่', 'error');
        closeModalAnimation(document.getElementById('report-date-modal'));
        executePrintReport(dateVal);
    });
}

function openPrintReportModal() {
    const modal = document.getElementById('report-date-modal');
    if (!modal) return;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    
    document.getElementById('report-date-input').value = `${yyyy}-${mm}-${dd}`;
    openModalAnimation(modal);
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
    setTimeout(() => {
        modal.classList.add('hidden');
        target.src = '';
    }, 300);
}

// ============================================================================
// 🎯 UTILS & EVENT LISTENERS
// ============================================================================
function handleTabClick(tabName) {
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.admin-tab').forEach(tab => { 
        tab.classList.remove('bg-indigo-50', 'border-indigo-500', 'text-indigo-600'); 
        tab.classList.add('border-transparent', 'text-slate-500'); 
    });
    
    document.getElementById(`content-${tabName}`)?.classList.remove('hidden');
    
    const btn = document.getElementById(`tab-${tabName}`); 
    if(btn) { 
        btn.classList.add('bg-indigo-50', 'border-indigo-500', 'text-indigo-600'); 
        btn.classList.remove('border-transparent', 'text-slate-500'); 
    }

    // 💡 แก้ไขบั๊กเมนูย่อย: ควบคุมการแสดงผลของเมนูหมวดหมู่คลังสินค้าเมื่อคลิกแท็บ
    const stockSubmenu = document.getElementById('stock-category-submenu');
    if (stockSubmenu) {
        if (tabName === 'stock') {
            stockSubmenu.classList.remove('hidden');
        } else {
            stockSubmenu.classList.add('hidden');
        }
    }
}

function showNotification(msg, type='success') { 
    const el = document.getElementById('notification');
    if(!el) { alert(msg); return; }
    document.getElementById('notification-message').innerHTML = msg.replace(/\n/g, '<br>');
    el.classList.remove('bg-red-500', 'bg-emerald-500', 'hidden'); 
    el.classList.add(type === 'error' ? 'bg-red-500' : 'bg-emerald-500');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function showLoadingButton(button, isLoading, originalHTML = '') { 
    if (!button) return;
    if (isLoading) { 
        if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML; 
        button.disabled = true; 
        button.innerHTML = `<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>`; 
    } else { 
        button.disabled = false; 
        button.innerHTML = originalHTML || button.dataset.originalHtml || 'Submit'; 
        button.dataset.originalHtml = ''; 
    }
}

function onAdminActionSuccess(message) {
    showNotification(message, 'success');
    clearUserForm(); resetActionButtons(); refreshData();
}

function onActionFailure(error) { showNotification(error.message, 'error'); resetActionButtons(); }

function resetActionButtons() {
    const saveUserBtn = document.getElementById('save-user-btn');
    if(saveUserBtn) { showLoadingButton(saveUserBtn, false, 'บันทึก'); saveUserBtn.dataset.isProcessing = 'false'; }
    document.querySelectorAll('button[data-is-processing="true"]').forEach(btn => { showLoadingButton(btn, false); btn.dataset.isProcessing = 'false'; });
}

function openModalAnimation(modal) { 
    if (!modal) return; modal.classList.remove('hidden'); 
    setTimeout(() => { modal.classList.remove('opacity-0'); const c = modal.querySelector('.modal-container'); if (c) c.classList.remove('scale-95'); }, 10); 
}

function closeModalAnimation(modal) { 
    if (!modal) return; modal.classList.add('opacity-0'); const c = modal.querySelector('.modal-container'); if (c) c.classList.add('scale-95'); 
    setTimeout(() => modal.classList.add('hidden'), 300); 
}

function showPromptModal(title, callback, onCancel) { 
    const modal = document.getElementById('prompt-modal'); if(!modal) return; 
    document.getElementById('prompt-modal-title').textContent = title; 
    const input = document.getElementById('prompt-modal-input'); input.value = ''; 
    const submitBtn = document.getElementById('prompt-modal-submit-btn'); submitBtn.disabled = false;
    submitBtn.onclick = () => { if(input.value.trim()) { if (submitBtn.disabled) return; submitBtn.disabled = true; closeModalAnimation(modal); callback(input.value.trim()); } }; 
    document.getElementById('prompt-modal-cancel-btn').onclick = () => { closeModalAnimation(modal); if(onCancel) onCancel(); }; 
    openModalAnimation(modal); setTimeout(() => input.focus(), 100); 
}

function showConfirmModal(message, callback, onCancel) { 
    const modal = document.getElementById('confirm-modal'); if(!modal) return; 
    document.getElementById('confirm-modal-message').textContent = message; 
    const okBtn = document.getElementById('confirm-modal-ok-btn'); okBtn.disabled = false;
    okBtn.onclick = () => { if(okBtn.disabled) return; okBtn.disabled = true; closeModalAnimation(modal); callback(); }; 
    document.getElementById('confirm-modal-cancel-btn').onclick = () => { closeModalAnimation(modal); if(onCancel) onCancel(); }; 
    openModalAnimation(modal); 
}

async function openHistoryModal(title) { 
    const modal = document.getElementById('user-history-modal'); if(!modal) return; 
    document.getElementById('history-modal-username').textContent = title; 
    openModalAnimation(modal); document.getElementById('history-modal-content').innerHTML = '<p class="text-center mt-6 text-slate-500">กำลังโหลดข้อมูล...</p>'; 
}

function closeHistoryModal() { closeModalAnimation(document.getElementById('user-history-modal')); }

function setupAdminEventListeners() {
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    });

    document.getElementById('history-modal-close-btn')?.addEventListener('click', closeHistoryModal);
    document.getElementById('user-history-modal')?.addEventListener('click', (e) => { if (e.target.id === 'user-history-modal') closeHistoryModal(); });
    document.getElementById('stock-history-modal-close-btn')?.addEventListener('click', () => closeModalAnimation(document.getElementById('stock-history-modal')));
    document.getElementById('stock-history-modal')?.addEventListener('click', (e) => { if (e.target.id === 'stock-history-modal') closeModalAnimation(document.getElementById('stock-history-modal')); });
    document.getElementById('close-adjust-modal-btn')?.addEventListener('click', () => closeModalAnimation(document.getElementById('advanced-adjust-modal')));
    document.getElementById('advanced-adjust-modal')?.addEventListener('click', (e) => { if (e.target.id === 'advanced-adjust-modal') closeModalAnimation(document.getElementById('advanced-adjust-modal')); });

    document.getElementById('save-user-btn')?.addEventListener('click', handleSaveUser);
    document.getElementById('clear-user-form-btn')?.addEventListener('click', clearUserForm);
    document.getElementById('import-users-btn')?.addEventListener('click', handleImportUsersCSV);
    
    document.getElementById('user-search-input')?.addEventListener('keyup', handleUserSearch);
    document.getElementById('user-dept-filter')?.addEventListener('change', handleUserSearch); 
    
    document.getElementById('prev-user-page-btn')?.addEventListener('click', () => changeUserPage(-1));
    document.getElementById('next-user-page-btn')?.addEventListener('click', () => changeUserPage(1));
    document.getElementById('toggle-user-form-btn')?.addEventListener('click', () => toggleUserForm());
    
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

    const printBtn = document.getElementById('print-wp-report-btn');
    if (printBtn) {
        printBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            พิมพ์ใบลงนาม (PDF)
        `;
    }

    document.getElementById('wp-fetch-report-btn')?.addEventListener('click', fetchDailyWaterparkReport);
    document.getElementById('wp-print-report-btn')?.addEventListener('click', handlePrintWaterparkReport);

    document.body.addEventListener('click', async (e) => {
        if (!AppState.currentUser) return;

        const tabTarget = e.target.closest('.admin-tab');
        if (tabTarget) handleTabClick(tabTarget.id.replace('tab-', ''));
        const filterTarget = e.target.closest('.stock-filter-btn');
        if (filterTarget) handleStockFilter(filterTarget);
        
        // 💡 กดดูประวัติญาติที่หน้าการจัดการ User
        if (e.target.matches('.view-relatives-btn') || e.target.closest('.view-relatives-btn')) {
            const btn = e.target.closest('.view-relatives-btn');
            openRelativesModal(btn.dataset.username);
        }
        
        // 🌊 Waterpark Approvals
        else if (e.target.matches('.wp-approve-btn') || e.target.closest('.wp-approve-btn')) {
            const btn = e.target.closest('.wp-approve-btn') || e.target;
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true'; showLoadingButton(btn, true);
            try {
                await apiCall('/api/waterpark/approvals/action', 'POST', { bookingId: btn.dataset.id, action: 'APPROVE', adminUser: AppState.currentUser.username, role: AppState.currentUser.role });
                showNotification('อนุมัติสำเร็จ', 'success'); loadWaterparkApprovals();
            } catch(err) { showNotification(err.message, 'error'); }
            btn.dataset.isProcessing = 'false';
        }
        else if (e.target.matches('.wp-reject-btn') || e.target.closest('.wp-reject-btn')) {
            const btn = e.target.closest('.wp-reject-btn') || e.target;
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            showPromptModal("เหตุผลที่ปฏิเสธคำขอเข้าสวนน้ำ:", async (reason) => {
                showLoadingButton(btn, true);
                try {
                    await apiCall('/api/waterpark/approvals/action', 'POST', { bookingId: btn.dataset.id, action: 'REJECT', reason, adminUser: AppState.currentUser.username, role: AppState.currentUser.role });
                    showNotification('ปฏิเสธสำเร็จ', 'success'); loadWaterparkApprovals();
                } catch(err) { showNotification(err.message, 'error'); }
                btn.dataset.isProcessing = 'false';
            }, () => { btn.dataset.isProcessing = 'false'; });
        }
        // 💡 ปุ่มตีกลับให้แก้ไขใหม่
        else if (e.target.matches('.wp-return-btn') || e.target.closest('.wp-return-btn')) {
            const btn = e.target.closest('.wp-return-btn');
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            
            showPromptModal("ระบุข้อความแจ้งพนักงานเพื่อให้แก้ไขคำขอ (เช่น บัตรญาติหมดอายุ):", async (reason) => {
                showLoadingButton(btn, true);
                try {
                    await apiCall('/api/waterpark/approvals/return', 'POST', { bookingId: btn.dataset.id, reason: reason || 'ข้อมูลไม่ถูกต้อง', adminUser: AppState.currentUser.username });
                    showNotification('ส่งคำขอคืนให้พนักงานแก้ไขเรียบร้อย', 'success');
                    loadWaterparkApprovals();
                } catch(err) { showNotification(err.message, 'error'); }
                btn.dataset.isProcessing = 'false';
            }, () => { btn.dataset.isProcessing = 'false'; });
        }
        
        // 🌊 Admin: ลบคนเดียว หรือ ยกเลิกคิว 
        else if (e.target.matches('.admin-cancel-booking-btn') || e.target.closest('.admin-cancel-booking-btn')) {
            const btn = e.target.closest('.admin-cancel-booking-btn') || e.target;
            showConfirmModal('ยืนยันที่จะ "ยกเลิก" รายการจองนี้ใช่หรือไม่?\nโควต้าจะถูกคืนให้พนักงาน', async () => {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = 'กำลังประมวลผล...'; btn.disabled = true;
                try {
                    await apiCall(`/api/waterpark/admin/cancel/${btn.dataset.id}`, 'PUT', { adminUser: AppState.currentUser.username });
                    showNotification('ยกเลิกรายการสำเร็จ', 'success');
                    loadWaterparkApprovals();
                    if(document.getElementById('wp-report-date-input')?.value) fetchDailyWaterparkReport();
                } catch(err) { 
                    showNotification(err.message, 'error'); 
                    btn.innerHTML = originalHtml; btn.disabled = false;
                }
            });
        }
        else if (e.target.matches('.admin-remove-guest-btn') || e.target.closest('.admin-remove-guest-btn')) {
            const btn = e.target.closest('.admin-remove-guest-btn') || e.target;
            showConfirmModal('ยืนยันที่จะ "ลบรายชื่อนี้" ออกจากการจองใช่หรือไม่?', async () => {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '...'; btn.disabled = true;
                try {
                    await apiCall(`/api/waterpark/admin/remove-guest/${btn.dataset.id}`, 'PUT', { guestIndex: btn.dataset.index, adminUser: AppState.currentUser.username });
                    showNotification('ลบรายชื่อสำเร็จ', 'success');
                    loadWaterparkApprovals();
                    if(document.getElementById('wp-report-date-input')?.value) fetchDailyWaterparkReport();
                } catch(err) { 
                    showNotification(err.message, 'error');
                    btn.innerHTML = originalHtml; btn.disabled = false;
                }
            });
        }
        
        // 🔑 Users & Approvals (Uniform)
        else if (e.target.matches('.approve-reset-btn')) {
            const btn = e.target;
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            const id = btn.dataset.id; const user = btn.dataset.user;
            showPromptModal(`ตั้งรหัสผ่านชั่วคราวให้ ${user}:`, async (pwd) => {
                if(pwd.length < 4) { btn.dataset.isProcessing = 'false'; return showNotification("รหัสผ่านต้องมี 4 ตัวอักษรขึ้นไป", "error"); }
                showLoadingButton(btn, true);
                try {
                    await apiCall('/api/admin/approve-reset', 'POST', { resetId: id, username: user, newPassword: pwd, adminUser: AppState.currentUser.username });
                    onAdminActionSuccess(`อนุมัติรีเซ็ตรหัสผ่านสำเร็จ`);
                } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'อนุมัติ / ตั้งรหัสใหม่'); btn.dataset.isProcessing = 'false'; }
            }, () => { btn.dataset.isProcessing = 'false'; });
        }
        else if (e.target.matches('.approve-btn') || e.target.closest('.approve-btn')) handleApproveRequest(e.target.closest('.approve-btn') || e.target);
        else if (e.target.matches('.reject-btn') || e.target.closest('.reject-btn')) handleRejectRequest(e.target.closest('.reject-btn') || e.target);
        else if (e.target.matches('.process-return-btn') || e.target.closest('.process-return-btn')) handleProcessReturn(e.target.closest('.process-return-btn') || e.target);
        else if (e.target.matches('.reject-return-btn') || e.target.closest('.reject-return-btn')) {
            const btn = e.target.closest('.reject-return-btn') || e.target;
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            showPromptModal("เหตุผลที่ปฏิเสธการคืน:", async (reason) => {
                showLoadingButton(btn, true);
                try {
                    await apiCall('/api/admin/reject', 'POST', { requestId: btn.dataset.id, reason, adminUser: AppState.currentUser.username });
                    onAdminActionSuccess('ปฏิเสธการคืนสำเร็จ');
                } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'ปฏิเสธ'); btn.dataset.isProcessing = 'false'; }
            }, () => { btn.dataset.isProcessing = 'false'; });
        }
        
        // 📦 Stock Management
        else if (e.target.matches('.edit-stock-btn') || e.target.closest('.edit-stock-btn')) {
            const btn = e.target.closest('.edit-stock-btn') || e.target;
            const item = AppState.masterStock.find(s => s.itemType === btn.dataset.type && s.size === btn.dataset.size);
            if (item) openSuperStockModal(true, item);
        }
        else if (e.target.matches('.receive-stock-btn') || e.target.closest('.receive-stock-btn')) {
            const btn = e.target.closest('.receive-stock-btn') || e.target;
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            const type = btn.dataset.type; const size = btn.dataset.size;
            showPromptModal(`รับของเข้า: ${type} (${size})\nระบุจำนวน (ชิ้น):`, async (qty) => {
                const num = parseInt(qty);
                if (isNaN(num) || num <= 0) { btn.dataset.isProcessing = 'false'; return showNotification('ระบุตัวเลขให้ถูกต้อง', 'error'); }
                showLoadingButton(btn, true);
                try {
                    await apiCall('/api/stock/transaction', 'POST', { itemType: type, size, transactionType: 'IN', quantity: num, reason: 'รับเข้าใหม่', adminUser: AppState.currentUser.username });
                    onAdminActionSuccess(`รับเข้าสำเร็จ`);
                } catch(err) { onActionFailure(err); showLoadingButton(btn, false, '+ รับเข้า'); btn.dataset.isProcessing = 'false'; }
            }, () => { btn.dataset.isProcessing = 'false'; });
        }
        else if (e.target.matches('.adjust-stock-btn') || e.target.closest('.adjust-stock-btn')) {
            const btn = e.target.closest('.adjust-stock-btn') || e.target;
            const item = AppState.masterStock.find(s => s.itemType === btn.dataset.type && s.size === btn.dataset.size);
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
        else if (e.target.matches('.toggle-status-btn') || e.target.closest('.toggle-status-btn')) {
            const btn = e.target.closest('.toggle-status-btn') || e.target;
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            const type = btn.dataset.type; const size = btn.dataset.size; const newStatus = btn.dataset.status === 'true';
            const actionName = newStatus ? 'เปิดใช้งาน' : 'ระงับการเบิกจ่าย';
            const actionMsg = newStatus ? `พนักงานจะสามารถมองเห็นและเบิกพัสดุนี้ได้ตามปกติ` : `พนักงานจะไม่สามารถเบิกพัสดุนี้ได้อีก แต่ประวัติเดิมจะยังคงอยู่`;
            showConfirmModal(`ยืนยันการ${actionName}\n"${type} (ไซส์ ${size})" หรือไม่?\n\n${actionMsg}`, async () => {
                showLoadingButton(btn, true);
                try {
                    await apiCall('/api/stock/toggle-status', 'PUT', { itemType: type, size: size, isActive: newStatus, adminUser: AppState.currentUser.username });
                    onAdminActionSuccess(`ดำเนินการ${actionName}สำเร็จ`);
                } catch(err) { onActionFailure(err); showLoadingButton(btn, false, ''); btn.dataset.isProcessing = 'false'; }
            }, () => { btn.dataset.isProcessing = 'false'; });
        }
        else if (e.target.closest('#confirm-advanced-adjust-btn')) {
            const btn = document.getElementById('confirm-advanced-adjust-btn');
            if (btn.disabled || btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true'; btn.disabled = true;
            const target = document.getElementById('adjust-target-id').value.split('|');
            const qty = parseInt(document.getElementById('adjust-qty-input').value);
            if (isNaN(qty) || qty < 0) { btn.dataset.isProcessing = 'false'; btn.disabled = false; return showNotification('กรุณากรอกตัวเลข', 'error'); }
            showLoadingButton(btn, true);
            try {
                await apiCall('/api/stock/advanced-adjust', 'POST', { 
                    itemType: target[0], size: target[1], condition: document.getElementById('adjust-stock-condition').value, mode: document.getElementById('adjust-mode').value, qty, 
                    reason: `[${document.getElementById('adjust-reason-category').value}] ${document.getElementById('adjust-reason-note').value}`, adminUser: AppState.currentUser.username 
                });
                onAdminActionSuccess(`ปรับปรุงสต๊อกสำเร็จ`);
                closeModalAnimation(document.getElementById('advanced-adjust-modal'));
            } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'บันทึก'); btn.dataset.isProcessing = 'false'; }
        }
        else if (e.target.matches('.history-stock-btn') || e.target.closest('.history-stock-btn')) {
            const btn = e.target.closest('.history-stock-btn') || e.target;
            const type = btn.dataset.type; const size = btn.dataset.size;
            document.getElementById('export-stock-history-btn').dataset.type = type;
            document.getElementById('export-stock-history-btn').dataset.size = size;
            document.getElementById('stock-history-modal-title').textContent = `ความเคลื่อนไหวสต๊อก: ${type} (${size})`;
            openModalAnimation(document.getElementById('stock-history-modal'));
            document.getElementById('stock-history-modal-content').innerHTML = '<div class="text-center p-4">กำลังโหลด...</div>';
            try {
                const history = await apiCall(`/api/stock/history?itemType=${encodeURIComponent(type)}&size=${encodeURIComponent(size)}`);
                let html = `<div class="flex gap-2 mb-4 overflow-x-auto pb-2 border-b border-slate-200">
                        <button class="sh-tab-btn active px-4 py-2 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600 whitespace-nowrap" data-filter="all">ทั้งหมด</button>
                        <button class="sh-tab-btn px-4 py-2 text-sm font-bold text-slate-500 border-b-2 border-transparent hover:text-slate-700 whitespace-nowrap" data-filter="in">รับเข้า</button>
                        <button class="sh-tab-btn px-4 py-2 text-sm font-bold text-slate-500 border-b-2 border-transparent hover:text-slate-700 whitespace-nowrap" data-filter="out">เบิกจ่าย</button>
                        <button class="sh-tab-btn px-4 py-2 text-sm font-bold text-slate-500 border-b-2 border-transparent hover:text-slate-700 whitespace-nowrap" data-filter="return">รับคืน</button>
                        <button class="sh-tab-btn px-4 py-2 text-sm font-bold text-slate-500 border-b-2 border-transparent hover:text-slate-700 whitespace-nowrap" data-filter="adjust">ปรับยอด</button>
                    </div>`;
                html += '<div class="overflow-hidden border border-slate-200 rounded-xl shadow-sm"><table class="min-w-full divide-y divide-slate-200"><thead class="bg-slate-100"><tr><th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">เวลา</th><th class="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase">ประเภท</th><th class="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase">จำนวน</th><th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">เหตุผล</th><th class="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">แอดมิน</th></tr></thead><tbody class="bg-white divide-y divide-slate-100">';
                if(history.length === 0) { html += '<tr id="sh-empty-row"><td colspan="5"><div class="text-center p-8 bg-white"><p class="text-slate-500 font-medium">ไม่มีประวัติความเคลื่อนไหว</p></div></td></tr>'; } 
                else {
                    html += '<tr id="sh-empty-row" class="hidden"><td colspan="5"><div class="text-center p-8 bg-white"><p class="text-slate-500 font-medium">ไม่มีข้อมูลในหมวดหมู่นี้</p></div></td></tr>';
                    history.forEach(log => {
                        let badgeColor = ''; let filterGroup = 'all ';
                        if (log.transactionType === 'IN') { badgeColor = 'bg-emerald-100 text-emerald-700 border-emerald-200'; filterGroup += 'in '; } 
                        else if (log.transactionType.startsWith('OUT')) { badgeColor = 'bg-rose-100 text-red-700 border-red-200'; filterGroup += 'out '; } 
                        else if (log.transactionType.startsWith('RETURN')) { badgeColor = 'bg-indigo-100 text-indigo-700 border-indigo-200'; filterGroup += 'return '; } 
                        else { badgeColor = 'bg-amber-100 text-amber-700 border-amber-200'; filterGroup += 'adjust '; }
                        let qtyColor = log.quantity > 0 ? 'text-emerald-600 bg-emerald-50' : log.quantity < 0 ? 'text-rose-600 bg-rose-50' : 'text-amber-600 bg-amber-50';
                        html += `<tr class="sh-row" data-groups="${filterGroup}"><td class="p-3 text-xs text-slate-500 whitespace-nowrap">${new Date(log.createdAt).toLocaleString()}</td><td class="p-3 text-center"><span class="px-2.5 py-1 rounded-md text-[10px] font-bold border ${badgeColor}">${log.transactionType}</span></td><td class="p-3 text-center"><span class="px-3 py-1 rounded-lg text-sm font-black ${qtyColor}">${log.quantity > 0 ? '+'+log.quantity : log.quantity}</span></td><td class="p-3 text-xs text-slate-700 font-medium">${log.reason || '-'}</td><td class="p-3 text-xs font-semibold text-indigo-600">${log.adminUser}</td></tr>`;
                    });
                }
                html += '</tbody></table></div>';
                document.getElementById('stock-history-modal-content').innerHTML = html;

                const tabs = document.querySelectorAll('.sh-tab-btn'); const rows = document.querySelectorAll('.sh-row'); const emptyRow = document.getElementById('sh-empty-row');
                tabs.forEach(tab => {
                    tab.addEventListener('click', (ev) => {
                        tabs.forEach(t => { t.classList.remove('text-indigo-600', 'border-indigo-600'); t.classList.add('text-slate-500', 'border-transparent'); });
                        ev.target.classList.remove('text-slate-500', 'border-transparent'); ev.target.classList.add('text-indigo-600', 'border-indigo-600');
                        const filter = ev.target.dataset.filter; let visibleCount = 0;
                        rows.forEach(row => { if (row.dataset.groups.includes(filter + ' ')) { row.style.display = ''; visibleCount++; } else { row.style.display = 'none'; } });
                        if (emptyRow) emptyRow.classList.toggle('hidden', visibleCount > 0);
                    });
                });
            } catch(e) { document.getElementById('stock-history-modal-content').innerHTML = '<p class="text-red-500 text-center">เกิดข้อผิดพลาด</p>'; }
        }
        
        // 👥 User Management & History
        else if (e.target.matches('.edit-user-btn') || e.target.closest('.edit-user-btn')) populateUserForm(e.target.closest('.edit-user-btn').dataset.username);
        else if (e.target.matches('.reset-password-btn') || e.target.closest('.reset-password-btn')) {
            const btn = e.target.closest('.reset-password-btn');
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            showPromptModal(`กรอกรหัสผ่านใหม่:`, async (pwd) => {
                if (pwd.length < 4) { btn.dataset.isProcessing = 'false'; return showNotification("รหัสผ่านต้องมี 4 ตัวอักษรขึ้นไป", "error"); }
                showLoadingButton(btn, true);
                try {
                    await apiCall('/api/auth/change-password', 'POST', { username: btn.dataset.username, newPassword: pwd, forceChange: true });
                    onAdminActionSuccess(`รีเซ็ตรหัสผ่านสำเร็จ`);
                } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'รหัส'); btn.dataset.isProcessing = 'false'; }
            }, () => { btn.dataset.isProcessing = 'false'; });
        }
        else if (e.target.matches('.resign-user-btn') || e.target.closest('.resign-user-btn')) {
            const btn = e.target.closest('.resign-user-btn');
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            const username = btn.dataset.username;
            if (username === AppState.currentUser.username) { btn.dataset.isProcessing = 'false'; return showNotification('ไม่สามารถทำรายการให้ตัวเองได้', 'error'); }
            showLoadingButton(btn, true);
            try {
                const requests = await apiCall(`/api/requests/me?username=${username}`);
                const holdings = requests.filter(r => r.status === 'Approved' && r.quantity > 0);
                showLoadingButton(btn, false, 'ลาออก'); openResignModal(username, holdings); btn.dataset.isProcessing = 'false';
            } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'ลาออก'); btn.dataset.isProcessing = 'false'; }
        }
        else if (e.target.matches('.delete-user-btn') || e.target.closest('.delete-user-btn')) {
            const btn = e.target.closest('.delete-user-btn');
            if (btn.dataset.isProcessing === 'true') return;
            btn.dataset.isProcessing = 'true';
            if (btn.dataset.username === AppState.currentUser.username) { btn.dataset.isProcessing = 'false'; return showNotification('ไม่สามารถลบตัวเองได้', 'error'); }
            showConfirmModal(`ยืนยันลบผู้ใช้?`, async () => {
                showLoadingButton(btn, true);
                try {
                    await apiCall(`/api/users/${btn.dataset.username}`, 'DELETE', { adminUser: AppState.currentUser.username });
                    onAdminActionSuccess('ลบสำเร็จ');
                } catch(err) { onActionFailure(err); showLoadingButton(btn, false, 'ลบ'); btn.dataset.isProcessing = 'false'; }
            }, () => { btn.dataset.isProcessing = 'false'; });
        }
        else if (e.target.matches('.view-history-btn') || e.target.matches('.clickable-username')) {
            e.preventDefault();
            const username = e.target.dataset.requesterName || e.target.dataset.username;
            openHistoryModal(username);
            try {
                const requests = await apiCall(`/api/requests/me?username=${username}`);
                const totalItems = requests.reduce((acc, req) => req.status === 'Approved' ? acc + req.quantity : acc, 0);
                
                let html = `
                    <div class="grid grid-cols-2 gap-4 text-center mt-4">
                        <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                            <p class="text-sm font-bold text-indigo-800">คำขอทั้งหมด</p>
                            <p class="text-3xl font-black text-indigo-600">${requests.length || 0}</p>
                        </div>
                        <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                            <p class="text-sm font-bold text-emerald-800">พัสดุที่เคยเบิก</p>
                            <p class="text-3xl font-black text-emerald-600">${totalItems}</p>
                        </div>
                    </div>
                    <div class="mt-6">
                        <h4 class="font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            รายละเอียดการเบิก-คืน
                        </h4>
                        <div class="overflow-hidden border border-slate-200 rounded-xl shadow-sm">
                            <div class="overflow-x-auto max-h-60 overflow-y-auto">
                                <table class="min-w-full divide-y divide-slate-200">
                                    <thead class="bg-slate-100 sticky top-0">
                                        <tr>
                                            <th class="px-4 py-2.5 text-left text-[11px] font-bold text-slate-600 uppercase">เวลา</th>
                                            <th class="px-4 py-2.5 text-left text-[11px] font-bold text-slate-600 uppercase">รายการพัสดุ</th>
                                            <th class="px-4 py-2.5 text-center text-[11px] font-bold text-slate-600 uppercase">จำนวน</th>
                                            <th class="px-4 py-2.5 text-center text-[11px] font-bold text-slate-600 uppercase">สถานะ</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-slate-50">
                `;

                if (requests.length === 0) { html += `<tr><td colspan="4" class="px-4 py-6 text-center text-sm text-slate-500 font-medium">ไม่มีประวัติในระบบ</td></tr>`; } 
                else {
                    requests.forEach(req => {
                        const safeStatus = (req.status || 'unknown').replace(' ', '-').toLowerCase();
                        const statusMap = {'pending':'bg-yellow-100 text-yellow-800','approved':'bg-emerald-100 text-emerald-800','rejected':'bg-red-100 text-red-800','returned':'bg-indigo-100 text-indigo-800','pending-return':'bg-orange-100 text-orange-800 border border-orange-200'};
                        const statusClass = statusMap[safeStatus] || 'bg-slate-100 text-slate-800';
                        html += `
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-4 py-3 text-[10px] text-slate-500 whitespace-nowrap">${new Date(req.createdAt).toLocaleString()}</td>
                                <td class="px-4 py-3 text-xs font-medium text-slate-800">${req.itemType} <span class="text-slate-500 ml-1">(ไซส์ ${req.size})</span></td>
                                <td class="px-4 py-3 text-center text-xs font-black text-indigo-600">${req.quantity}</td>
                                <td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${statusClass}">${req.status}</span></td>
                            </tr>
                        `;
                    });
                }
                html += `</tbody></table></div></div></div>`;
                document.getElementById('history-modal-content').innerHTML = html;
            } catch(e) { document.getElementById('history-modal-content').innerHTML = '<p class="text-red-500 text-center py-4">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>'; }
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.matches('input[name^="return-condition-"]')) {
            const id = e.target.name.replace('return-condition-', '');
            const reasonDiv = document.getElementById(`damage-reason-div-${id}`);
            if (e.target.value === 'Damaged') reasonDiv.classList.remove('hidden'); else reasonDiv.classList.add('hidden');
        }
    });
}
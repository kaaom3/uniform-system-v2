const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = isLocalhost ? 'http://localhost:3000' : 'https://uniform-system-hg0e.onrender.com';

const storedUser = sessionStorage.getItem('currentUser');
if (!storedUser) {
    window.location.href = 'index.html'; 
}
const currentUser = JSON.parse(storedUser);

const WPState = {
    tier: 'Tier1_Staff',
    maxFree: 4,
    freeRemaining: 0,
    relatives: [],
    regUnlocked: false,
    cart: [],
    allBookings: [],     
    editingBookingId: null 
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('wp-user-name').textContent = currentUser.name;
    
    // 💡 ปรับให้เลือกปฏิทินวันนี้ได้ (ไม่ล็อค 3 วัน) แต่ค่าเริ่มต้นคือ 3 วันล่วงหน้า
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const d = new Date(); d.setDate(d.getDate() + 3);
    const defaultDateStr = d.toISOString().split('T')[0];
    
    const dateInput = document.getElementById('wp-visit-date');
    if (dateInput) {
        dateInput.min = todayStr; // อนุญาตให้เลือกตั้งแต่วันนี้
        dateInput.value = defaultDateStr; // ค่าเริ่มต้น 3 วันล่วงหน้า
        
        // 💡 ตรวจจับการเปลี่ยนวันที่ เพื่อเปิดกล่องให้กรอกเหตุผล
        dateInput.addEventListener('change', checkUrgentDate);
    }
    
    injectImageModal(); 
    loadWaterparkDashboard();
    setupEventListeners();
});

// 💡 ฟังก์ชันตรวจจับจองด่วน
function checkUrgentDate() {
    const dateInput = document.getElementById('wp-visit-date');
    if (!dateInput || !dateInput.value) return;
    
    const vDate = new Date(dateInput.value); vDate.setHours(0,0,0,0);
    const tDate = new Date(); tDate.setHours(0,0,0,0);
    const diffDays = Math.floor((vDate - tDate) / (1000 * 60 * 60 * 24));

    const container = document.getElementById('urgent-reason-container');
    if (diffDays < 3 && diffDays >= 0) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
        document.getElementById('wp-urgent-reason').value = '';
    }
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = { method, headers: {} };
    if (body) {
        if (body instanceof FormData) {
            options.body = body; 
        } else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    let data;
    try { data = await response.json(); } catch (e) { data = { error: 'ไม่สามารถอ่านข้อมูลจากเซิร์ฟเวอร์ได้' }; }
    if (!response.ok) throw new Error(data.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ API');
    return data;
}

async function loadWaterparkDashboard() {
    try {
        const data = await apiCall(`/api/waterpark/dashboard/${currentUser.username}`);
        
        WPState.tier = data.tier;
        WPState.maxFree = data.maxFree;
        WPState.freeRemaining = data.freeRemaining;
        WPState.relatives = data.relatives || [];
        WPState.regUnlocked = data.regUnlocked || false;
        WPState.allBookings = data.allBookings || [];

        setupUIByTier();
        
        document.getElementById('wp-free-remain').textContent = WPState.freeRemaining;
        document.getElementById('wp-free-total').textContent = `/ ${WPState.maxFree === 999999 ? '∞' : WPState.maxFree}`;
        
        renderLatestStatus(data.allBookings);
        renderHistory(data.allBookings);

    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function renderLatestStatus(bookings) {
    const container = document.getElementById('wp-latest-status-container');
    if (!container) return;

    const today = new Date();
    today.setHours(0,0,0,0);
    
    const activeBooking = bookings.find(b => {
        const vDate = new Date(b.visitDate);
        vDate.setHours(0,0,0,0);
        return (b.status === 'Pending_Head' || b.status === 'Pending_HR' || b.status === 'Approved') && vDate >= today;
    });

    if (!activeBooking) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    const d = new Date(activeBooking.visitDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    
    let statusHtml = '';
    if (activeBooking.status === 'Pending_Head') statusHtml = '<span class="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-yellow-100 text-yellow-800 border border-yellow-200 shadow-sm">รอหัวหน้าแผนก</span>';
    else if (activeBooking.status === 'Pending_HR') statusHtml = '<span class="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-orange-100 text-orange-800 border border-orange-200 shadow-sm">รอ HR อนุมัติ</span>';
    else if (activeBooking.status === 'Approved') statusHtml = '<span class="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">อนุมัติแล้ว</span>';

    container.innerHTML = `
        <div class="bg-indigo-50 border border-indigo-200 p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden">
            <div class="absolute -right-4 -top-4 text-7xl opacity-[0.03]">🎟️</div>
            <p class="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><span class="animate-pulse w-2 h-2 bg-indigo-500 rounded-full inline-block"></span> สถานะคำขอล่าสุด</p>
            <div class="flex justify-between items-center relative z-10">
                <div>
                    <p class="text-sm font-bold text-slate-800">เข้าสวนน้ำวันที่: <span class="text-indigo-700">${d}</span></p>
                    <p class="text-[10px] text-slate-500 mt-1">ผู้ติดตาม: <span class="font-bold text-slate-700">${activeBooking.guests.length}</span> คน | รหัส: ${activeBooking.bookingId}</p>
                </div>
                <div>${statusHtml}</div>
            </div>
        </div>
    `;
    container.classList.remove('hidden');
}

function setupUIByTier() {
    const tierDisplay = document.getElementById('wp-tier-display');
    const note = document.getElementById('wp-quota-note');
    
    const btnDiscount = document.getElementById('wp-btn-add-guest-discount');
    const btnFree = document.getElementById('wp-btn-add-guest');
    const toggleBtnText = document.getElementById('wp-toggle-freeform-text');

    if (WPState.tier === 'Tier1_Staff') {
        tierDisplay.textContent = 'Staff / Sup (ฟรี 4)';
        note.textContent = WPState.regUnlocked ? 'ระบบเปิดให้แก้ไขญาติได้ กรุณาเพิ่มรายชื่อที่แผงด้านล่างก่อนจอง (สูงสุด 8 คน)' : 'หากต้องการเพิ่มบุคคลภายนอก สามารถเพิ่มได้ที่ฟอร์มด้านขวา (ลด 50%)';
        
        if (WPState.regUnlocked) {
            document.getElementById('wp-relative-panel')?.classList.remove('hidden');
        } else {
            document.getElementById('wp-relative-panel')?.classList.add('hidden');
        }
        
        document.getElementById('wp-guest-dropdown-section')?.classList.remove('hidden'); 
        
        if (toggleBtnText) toggleBtnText.innerHTML = 'เพิ่มบุคคลภายนอก <span class="text-amber-600">(ลด 50%)</span>';
        document.getElementById('wp-freeform-label').innerHTML = 'บุคคลภายนอก (ส่วนลด 50%) ไม่จำกัดจำนวน ไม่หักโควต้าฟรี';
        
        const box = document.getElementById('wp-freeform-box');
        if(box) box.className = 'p-4 bg-amber-50 border border-amber-200 rounded-xl shadow-sm relative';
        
        if(btnFree) {
            btnFree.className = 'w-full bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 font-bold py-2.5 px-4 rounded-lg shadow-sm transition-all text-xs flex justify-center items-center gap-1';
            btnFree.dataset.forceDiscount = 'true';
        }
        const textLabel = document.getElementById('wp-btn-add-guest-text');
        if(textLabel) textLabel.textContent = 'เพิ่ม (ส่วนลด 50%)';
        
        if(btnDiscount) btnDiscount.classList.add('hidden'); 
        renderRelativesList();
    } 
    else {
        if (WPState.tier === 'Tier2_Manager') {
            tierDisplay.textContent = 'Asst / Manager (ฟรี 5)';
            note.textContent = 'สามารถพิมพ์ชื่อเพื่อใช้โควต้าฟรี หรือกดปุ่มลด 50% หากไม่ต้องการหักโควต้า';
            if(btnDiscount) { btnDiscount.classList.remove('hidden'); btnDiscount.classList.add('flex'); }
        } else if (WPState.tier === 'Tier3_Director') {
            tierDisplay.textContent = 'Director (ฟรีไม่จำกัด)';
            note.textContent = 'สิทธิ์จองฟรีไม่จำกัดจำนวน';
            document.getElementById('wp-free-remain').textContent = '∞';
            document.getElementById('wp-free-total').textContent = '';
            if(btnDiscount) btnDiscount.classList.add('hidden'); 
        }
        
        document.getElementById('wp-guest-dropdown-section')?.classList.add('hidden');
        
        if (toggleBtnText) toggleBtnText.textContent = 'เพิ่มรายชื่อผู้ติดตาม';
        document.getElementById('wp-freeform-label').textContent = 'กรอกข้อมูลผู้ติดตาม';
        
        const box = document.getElementById('wp-freeform-box');
        if(box) box.className = 'p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-sm relative';
        
        if(btnFree) {
            btnFree.className = 'w-full bg-cyan-600 border border-cyan-600 text-white hover:bg-cyan-700 font-bold py-2.5 px-4 rounded-lg shadow-sm transition-all text-xs flex justify-center items-center gap-1';
            btnFree.dataset.forceDiscount = 'false'; 
        }
        const textLabel = document.getElementById('wp-btn-add-guest-text');
        if(textLabel) textLabel.textContent = 'เพิ่ม (ใช้โควต้าฟรี)';
    }

    document.getElementById('wp-guest-freeform-section')?.classList.add('hidden');
    document.getElementById('wp-toggle-freeform-container')?.classList.remove('hidden');
}

function renderRelativesList() {
    const leftList = document.getElementById('wp-relatives-list');
    const countLabel = document.getElementById('wp-rel-count');
    const form = document.getElementById('wp-add-rel-form');
    const lockedMsg = document.getElementById('wp-locked-msg');

    if (leftList) {
        leftList.innerHTML = '';
        if(countLabel) countLabel.textContent = `${WPState.relatives.length}/8`;

        if (WPState.relatives.length >= 8) {
            if(form) form.classList.add('hidden');
            if(lockedMsg) lockedMsg.classList.remove('hidden');
        } else {
            if(form) form.classList.remove('hidden');
            if(lockedMsg) lockedMsg.classList.add('hidden');
        }

        if (WPState.relatives.length === 0) {
            leftList.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">ยังไม่ได้ลงทะเบียนญาติ</p>';
        } else {
            WPState.relatives.forEach(rel => {
                leftList.innerHTML += `
                    <div class="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg shadow-sm mb-2 last:mb-0">
                        <div class="flex items-center gap-3">
                            <img src="${getImageUrl(rel.idCardImageUrl)}" class="w-10 h-6 object-cover rounded bg-slate-100 border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity" onclick="openImageModal(this.src)" title="คลิกเพื่อขยายรูป">
                            <p class="text-[11px] font-bold text-slate-700">${rel.fullName}</p>
                        </div>
                        <button type="button" class="del-rel-btn text-rose-500 hover:text-rose-700 p-1.5 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors" data-id="${rel._id}" title="ลบรายชื่อ">
                            <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                `;
            });
        }
    }

    const dropdownSection = document.getElementById('wp-guest-dropdown-section');
    if (!dropdownSection) return;

    let html = `<label class="block text-[10px] font-bold text-slate-500 mb-1.5">เลือกจากรายชื่อที่ลงทะเบียนไว้ <span class="text-emerald-600">(ใช้โควต้าฟรี)</span></label>`;

    if (WPState.relatives.length === 0) {
        html += `<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center"><p class="text-xs text-slate-400 font-medium">ยังไม่มีรายชื่อญาติในระบบ (กรุณาติดต่อ HR)</p></div>`;
    } else {
        html += `<div class="space-y-2 max-h-48 overflow-y-auto pr-1">`;
        
        WPState.relatives.forEach(rel => {
            const inCart = WPState.cart.find(c => c.fullName === rel.fullName);
            html += `
                <div class="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                    <div class="flex items-center gap-3">
                        <img src="${getImageUrl(rel.idCardImageUrl)}" class="w-10 h-6 object-cover rounded bg-slate-100 border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity" onclick="openImageModal(this.src)" title="คลิกเพื่อขยายรูป">
                        <p class="text-xs font-bold text-slate-700">${rel.fullName}</p>
                    </div>
                    <div class="flex items-center gap-1.5">
                        ${!inCart ? `
                        <button type="button" class="add-rel-cart-btn text-white bg-cyan-500 hover:bg-cyan-600 p-1.5 rounded-lg shadow-sm transition-colors" data-id="${rel._id}" title="เพิ่มเข้าตะกร้า">
                            <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"></path></svg>
                        </button>
                        ` : `<span class="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">เพิ่มแล้ว</span>`}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    
    html += `<p class="text-[9px] text-slate-400 mt-2">* หากโควต้าฟรีเดือนนี้หมด ระบบจะปัดเป็นส่วนลด 50% ให้โดยอัตโนมัติ</p>`;
    dropdownSection.innerHTML = html;
}

function renderCart() {
    const list = document.getElementById('wp-cart-list');
    const countSpan = document.getElementById('wp-cart-count');
    if (countSpan) countSpan.textContent = WPState.cart.length;
    if (!list) return;
    
    list.innerHTML = '';

    let currentFreeUsedInCart = 0; 

    if (WPState.cart.length === 0) {
        list.innerHTML = '<p class="text-center text-xs text-slate-400 py-3">ยังไม่ได้เพิ่มผู้ติดตาม</p>';
    } else {
        let freeSpotsLeftDisplay = WPState.freeRemaining;
        
        WPState.cart.forEach((guest, index) => {
            let badge = '';
            if (guest.forceDiscount) {
                badge = '<span class="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 shadow-sm whitespace-nowrap">ลด 50%</span>';
            } else {
                if (WPState.tier === 'Tier3_Director') {
                    badge = '<span class="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 shadow-sm whitespace-nowrap">เข้าฟรี</span>';
                } else if (freeSpotsLeftDisplay > 0) {
                    badge = '<span class="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 shadow-sm whitespace-nowrap">ฟรี (โควต้า)</span>';
                    freeSpotsLeftDisplay--;
                    currentFreeUsedInCart++; 
                } else {
                    badge = '<span class="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 shadow-sm whitespace-nowrap">ลด 50% (เกินโควต้า)</span>';
                }
            }

            list.innerHTML += `
                <div class="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <div class="flex items-center gap-2.5 w-full pr-2 overflow-hidden">
                        <img src="${getImageUrl(guest.idCardImageUrl)}" class="w-8 h-5 object-cover rounded border border-slate-200 shrink-0 cursor-pointer hover:opacity-80 transition-opacity" onclick="openImageModal(this.src)" title="คลิกดูรูป">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between w-full min-w-0 gap-1 sm:gap-2">
                            <div>
                                <p class="text-[11px] font-bold text-slate-800 truncate leading-tight">${guest.fullName}</p>
                                ${guest.idCardNumber ? `<p class="text-[9px] font-mono text-slate-400 leading-none mt-0.5">${guest.idCardNumber}</p>` : ''}
                            </div>
                            ${badge}
                        </div>
                    </div>
                    <button type="button" class="del-cart-btn shrink-0 text-slate-400 hover:text-rose-500 transition-colors p-1 bg-slate-50 hover:bg-rose-50 rounded" data-index="${index}">
                        <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            `;
        });
    }

    const remainEl = document.getElementById('wp-free-remain');
    if (remainEl) {
        if (WPState.tier === 'Tier3_Director') {
            remainEl.textContent = '∞';
        } else {
            const actualRemain = Math.max(0, WPState.freeRemaining - currentFreeUsedInCart);
            remainEl.textContent = actualRemain;
        }
    }

    if (WPState.tier === 'Tier1_Staff') renderRelativesList(); 
}

function renderHistory(bookings) {
    const list = document.getElementById('wp-history-list-modal');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (bookings.length === 0) {
        list.innerHTML = '<div class="text-center p-6 bg-slate-50 rounded-xl border border-slate-200"><p class="text-slate-500 text-sm font-medium">ยังไม่มีประวัติการจอง</p></div>';
        return;
    }

    bookings.forEach(b => {
        const d = new Date(b.visitDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        
        let statusHtml = '';
        let cancelBtnHtml = '';
        let editBtnHtml = ''; 
        let urgentBadge = b.isUrgent ? `<span class="px-2 py-0.5 text-[9px] font-bold rounded-lg bg-red-100 text-red-700 border border-red-200 shadow-sm animate-pulse ml-1">🚨 จองด่วน</span>` : '';
        
        const isCancelable = (b.status === 'Pending_Head' || b.status === 'Pending_HR' || b.status === 'Returned');

        if (b.status === 'Pending_Head') statusHtml = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-yellow-100 text-yellow-800 border border-yellow-200 shadow-sm">รอหัวหน้าอนุมัติ</span>';
        else if (b.status === 'Pending_HR') statusHtml = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-orange-100 text-orange-800 border border-orange-200 shadow-sm">รอ HR อนุมัติ</span>';
        else if (b.status === 'Approved') statusHtml = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">อนุมัติเรียบร้อย</span>';
        else if (b.status === 'Rejected') statusHtml = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-rose-100 text-rose-800 border border-rose-200">ไม่อนุมัติ</span>`;
        else if (b.status === 'Cancelled') statusHtml = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-slate-100 text-slate-500 border border-slate-200">ยกเลิกรายการแล้ว</span>`;
        else if (b.status === 'Returned') statusHtml = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">ส่งกลับให้แก้ไข</span>`; 
        
        if (isCancelable) {
            cancelBtnHtml = `<button class="cancel-wp-btn text-rose-500 hover:text-rose-700 underline font-bold text-[10px] mt-1 text-right block w-full" data-id="${b._id}">[ ยกเลิกคำขอ ]</button>`;
        }
        
        if (b.status === 'Returned') {
            editBtnHtml = `<button class="edit-wp-btn text-indigo-600 hover:text-indigo-800 underline font-bold text-[11px] mt-1 text-right block w-full bg-indigo-50 py-1 rounded" data-id="${b._id}">[ คลิกเพื่อแก้ไขคำขอใหม่ ]</button>`;
        }

        let guestsHtml = b.guests.map(g => {
            const bClass = g.ticketType === 'FREE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';
            const bText = g.ticketType === 'FREE' ? 'ฟรี' : '50%';
            return `<div class="flex justify-between items-center text-xs py-1.5 border-b border-slate-100 last:border-0">
                        <span class="text-slate-600 font-medium truncate pr-2 flex items-center gap-2">
                            <img src="${getImageUrl(g.idCardImageUrl)}" class="w-8 h-5 object-cover rounded border border-slate-200 shrink-0 cursor-pointer hover:opacity-80 transition-opacity" onclick="openImageModal(this.src)" title="คลิกเพื่อขยายรูป">
                            ${g.fullName}
                        </span>
                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${bClass} shrink-0">${bText}</span>
                    </div>`;
        }).join('');

        if (b.guests.length === 0) guestsHtml = '<p class="text-[11px] text-slate-400 italic">ไม่มีผู้ติดตาม</p>';

        list.innerHTML += `
            <div class="border border-slate-200 rounded-2xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow ${b.status === 'Cancelled' ? 'opacity-60 grayscale-[50%]' : ''}">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">วันที่เข้าใช้บริการ</span>
                        <p class="font-bold text-slate-800 text-sm mt-0.5">${d} ${urgentBadge}</p>
                    </div>
                    <div class="text-right">
                        ${statusHtml}
                        ${editBtnHtml}
                        ${cancelBtnHtml}
                    </div>
                </div>
                ${b.isUrgent && b.urgentReason ? `<div class="mt-2 bg-red-50 border border-red-200 p-2.5 rounded-lg mb-3"><p class="text-[10px] font-bold text-red-800 flex items-center gap-1">🚨 เหตุผลจองด่วน:</p><p class="text-xs text-red-700 mt-1">${b.urgentReason}</p></div>` : ''}
                ${(b.status === 'Rejected' || b.status === 'Returned') && b.rejectReason ? `<p class="text-[10px] ${b.status === 'Returned' ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-rose-600 bg-rose-50 border-rose-100'} font-bold mb-3 p-2 rounded-lg border">${b.rejectReason}</p>` : ''}
                <div class="flex gap-2 mb-3 mt-3">
                    <span class="text-[9px] bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-bold border border-blue-100">พนักงานเข้า: ${b.isEmployeeEntering ? 'ใช่' : 'ไม่'}</span>
                    <span class="text-[9px] bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-bold border border-slate-200">ผู้ติดตาม: ${b.guests.length}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    ${guestsHtml}
                </div>
            </div>
        `;
    });
}

window.openWpHistoryModal = function() {
    const m = document.getElementById('wp-history-modal');
    const c = document.getElementById('wp-history-modal-container');
    if(!m) return;
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.remove('opacity-0'); c.classList.remove('scale-95'); }, 10);
}
window.closeWpHistoryModal = function() {
    const m = document.getElementById('wp-history-modal');
    const c = document.getElementById('wp-history-modal-container');
    if(!m) return;
    m.classList.add('opacity-0'); c.classList.add('scale-95');
    setTimeout(() => { m.classList.add('hidden'); }, 300);
}

function setupEventListeners() {
    
    const toggleFreeformBtn = document.getElementById('wp-toggle-freeform-btn');
    const closeFreeformBtn = document.getElementById('wp-close-freeform-btn');
    const freeformSection = document.getElementById('wp-guest-freeform-section');
    const toggleContainer = document.getElementById('wp-toggle-freeform-container');

    toggleFreeformBtn?.addEventListener('click', () => {
        freeformSection.classList.remove('hidden');
        toggleContainer.classList.add('hidden');
    });

    closeFreeformBtn?.addEventListener('click', () => {
        freeformSection.classList.add('hidden');
        toggleContainer.classList.remove('hidden');
    });

    document.getElementById('wp-add-rel-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('wp-btn-add-rel');
        if (btn.disabled || btn.dataset.isProcessing === 'true') return;
        
        const nameInput = document.getElementById('wp-rel-name').value.trim();
        const idCardNoInput = document.getElementById('wp-rel-idcard-no').value.trim();
        const idCardExpInput = document.getElementById('wp-rel-idcard-expiry').value;
        const fileInput = document.getElementById('wp-rel-idcard').files[0];
        
        if (!nameInput || !idCardNoInput || !idCardExpInput || !fileInput) return showNotification('กรุณากรอกข้อมูลและแนบรูปบัตรให้ครบถ้วน', 'error');
        if (idCardNoInput.length !== 13) return showNotification('เลขบัตรประชาชนต้องมี 13 หลัก', 'error');
        
        if (fileInput.size > 2 * 1024 * 1024) {
            return showNotification('ขนาดไฟล์รูปภาพต้องไม่เกิน 2 MB', 'error');
        }
        
        btn.dataset.isProcessing = 'true';
        showLoadingButton(btn, true);

        try {
            const formData = new FormData(); formData.append('image', fileInput);
            const uploadRes = await apiCall('/api/upload', 'POST', formData);
            
            await apiCall('/api/waterpark/relatives', 'POST', {
                username: currentUser.username, fullName: nameInput, idCardNumber: idCardNoInput, idCardExpiry: idCardExpInput, idCardImageUrl: uploadRes.imageUrl
            });
            showNotification('เพิ่มรายชื่อญาติสำเร็จ');
            document.getElementById('wp-add-rel-form').reset();
            loadWaterparkDashboard(); 
        } catch(err) { showNotification(err.message, 'error'); } 
        finally { showLoadingButton(btn, false, 'บันทึกรายชื่อ'); btn.dataset.isProcessing = 'false'; }
    });

    document.addEventListener('click', async (e) => {
        if (e.target.matches('.add-rel-cart-btn') || e.target.closest('.add-rel-cart-btn')) {
            const btn = e.target.closest('.add-rel-cart-btn');
            const relId = btn.dataset.id;
            const relData = WPState.relatives.find(r => r._id === relId);
            if (relData) {
                if (WPState.cart.find(c => c.fullName === relData.fullName)) return showNotification('เพิ่มรายชื่อนี้ไปแล้ว', 'error');
                WPState.cart.push({ fullName: relData.fullName, idCardNumber: relData.idCardNumber, idCardExpiry: relData.idCardExpiry, idCardImageUrl: relData.idCardImageUrl, forceDiscount: false });
                renderCart();
            }
        }
        else if (e.target.matches('.del-rel-btn') || e.target.closest('.del-rel-btn')) {
            const btn = e.target.closest('.del-rel-btn');
            if(confirm('ยืนยันการลบรายชื่อญาตินี้?')) {
                try {
                    await apiCall(`/api/waterpark/relatives/${btn.dataset.id}`, 'DELETE');
                    loadWaterparkDashboard();
                } catch(err) { showNotification(err.message, 'error'); }
            }
        }
        else if (e.target.matches('.del-cart-btn') || e.target.closest('.del-cart-btn')) {
            const btn = e.target.closest('.del-cart-btn');
            WPState.cart.splice(btn.dataset.index, 1);
            renderCart();
        }
        else if (e.target.matches('.cancel-wp-btn')) {
            const id = e.target.dataset.id;
            if(confirm('คุณแน่ใจหรือไม่ที่จะ "ยกเลิกคำขอ" จองสวนน้ำรายการนี้?')) {
                try {
                    await apiCall(`/api/waterpark/cancel/${id}`, 'PUT');
                    showNotification('ยกเลิกคำขอสำเร็จ', 'success');
                    loadWaterparkDashboard();
                } catch(err) { showNotification(err.message, 'error'); }
            }
        }
        else if (e.target.matches('.edit-wp-btn') || e.target.closest('.edit-wp-btn')) {
            const btn = e.target.closest('.edit-wp-btn') || e.target;
            const id = btn.dataset.id;
            const booking = WPState.allBookings.find(b => b._id === id);
            
            if(booking) {
                WPState.editingBookingId = id; 
                document.getElementById('wp-visit-date').value = booking.visitDate.split('T')[0];
                document.getElementById('wp-emp-enter').checked = booking.isEmployeeEntering;
                
                checkUrgentDate(); // 💡 โหลดฟอร์มตรวจความด่วนให้ด้วย
                if (booking.isUrgent && booking.urgentReason) {
                    document.getElementById('wp-urgent-reason').value = booking.urgentReason;
                }

                WPState.cart = booking.guests.map(g => ({
                    fullName: g.fullName,
                    idCardNumber: g.idCardNumber,
                    idCardExpiry: g.idCardExpiry,
                    idCardImageUrl: g.idCardImageUrl,
                    forceDiscount: g.ticketType === '50_DISCOUNT' 
                }));
                
                renderCart();
                closeWpHistoryModal();
                window.scrollTo({ top: 0, behavior: 'smooth' }); 
                
                const submitBtn = document.getElementById('wp-btn-submit');
                submitBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> บันทึกการแก้ไขคำขอ';
                submitBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700', 'shadow-cyan-200');
                submitBtn.classList.add('bg-amber-500', 'hover:bg-amber-600', 'shadow-amber-200');
                
                showNotification('ดึงข้อมูลคำขอมาที่ฟอร์มแล้ว กรุณาแก้ไขและกดยืนยันใหม่', 'success');
            }
        }
    });

    async function handleAddFreeformGuest(isDiscount) {
        const btnId = isDiscount ? 'wp-btn-add-guest-discount' : 'wp-btn-add-guest';
        const btn = document.getElementById(btnId);
        if (!btn || btn.dataset.isProcessing === 'true') return;
        
        const nameInput = document.getElementById('wp-guest-name').value.trim();
        const idCardNoInput = document.getElementById('wp-guest-idcard-no').value.trim();
        const idCardExpInput = document.getElementById('wp-guest-idcard-expiry').value;
        const fileInput = document.getElementById('wp-guest-idcard').files[0];
        
        if (!nameInput || !idCardNoInput || !idCardExpInput || !fileInput) return showNotification('กรุณากรอกชื่อ, เลขบัตร, วันหมดอายุ และแนบรูปให้ครบถ้วน', 'error');
        if (idCardNoInput.length !== 13) return showNotification('เลขบัตรต้องมี 13 หลัก', 'error');
        if (WPState.cart.find(c => c.fullName === nameInput)) return showNotification('เพิ่มรายชื่อนี้ไปแล้ว', 'error');

        if (fileInput.size > 2 * 1024 * 1024) {
            return showNotification('ขนาดไฟล์รูปภาพต้องไม่เกิน 2 MB', 'error');
        }

        btn.dataset.isProcessing = 'true';
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<div class="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>';

        try {
            const formData = new FormData(); formData.append('image', fileInput);
            const uploadRes = await apiCall('/api/upload', 'POST', formData);
            let forceDisc = isDiscount;
            if (btnId === 'wp-btn-add-guest' && btn.dataset.forceDiscount === 'true') forceDisc = true;

            WPState.cart.push({ fullName: nameInput, idCardNumber: idCardNoInput, idCardExpiry: idCardExpInput, idCardImageUrl: uploadRes.imageUrl, forceDiscount: forceDisc });
            
            document.getElementById('wp-guest-name').value = '';
            document.getElementById('wp-guest-idcard-no').value = '';
            document.getElementById('wp-guest-idcard-expiry').value = '';
            document.getElementById('wp-guest-idcard').value = '';
            
            freeformSection.classList.add('hidden');
            toggleContainer.classList.remove('hidden');

            renderCart();
        } catch(err) { showNotification(err.message, 'error'); } 
        finally { btn.innerHTML = originalHtml; btn.dataset.isProcessing = 'false'; }
    }

    document.getElementById('wp-btn-add-guest')?.addEventListener('click', () => handleAddFreeformGuest(false));
    document.getElementById('wp-btn-add-guest-discount')?.addEventListener('click', () => handleAddFreeformGuest(true));

    document.getElementById('wp-btn-submit')?.addEventListener('click', async (e) => {
        const btn = e.target;
        if (btn.disabled || btn.dataset.isProcessing === 'true') return;
        
        const visitDate = document.getElementById('wp-visit-date').value;
        const isEmployeeEntering = document.getElementById('wp-emp-enter').checked;
        const urgentReason = document.getElementById('wp-urgent-reason')?.value || ''; // 💡 ดึงเหตุผลจองด่วน

        if (!visitDate) return showNotification('กรุณาเลือกวันที่เข้าใช้บริการ', 'error');
        if (!isEmployeeEntering && WPState.cart.length === 0) return showNotification('กรุณาเพิ่มพนักงาน หรือ ผู้ติดตาม อย่างน้อย 1 คน', 'error');

        // 💡 เช็คก่อนส่งว่าถ้าด่วนแล้วกรอกเหตุผลหรือยัง
        const vDate = new Date(visitDate); vDate.setHours(0,0,0,0);
        const tDate = new Date(); tDate.setHours(0,0,0,0);
        if (vDate < tDate) return showNotification('ไม่สามารถทำรายการจองย้อนหลังได้', 'error');
        const diffDays = Math.floor((vDate - tDate) / (1000 * 60 * 60 * 24));
        if (diffDays < 3 && urgentReason.trim() === '') {
            return showNotification('กรุณาระบุเหตุผลการจองด่วน (กล่องสีแดงด้านบน) ก่อนยืนยัน', 'error');
        }

        btn.dataset.isProcessing = 'true';
        showLoadingButton(btn, true);

        try {
            if (WPState.editingBookingId) {
                await apiCall(`/api/waterpark/book/${WPState.editingBookingId}`, 'PUT', { username: currentUser.username, visitDate, isEmployeeEntering, guests: WPState.cart, urgentReason });
                showNotification('แก้ไขคำขอเข้าสวนน้ำสำเร็จ รอการอนุมัติ');
                WPState.editingBookingId = null;
                
                const submitBtn = document.getElementById('wp-btn-submit');
                submitBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ยืนยันการจองสิทธิ์';
                submitBtn.classList.add('bg-cyan-600', 'hover:bg-cyan-700', 'shadow-cyan-200');
                submitBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600', 'shadow-amber-200');
                
                document.getElementById('urgent-reason-container').classList.add('hidden');
                document.getElementById('wp-urgent-reason').value = '';
            } else {
                await apiCall('/api/waterpark/book', 'POST', { username: currentUser.username, visitDate, isEmployeeEntering, guests: WPState.cart, urgentReason });
                showNotification('จองสิทธิ์เข้าสวนน้ำสำเร็จ รอการอนุมัติ');
                
                const d = new Date(); d.setDate(d.getDate() + 3);
                document.getElementById('wp-visit-date').value = d.toISOString().split('T')[0];
                document.getElementById('urgent-reason-container').classList.add('hidden');
                document.getElementById('wp-urgent-reason').value = '';
            }
            
            WPState.cart = [];
            renderCart();
            loadWaterparkDashboard();
        } catch(err) { showNotification(err.message, 'error'); } 
        finally {
            showLoadingButton(btn, false, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ยืนยันการจองสิทธิ์');
            btn.dataset.isProcessing = 'false';
        }
    });
}

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

function getImageUrl(url) { return url.startsWith('http') ? url : API_BASE_URL + '/' + url; }
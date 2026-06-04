const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = isLocalhost ? 'http://localhost:3000' : 'https://uniform-system-v2.onrender.com';

const AppState = {
    currentUser: null,
    masterStock: [],
    userApprovedItems: []
};

document.addEventListener('DOMContentLoaded', () => {
    const storedUser = sessionStorage.getItem('currentUser');
    if (!storedUser) {
        window.location.href = 'index.html';
        return;
    }
    AppState.currentUser = JSON.parse(storedUser);
    
    document.getElementById('user-name').textContent = AppState.currentUser.name;
    document.getElementById('user-department').textContent = AppState.currentUser.department || '-';

    setupEventListeners();
    loadInitialData();
});

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = { method, headers: {} };
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    let data;
    try { data = await response.json(); } catch (e) { data = { error: 'Server error' }; }
    if (!response.ok) throw new Error(data.error || 'API Error');
    return data;
}

async function loadInitialData() {
    try {
        const [stockData, requestsData, holdingsData] = await Promise.all([
            apiCall('/api/stock'), 
            apiCall(`/api/requests/me?username=${AppState.currentUser.username}`), 
            apiCall(`/api/requests/holdings?username=${AppState.currentUser.username}`)
        ]);

        AppState.masterStock = stockData;
        populateTypeDropdown();
        
        displayRequests(requestsData);
        displayCurrentUserHoldings(holdingsData);
        
        AppState.userApprovedItems = requestsData.filter(r => r.status === 'Approved' && r.quantity > 0);
        populateReturnableItemsDropdown();
    } catch (error) { showNotification(error.message, 'error'); }
}

function setupEventListeners() {
    document.getElementById('request-btn')?.addEventListener('click', handleSubmitRequest);
    document.getElementById('request-reason-type')?.addEventListener('change', toggleRequestForm);
    document.getElementById('request-type')?.addEventListener('change', populateSizeDropdown);
    document.getElementById('request-size')?.addEventListener('change', displaySelectedItemImage); 
    document.getElementById('return-item-select')?.addEventListener('change', handleReturnableItemSelection);
}

function populateTypeDropdown() {
    const typeSelect = document.getElementById('request-type');
    if(!typeSelect) return;
    
    let activeStocks = AppState.masterStock.filter(item => item.isActive !== false);
    
    const userDept = AppState.currentUser.department || '';
    const isLifeguardOrOps = (userDept === 'Lifeguard' || userDept === 'Operations');
    
    activeStocks = activeStocks.filter(item => {
        const cat = item.category || '';
        if (isLifeguardOrOps) return cat === 'ไลฟ์การ์ด' || cat === 'อื่นๆ';
        else return cat !== 'ไลฟ์การ์ด';
    });

    const uniqueTypes = [...new Set(activeStocks.map(item => item.itemType))];
    typeSelect.innerHTML = '<option value="">-- เลือกประเภท --</option>';
    uniqueTypes.forEach(type => { if(type) typeSelect.add(new Option(type, type)); });
}

function populateSizeDropdown() {
    const typeSelect = document.getElementById('request-type');
    const sizeSelect = document.getElementById('request-size');
    if (!typeSelect || !sizeSelect) return;
    
    let availableItems = AppState.masterStock.filter(item => item.itemType === typeSelect.value && item.isActive !== false);
    
    const userDept = AppState.currentUser.department || '';
    const isLifeguardOrOps = (userDept === 'Lifeguard' || userDept === 'Operations');
    
    availableItems = availableItems.filter(item => {
        const cat = item.category || '';
        if (isLifeguardOrOps) return cat === 'ไลฟ์การ์ด' || cat === 'อื่นๆ';
        else return cat !== 'ไลฟ์การ์ด';
    });
    
    sizeSelect.innerHTML = '<option value="">-- เลือกขนาด --</option>';
    availableItems.forEach(item => { if(item.size) sizeSelect.add(new Option(`${item.size} (คงเหลือ: ${item.newStock} ชิ้น)`, item.size)); });
    displaySelectedItemImage();
}

function displaySelectedItemImage() {
    const typeInput = document.getElementById('request-type');
    const sizeInput = document.getElementById('request-size');
    const stockItem = AppState.masterStock.find(item => item.itemType === typeInput.value && item.size === sizeInput.value);
    const previewContainer = document.getElementById('item-image-preview-container');
    if (stockItem && stockItem.imageUrl) {
        document.getElementById('item-image-preview').src = getImageUrl(stockItem.imageUrl); 
        previewContainer.classList.remove('hidden');
    } else { 
        previewContainer.classList.add('hidden'); 
    }
}

function populateReturnableItemsDropdown() {
    const select = document.getElementById('return-item-select');
    select.innerHTML = ''; 
    document.getElementById('return-quantity-wrapper')?.classList.add('hidden');
    if (AppState.userApprovedItems.length > 0) {
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
    if (requestBtn.dataset.isProcessing === 'true') return;
    requestBtn.dataset.isProcessing = 'true';
    requestBtn.innerHTML = 'กำลังโหลด...';

    const reasonType = document.getElementById('request-reason-type').value;

    try {
        if (reasonType === 'Damaged/Lost') {
            const originalRequestId = document.getElementById('return-item-select').value;
            const quantityToReturn = parseInt(document.getElementById('return-quantity').value);
            const reasonDetails = document.getElementById('return-details').value.trim();
            if (!originalRequestId || !reasonDetails) throw new Error('กรุณาเลือกรายการและระบุเหตุผล');
            
            await apiCall('/api/requests/return', 'POST', { originalRequestId, quantityToReturn, reasonDetails, requesterName: AppState.currentUser.name });
            showNotification('ส่งคำขอคืนสำเร็จ');
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
            showNotification('ส่งคำขอเบิกสำเร็จ กำลังรอการอนุมัติ');
        }
        document.getElementById('new-request-form').reset();
        document.getElementById('return-request-form').reset();
        loadInitialData();
    } catch (error) { 
        showNotification(error.message, 'error'); 
    } finally {
        requestBtn.dataset.isProcessing = 'false';
        requestBtn.innerHTML = reasonType === 'Damaged/Lost' ? 'ส่งคำขอคืน' : 'ส่งคำขอเบิก';
    }
}

function displayRequests(requests) {
    const tableBody = document.getElementById('my-requests-table');
    tableBody.innerHTML = '';
    if (!requests || requests.length === 0) return tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-slate-500">ไม่พบข้อมูล</td></tr>`;

    requests.forEach(req => {
        let actionButton = (req.status === 'Approved' && req.quantity > 0) ? `<span class="text-xs text-indigo-500">คืนได้ในฟอร์มซ้ายมือ</span>` : '-';
        const safeStatus = (req.status || 'unknown').replace(' ', '-').toLowerCase();
        const statusMap = {'pending':'bg-yellow-100 text-yellow-800','approved':'bg-emerald-100 text-emerald-800','rejected':'bg-red-100 text-red-800','returned':'bg-indigo-100 text-indigo-800','pending-return':'bg-orange-100 text-orange-800'};
        const statusClass = statusMap[safeStatus] || 'bg-slate-100 text-slate-800';

        tableBody.innerHTML += `<tr class="hover:bg-slate-50 transition-colors">
            <td class="p-4 text-[10px] text-slate-500 whitespace-nowrap">${new Date(req.createdAt).toLocaleString()}</td>
            <td class="p-4 text-xs font-medium text-slate-800">${req.itemType} <span class="text-slate-500">(ไซส์ ${req.size}) x <span class="font-bold text-indigo-600">${req.quantity}</span></span></td>
            <td class="p-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${statusClass}">${req.status}</span></td>
            <td class="p-4 text-[11px] text-slate-600 truncate max-w-[150px]" title="${req.notes || '-'}">${req.notes || '-'}</td>
            <td class="p-4 text-sm">${actionButton}</td>
        </tr>`;
    });
}

function displayCurrentUserHoldings(holdings) {
    const listDiv = document.getElementById('my-holdings-list');
    listDiv.innerHTML = '';
    if (!holdings || Object.keys(holdings).length === 0 || holdings.error) return listDiv.innerHTML = `<p class="text-center text-slate-400 text-sm mt-4">คุณไม่มีพัสดุที่ถือครองอยู่</p>`;
    
    for (const item in holdings) {
        listDiv.innerHTML += `<div class="flex justify-between items-center text-sm bg-white/5 p-3 rounded-xl border border-white/10 mb-2">
            <span class="font-medium text-slate-200">${item}</span>
            <span class="font-bold text-white bg-white/20 px-3 py-1 rounded-lg">${holdings[item]} ชิ้น</span>
        </div>`;
    }
}

function toggleRequestForm() {
    if (document.getElementById('request-reason-type').value === 'Damaged/Lost') {
        document.getElementById('new-request-form').classList.add('hidden'); 
        document.getElementById('return-request-form').classList.remove('hidden');
        const btn = document.getElementById('request-btn'); btn.textContent = 'ส่งคำขอคืน'; 
        btn.className = "w-full mt-8 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all flex justify-center";
        populateReturnableItemsDropdown();
    } else {
        document.getElementById('new-request-form').classList.remove('hidden'); 
        document.getElementById('return-request-form').classList.add('hidden');
        const btn = document.getElementById('request-btn'); btn.textContent = 'ส่งคำขอเบิก'; 
        btn.className = "w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all flex justify-center";
    }
}

function getImageUrl(url) {
    if (!url) return 'https://placehold.co/128x128/e2e8f0/64748b?text=No+Image';
    return url.startsWith('http') ? url : API_BASE_URL + '/' + url;
}

function showNotification(message, type = 'success') {
    const el = document.getElementById('notification');
    if(!el) return;
    document.getElementById('notification-message').innerHTML = message.replace(/\n/g, '<br>');
    el.classList.remove('bg-red-500', 'bg-emerald-500', 'hidden'); 
    el.classList.add(type === 'error' ? 'bg-red-500' : 'bg-emerald-500');
    setTimeout(() => el.classList.add('hidden'), type === 'error' ? 8000 : 4000);
}
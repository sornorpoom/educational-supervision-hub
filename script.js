/**
 * my-supervisor-hub client logic
 * Dual-Mode Data Fetching (Backend with direct client-side Google Sheet fallback)
 */

// Configuration
const BACKEND_API = '/api/documents';
const GOOGLE_SHEET_JSON_URL = 'https://docs.google.com/spreadsheets/d/1hPLCd4ZPG1BrSELile63Mb2ftaJl9Ts2TCH5QvxrFgY/gviz/tq?tqx=out:json';
// Google Sheets Registration Web App API URL
const REGISTRATION_API_URL = 'https://script.google.com/macros/s/AKfycbxEDQ-TYGxgyp9qEP2GZEBQm6vSdzMiguVF9SLUOyxguv4n6znCH2ccXKddnCfqj3wTVg/exec';

// Application State
let allDocuments = [];
let filteredDocuments = [];
let uniqueSubMissions = new Set();
let fileLinksMap = window.fileLinksMap || {};

let state = {
  searchQuery: '',
  activeMissionGroup: 'all', // 'all', '1', '2', '3', '4'
  selectedSubMission: 'all',
  sortBy: 'name-asc' // 'name-asc', 'name-desc', 'mission-asc'
};

// UI Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const syncBtn = document.getElementById('syncBtn');
const cardsContainer = document.getElementById('cardsContainer');
const missionTabs = document.getElementById('missionTabs');
const subMissionFilter = document.getElementById('subMissionFilter');
const sortOrder = document.getElementById('sortOrder');
const resultsCount = document.getElementById('resultsCount');
const syncTime = document.getElementById('syncTime');

// Stats Counters
const statTotal = document.getElementById('statTotal');
const statM1 = document.getElementById('statM1');
const statM2 = document.getElementById('statM2');
const statM3 = document.getElementById('statM3');
const statM4 = document.getElementById('statM4');

// Modal Elements
const detailModal = document.getElementById('detailModal');
const modalFileName = document.getElementById('modalFileName');
const modalMainMission = document.getElementById('modalMainMission');
const modalSubMission = document.getElementById('modalSubMission');
const modalSummary = document.getElementById('modalSummary');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalCloseFooterBtn = document.getElementById('modalCloseFooterBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const modalPreviewContainer = document.getElementById('modalPreviewContainer');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initTheme();
  loadData();
});

// Setup DOM Event Listeners
function setupEventListeners() {
  // Sync button click
  syncBtn.addEventListener('click', () => {
    loadData(true);
  });


  // Main mission tabs selection
  missionTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab-btn');
    if (!tab) return;

    // Toggle active classes
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    tab.classList.add('active');

    state.activeMissionGroup = tab.dataset.mission;
    
    // Reset sub-mission filter to 'all' when switching tabs
    state.selectedSubMission = 'all';
    subMissionFilter.value = 'all';
    
    // Highlight active legend description in the overview panel
    const legends = document.querySelectorAll('.legend-item');
    legends.forEach(item => {
      if (state.activeMissionGroup === 'all' || item.classList.contains(`m${state.activeMissionGroup}`)) {
        item.style.opacity = '1';
        item.style.filter = 'none';
      } else {
        item.style.opacity = '0.35';
        item.style.filter = 'grayscale(30%) blur(0.2px)';
      }
    });
    
    buildSubMissionDropdown(); // Rebuild sub-missions dropdown based on active tab selection
    applyFilters();
  });

  // Sub-mission select filter
  subMissionFilter.addEventListener('change', (e) => {
    state.selectedSubMission = e.target.value;
    applyFilters();
  });

  // Sort dropdown
  if (sortOrder) {
    sortOrder.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      applyFilters();
    });
  }

  // Modal close handlers
  modalCloseBtn.addEventListener('click', closeModal);
  modalCloseFooterBtn.addEventListener('click', closeModal);
  
  // Close modal when clicking on dark backdrop
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) {
      closeModal();
    }
  });

  // Close modal on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailModal.classList.contains('active')) {
      closeModal();
    }
  });

  // Theme Toggle click listener
  themeToggleBtn.addEventListener('click', toggleTheme);

  // Registration Modal Event Listeners
  const regModalCloseBtn = document.getElementById('regModalCloseBtn');
  const regModalCancelBtn = document.getElementById('regModalCancelBtn');
  const registrationForm = document.getElementById('registrationForm');
  const registrationModal = document.getElementById('registrationModal');

  if (regModalCloseBtn) regModalCloseBtn.addEventListener('click', closeRegistrationModal);
  if (regModalCancelBtn) regModalCancelBtn.addEventListener('click', closeRegistrationModal);
  if (registrationForm) registrationForm.addEventListener('submit', handleRegistrationSubmit);
  
  // Close registration modal when clicking backdrop
  if (registrationModal) {
    registrationModal.addEventListener('click', (e) => {
      if (e.target === registrationModal) {
        closeRegistrationModal();
      }
    });
  }
}

// Initialize theme from local storage
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i> <span>โหมดสว่าง</span>';
  } else {
    document.body.classList.remove('dark-theme');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i> <span>โหมดมืด</span>';
  }
}

// Toggle light/dark themes
function toggleTheme() {
  if (document.body.classList.contains('dark-theme')) {
    document.body.classList.remove('dark-theme');
    localStorage.setItem('theme', 'light');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i> <span>โหมดมืด</span>';
  } else {
    document.body.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i> <span>โหมดสว่าง</span>';
  }
}

// Extract number from "กลุ่มที่ X"
function getMissionGroupNumber(missionStr) {
  if (!missionStr) return 0;
  const match = missionStr.match(/กลุ่มที่\s*(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Setup global namespace for Google Visualization JSONP Callback
window.google = window.google || {};
window.google.visualization = window.google.visualization || {};
window.google.visualization.Query = window.google.visualization.Query || {};

let jsonpResolve = null;
let jsonpReject = null;

window.google.visualization.Query.setResponse = function(response) {
  if (jsonpResolve) {
    if (response && response.status === 'ok') {
      try {
        const rows = response.table.rows;
        const documents = rows.map(row => {
          const cells = row.c;
          return {
            fileName: cells[0] ? cells[0].v : '',
            mainMission: cells[1] ? cells[1].v : '',
            subMission: cells[2] ? cells[2].v : '',
            summary: cells[3] ? cells[3].v : '',
            link: cells[4] ? cells[4].v : ''
          };
        }).filter(doc => doc.fileName && doc.fileName.trim() !== '');
        
        jsonpResolve(documents);
      } catch (err) {
        jsonpReject(new Error('การแกะข้อมูล Google Sheet ล้มเหลว: ' + err.message));
      }
    } else {
      const reason = response && response.errors && response.errors[0] ? response.errors[0].detailed_message : 'ไม่สามารถดึงข้อมูลได้';
      jsonpReject(new Error('Google Sheet แจ้งเตือนข้อผิดพลาด: ' + reason));
    }
    jsonpResolve = null;
    jsonpReject = null;
  }
};

function fetchGoogleSheetViaJSONP() {
  return new Promise((resolve, reject) => {
    jsonpResolve = resolve;
    jsonpReject = reject;

    // Remove existing script element if it exists to refresh
    const existingScript = document.getElementById('google-sheets-jsonp');
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = 'google-sheets-jsonp';
    // Add timestamp cache buster
    script.src = `${GOOGLE_SHEET_JSON_URL}&t=${Date.now()}`;

    // 15 seconds timeout
    const timeoutId = setTimeout(() => {
      if (jsonpReject) {
        jsonpReject(new Error('เชื่อมต่อ Google Sheets หมดเวลา (Timeout) โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'));
        jsonpResolve = null;
        jsonpReject = null;
      }
      script.remove();
    }, 15000);

    script.onload = () => {
      clearTimeout(timeoutId);
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      if (jsonpReject) {
        jsonpReject(new Error('ไม่สามารถโหลดข้อมูลสคริปต์จาก Google Sheets ได้ (CORS / Network Error)'));
        jsonpResolve = null;
        jsonpReject = null;
      }
      script.remove();
    };

    document.body.appendChild(script);
  });
}

// Fetch and load data
async function loadData(forceRefresh = false) {
  setLoadingState(true);
  
  // Load file links mapping from globally injected window object
  fileLinksMap = window.fileLinksMap || {};
  
  // Try fetching from Node/Express Backend
  try {
    const url = forceRefresh ? `${BACKEND_API}?refresh=true` : BACKEND_API;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }
    
    const result = await response.json();
    if (result.success) {
      allDocuments = result.data;
      updateStatusIndicator(true, 'backend', result.lastUpdated);
      processData();
      return;
    } else {
      throw new Error(result.message || 'Unknown backend error');
    }
  } catch (backendError) {
    console.warn('Backend server connection failed, trying client-side JSONP fallback...', backendError.message);
    
    // Fallback: Fetch directly from Google Sheets using JSONP script injection
    try {
      allDocuments = await fetchGoogleSheetViaJSONP();
      updateStatusIndicator(true, 'google-sheet-direct', new Date().toISOString());
      processData();
    } catch (sheetError) {
      console.error('All retrieval attempts failed:', sheetError.message);
      updateStatusIndicator(false);
      renderErrorState(sheetError.message);
    }
  } finally {
    setLoadingState(false);
  }
}

// Update loading indicators in UI
function setLoadingState(isLoading) {
  const syncIcon = syncBtn.querySelector('i');
  if (isLoading) {
    syncBtn.disabled = true;
    syncIcon.classList.add('spinning');
    statusText.textContent = 'กำลังดึงข้อมูลล่าสุด...';
  } else {
    syncBtn.disabled = false;
    syncIcon.classList.remove('spinning');
  }
}

// Update backend/Google Sheets online indicators
function updateStatusIndicator(isOnline, source = '', lastUpdated = '') {
  if (isOnline) {
    statusDot.className = 'status-dot online';
    if (source === 'backend') {
      statusText.textContent = 'ออนไลน์ (เชื่อมต่อระบบหลังบ้าน)';
    } else {
      statusText.textContent = 'ออนไลน์ (เชื่อมต่อตรง Google Sheet)';
    }
    
    if (lastUpdated) {
      const date = new Date(lastUpdated);
      syncTime.textContent = `อัปเดตล่าสุด: ${date.toLocaleDateString('th-TH')} ${date.toLocaleTimeString('th-TH')}`;
    }
  } else {
    statusDot.className = 'status-dot';
    statusText.textContent = 'ออฟไลน์ (เชื่อมต่อข้อมูลล้มเหลว)';
    syncTime.textContent = 'อัปเดตล่าสุด: ล้มเหลว';
  }
}

// Calculate stats and build dropdown filters
function processData() {
  // Reset Unique Submissions Set
  uniqueSubMissions.clear();
  
  let total = allDocuments.length;
  let countM1 = 0;
  let countM2 = 0;
  let countM3 = 0;
  let countM4 = 0;

  allDocuments.forEach(doc => {
    // Count missions
    const grp = getMissionGroupNumber(doc.mainMission);
    if (grp === 1) countM1++;
    else if (grp === 2) countM2++;
    else if (grp === 3) countM3++;
    else if (grp === 4) countM4++;
    
    // Collect unique sub-missions
    if (doc.subMission && doc.subMission.trim() !== '') {
      uniqueSubMissions.add(doc.subMission.trim());
    }
  });

  // Update Stats UI
  statTotal.textContent = total;
  statM1.textContent = countM1;
  statM2.textContent = countM2;
  statM3.textContent = countM3;
  statM4.textContent = countM4;

  // Build Sub-mission Filter Dropdown
  buildSubMissionDropdown();
  
  // Apply initial filters and render
  applyFilters();
}

// Populate Sub-mission dropdown filter options
function buildSubMissionDropdown() {
  // Save current selection to restore if possible
  const prevSelection = subMissionFilter.value;
  
  // Clear options except default "All"
  subMissionFilter.innerHTML = '<option value="all">-- แสดงภารกิจย่อยทั้งหมด --</option>';
  
  // Collect sub-missions that match the current active main mission group
  const activeSubMissions = new Set();
  allDocuments.forEach(doc => {
    const groupNum = getMissionGroupNumber(doc.mainMission);
    const matchesTab = 
      state.activeMissionGroup === 'all' ||
      groupNum === parseInt(state.activeMissionGroup);
      
    if (matchesTab && doc.subMission && doc.subMission.trim() !== '') {
      const subTrimmed = doc.subMission.trim();
      // Ensure the sub-mission prefix matches the selected main mission group number (e.g. starts with "1." for Group 1)
      if (state.activeMissionGroup === 'all' || subTrimmed.startsWith(state.activeMissionGroup + '.')) {
        activeSubMissions.add(subTrimmed);
      }
    }
  });

  // Sort and add new options
  Array.from(activeSubMissions).sort().forEach(sub => {
    const option = document.createElement('option');
    option.value = sub;
    option.textContent = sub;
    subMissionFilter.appendChild(option);
  });
  
  // Restore selection if it's still available in the filtered list
  if (activeSubMissions.has(prevSelection)) {
    subMissionFilter.value = prevSelection;
    state.selectedSubMission = prevSelection;
  } else {
    subMissionFilter.value = 'all';
    state.selectedSubMission = 'all';
  }
}

// Core Filter and Sort Logic
function applyFilters() {
  filteredDocuments = allDocuments.filter(doc => {
    // 1. Search Query filter
    const matchesSearch = 
      state.searchQuery === '' ||
      doc.fileName.toLowerCase().includes(state.searchQuery) ||
      doc.summary.toLowerCase().includes(state.searchQuery) ||
      doc.mainMission.toLowerCase().includes(state.searchQuery) ||
      doc.subMission.toLowerCase().includes(state.searchQuery);
      
    // 2. Main Mission Tab filter
    const matchesTab = 
      state.activeMissionGroup === 'all' ||
      getMissionGroupNumber(doc.mainMission) === parseInt(state.activeMissionGroup);
      
    // 3. Sub-mission Dropdown filter
    const matchesSubMission =
      state.selectedSubMission === 'all' ||
      doc.subMission === state.selectedSubMission;
      
    return matchesSearch && matchesTab && matchesSubMission;
  });

  // Sort Logic
  sortFilteredData();
  
  // Render cards
  renderCards();
}

// Sort in-place based on selected method
function sortFilteredData() {
  if (state.sortBy === 'name-asc') {
    filteredDocuments.sort((a, b) => a.fileName.localeCompare(b.fileName, 'th'));
  } else if (state.sortBy === 'name-desc') {
    filteredDocuments.sort((a, b) => b.fileName.localeCompare(a.fileName, 'th'));
  } else if (state.sortBy === 'mission-asc') {
    filteredDocuments.sort((a, b) => {
      const groupA = getMissionGroupNumber(a.mainMission);
      const groupB = getMissionGroupNumber(b.mainMission);
      if (groupA !== groupB) {
        return groupA - groupB;
      }
      return a.fileName.localeCompare(b.fileName, 'th');
    });
  }
}

// Generate Card Grid HTML elements
function renderCards() {
  cardsContainer.innerHTML = '';
  resultsCount.textContent = filteredDocuments.length;

  if (filteredDocuments.length === 0) {
    cardsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-magnifying-glass-minus"></i>
        <h3>ไม่พบเอกสารที่สอดคล้องกับการค้นหา</h3>
        <p>ลองปรับคำค้นหา หรือรีเซ็ตตัวกรองเพื่อเรียกดูเอกสารทั้งหมดอีกครั้ง</p>
      </div>
    `;
    return;
  }

  filteredDocuments.forEach((doc, index) => {
    const groupNum = getMissionGroupNumber(doc.mainMission);
    
    // Create card container
    const card = document.createElement('div');
    card.className = 'doc-card';
    card.dataset.missionGroup = groupNum;
    // Apply animation delay for staggering fade-in effect
    card.style.animationDelay = `${Math.min(index * 0.03, 0.4)}s`;
    
    // Badges block
    let badgeClass = `badge b-m${groupNum || 1}`;
    let groupShortLabel = `กลุ่มที่ ${groupNum || '-'}`;
    
    // Determine if the item is a website or a PDF/Drive file
    const isDrive = doc.link && (doc.link.includes('drive.google.com') || doc.link.includes('drive.google'));
    const fileId = fileLinksMap[doc.fileName];
    const isWebsite = doc.link && !isDrive && !fileId;
    
    const buttonIcon = isWebsite ? 'fa-solid fa-globe' : 'fa-solid fa-book-open';
    const buttonLabel = isWebsite ? 'อ่านย่อ / Click webapp' : 'อ่านย่อ / อ่านไฟล์ PDF';
    
    // Structure HTML inside card
    card.innerHTML = `
      <div class="card-header-block">
        <div class="card-badges">
          <span class="${badgeClass}" title="${doc.mainMission}">${groupShortLabel}</span>
          ${doc.subMission ? `<span class="badge b-sub" title="${doc.subMission}">${doc.subMission.split(' ')[0]}</span>` : ''}
        </div>
        <h3 class="card-title">${doc.fileName}</h3>
      </div>
      <div class="card-body">
        ${doc.summary || '<i>ไม่มีรายละเอียดการถอดประสบการณ์การเรียนรู้</i>'}
      </div>
      <div class="card-actions">
        <button class="action-btn btn-card-primary" onclick="showDocumentDetails(${index})">
          <i class="${buttonIcon}"></i> ${buttonLabel}
        </button>
      </div>
    `;
    
    cardsContainer.appendChild(card);
  });
}

// Display error message
function renderErrorState(message) {
  cardsContainer.innerHTML = `
    <div class="empty-state" style="border-color: rgba(239, 68, 68, 0.2)">
      <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444"></i>
      <h3 style="color: #ef4444">การเชื่อมต่อข้อมูลขัดข้อง</h3>
      <p style="margin-bottom: 15px;">ไม่สามารถดึงข้อมูลจากระบบหลังบ้านหรือ Google Sheets ได้</p>
      <code style="background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; color: #fecdd3;">Error: ${message}</code>
      <br><br>
      <button class="sync-btn" onclick="loadData(true)" style="margin: 0 auto; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3)">
        <i class="fa-solid fa-arrows-rotate"></i> ลองใหม่อีกครั้ง
      </button>
    </div>
  `;
}

// Show modal window with details
window.showDocumentDetails = function(index) {
  const doc = filteredDocuments[index];
  if (!doc) return;

  const groupNum = getMissionGroupNumber(doc.mainMission);
  
  // Populate Modal Fields
  modalFileName.textContent = doc.fileName;
  modalMainMission.textContent = doc.mainMission || '-';
  modalSubMission.textContent = doc.subMission || '-';
  modalSummary.innerHTML = doc.summary ? doc.summary.replace(/\n/g, '<br>') : '<i>ไม่มีบทสรุปวิชาการระบุไว้</i>';
  
  const fileId = fileLinksMap[doc.fileName];
  const blocker = document.querySelector('.iframe-header-blocker');
  
  // Render scrollable document preview if direct link is resolved
  if (fileId) {
    modalPreviewContainer.innerHTML = `<iframe class="modal-preview-iframe" src="https://drive.google.com/file/d/${fileId}/preview" allow="autoplay"></iframe>`;
    if (blocker) blocker.style.display = 'block';
  } else {
    if (blocker) blocker.style.display = 'none';
    
    // Check if the link is an external web application link
    const isDrive = doc.link && (doc.link.includes('drive.google.com') || doc.link.includes('drive.google'));
    
    if (doc.link && !isDrive) {
      // It is an external web application link
      modalPreviewContainer.innerHTML = `
        <div class="empty-preview">
          <i class="fa-solid fa-globe" style="font-size: 3.5rem; color: #0284c7; margin-bottom: 1.25rem; text-shadow: 0 0 15px rgba(2,132,199,0.2);"></i>
          <h4 style="margin-bottom: 8px;">ลิงก์เชื่อมโยงไปยังระบบเว็บแอปพลิเคชัน</h4>
          <p style="margin-bottom: 20px; max-width: 440px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">เอกสารวิชาการชิ้นนี้ได้รับการพัฒนาเป็นระบบสารสนเทศอัจฉริยะแบบทำงานตอบโต้ได้ (Interactive Web Application) คุณสามารถกดปุ่มด้านล่างเพื่อเข้าสู่ระบบงานวิเคราะห์ O-NET ได้ครับ</p>
          <a class="action-btn btn-modal-primary" href="${doc.link}" target="_blank" style="width: auto; padding: 12px 28px; font-size: 0.95rem; border-radius: 30px; display: inline-flex;">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> เปิดเข้าใช้งานเว็บแอปพลิเคชัน
          </a>
        </div>
      `;
    } else {
      // It is a google drive folder or has no link
      modalPreviewContainer.innerHTML = `
        <div class="empty-preview">
          <i class="fa-solid fa-folder-open"></i>
          <h4>ไม่พบตัวอย่างเอกสารสำหรับรายการนี้</h4>
          <p>เอกสารชิ้นนี้ยังไม่ได้ทำระบบแสดงตัวอย่างบนระบบหน้าบ้านครับ</p>
        </div>
      `;
    }
  }

  // Show or Hide Download button based on whether a downloadable PDF file exists
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');
  if (fileId) {
    modalDownloadBtn.style.display = 'inline-flex';
    // Save current doc reference for the download action
    modalDownloadBtn.onclick = () => openRegistrationModal(doc, fileId);
  } else {
    modalDownloadBtn.style.display = 'none';
    modalDownloadBtn.onclick = null;
  }

  // Set modal accent color
  const modalContainer = detailModal.querySelector('.modal-container');
  modalContainer.className = 'modal-container'; // Reset classes
  if (groupNum) {
    modalContainer.classList.add(`m${groupNum}`);
    // Add custom border glow class if needed
    modalContainer.style.borderTop = `6px solid var(--mission-${groupNum}-start)`;
  } else {
    modalContainer.style.borderTop = `none`;
  }

  // Activate Modal
  detailModal.classList.add('active');
  document.body.style.overflow = 'hidden'; // Disable background scrolling
};

// Close modal window
function closeModal() {
  detailModal.classList.remove('active');
  closeRegistrationModal(); // Close registration modal too if the detail modal is closed
  document.body.style.overflow = ''; // Re-enable background scrolling
  modalPreviewContainer.innerHTML = ''; // Clear iframe to stop network requests & resource usage
}

// =========================================
// REGISTRATION FORM MODAL LOGIC
// =========================================
let currentDownloadingDoc = null;
let currentDownloadingFileId = null;

function openRegistrationModal(doc, fileId) {
  currentDownloadingDoc = doc;
  currentDownloadingFileId = fileId;
  
  const regDocName = document.getElementById('regDocName');
  const regMainMission = document.getElementById('regMainMission');
  const regSubMission = document.getElementById('regSubMission');
  const registrationModal = document.getElementById('registrationModal');
  
  if (regDocName) regDocName.textContent = doc.fileName;
  if (regMainMission) regMainMission.textContent = doc.mainMission || '-';
  if (regSubMission) regSubMission.textContent = doc.subMission || '-';
  
  // Auto-fill values from localStorage
  const regEmail = document.getElementById('regEmail');
  const regName = document.getElementById('regName');
  const regSchool = document.getElementById('regSchool');
  const regProvince = document.getElementById('regProvince');
  const regObjective = document.getElementById('regObjective');
  
  if (regEmail) regEmail.value = localStorage.getItem('reg_email') || '';
  if (regName) regName.value = localStorage.getItem('reg_name') || '';
  if (regSchool) regSchool.value = localStorage.getItem('reg_school') || '';
  if (regProvince) regProvince.value = localStorage.getItem('reg_province') || '';
  if (regObjective) regObjective.value = ''; // Clear objective for fresh inputs
  
  if (registrationModal) {
    registrationModal.classList.add('active');
  }
}

function closeRegistrationModal() {
  const registrationModal = document.getElementById('registrationModal');
  if (registrationModal) {
    registrationModal.classList.remove('active');
  }
  
  // Reset submit button state
  const regSubmitBtn = document.getElementById('regSubmitBtn');
  if (regSubmitBtn) {
    regSubmitBtn.disabled = false;
    regSubmitBtn.innerHTML = '<i class="fa-solid fa-download"></i> ยืนยันและดาวน์โหลด';
  }
  
  currentDownloadingDoc = null;
  currentDownloadingFileId = null;
}

async function handleRegistrationSubmit(e) {
  e.preventDefault();
  
  if (!currentDownloadingDoc || !currentDownloadingFileId) return;
  
  const regEmail = document.getElementById('regEmail').value.trim();
  const regName = document.getElementById('regName').value.trim();
  const regSchool = document.getElementById('regSchool').value.trim();
  const regProvince = document.getElementById('regProvince').value.trim();
  const regObjective = document.getElementById('regObjective').value.trim();
  
  // Save user details to localStorage for next time convenience
  localStorage.setItem('reg_email', regEmail);
  localStorage.setItem('reg_name', regName);
  localStorage.setItem('reg_school', regSchool);
  localStorage.setItem('reg_province', regProvince);
  
  // Show loading indicator in button
  const regSubmitBtn = document.getElementById('regSubmitBtn');
  if (regSubmitBtn) {
    regSubmitBtn.disabled = true;
    regSubmitBtn.innerHTML = '<span class="btn-spinner"></span> กำลังบันทึกข้อมูล...';
  }
  
  // Prepare payload mapping sheet columns: Timestamp / pdf name / sub mission / main mission / e mail / name / school / province / objective
  const payload = {
    pdfName: currentDownloadingDoc.fileName,
    subMission: currentDownloadingDoc.subMission,
    mainMission: currentDownloadingDoc.mainMission,
    email: regEmail,
    name: regName,
    school: regSchool,
    province: regProvince,
    objective: regObjective
  };
  
  try {
    if (REGISTRATION_API_URL) {
      // Send as POST request (using text/plain content type to avoid CORS preflight options blocks in Apps Script)
      await fetch(REGISTRATION_API_URL, {
        method: 'POST',
        mode: 'no-cors', // Bypasses CORS blocks since we do not need to read the Apps Script redirect response
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });
      console.log('Registration submitted to Google Sheets successfully.');
    } else {
      console.warn('REGISTRATION_API_URL is not set. Simulating Apps Script write...');
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  } catch (error) {
    console.error('Error submitting registration:', error);
    // Proceed to download anyway so the teacher still gets the document
  } finally {
    // Trigger Google Drive direct download
    const downloadLink = document.createElement('a');
    downloadLink.href = `https://drive.google.com/uc?export=download&id=${currentDownloadingFileId}`;
    downloadLink.target = '_blank';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    // Close the registration overlay modal
    closeRegistrationModal();
  }
}

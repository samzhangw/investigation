/**
 * Main Application Logic
 */
const app = {
    state: {
        role: 'student', // 'student' | 'admin'
        surveys: [],
        selectedSurvey: null,
        currentView: 'home',
        signaturePad: null
    },

    // Initialization
    init: async () => {
        app.setupClock();
        app.setupSignaturePad();
        app.setupPinInputs();
        await app.loadSurveys();
        
        // Initial route
        app.navigate('home');
    },

    // UI & Navigation
    navigate: (viewId) => {
        // Hide all views
        document.querySelectorAll('section[id^="view-"]').forEach(el => el.classList.add('hidden'));
        
        // Show target view
        const target = document.getElementById(`view-${viewId}`);
        if(target) target.classList.remove('hidden');

        // Update nav buttons
        document.getElementById('btn-nav-home').className = viewId === 'home' 
            ? 'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-white text-brand-700 shadow-sm'
            : 'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-slate-500 hover:text-slate-700';
            
        document.getElementById('btn-nav-inquiry').className = viewId === 'inquiry'
            ? 'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-white text-brand-700 shadow-sm'
            : 'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-slate-500 hover:text-slate-700';

        app.state.currentView = viewId;
    },

    switchRole: (role) => {
        app.state.role = role;
        if (role === 'admin') {
            document.getElementById('nav-student').classList.add('hidden');
            document.getElementById('nav-admin').classList.remove('hidden');
            app.navigate('admin');
            app.renderAdminDashboard();
        } else {
            document.getElementById('nav-student').classList.remove('hidden');
            document.getElementById('nav-admin').classList.add('hidden');
            app.navigate('home');
        }
    },

    setLoading: (isLoading) => {
        const overlay = document.getElementById('loading-overlay');
        isLoading ? overlay.classList.remove('hidden') : overlay.classList.add('hidden');
    },

    setupClock: () => {
        const update = () => {
            const now = new Date();
            const str = now.getFullYear() + '/' + 
                String(now.getMonth()+1).padStart(2,'0') + '/' + 
                String(now.getDate()).padStart(2,'0') + ' ' + 
                String(now.getHours()).padStart(2,'0') + ':' + 
                String(now.getMinutes()).padStart(2,'0') + ':' + 
                String(now.getSeconds()).padStart(2,'0');
            document.getElementById('clock-display').innerText = str;
        };
        setInterval(update, 1000);
        update();
    },

    // Survey Logic
    loadSurveys: async () => {
        app.setLoading(true);
        try {
            const data = await API.getSurveys();
            app.state.surveys = data;
            app.renderSurveyList();
            if(app.state.role === 'admin') app.renderAdminDashboard();
        } catch (err) {
            alert("無法載入資料: " + err.message);
        } finally {
            app.setLoading(false);
        }
    },

    renderSurveyList: () => {
        const container = document.getElementById('survey-list-container');
        if (!app.state.surveys.length) {
            container.innerHTML = '<div class="col-span-2 text-center text-slate-400 py-10">目前沒有調查</div>';
            return;
        }

        container.innerHTML = app.state.surveys.map(survey => {
            const isActive = survey.status === 'ACTIVE';
            return `
            <div class="group relative bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden flex flex-col h-full">
                <div class="absolute top-0 left-0 w-full h-1.5 ${isActive ? 'bg-brand-500' : 'bg-slate-300'}"></div>
                <div class="flex justify-between items-start mb-4">
                    <span class="px-3 py-1 text-xs font-bold rounded-full ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">
                        ${isActive ? '進行中' : '已結束'}
                    </span>
                    <span class="text-xs font-medium text-slate-400">截止: ${survey.deadline}</span>
                </div>
                <h3 class="text-xl font-bold text-slate-800 mb-3 group-hover:text-brand-600">${survey.title}</h3>
                <p class="text-slate-500 mb-6 text-sm line-clamp-2 flex-grow">${survey.description}</p>
                <button onclick="app.openSurveyForm('${survey.id}')" ${!isActive ? 'disabled' : ''} class="w-full py-3 px-4 rounded-xl font-bold text-sm transition-all ${isActive ? 'bg-slate-50 text-brand-700 hover:bg-brand-600 hover:text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}">
                    ${isActive ? '前往填寫' : '已截止'}
                </button>
            </div>`;
        }).join('');
    },

    openSurveyForm: (id) => {
        const survey = app.state.surveys.find(s => s.id === id);
        if (!survey) return;
        app.state.selectedSurvey = survey;
        
        // Populate Form
        document.getElementById('form-survey-title').innerText = survey.title;
        document.getElementById('form-survey-desc').innerText = survey.description;
        document.getElementById('form-survey-deadline').innerText = survey.deadline;
        
        // Reset Inputs
        document.getElementById('response-form').reset();
        app.clearSignature();
        document.getElementById('form-error-msg').classList.add('hidden');
        
        app.navigate('form');
    },

    // Form & Signature
    setupSignaturePad: () => {
        const canvas = document.getElementById('signature-canvas');
        const container = document.getElementById('signature-pad-container');
        const ctx = canvas.getContext('2d');
        let isDrawing = false;

        const resize = () => {
            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#0f172a';
        };

        window.addEventListener('resize', resize);
        // Initial resize
        setTimeout(resize, 100);

        const getCoords = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
            return { x, y };
        };

        const start = (e) => {
            if(e.cancelable) e.preventDefault();
            isDrawing = true;
            document.getElementById('signature-placeholder').classList.add('hidden');
            const { x, y } = getCoords(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
        };

        const move = (e) => {
            if(e.cancelable) e.preventDefault();
            if (!isDrawing) return;
            const { x, y } = getCoords(e);
            ctx.lineTo(x, y);
            ctx.stroke();
            app.state.hasSignature = true;
            document.getElementById('signature-success-badge').classList.remove('hidden');
        };

        const end = (e) => {
            if(e.cancelable) e.preventDefault();
            isDrawing = false;
        };

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', end);
        canvas.addEventListener('mouseleave', end);
        canvas.addEventListener('touchstart', start);
        canvas.addEventListener('touchmove', move);
        canvas.addEventListener('touchend', end);

        app.state.signaturePad = { canvas, ctx, resize };
    },

    clearSignature: () => {
        const { canvas, ctx } = app.state.signaturePad;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        document.getElementById('signature-placeholder').classList.remove('hidden');
        document.getElementById('signature-success-badge').classList.add('hidden');
        app.state.hasSignature = false;
    },

    handleFormSubmit: async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('form-error-msg');
        errorEl.classList.add('hidden');

        // Validation
        const studentId = document.getElementById('input-student-id').value.trim();
        if (!/^[a-zA-Z0-9]+$/.test(studentId)) {
            errorEl.innerText = "學號格式錯誤 (僅限英數字)";
            errorEl.classList.remove('hidden');
            return;
        }

        if (!app.state.hasSignature) {
            errorEl.innerText = "請簽名";
            errorEl.classList.remove('hidden');
            return;
        }

        // Check Duplicate
        app.setLoading(true);
        try {
            const isDup = await API.hasStudentSubmitted(app.state.selectedSurvey.id, studentId);
            if (isDup) {
                throw new Error("此學號已提交過回覆");
            }
            // Show Pin Modal
            app.setLoading(false);
            document.getElementById('modal-pin').classList.remove('hidden');
            // Focus first pin input
            document.querySelector('.pin-digit').focus();
        } catch (err) {
            app.setLoading(false);
            errorEl.innerText = err.message;
            errorEl.classList.remove('hidden');
        }
    },

    setupPinInputs: () => {
        const inputs = document.querySelectorAll('.pin-digit');
        inputs.forEach((input, idx) => {
            input.addEventListener('input', (e) => {
                if(input.value.length === 1 && idx < inputs.length - 1) {
                    inputs[idx + 1].focus();
                }
            });
            input.addEventListener('keydown', (e) => {
                if(e.key === 'Backspace' && input.value.length === 0 && idx > 0) {
                    inputs[idx - 1].focus();
                }
            });
        });
    },

    verifyPin: async () => {
        const inputs = document.querySelectorAll('.pin-digit');
        const pin = Array.from(inputs).map(i => i.value).join('');
        const errorEl = document.getElementById('pin-error');
        
        if (pin !== app.state.selectedSurvey.pin) {
            errorEl.innerText = "驗證碼錯誤";
            errorEl.classList.remove('hidden');
            inputs.forEach(i => i.value = '');
            inputs[0].focus();
            return;
        }

        // Proceed to Submit
        document.getElementById('modal-pin').classList.add('hidden');
        app.setLoading(true);
        
        const data = {
            surveyId: app.state.selectedSurvey.id,
            studentName: document.getElementById('input-student-name').value,
            studentId: document.getElementById('input-student-id').value.trim().toUpperCase(),
            parentName: document.getElementById('input-parent-name').value,
            comments: document.getElementById('input-comments').value,
            signatureDataUrl: app.state.signaturePad.canvas.toDataURL(),
            securityMetadata: {
                userAgent: navigator.userAgent,
                deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                ipAddress: '127.0.0.1',
                verifiedByPin: true
            }
        };

        try {
            const res = await API.saveResponse(data);
            app.showReceipt(res);
        } catch (err) {
            alert("提交失敗: " + err.message);
        } finally {
            app.setLoading(false);
        }
    },

    showReceipt: (response) => {
        const details = `
            <div>
                <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">調查主題</span>
                <span class="text-slate-800 font-bold block">${app.state.selectedSurvey.title}</span>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div><span class="text-xs font-bold text-slate-400 uppercase mb-1 block">學生</span><span class="font-medium">${response.studentName}</span></div>
                <div><span class="text-xs font-bold text-slate-400 uppercase mb-1 block">學號</span><span class="font-mono">${response.studentId}</span></div>
            </div>
            <div class="pt-4 border-t border-slate-200 grid grid-cols-2 gap-4">
                 <div><span class="text-xs font-bold text-slate-400 uppercase mb-1 block">時間</span><span class="text-sm">${new Date(response.submittedAt).toLocaleString()}</span></div>
                 <div><span class="text-xs font-bold text-slate-400 uppercase mb-1 block">流水號</span><span class="text-xs font-mono">${response.id}</span></div>
            </div>
        `;
        document.getElementById('receipt-details').innerHTML = details;
        app.navigate('receipt');
    },

    // Inquiry
    handleInquiry: async (e) => {
        e.preventDefault();
        const id = document.getElementById('inquiry-student-id').value.trim();
        if(!id) return;
        
        app.setLoading(true);
        try {
            const results = await API.checkStudentStatus(id);
            const container = document.getElementById('inquiry-results');
            if (results.length === 0) {
                container.innerHTML = `<div class="text-center py-6 text-slate-500">查無資料</div>`;
            } else {
                container.innerHTML = results.map(r => {
                    const survey = app.state.surveys.find(s => s.id === r.surveyId);
                    return `
                    <div class="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
                        <div>
                            <div class="font-bold text-slate-800">${survey ? survey.title : '未知調查'}</div>
                            <div class="text-xs text-slate-500">${new Date(r.submittedAt).toLocaleString()}</div>
                        </div>
                        <span class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-lg">已完成</span>
                    </div>`;
                }).join('');
            }
        } catch (err) {
            alert("查詢失敗");
        } finally {
            app.setLoading(false);
        }
    },

    // Admin
    renderAdminDashboard: async () => {
        const select = document.getElementById('admin-survey-select');
        select.innerHTML = app.state.surveys.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
        
        app.handleAdminSurveyChange();
    },

    handleAdminSurveyChange: async () => {
        const surveyId = document.getElementById('admin-survey-select').value;
        const survey = app.state.surveys.find(s => s.id === surveyId);
        if(!survey) return;

        document.getElementById('admin-current-pin').innerText = `PIN: ${survey.pin}`;
        
        // Load responses
        const tbody = document.getElementById('admin-response-table');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">載入中...</td></tr>';
        
        try {
            const responses = await API.getResponses(surveyId);
            app.state.currentAdminResponses = responses; // Save for CSV
            document.getElementById('admin-total-responses').innerText = responses.length;

            if(responses.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400">尚無回覆</td></tr>';
                return;
            }

            tbody.innerHTML = responses.map(r => `
                <tr class="hover:bg-slate-50">
                    <td class="px-6 py-4">
                        <div class="font-bold text-sm">${r.studentName}</div>
                        <div class="text-xs text-slate-500 font-mono">${r.studentId}</div>
                    </td>
                    <td class="px-6 py-4 text-sm">${r.parentName}</td>
                    <td class="px-6 py-4 text-xs text-slate-500">${new Date(r.submittedAt).toLocaleString()}</td>
                    <td class="px-6 py-4 text-sm truncate max-w-xs">${r.comments || ''}</td>
                    <td class="px-6 py-4">
                        <button onclick='app.showCertificate(${JSON.stringify(r).replace(/'/g, "&#39;")})' class="text-xs bg-brand-50 text-brand-700 px-3 py-1 rounded-full border border-brand-200">檢視</button>
                    </td>
                </tr>
            `).join('');
        } catch(e) {
            console.error(e);
        }
    },

    exportCSV: () => {
        const responses = app.state.currentAdminResponses || [];
        if(!responses.length) return alert("無資料可匯出");

        const headers = ["學生姓名", "學號", "家長姓名", "提交時間", "備註", "驗證狀態", "IP", "流水號"];
        const rows = responses.map(r => [
            r.studentName,
            r.studentId,
            r.parentName,
            new Date(r.submittedAt).toLocaleString(),
            String(r.comments || "").replace(/(\r\n|\n|\r)/gm, " "),
            r.securityMetadata?.verifiedByPin ? "已驗證" : "未驗證",
            r.securityMetadata?.ipAddress || "",
            r.id
        ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(","));

        const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `survey_export.csv`;
        link.click();
    },

    openCreateSurveyModal: () => {
        document.getElementById('modal-create').classList.remove('hidden');
    },

    submitNewSurvey: async (e) => {
        e.preventDefault();
        const data = {
            title: document.getElementById('new-survey-title').value,
            description: document.getElementById('new-survey-desc').value,
            deadline: document.getElementById('new-survey-deadline').value
        };
        
        // Date check
        if (new Date(data.deadline) < new Date().setHours(0,0,0,0)) {
            return alert("截止日期不可早於今日");
        }

        document.getElementById('modal-create').classList.add('hidden');
        app.setLoading(true);

        try {
            const newS = await API.createSurvey(data);
            alert(`建立成功！ PIN: ${newS.pin}`);
            app.loadSurveys();
        } catch(err) {
            alert("建立失敗");
        } finally {
            app.setLoading(false);
        }
    },

    showCertificate: (r) => {
        const modal = document.getElementById('modal-certificate');
        const content = document.getElementById('certificate-content');
        content.innerHTML = `
            <div class="border-2 border-slate-200 rounded-xl bg-slate-50 h-40 flex items-center justify-center overflow-hidden mb-4 relative">
                <div class="absolute inset-0 opacity-[0.05]" style="background-image: radial-gradient(#000 1px, transparent 1px); background-size: 10px 10px;"></div>
                <img src="${r.signatureDataUrl}" class="max-h-32 relative z-10" />
            </div>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div class="bg-slate-50 p-3 rounded-lg border">
                    <span class="text-xs text-slate-400 font-bold block">PIN 驗證</span>
                    <span class="font-mono font-bold text-slate-800">${r.securityMetadata?.verifiedByPin ? 'PASS' : 'FAIL'}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-lg border">
                    <span class="text-xs text-slate-400 font-bold block">IP 位址</span>
                    <span class="font-mono text-slate-800">${r.securityMetadata?.ipAddress || 'Unknown'}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-lg border col-span-2">
                    <span class="text-xs text-slate-400 font-bold block">User Agent</span>
                    <span class="font-mono text-xs text-slate-500 break-all">${r.securityMetadata?.userAgent || 'Unknown'}</span>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
    }
};

// Start
document.addEventListener('DOMContentLoaded', app.init);
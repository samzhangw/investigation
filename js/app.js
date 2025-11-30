

/**
 * Main Application Logic
 */
const app = {
    state: {
        role: 'student', // 'student' | 'admin'
        surveys: [],
        selectedSurvey: null,
        currentView: 'home',
        signaturePad: null,
        signatureHistory: [], // For Undo
        newSurveyQuestions: [], // For Survey Builder
        charts: [], // Store chart instances to destroy them later
        draftDebounceTimer: null
    },

    // Initialization
    init: async () => {
        app.setupClock();
        app.setupSignaturePad();
        app.setupPinInputs();
        await app.loadSurveys();
        
        // Check for Deep Link (e.g. ?surveyId=xxx)
        app.checkUrlParams();
        
        // Initial route (only if deep link didn't redirect)
        if (!app.state.selectedSurvey) {
            app.navigate('home');
        }
        
        // Check for announcements
        app.checkAnnouncement();
        
        // Auto-save listeners
        app.setupAutoSaveListeners();
    },
    
    checkUrlParams: () => {
        const params = new URLSearchParams(window.location.search);
        const surveyId = params.get('surveyId');
        if (surveyId) {
            const survey = app.state.surveys.find(s => s.id === surveyId);
            if (survey) {
                // Clear the URL to avoid re-triggering on refresh, but keep history clean? 
                // Actually keep it clean for now:
                window.history.replaceState({}, document.title, window.location.pathname);
                app.openSurveyForm(surveyId);
            }
        }
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
            ? 'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 bg-white text-brand-700 shadow-sm whitespace-nowrap'
            : 'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 text-slate-500 hover:text-slate-700 whitespace-nowrap';
            
        document.getElementById('btn-nav-inquiry').className = viewId === 'inquiry'
            ? 'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 bg-white text-brand-700 shadow-sm whitespace-nowrap'
            : 'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 text-slate-500 hover:text-slate-700 whitespace-nowrap';

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
            app.checkAnnouncement(); // Re-check as student
        }
    },

    setLoading: (isLoading, message = "資料讀取中...") => {
        const overlay = document.getElementById('loading-overlay');
        const textEl = document.getElementById('loading-text');
        
        if (isLoading) {
            if(textEl) textEl.innerText = message;
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
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

    // --- Announcement Logic ---
    checkAnnouncement: async () => {
        if (app.state.role === 'admin') return; // Admins don't need the popup
        
        try {
            const ann = await API.getAnnouncement();
            if (ann.isActive && ann.title) {
                // Check if user has already seen this version of announcement (using timestamp)
                const seenKey = 'ann_seen_' + ann.updatedAt;
                if (!sessionStorage.getItem(seenKey)) {
                    document.getElementById('view-ann-title').innerText = ann.title;
                    document.getElementById('view-ann-content').innerText = ann.content;
                    document.getElementById('modal-announcement-view').classList.remove('hidden');
                    
                    // Mark as seen for this session
                    sessionStorage.setItem(seenKey, 'true');
                }
            }
        } catch (e) {
            console.error("Failed to check announcement", e);
        }
    },

    openAnnouncementEditor: async () => {
        app.setLoading(true, "載入公告設定...");
        try {
            const ann = await API.getAnnouncement();
            document.getElementById('ann-title').value = ann.title || '';
            document.getElementById('ann-content').value = ann.content || '';
            document.getElementById('ann-active').checked = ann.isActive;
            
            document.getElementById('modal-announcement-editor').classList.remove('hidden');
        } catch(e) {
            alert("無法載入公告設定");
        } finally {
            app.setLoading(false);
        }
    },

    saveAnnouncement: async () => {
        const title = document.getElementById('ann-title').value;
        const content = document.getElementById('ann-content').value;
        const isActive = document.getElementById('ann-active').checked;
        
        document.getElementById('modal-announcement-editor').classList.add('hidden');
        app.setLoading(true, "儲存公告中...");
        
        try {
            await API.saveAnnouncement({ title, content, isActive });
            alert("公告設定已更新！");
        } catch(e) {
            alert("儲存失敗");
        } finally {
            app.setLoading(false);
        }
    },
    
    // --- QR Code & Share Logic ---
    openShareModal: () => {
        const surveyId = document.getElementById('admin-survey-select').value;
        if (!surveyId) return alert("請先選擇一個調查");
        
        // Generate Link
        const link = `${window.location.origin}${window.location.pathname}?surveyId=${surveyId}`;
        document.getElementById('share-link-text').innerText = link;
        
        // Generate QR Code
        const container = document.getElementById('qrcode-container');
        container.innerHTML = ''; // Clear old
        new QRCode(container, {
            text: link,
            width: 192,
            height: 192,
            colorDark : "#0f172a",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        
        document.getElementById('modal-share').classList.remove('hidden');
    },
    
    copyShareLink: () => {
        const link = document.getElementById('share-link-text').innerText;
        navigator.clipboard.writeText(link).then(() => {
            alert("連結已複製！");
        });
    },

    // Survey Logic
    loadSurveys: async () => {
        app.setLoading(true, "正在載入調查資料...");
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
            <div class="group relative bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden flex flex-col h-full">
                <div class="absolute top-0 left-0 w-full h-1.5 ${isActive ? 'bg-brand-500' : 'bg-slate-300'}"></div>
                <div class="flex justify-between items-start mb-4">
                    <span class="px-3 py-1 text-xs font-bold rounded-full ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">
                        ${isActive ? '進行中' : '已結束'}
                    </span>
                    <span class="text-xs font-medium text-slate-400">截止: ${survey.deadline}</span>
                </div>
                <h3 class="text-lg sm:text-xl font-bold text-slate-800 mb-2 sm:mb-3 group-hover:text-brand-600">${survey.title}</h3>
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
        
        // Render Dynamic Questions
        app.renderDynamicQuestions(survey.questions || []);

        // Reset Inputs
        document.getElementById('response-form').reset();
        app.clearSignature();
        document.getElementById('form-error-msg').classList.add('hidden');
        
        // Restore Draft (if any)
        app.restoreDraft(id);
        
        // Preview Mode Handling
        const banner = document.getElementById('preview-mode-banner');
        if (app.state.role === 'admin') {
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
        
        app.navigate('form');
        
        // Scroll to top
        window.scrollTo(0, 0);
    },
    
    // Auto Save Logic
    setupAutoSaveListeners: () => {
        const form = document.getElementById('response-form');
        form.addEventListener('input', () => {
            if (!app.state.selectedSurvey) return;
            
            clearTimeout(app.state.draftDebounceTimer);
            app.state.draftDebounceTimer = setTimeout(() => {
                app.saveDraft();
            }, 1000);
        });
    },

    saveDraft: () => {
        if (!app.state.selectedSurvey || app.state.role === 'admin') return;
        
        const data = {
            studentClass: document.getElementById('input-student-class').value,
            studentId: document.getElementById('input-student-id').value,
            studentName: document.getElementById('input-student-name').value,
            parentName: document.getElementById('input-parent-name').value,
            comments: document.getElementById('input-comments').value,
        };
        
        localStorage.setItem(`draft_${app.state.selectedSurvey.id}`, JSON.stringify(data));
    },

    restoreDraft: (surveyId) => {
        const draft = localStorage.getItem(`draft_${surveyId}`);
        if (!draft) return;
        
        try {
            const data = JSON.parse(draft);
            if (data.studentClass) document.getElementById('input-student-class').value = data.studentClass;
            if (data.studentId) document.getElementById('input-student-id').value = data.studentId;
            if (data.studentName) document.getElementById('input-student-name').value = data.studentName;
            if (data.parentName) document.getElementById('input-parent-name').value = data.parentName;
            if (data.comments) document.getElementById('input-comments').value = data.comments;
        } catch (e) {
            console.error("Failed to restore draft", e);
        }
    },

    clearDraft: (surveyId) => {
        localStorage.removeItem(`draft_${surveyId}`);
    },

    // New function to handle exiting the form
    exitForm: () => {
        if (app.state.role === 'admin') {
            app.navigate('admin');
        } else {
            app.navigate('home');
        }
    },
    
    handleAdminPreview: () => {
        const id = document.getElementById('admin-survey-select').value;
        if(!id) return alert("請先選擇一個調查");
        app.openSurveyForm(id);
    },

    renderDynamicQuestions: (questions) => {
        const container = document.getElementById('dynamic-questions-container');
        if (!questions || questions.length === 0) {
            container.innerHTML = '';
            container.classList.add('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200">
                <h3 class="text-base sm:text-lg font-bold text-slate-800 mb-4 flex items-center">
                    <svg class="h-5 w-5 mr-2 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    調查內容
                </h3>
                <div class="space-y-6">
                ${questions.map((q, idx) => {
                    const requiredStar = q.required ? '<span class="text-red-500 ml-1">*</span>' : '';
                    let inputHtml = '';
                    
                    if (q.type === 'text') {
                        inputHtml = `<input name="q_${idx}" type="text" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-brand-500 outline-none bg-white text-base" placeholder="請輸入回答" ${q.required ? 'required' : ''}>`;
                    } else if (q.type === 'radio') {
                        inputHtml = `<div class="space-y-3">
                            ${q.options.map(opt => `
                                <label class="flex items-center space-x-3 cursor-pointer p-2 rounded-lg hover:bg-slate-100 active:bg-slate-200">
                                    <input type="radio" name="q_${idx}" value="${opt}" class="form-radio h-5 w-5 text-brand-600 focus:ring-brand-500 border-gray-300" ${q.required ? 'required' : ''}>
                                    <span class="text-slate-700 text-base">${opt}</span>
                                </label>
                            `).join('')}
                        </div>`;
                    } else if (q.type === 'checkbox') {
                         inputHtml = `<div class="space-y-3">
                            ${q.options.map(opt => `
                                <label class="flex items-center space-x-3 cursor-pointer p-2 rounded-lg hover:bg-slate-100 active:bg-slate-200">
                                    <input type="checkbox" name="q_${idx}" value="${opt}" class="form-checkbox h-5 w-5 text-brand-600 focus:ring-brand-500 border-gray-300">
                                    <span class="text-slate-700 text-base">${opt}</span>
                                </label>
                            `).join('')}
                        </div>`;
                    }

                    return `
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-2">${q.label} ${requiredStar}</label>
                        ${inputHtml}
                    </div>
                    `;
                }).join('')}
                </div>
            </div>
        `;
    },

    // Form Builder Logic
    addQuestion: (type) => {
        app.state.newSurveyQuestions.push({
            id: Date.now().toString(),
            type,
            label: '',
            options: type === 'text' ? [] : ['選項1'],
            required: true
        });
        app.renderQuestionBuilder();
    },

    removeQuestion: (idx) => {
        app.state.newSurveyQuestions.splice(idx, 1);
        app.renderQuestionBuilder();
    },

    updateQuestion: (idx, field, value) => {
        app.state.newSurveyQuestions[idx][field] = value;
        app.renderQuestionBuilder(); // Re-render needed if changing type? usually not for simple inputs
    },

    updateQuestionOptions: (idx, value) => {
        // Options input is a comma separated string
        app.state.newSurveyQuestions[idx].options = value.split(',').map(s => s.trim()).filter(s => s);
    },

    renderQuestionBuilder: () => {
        const container = document.getElementById('question-builder-container');
        if (app.state.newSurveyQuestions.length === 0) {
             container.innerHTML = '<div class="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">點擊上方按鈕新增題目</div>';
             return;
        }

        container.innerHTML = app.state.newSurveyQuestions.map((q, idx) => {
            const typeLabel = q.type === 'text' ? '簡答題' : q.type === 'radio' ? '單選題' : '多選題';
            const optionsInput = q.type !== 'text' 
                ? `<div class="mt-2">
                     <label class="text-xs text-slate-500">選項 (請用逗號分隔)</label>
                     <input type="text" value="${q.options.join(', ')}" onchange="app.updateQuestionOptions(${idx}, this.value)" class="w-full text-base px-3 py-2 border border-slate-200 rounded-lg" placeholder="例如: 是, 否, 其他">
                   </div>` 
                : '';

            return `
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 relative group">
                <button type="button" onclick="app.removeQuestion(${idx})" class="absolute top-2 right-2 text-slate-400 hover:text-red-500 px-2 py-1">✕</button>
                <div class="flex items-center mb-2">
                    <span class="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded mr-2">${typeLabel}</span>
                    <label class="flex items-center text-xs text-slate-500 cursor-pointer">
                        <input type="checkbox" onchange="app.updateQuestion(${idx}, 'required', this.checked)" ${q.required ? 'checked' : ''} class="mr-1 h-4 w-4"> 必填
                    </label>
                </div>
                <input type="text" value="${q.label}" onchange="app.updateQuestion(${idx}, 'label', this.value)" class="w-full font-bold bg-transparent border-b border-dashed border-slate-300 focus:border-brand-500 outline-none placeholder-slate-400 py-1 text-base" placeholder="請輸入題目內容...">
                ${optionsInput}
            </div>
            `;
        }).join('');
    },

    // Form & Signature
    setupSignaturePad: () => {
        const canvas = document.getElementById('signature-canvas');
        const container = document.getElementById('signature-pad-container');
        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let points = [];
        
        app.state.signatureHistory = []; // Reset history

        const resize = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const dpr = window.devicePixelRatio || 1;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            
            // Pen Style
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#0f172a';
            ctx.shadowBlur = 0.5;
            ctx.shadowColor = '#0f172a';
            
            app.state.signatureHistory = []; // Clear history on resize
        };

        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', () => setTimeout(resize, 200)); 
        setTimeout(resize, 200);

        const getCoords = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return { 
                x: clientX - rect.left, 
                y: clientY - rect.top 
            };
        };

        const start = (e) => {
            if(e.cancelable) e.preventDefault();
            if (canvas.width === 0) resize();

            isDrawing = true;
            points = [];
            
            // Save state for undo BEFORE drawing new stroke
            // We use getImageData at native resolution (not CSS pixels)
            app.state.signatureHistory.push(
                ctx.getImageData(0, 0, canvas.width, canvas.height)
            );
            
            const coords = getCoords(e);
            points.push(coords);
            
            document.getElementById('signature-placeholder').classList.add('hidden');
        };

        const move = (e) => {
            if(e.cancelable) e.preventDefault();
            if (!isDrawing) return;
            
            const coords = getCoords(e);
            points.push(coords);

            // Smoother drawing with Quadratic Bezier Curves
            if (points.length > 2) {
                const lastTwo = points.slice(-2);
                const p1 = lastTwo[0];
                const p2 = lastTwo[1];
                const midPoint = {
                    x: (p1.x + p2.x) / 2,
                    y: (p1.y + p2.y) / 2
                };

                ctx.beginPath();
                // Move to the last point (or start)
                if (points.length === 3) {
                    ctx.moveTo(points[0].x, points[0].y);
                } else {
                    // We need to track where the last curve ended. 
                    // Actually, simpler approach for live drawing:
                    // Just draw curve from p1 to midPoint using p1 as control? No.
                    // Standard approach: Curve from Mid(p0, p1) to Mid(p1, p2) with p1 control.
                    
                    // Simplified implementation for live buffer:
                    // Just draw small segments is choppy.
                    // Let's use the simple mid-point algo.
                    
                    // We redraw the last segment properly:
                    const p0 = points[points.length - 3];
                    const mid1 = { x: (p0.x + p1.x)/2, y: (p0.y + p1.y)/2 };
                    const mid2 = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
                    
                    ctx.beginPath();
                    ctx.moveTo(mid1.x, mid1.y);
                    ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
                    ctx.stroke();
                }
            }
            
            app.state.hasSignature = true;
            document.getElementById('signature-success-badge').classList.remove('hidden');
        };

        const end = (e) => {
            if(e.cancelable) e.preventDefault();
            isDrawing = false;
            // Handle single dot
            if (points.length === 1) {
                const p = points[0];
                ctx.beginPath();
                ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
                ctx.fill();
                app.state.hasSignature = true;
            }
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
    
    undoSignature: () => {
        const { canvas, ctx } = app.state.signaturePad;
        if (app.state.signatureHistory.length > 0) {
            const lastState = app.state.signatureHistory.pop();
            // Restore native pixel data
            ctx.putImageData(lastState, 0, 0);
            
            if (app.state.signatureHistory.length === 0) {
                 // Check if canvas is actually empty visually? 
                 // If we popped to empty state, it might still have lines if we pushed empty state at start?
                 // Our logic pushes BEFORE stroke. So if history is empty, canvas might still have 1 stroke?
                 // No, we push current state (which might be empty).
                 // So if history is empty, it means we are at the very beginning (or user didn't draw yet)
                 // But wait, undo action restores the state.
                 // So if we just restored the last state, is that state empty?
                 // Simple check:
                 // app.state.hasSignature = ??? (hard to know without pixel scanning)
                 // For UX, just keep badge if history > 0 or assume user knows.
                 // Better: If history is empty, it means we reverted to initial state (blank).
            }
        } else {
            // Nothing to undo
        }
    },

    clearSignature: () => {
        const { canvas, ctx, resize } = app.state.signaturePad;
        
        // Ensure size is correct before clearing
        resize();

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        document.getElementById('signature-placeholder').classList.remove('hidden');
        document.getElementById('signature-success-badge').classList.add('hidden');
        app.state.hasSignature = false;
        app.state.signatureHistory = [];
    },

    handleFormSubmit: async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('form-error-msg');
        errorEl.classList.add('hidden');

        // Validation
        const studentId = document.getElementById('input-student-id').value.trim();
        const studentClass = document.getElementById('input-student-class').value;
        
        if (!studentClass) {
             errorEl.innerText = "請選擇班級";
             errorEl.classList.remove('hidden');
             return;
        }

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
        
        // Collect Dynamic Answers
        const answers = {};
        const questions = app.state.selectedSurvey.questions || [];
        const form = document.getElementById('response-form');
        const formData = new FormData(form);

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const name = `q_${i}`;
            const val = formData.getAll(name); // returns array

            if (q.required && (val.length === 0 || (val.length === 1 && val[0] === ''))) {
                 errorEl.innerText = `請回答問題：「${q.label}」`;
                 errorEl.classList.remove('hidden');
                 return;
            }
            
            // Store simple string for single val, array for checkboxes
            answers[q.label] = val.length > 1 ? val : (val[0] || "");
        }
        
        app.state.tempAnswers = answers;

        // Check Duplicate
        app.setLoading(true, "檢查提交狀態...");
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
        app.setLoading(true, "正在提交回條...");
        
        const data = {
            surveyId: app.state.selectedSurvey.id,
            studentClass: document.getElementById('input-student-class').value,
            studentName: document.getElementById('input-student-name').value,
            studentId: document.getElementById('input-student-id').value.trim().toUpperCase(),
            parentName: document.getElementById('input-parent-name').value,
            comments: document.getElementById('input-comments').value,
            signatureDataUrl: app.state.signaturePad.canvas.toDataURL(),
            answers: app.state.tempAnswers || {}, // Attach dynamic answers
            securityMetadata: {
                userAgent: navigator.userAgent,
                deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                ipAddress: '127.0.0.1',
                verifiedByPin: true
            }
        };

        try {
            const res = await API.saveResponse(data);
            app.clearDraft(data.surveyId); // Clear draft on success
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
        
        app.setLoading(true, "查詢紀錄中...");
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
        const mobileList = document.getElementById('admin-response-mobile-list');
        
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">載入中...</td></tr>';
        mobileList.innerHTML = '<div class="text-center py-4 text-slate-500">載入中...</div>';
        
        try {
            const responses = await API.getResponses(surveyId);
            app.state.currentAdminResponses = responses; // Save for CSV
            document.getElementById('admin-total-responses').innerText = responses.length;

            // Render Charts
            app.renderAnalytics(responses, survey);

            if(responses.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400">尚無回覆</td></tr>';
                mobileList.innerHTML = '<div class="text-center py-8 text-slate-400">尚無回覆</div>';
                return;
            }

            // Render Desktop Table
            tbody.innerHTML = responses.map(r => `
                <tr class="hover:bg-slate-50">
                     <td class="px-6 py-4">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          ${r.studentClass || '未填'}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="font-bold text-sm">${r.studentName}</div>
                        <div class="text-xs text-slate-500 font-mono">${r.studentId}</div>
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-700 font-medium">${r.parentName}</td>
                    <td class="px-6 py-4 text-xs text-slate-500">${new Date(r.submittedAt).toLocaleString()}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <button onclick='app.showCertificate(${JSON.stringify(r).replace(/'/g, "&#39;")})' class="text-xs bg-brand-50 text-brand-700 px-3 py-1 rounded-full border border-brand-200">詳情</button>
                    </td>
                </tr>
            `).join('');

            // Render Mobile Cards
            mobileList.innerHTML = responses.map(r => `
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                             <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 mb-1">${r.studentClass || '未填'}</span>
                            <div class="font-bold text-slate-900 text-lg">${r.studentName} <span class="text-xs text-slate-500 font-mono font-normal">#${r.studentId}</span></div>
                        </div>
                        <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">${new Date(r.submittedAt).toLocaleDateString()}</span>
                    </div>
                    <div class="text-sm text-slate-600 mb-1"><span class="font-bold text-slate-400 text-xs uppercase mr-2">家長</span>${r.parentName}</div>
                    ${r.comments ? `<div class="text-sm text-slate-500 mb-3 bg-slate-50 p-2 rounded">${r.comments}</div>` : ''}
                    <div class="flex justify-end mt-2">
                         <button onclick='app.showCertificate(${JSON.stringify(r).replace(/'/g, "&#39;")})' class="text-xs font-bold text-brand-600 border border-brand-200 bg-brand-50 px-4 py-2 rounded-lg w-full sm:w-auto">查看詳情 & 驗證</button>
                    </div>
                </div>
            `).join('');

        } catch(e) {
            console.error(e);
        }
    },

    renderAnalytics: (responses, survey) => {
        const container = document.getElementById('admin-analytics-container');
        container.innerHTML = '';
        
        // Destroy old charts to prevent memory leaks
        if (app.state.charts) {
            app.state.charts.forEach(c => c.destroy());
        }
        app.state.charts = [];

        if (!survey.questions || survey.questions.length === 0) return;

        const colors = [
            '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', 
            '#6366f1', '#14b8a6', '#f97316', '#ec4899', '#64748b'
        ];

        survey.questions.forEach((q, idx) => {
            if (q.type === 'text') return; // Skip text questions for charts

            // Create Canvas Container
            const wrapper = document.createElement('div');
            wrapper.className = "bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 flex flex-col";
            wrapper.innerHTML = `
                <h4 class="text-sm font-bold text-slate-800 mb-4 border-l-4 border-brand-500 pl-2">${q.label}</h4>
                <div class="flex-grow flex items-center justify-center relative h-56 sm:h-64">
                    <canvas id="chart-${idx}"></canvas>
                </div>
            `;
            container.appendChild(wrapper);

            // Aggregate Data
            const counts = {};
            q.options.forEach(opt => counts[opt] = 0); // Init with 0

            responses.forEach(r => {
                if (!r.answers) return;
                const ans = r.answers[q.label];
                
                if (Array.isArray(ans)) {
                    // Checkbox
                    ans.forEach(val => {
                        if (counts[val] !== undefined) counts[val]++;
                    });
                } else {
                    // Radio
                    if (counts[ans] !== undefined) counts[ans]++;
                }
            });

            const ctx = document.getElementById(`chart-${idx}`).getContext('2d');
            const config = {
                type: q.type === 'checkbox' ? 'bar' : 'pie', // Bar for multi, Pie for single
                data: {
                    labels: Object.keys(counts),
                    datasets: [{
                        label: '人數',
                        data: Object.values(counts),
                        backgroundColor: q.type === 'checkbox' ? '#0ea5e9' : colors,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            };
            
            const chart = new Chart(ctx, config);
            app.state.charts.push(chart);
        });
    },

    exportCSV: () => {
        const responses = app.state.currentAdminResponses || [];
        if(!responses.length) return alert("無資料可匯出");

        const headers = ["班級", "學生姓名", "學號", "家長姓名", "提交時間", "備註", "回答內容", "驗證狀態", "IP", "流水號"];
        const rows = responses.map(r => {
            // Flatten answers to string
            let answersStr = "";
            if (r.answers) {
                answersStr = Object.entries(r.answers).map(([k, v]) => `${k}: ${Array.isArray(v)?v.join(','):v}`).join(" | ");
            }

            return [
                r.studentClass || "",
                r.studentName,
                r.studentId,
                r.parentName,
                new Date(r.submittedAt).toLocaleString(),
                String(r.comments || "").replace(/(\r\n|\n|\r)/gm, " "),
                answersStr,
                r.securityMetadata?.verifiedByPin ? "已驗證" : "未驗證",
                r.securityMetadata?.ipAddress || "",
                r.id
            ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(",");
        });

        const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `survey_export.csv`;
        link.click();
    },

    openCreateSurveyModal: () => {
        app.state.newSurveyQuestions = [];
        document.getElementById('create-survey-form').reset();
        app.renderQuestionBuilder();
        document.getElementById('modal-create').classList.remove('hidden');
    },

    submitNewSurvey: async (e) => {
        e.preventDefault();
        const data = {
            title: document.getElementById('new-survey-title').value,
            description: document.getElementById('new-survey-desc').value,
            deadline: document.getElementById('new-survey-deadline').value,
            questions: app.state.newSurveyQuestions // Attach questions
        };
        
        // Date check
        if (new Date(data.deadline) < new Date().setHours(0,0,0,0)) {
            return alert("截止日期不可早於今日");
        }

        document.getElementById('modal-create').classList.add('hidden');
        app.setLoading(true, "建立調查中...");

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
        
        let answersHtml = '<div class="text-center text-slate-400 text-sm py-4">無回答內容</div>';
        if (r.answers && Object.keys(r.answers).length > 0) {
            answersHtml = Object.entries(r.answers).map(([label, val]) => `
                <div class="mb-3 border-b border-slate-100 pb-2 last:border-0">
                    <div class="text-xs text-slate-500 font-bold mb-1">${label}</div>
                    <div class="text-sm text-slate-800 break-words">${Array.isArray(val) ? val.join(', ') : val}</div>
                </div>
            `).join('');
        }

        content.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                 <!-- 簽名區塊 -->
                <div class="col-span-1 md:col-span-2">
                    <div class="border-2 border-slate-200 rounded-xl bg-slate-50 h-32 flex items-center justify-center overflow-hidden mb-2 relative">
                        <div class="absolute inset-0 opacity-[0.05]" style="background-image: radial-gradient(#000 1px, transparent 1px); background-size: 10px 10px;"></div>
                        <img src="${r.signatureDataUrl}" class="max-h-24 relative z-10" />
                    </div>
                </div>
                
                <div class="col-span-1 md:col-span-2 mb-2">
                     <span class="inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">
                        ${r.studentClass || '未填班級'} - ${r.studentName}
                     </span>
                </div>

                <!-- 詳細回答區塊 -->
                <div class="col-span-1 md:col-span-2">
                    <h4 class="font-bold text-slate-800 mb-2 flex items-center text-sm sm:text-base">
                        <svg class="w-4 h-4 mr-1 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        填寫內容詳細
                    </h4>
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-h-60 overflow-y-auto">
                        ${answersHtml}
                    </div>
                </div>

                <!-- Metadata -->
                <div class="bg-slate-50 p-3 rounded-lg border">
                    <span class="text-xs text-slate-400 font-bold block">PIN 驗證</span>
                    <span class="font-mono font-bold text-slate-800 text-sm">${r.securityMetadata?.verifiedByPin ? 'PASS' : 'FAIL'}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-lg border">
                    <span class="text-xs text-slate-400 font-bold block">IP 位址</span>
                    <span class="font-mono text-slate-800 text-sm break-all">${r.securityMetadata?.ipAddress || 'Unknown'}</span>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
    }
};

// Start
document.addEventListener('DOMContentLoaded', app.init);
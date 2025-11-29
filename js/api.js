
// Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbwOE9wsOY4ZHYtYDnRxpvmMu3fQr_8VlhuefU-NNs7TSmFGUysqVxNq-w_Z4wmECcHB/exec';

// API Service Object
const API = {
    fetch: async (action, method = 'GET', body = null) => {
        if (!API_URL) throw new Error("API URL not configured");

        let url = `${API_URL}?action=${action}`;
        const options = {
            method,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        };

        if (method === 'POST' && body) {
            options.body = JSON.stringify(body);
        } else if (method === 'GET' && body) {
            Object.keys(body).forEach(key => url += `&${key}=${encodeURIComponent(body[key])}`);
        }

        try {
            const res = await fetch(url, options);
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                console.error("Non-JSON response:", text);
                throw new Error("Server response error");
            }

            if (json.status === 'error') {
                throw new Error(json.message || json.error);
            }
            return json;
        } catch (error) {
            console.error(`API Error (${action}):`, error);
            throw error;
        }
    },

    getSurveys: async () => {
        const data = await API.fetch('getSurveys');
        return data.map(s => ({ ...s, pin: String(s.pin || '') }));
    },

    createSurvey: async (surveyData) => {
        const autoPin = Math.floor(1000 + Math.random() * 9000).toString();
        const newSurvey = {
            ...surveyData,
            id: 's' + Date.now(),
            status: 'ACTIVE',
            createdAt: Date.now(),
            pin: autoPin
        };
        await API.fetch('createSurvey', 'POST', newSurvey);
        return newSurvey;
    },

    getResponses: async (surveyId) => {
        return await API.fetch('getResponses', 'GET', { surveyId });
    },

    checkStudentStatus: async (studentId) => {
        return await API.fetch('checkStudentStatus', 'GET', { studentId });
    },

    hasStudentSubmitted: async (surveyId, studentId) => {
        const responses = await API.getResponses(surveyId);
        const normId = studentId.trim().toLowerCase();
        return responses.some(r => String(r.studentId).trim().toLowerCase() === normId);
    },

    saveResponse: async (data) => {
        // Backend duplicate check exists, but we can do a quick check here too if needed
        const newResponse = {
            ...data,
            id: Math.random().toString(36).substring(7),
            submittedAt: Date.now()
        };
        await API.fetch('saveResponse', 'POST', newResponse);
        return newResponse;
    },

    // --- Announcement ---
    getAnnouncement: async () => {
        return await API.fetch('getAnnouncement');
    },

    saveAnnouncement: async (data) => {
        return await API.fetch('saveAnnouncement', 'POST', data);
    }
};

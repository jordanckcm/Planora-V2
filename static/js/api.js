/* =========================================================
   PLANORA — API CLIENT
   Talks to the Flask backend (app.py) instead of localStorage.
   Everyone's data now lives on the server, in plain lists.
========================================================= */

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
}

async function apiRequest(url, options = {}) {
    let response;
    try {
        response = await fetch(url, {
            method: options.method || "GET",
            headers: { "Content-Type": "application/json" },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
    } catch (networkErr) {
        const offlineError = new Error("No connection right now.");
        offlineError.isOffline = true;
        throw offlineError;
    }

    const raw = await response.text();
    let data = {};
    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch (parseErr) {
            throw new Error(`The server sent back something unexpected (status ${response.status}). Try again.`);
        }
    }

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}


/* =========================
   ACCOUNTS / SESSIONS
========================= */

const Planora = (() => {

    function escapeHTML(str) {
        const div = document.createElement("div");
        div.textContent = str ?? "";
        return div.innerHTML;
    }

    function passwordStrength(password) {
        if (password.length < 8) return { ok: false, message: "At least 8 characters." };
        if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
            return { ok: false, message: "Mix letters and numbers." };
        }
        return { ok: true, message: "" };
    }

    async function signup(username, displayName, password) {
        return apiRequest("/api/signup", { method: "POST", body: { username, displayName, password } });
    }

    async function login(username, password, remember) {
        return apiRequest("/api/login", { method: "POST", body: { username, password, remember } });
    }

    // Wipes every cache api.js keeps in localStorage, not just the
    // identity cache — otherwise the next person to log in on this
    // browser can inherit the previous account's cached event lists.
    async function logout() {
        const result = await apiRequest("/api/logout", { method: "POST" });
        clearAllLocalCaches();
        return result;
    }

    async function getCurrentUser() {
        try {
            const user = await apiRequest("/api/me");
            try { localStorage.setItem("planora_cached_me", JSON.stringify(user)); } catch (e) { /* storage full/unavailable — safe to ignore */ }
            return user;
        } catch (err) {
            if (err.isOffline) {
                const cached = localStorage.getItem("planora_cached_me");
                if (cached) {
                    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
                }
            }
            return null;
        }
    }

    async function requireAuth() {
        const user = await getCurrentUser();
        if (!user) {
            window.location.href = "/login";
            return null;
        }
        return user;
    }

    async function updateProfile(updates) {
        return apiRequest("/api/me", { method: "PUT", body: updates });
    }

    return {
        escapeHTML,
        passwordStrength,
        signup,
        login,
        logout,
        getCurrentUser,
        requireAuth,
        updateProfile
    };

})();

// Removes every localStorage key this app writes, so switching accounts
// on the same browser never leaks one user's cached data to the next.
function clearAllLocalCaches() {
    localStorage.removeItem("planora_started");
    localStorage.removeItem("planora_cached_me");
    Object.keys(localStorage)
        .filter((key) => key.startsWith("planora_cached_events_"))
        .forEach((key) => localStorage.removeItem(key));
}


/* =========================
   EVENTS / COMMENTS
========================= */

const PlanoraData = (() => {

    // Cache key now includes the username so two different accounts
    // sharing a browser never read or overwrite each other's cached
    // Local event list.
    async function getEvents(mode, year) {
        const me = await Planora.getCurrentUser();
        const owner = me ? me.username.toLowerCase() : "anon";
        const cacheKey = `planora_cached_events_${mode}_${year}_${owner}`;

        try {
            const events = await apiRequest(`/api/events?mode=${encodeURIComponent(mode)}&year=${encodeURIComponent(year)}`);
            if (mode === "local") {
                try { localStorage.setItem(cacheKey, JSON.stringify(events)); } catch (e) { /* storage full/unavailable — safe to ignore */ }
            }
            return events;
        } catch (err) {
            if (err.isOffline && mode === "local") {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const events = JSON.parse(cached);
                        events.fromCache = true;
                        return events;
                    } catch (e) { /* fall through to the throw below */ }
                }
            }
            throw err;
        }
    }

    async function addEvent(event) {
        return apiRequest("/api/events", { method: "POST", body: event });
    }

    async function editEvent(eventId, event) {
        return apiRequest(`/api/events/${eventId}`, { method: "PUT", body: event });
    }

    async function addToMyCalendar(eventId) {
        return apiRequest(`/api/events/${eventId}/add`, { method: "POST" });
    }

    async function deleteEvent(eventId) {
        return apiRequest(`/api/events/${eventId}`, { method: "DELETE" });
    }

    async function adminDeleteEvent(eventId) {
        return apiRequest(`/api/admin/events/${eventId}`, { method: "DELETE" });
    }

    async function getComments(eventId) {
        return apiRequest(`/api/events/${eventId}/comments`);
    }

    async function addComment(eventId, text) {
        return apiRequest(`/api/events/${eventId}/comments`, { method: "POST", body: { text } });
    }

    async function deleteComment(eventId, commentId) {
        return apiRequest(`/api/events/${eventId}/comments/${commentId}`, { method: "DELETE" });
    }

    async function editComment(eventId, commentId, text) {
        return apiRequest(`/api/events/${eventId}/comments/${commentId}`, { method: "PUT", body: { text } });
    }

    async function getStats() {
        return apiRequest("/api/stats");
    }

    return {
        getEvents,
        addEvent,
        editEvent,
        addToMyCalendar,
        deleteEvent,
        adminDeleteEvent,
        getComments,
        addComment,
        deleteComment,
        editComment,
        getStats
    };

})();

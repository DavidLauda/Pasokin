import axios from 'axios';

const sessionKey = 'pasokin.auth.session';
export const getSession = () => {
    try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); }
    catch { return null; }
};
export const saveSession = session => {
    localStorage.setItem(sessionKey, JSON.stringify(session));
    window.dispatchEvent(new Event('pasokin:auth-changed'));
};
export const clearSession = () => {
    localStorage.removeItem(sessionKey);
    window.dispatchEvent(new Event('pasokin:auth-changed'));
};

const client = axios.create({
    baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api'),
    headers: {
        'Content-Type': 'application/json'
    }
});

let refreshPromise = null;
client.interceptors.request.use(async config => {
    if (/\/auth\/(login|register|refresh)$/.test(config.url || '')) return config;
    let session = getSession();
    if (session?.refresh_token && session.expires_at * 1000 < Date.now() + 60_000) {
        refreshPromise ||= axios.post(`${client.defaults.baseURL}/auth/refresh`, {
            refresh_token: session.refresh_token
        }).then(response => {
            saveSession(response.data);
            return response.data;
        }).catch(error => {
            clearSession();
            throw error;
        }).finally(() => { refreshPromise = null; });
        session = await refreshPromise;
    }
    if (session?.access_token) config.headers.Authorization = `Bearer ${session.access_token}`;
    return config;
});

client.interceptors.response.use(response => response, error => {
    if (error.response?.status === 401 && !/\/auth\/(login|register)$/.test(error.config?.url || '')) {
        clearSession();
    }
    return Promise.reject(error);
});

export default client;

import axios from 'axios';

const client = axios.create({
    baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api'),
    headers: {
        'Content-Type': 'application/json'
    }
});

export default client;

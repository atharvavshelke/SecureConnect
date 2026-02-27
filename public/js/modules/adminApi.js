export const adminApi = {
    getToken() {
        return localStorage.getItem('admin_token');
    },

    async get(endpoint) {
        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${this.getToken()}`
            }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `GET ${endpoint} failed: ${response.statusText}`);
        }
        return response.json();
    },

    async post(endpoint, data = {}) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getToken()}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `POST ${endpoint} failed: ${response.statusText}`);
        }
        return response.json();
    },

    async delete(endpoint) {
        const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`
            }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `DELETE ${endpoint} failed: ${response.statusText}`);
        }
        return response.json();
    }
};

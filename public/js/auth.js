// Authentication handling

function switchToRegister() {
    document.getElementById('loginCard').classList.add('hidden');
    document.getElementById('registerCard').classList.remove('hidden');
}

function switchToLogin() {
    document.getElementById('registerCard').classList.add('hidden');
    document.getElementById('loginCard').classList.remove('hidden');
}

function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.classList.add('show');

    setTimeout(() => {
        errorElement.classList.remove('show');
    }, 5000);
}

// Logout handler
async function logout() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (e) {
            console.error('Logout failed', e);
        }
    }

    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    // We DON'T remove the keys to be user-friendly on this device, 
    // but strict mode might require it. For now let's keep them 
    // or maybe removing them is safer for "logout". 
    // User requested "logout of old device first", suggesting session termination.
    // Let's clear keys to be safe and force re-decryption on login.
    const username = localStorage.getItem('username'); // oh we just removed it
    // Actually, iterate and remove known keys or just leave them?
    // If we leave them, next login can skip decryption if we implement that check.
    // But to be consistent with "access from any device", let's rely on the server key.
    // Let's clear keys for the specific user if possible, but we might not know who it was if we cleared username.

    window.location.href = '/';
}


// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    await performLogin(username, password);
});

async function performLogin(username, password, forceLogin = false) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, forceLogin })
        });

        const data = await response.json();

        if (response.status === 403 && data.requiresForceLogin) {
            if (confirm("You are logged in on another device (or previous session stuck). Do you want to force login here? This will log you out elsewhere.")) {
                await performLogin(username, password, true);
            }
            return;
        }

        if (response.ok) {
            // Store token
            localStorage.setItem('token', data.token);
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('username', data.username);

            // Handle Private Key
            if (data.encryptedPrivateKey) {
                try {
                    await secureEncryption.decryptPrivateKeyWithPassword(password, data.encryptedPrivateKey);

                    // Handle Public Key (Sync from server)
                    if (data.publicKey) {
                        secureEncryption.publicKey = await secureEncryption.importPublicKey(data.publicKey);
                    }

                    secureEncryption.storeKeys(data.username);
                } catch (decryptErr) {
                    console.error('Decryption failed', decryptErr);
                    showError('loginError', 'Failed to decrypt your private key. Password might be wrong (logic error) or key corrupted.');
                    return;
                }
            } else {
                // No key on server. Check local.
                await secureEncryption.loadKeys(data.username);
                if (secureEncryption.privateKey) {
                    // We have a local key but server doesn't. SYNC IT.
                    console.log('Syncing private key to server...');
                    const encryptedPrivateKey = await secureEncryption.encryptPrivateKeyWithPassword(password);

                    await fetch('/api/user/sync-key', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${data.token}`
                        },
                        body: JSON.stringify({ encryptedPrivateKey })
                    });
                } else {
                    // No key anywhere. This is bad for an existing user.
                    console.warn('No private key found for user.');
                }
            }

            // Redirect to chat
            window.location.href = '/chat';
        } else {
            showError('loginError', data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('loginError', 'Connection error. Please try again.');
    }
}

// Register form handler
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;

    if (password.length < 6) {
        showError('registerError', 'Password must be at least 6 characters long');
        return;
    }

    try {
        // Update status
        const statusText = document.querySelector('#registerCard .status-text');
        statusText.textContent = 'Generating encryption keys...';

        // Generate encryption keys
        const publicKey = await secureEncryption.generateKeyPair();

        // Encrypt private key with password
        statusText.textContent = 'Encrypting keys...';
        const encryptedPrivateKey = await secureEncryption.encryptPrivateKeyWithPassword(password);

        // Store private key locally for this user
        secureEncryption.storeKeys(username);

        statusText.textContent = 'Creating account...';

        // Register user
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                email,
                password,
                publicKey,
                encryptedPrivateKey
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Store token
            localStorage.setItem('token', data.token);
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('username', data.username);

            // Show success message
            statusText.textContent = 'Account created! Redirecting...';

            // Redirect to chat
            setTimeout(() => {
                window.location.href = '/chat';
            }, 1000);
        } else {
            statusText.textContent = 'Generating Keys...';
            showError('registerError', data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        const statusText = document.querySelector('#registerCard .status-text');
        statusText.textContent = 'Generating Keys...';
        showError('registerError', 'Connection error. Please try again.');
    }
});

// Check if already logged in
const token = localStorage.getItem('token');
const savedUsername = localStorage.getItem('username');
if (token && window.location.pathname === '/' && savedUsername) {
    // Verify token is still valid
    fetch('/api/user/me', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
        .then(async response => {
            if (response.ok) {
                const userData = await response.json();

                // Load keys - try local first
                await secureEncryption.loadKeys(savedUsername);

                // If local missing but server has it? 
                // We can't decrypt without password! 
                // So we actually need to FORCE login if local keys are missing 
                // but we are "remembered".

                if (!secureEncryption.privateKey && userData.encrypted_private_key) {
                    // We need password to decrypt. Redirect to login?
                    // Or prompt? For simplicity, treat as logged out if keys missing.
                    console.log('Keys missing locally, need login to decrypt.');
                    logout();
                    return;
                }

                window.location.href = '/chat';
            } else {
                throw new Error('Token invalid or session expired');
            }
        })
        .catch((e) => {
            console.log('Session check failed:', e);
            // Token invalid or other error, clear session
            localStorage.removeItem('token');
        });
}

// Attach logout to any logout buttons if they exist
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
});

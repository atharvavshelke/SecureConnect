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

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Load existing encryption keys
            await secureEncryption.loadKeys();
            
            // Store token
            localStorage.setItem('token', data.token);
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('username', data.username);
            
            // Redirect to chat
            window.location.href = '/chat';
        } else {
            showError('loginError', data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('loginError', 'Connection error. Please try again.');
    }
});

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
        
        // Store private key locally
        secureEncryption.storeKeys();
        localStorage.setItem('secureconnect_public_key', publicKey);
        
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
                publicKey 
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
if (token && window.location.pathname === '/') {
    // Verify token is still valid
    fetch('/api/user/me', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (response.ok) {
            window.location.href = '/chat';
        }
    })
    .catch(() => {
        // Token invalid, stay on login page
        localStorage.removeItem('token');
    });
}

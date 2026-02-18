const BASE_URL = 'http://localhost:3001';
let userToken = '';
let userId = '';

async function test() {
    console.log('--- Starting Verification ---');

    // 1. Register
    const uniqueId = Date.now();
    const username = `testuser_${uniqueId}`;
    const email = `test_${uniqueId}@device.com`;
    const password = 'password123';

    console.log(`1. Registering User: ${username}...`);
    const regRes = await fetch(`${BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            password,
            email,
            publicKey: 'dummy-public-key',
            encryptedPrivateKey: 'dummy-encrypted-private-key'
        })
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
    console.log('Registration successful:', regData.username);
    userToken = regData.token;
    userId = regData.userId;

    // 2. Check "Already Logged In" (Registration auto-logs in)
    console.log('2. Verifying Single Device Constraint (Login while logged in)...');
    const loginRes1 = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            password
        })
    });

    if (loginRes1.status === 403) {
        // Check if it asks for force login
        const data = await loginRes1.json();
        if (data.requiresForceLogin) {
            console.log('Success: Blocked concurrent login and offered Force Login.');
        } else {
            console.log('Success: Blocked concurrent login.');
        }
    } else {
        const data = await loginRes1.json();
        throw new Error(`Failed constraint check. Status: ${loginRes1.status}, Body: ${JSON.stringify(data)}`);
    }

    // 3. Force Login Check
    console.log('3. Verifying Force Login...');

    const forceLoginRes = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            password,
            forceLogin: true
        })
    });

    const forceLoginData = await forceLoginRes.json();
    if (!forceLoginRes.ok) throw new Error(`Force login failed: ${JSON.stringify(forceLoginData)}`);
    console.log('Force Login successful');
    userToken = forceLoginData.token; // Update token

    // Validate we are logged in (can hit protected route)
    const checkRes = await fetch(`${BASE_URL}/api/user/me`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
    });
    if (!checkRes.ok) throw new Error('Force login session invalid');

    // 4. Logout (Clean up)
    console.log('4. Logging out...');
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}` }
    });
    if (!logoutRes.ok) throw new Error('Logout failed');
    console.log('Logout successful');

    // 5. Login Normal (Should succeed now)
    console.log('5. Logging in (Normal)...');
    const loginRes2 = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            password
        })
    });
    const loginData = await loginRes2.json();
    if (!loginRes2.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);

    // Check if key is returned
    if (loginData.encryptedPrivateKey === 'dummy-encrypted-private-key') {
        console.log('Success: Encrypted private key retrieved.');
    } else {
        throw new Error('Private key not returned or mismatched.');
    }

    // Check if public key is returned
    if (loginData.publicKey === 'dummy-public-key') {
        console.log('Success: Public key retrieved.');
    } else {
        throw new Error('Public key not returned or mismatched.');
    }

    console.log('--- Verification Complete: ALL TESTS PASSED ---');
}

test().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});

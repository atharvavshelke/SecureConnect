# SecureConnect Deployment Guide
## AWS EC2 Ubuntu 24.04 LTS Deployment

### Prerequisites
- AWS EC2 instance running Ubuntu 24.04 LTS
- SC.pem key file for SSH access
- Security group configured to allow:
  - Port 22 (SSH)
  - Port 3000 (Application) or your chosen port
  - Port 80 (optional, if using reverse proxy)
  - Port 443 (optional, if adding SSL later)

---

## Step 1: Connect to Your EC2 Instance

```bash
# Set proper permissions for your key file
chmod 400 SC.pem

# Connect to your EC2 instance (replace YOUR_EC2_IP with actual IP)
ssh -i SC.pem ubuntu@YOUR_EC2_IP
```

---

## Step 2: Update System and Install Dependencies

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x

# Install build tools (needed for some npm packages)
sudo apt install -y build-essential

# Install PM2 for process management
sudo npm install -g pm2
```

---

## Step 3: Upload SecureConnect Files to EC2

### Option A: Using SCP (from your local machine)

```bash
# From your local machine, navigate to the secureconnect folder
cd /path/to/secureconnect

# Upload the entire folder to EC2
scp -i SC.pem -r . ubuntu@YOUR_EC2_IP:~/secureconnect/
```

### Option B: Using Git (if you have the code in a repository)

```bash
# On EC2 instance
cd ~
git clone YOUR_REPOSITORY_URL secureconnect
cd secureconnect
```

### Option C: Manual File Creation (create files on EC2)

```bash
# On EC2 instance, create the directory structure
mkdir -p ~/secureconnect/{public/{css,js},views,admin}
cd ~/secureconnect

# Then create each file manually using nano or vim
# Example:
nano server.js
# [Paste content and save with Ctrl+X, Y, Enter]
```

---

## Step 4: Configure the Application

```bash
cd ~/secureconnect

# Open server.js and update these settings:
nano server.js

# Important: Change these values in server.js:
# 1. JWT_SECRET - Line ~16: Change to a secure random string
# 2. ADMIN_PASSWORD - Line ~17: Change from 'admin123' to a strong password
# 3. PORT - Line ~15: Keep as 3000 or change to your preference

# Example changes:
# const JWT_SECRET = 'your-super-secure-random-string-here-' + Math.random();
# const ADMIN_PASSWORD = 'YourStrongAdminPassword123!';
# const PORT = process.env.PORT || 3000;
```

---

## Step 5: Install Node Modules

```bash
cd ~/secureconnect
npm install
```

---

## Step 6: Configure EC2 Security Group

### AWS Console Steps:
1. Go to EC2 Dashboard
2. Select your instance
3. Click on "Security" tab
4. Click on the security group name
5. Click "Edit inbound rules"
6. Add rule:
   - Type: Custom TCP
   - Port: 3000 (or your chosen port)
   - Source: 0.0.0.0/0 (for public access) or specific IP ranges
7. Save rules

---

## Step 7: Start the Application

### Option A: Quick Test (temporary)

```bash
cd ~/secureconnect
node server.js

# You should see:
# SecureConnect server running on port 3000
# Access at: http://YOUR_EC2_IP:3000
# Admin panel: http://YOUR_EC2_IP:3000/admin-panel
# Default admin account created - Username: admin, Password: admin123
```

### Option B: Production with PM2 (recommended)

```bash
cd ~/secureconnect

# Start with PM2
pm2 start server.js --name secureconnect

# Enable auto-restart on system reboot
pm2 startup
# Follow the command it outputs (will be something like):
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu

pm2 save

# Useful PM2 commands:
pm2 status              # Check status
pm2 logs secureconnect  # View logs
pm2 restart secureconnect  # Restart app
pm2 stop secureconnect     # Stop app
pm2 delete secureconnect   # Remove from PM2
```

---

## Step 8: Access Your Application

### Main Application
```
http://YOUR_EC2_IP:3000
```

### Admin Panel
```
http://YOUR_EC2_IP:3000/admin-panel
```

### Default Admin Credentials
- **Username:** admin
- **Password:** admin123 (or whatever you changed it to)

**IMPORTANT:** Change the admin password immediately after first login!

---

## Step 9: Using the Application

### For Users:
1. **Register:** Create an account at `http://YOUR_EC2_IP:3000`
   - Encryption keys are automatically generated
   - You receive 10 free credits
2. **Login:** Use your credentials to access the chat
3. **Chat:** Select a user from the sidebar to start chatting
4. **Buy Credits:** Click "Buy Credits" to request more credits
   - Each message costs 1 credit
   - Submit payment reference for admin approval

### For Admin:
1. **Login:** Access admin panel at `http://YOUR_EC2_IP:3000/admin-panel`
2. **Review Transactions:** View pending credit purchase requests
3. **Verify Payment:** Check the transaction reference
4. **Approve/Reject:** Approve valid transactions to add credits

---

## Step 10: Security Hardening (Optional but Recommended)

### Change Admin Password in Code

```bash
cd ~/secureconnect
nano server.js

# Find line ~17 and change:
const ADMIN_PASSWORD = 'YourVeryStrongPasswordHere123!@#';

# Save and restart
pm2 restart secureconnect
```

### Setup Firewall

```bash
# Enable UFW firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3000/tcp  # Application
sudo ufw enable
sudo ufw status
```

### Setup HTTPS with Nginx (Optional - for production)

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/secureconnect

# Add this configuration:
server {
    listen 80;
    server_name YOUR_EC2_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Enable the site
sudo ln -s /etc/nginx/sites-available/secureconnect /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Now you can access via http://YOUR_EC2_IP (without :3000)
```

---

## Step 11: Monitoring and Maintenance

### View Logs

```bash
# Application logs
pm2 logs secureconnect

# System logs
journalctl -u pm2-ubuntu
```

### Backup Database

```bash
# The database is stored in secureconnect.db
cd ~/secureconnect
cp secureconnect.db secureconnect.db.backup

# For regular backups, create a cron job:
crontab -e

# Add this line to backup daily at 2 AM:
0 2 * * * cp ~/secureconnect/secureconnect.db ~/secureconnect/backups/db-$(date +\%Y\%m\%d).db
```

### Update Application

```bash
cd ~/secureconnect

# Pull latest changes (if using Git)
git pull

# Or upload new files via SCP

# Install any new dependencies
npm install

# Restart application
pm2 restart secureconnect
```

---

## Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs secureconnect

# Check if port is in use
sudo lsof -i :3000

# Check Node.js version
node --version  # Should be 20.x
```

### Can't connect from browser
```bash
# Check if application is running
pm2 status

# Check security group allows port 3000
# Check firewall
sudo ufw status

# Test from EC2 itself
curl http://localhost:3000
```

### Database errors
```bash
# Check database file permissions
cd ~/secureconnect
ls -l secureconnect.db

# If needed, fix permissions
chmod 644 secureconnect.db
```

### WebSocket connection issues
```bash
# Ensure Socket.io port is accessible
# Check that there's no firewall blocking WebSocket connections
# Try accessing directly: http://YOUR_EC2_IP:3000/socket.io/socket.io.js
```

---

## Architecture Overview

### Technology Stack
- **Backend:** Node.js with Express
- **Database:** SQLite
- **Real-time:** Socket.io
- **Encryption:** Web Crypto API (RSA-2048 + AES-256-GCM)
- **Authentication:** JWT

### Security Features
- End-to-end encryption (E2E)
- Password hashing with bcrypt
- JWT token authentication
- No message storage on server (only encrypted)
- Client-side key generation

### Database Schema
- **users:** User accounts with encrypted public keys
- **messages:** Encrypted messages
- **credit_transactions:** Payment verification records

---

## Important Notes

1. **Encryption Keys:** Users generate their own encryption keys in the browser. Keys are stored in browser localStorage. Clearing browser data will lose access to past messages.

2. **Admin Password:** Change the default admin password immediately in server.js (line ~17).

3. **Credits:** Messages cost 1 credit each. Users start with 10 free credits.

4. **Payment Processing:** This is a manual verification system. Admin reviews transaction references and approves credits.

5. **Backups:** Regularly backup the secureconnect.db file.

6. **Updates:** Keep Node.js and npm packages updated for security.

---

## Support

For issues or questions:
1. Check application logs: `pm2 logs secureconnect`
2. Check system logs: `journalctl -u pm2-ubuntu`
3. Verify all ports are open in security group
4. Ensure Node.js version is 20.x or higher

---

## Default Credentials

**Admin Login:**
- URL: http://YOUR_EC2_IP:3000/admin-panel
- Username: admin
- Password: admin123 (CHANGE THIS!)

**User Registration:**
- URL: http://YOUR_EC2_IP:3000
- Create your own account
- 10 free credits included

---

**Your SecureConnect application is now deployed and ready to use!**

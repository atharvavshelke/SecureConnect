#!/bin/bash

# SecureConnect Domain & HTTPS Setup Script
# This script automates the setup of Nginx, domain, and SSL certificate

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="secureconnect.space"
APP_PORT=3000

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SecureConnect Domain & HTTPS Setup Script       ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo ""

# Function to print step headers
print_step() {
    echo -e "\n${GREEN}▶ $1${NC}"
    echo -e "${GREEN}$( printf '━%.0s' {1..50} )${NC}"
}

# Function to print success messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print warnings
print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Function to print errors
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should NOT be run as root (don't use sudo)"
   echo "The script will ask for sudo password when needed."
   exit 1
fi

# Get email for SSL certificate
echo -e "${YELLOW}Please enter your email address for SSL certificate notifications:${NC}"
read -p "Email: " EMAIL

if [[ -z "$EMAIL" ]]; then
    print_error "Email is required for SSL certificate"
    exit 1
fi

# Confirm domain
echo ""
echo -e "${YELLOW}Domain to configure: ${GREEN}${DOMAIN}${NC}"
echo -e "${YELLOW}App running on port: ${GREEN}${APP_PORT}${NC}"
echo ""
read -p "Is this correct? (y/n): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    print_error "Setup cancelled"
    exit 1
fi

# ============================================================
# STEP 1: Update System
# ============================================================
print_step "STEP 1: Updating system packages"

sudo apt update
print_success "System packages updated"

# ============================================================
# STEP 2: Install Nginx
# ============================================================
print_step "STEP 2: Installing Nginx"

if command -v nginx &> /dev/null; then
    print_warning "Nginx is already installed"
else
    sudo apt install nginx -y
    print_success "Nginx installed successfully"
fi

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
print_success "Nginx started and enabled"

# ============================================================
# STEP 3: Configure Nginx for SecureConnect
# ============================================================
print_step "STEP 3: Configuring Nginx"

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/secureconnect > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Client body size limit
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

print_success "Nginx configuration created"

# Enable the site
sudo ln -sf /etc/nginx/sites-available/secureconnect /etc/nginx/sites-enabled/
print_success "Site configuration enabled"

# Remove default site if exists
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm /etc/nginx/sites-enabled/default
    print_success "Default site removed"
fi

# Test Nginx configuration
if sudo nginx -t; then
    print_success "Nginx configuration is valid"
else
    print_error "Nginx configuration has errors"
    exit 1
fi

# Restart Nginx
sudo systemctl restart nginx
print_success "Nginx restarted"

# ============================================================
# STEP 4: Check Firewall and Ports
# ============================================================
print_step "STEP 4: Checking firewall and ports"

# Check if UFW is active
if sudo ufw status | grep -q "Status: active"; then
    print_warning "UFW firewall is active, configuring rules..."
    
    # Allow necessary ports
    sudo ufw allow 22/tcp comment 'SSH'
    sudo ufw allow 80/tcp comment 'HTTP'
    sudo ufw allow 443/tcp comment 'HTTPS'
    sudo ufw allow ${APP_PORT}/tcp comment 'Node.js App'
    
    print_success "Firewall rules configured"
else
    print_warning "UFW firewall is not active"
    echo "  You may need to configure AWS Security Groups manually"
fi

# Check if app is running
if nc -z localhost ${APP_PORT} 2>/dev/null; then
    print_success "App is running on port ${APP_PORT}"
else
    print_warning "App doesn't appear to be running on port ${APP_PORT}"
    echo "  Make sure your Node.js app is running before proceeding"
fi

# ============================================================
# STEP 5: Test HTTP Access
# ============================================================
print_step "STEP 5: Testing HTTP access"

# Get server IP
SERVER_IP=$(curl -s ifconfig.me)
echo "Server IP: ${SERVER_IP}"

# Test localhost
if curl -s http://localhost > /dev/null; then
    print_success "Nginx is serving content on localhost"
else
    print_error "Nginx is not responding on localhost"
fi

# ============================================================
# STEP 6: DNS Configuration Instructions
# ============================================================
print_step "STEP 6: DNS Configuration (Action Required)"

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}         DNS CONFIGURATION REQUIRED IN HOSTINGER        ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "1. Go to Hostinger dashboard"
echo "2. Navigate to: Domains → ${DOMAIN} → DNS Zone"
echo "3. Add the following A records:"
echo ""
echo -e "   ${GREEN}┌─────────┬──────┬─────────────────┬──────┐${NC}"
echo -e "   ${GREEN}│ Type    │ Name │ Value           │ TTL  │${NC}"
echo -e "   ${GREEN}├─────────┼──────┼─────────────────┼──────┤${NC}"
echo -e "   ${GREEN}│ A       │ @    │ ${SERVER_IP} │ 3600 │${NC}"
echo -e "   ${GREEN}│ A       │ www  │ ${SERVER_IP} │ 3600 │${NC}"
echo -e "   ${GREEN}└─────────┴──────┴─────────────────┴──────┘${NC}"
echo ""
echo "4. Save the changes"
echo "5. Wait 5-60 minutes for DNS propagation"
echo ""

read -p "Press ENTER after you've configured DNS in Hostinger..."

# Check DNS propagation
echo ""
print_step "Checking DNS propagation"

echo "Checking if ${DOMAIN} points to ${SERVER_IP}..."
sleep 2

DNS_IP=$(dig +short ${DOMAIN} @8.8.8.8 | head -n1)

if [ "$DNS_IP" == "$SERVER_IP" ]; then
    print_success "DNS is configured correctly! ${DOMAIN} → ${SERVER_IP}"
    DNS_READY=true
else
    print_warning "DNS not propagated yet"
    echo "  Current DNS: ${DNS_IP:-Not found}"
    echo "  Expected: ${SERVER_IP}"
    echo ""
    echo "DNS propagation can take up to 48 hours (usually 5-60 minutes)"
    echo "Check status at: https://dnschecker.org"
    echo ""
    read -p "Continue anyway to install SSL? (y/n): " CONTINUE_SSL
    
    if [[ ! "$CONTINUE_SSL" =~ ^[Yy]$ ]]; then
        print_warning "Setup paused. Run this script again after DNS propagates."
        exit 0
    fi
    DNS_READY=false
fi

# ============================================================
# STEP 7: AWS Security Group Check
# ============================================================
print_step "STEP 7: AWS Security Group Configuration (Action Required)"

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}    AWS SECURITY GROUP CONFIGURATION REQUIRED          ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "1. Go to AWS EC2 Console"
echo "2. Select your instance"
echo "3. Security tab → Click Security Group"
echo "4. Edit Inbound Rules → Add these rules:"
echo ""
echo -e "   ${GREEN}┌──────────┬──────────┬──────┬────────────┐${NC}"
echo -e "   ${GREEN}│ Type     │ Protocol │ Port │ Source     │${NC}"
echo -e "   ${GREEN}├──────────┼──────────┼──────┼────────────┤${NC}"
echo -e "   ${GREEN}│ HTTP     │ TCP      │ 80   │ 0.0.0.0/0  │${NC}"
echo -e "   ${GREEN}│ HTTPS    │ TCP      │ 443  │ 0.0.0.0/0  │${NC}"
echo -e "   ${GREEN}└──────────┴──────────┴──────┴────────────┘${NC}"
echo ""
echo "5. Save the rules"
echo ""

read -p "Press ENTER after you've configured AWS Security Groups..."

# ============================================================
# STEP 8: Install Certbot for SSL
# ============================================================
print_step "STEP 8: Installing Certbot (Let's Encrypt SSL)"

if command -v certbot &> /dev/null; then
    print_warning "Certbot is already installed"
else
    sudo apt install certbot python3-certbot-nginx -y
    print_success "Certbot installed successfully"
fi

# ============================================================
# STEP 9: Obtain SSL Certificate
# ============================================================
print_step "STEP 9: Obtaining SSL Certificate"

if [ "$DNS_READY" = true ]; then
    echo "Obtaining SSL certificate for ${DOMAIN}..."
    echo ""
    
    if sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --email ${EMAIL} --agree-tos --no-eff-email --redirect; then
        print_success "SSL certificate obtained successfully!"
        print_success "HTTPS is now enabled with automatic HTTP→HTTPS redirect"
    else
        print_error "Failed to obtain SSL certificate"
        echo ""
        echo "Common issues:"
        echo "  1. DNS not propagated yet (wait and try: sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN})"
        echo "  2. Port 80 blocked in Security Group"
        echo "  3. Domain not pointing to this server"
        exit 1
    fi
else
    print_warning "Skipping SSL certificate (DNS not ready)"
    echo ""
    echo "After DNS propagates, run this command to get SSL:"
    echo -e "${GREEN}sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --email ${EMAIL} --agree-tos --no-eff-email --redirect${NC}"
fi

# ============================================================
# STEP 10: Test Auto-Renewal
# ============================================================
if [ "$DNS_READY" = true ]; then
    print_step "STEP 10: Testing SSL auto-renewal"
    
    if sudo certbot renew --dry-run; then
        print_success "SSL auto-renewal is configured correctly"
    else
        print_warning "SSL auto-renewal test had issues (might still work)"
    fi
fi

# ============================================================
# FINAL SUMMARY
# ============================================================
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              SETUP COMPLETE! 🎉                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}Your site is now accessible at:${NC}"
echo ""

if [ "$DNS_READY" = true ]; then
    echo -e "  ${GREEN}✓ https://${DOMAIN}${NC}"
    echo -e "  ${GREEN}✓ https://www.${DOMAIN}${NC}"
    echo -e "  ${GREEN}✓ http://${DOMAIN} ${NC}(auto-redirects to HTTPS)"
    echo -e "  ${GREEN}✓ http://www.${DOMAIN} ${NC}(auto-redirects to HTTPS)"
else
    echo -e "  ${YELLOW}⏳ http://${DOMAIN} ${NC}(after DNS propagates)"
    echo -e "  ${YELLOW}⏳ https://${DOMAIN} ${NC}(run certbot command above)"
fi

echo ""
echo -e "  ${GREEN}✓ Admin Panel: https://${DOMAIN}/admin-panel${NC}"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Test your site in a browser"
echo "2. Change default admin password (currently: admin123)"
echo "3. Update JWT_SECRET in server.js"
echo "4. Set up database backups"
echo ""

echo -e "${YELLOW}Useful Commands:${NC}"
echo ""
echo "  # Check Nginx status"
echo "  sudo systemctl status nginx"
echo ""
echo "  # Restart Nginx"
echo "  sudo systemctl restart nginx"
echo ""
echo "  # Check SSL certificate"
echo "  sudo certbot certificates"
echo ""
echo "  # Renew SSL manually"
echo "  sudo certbot renew"
echo ""
echo "  # View Nginx logs"
echo "  sudo tail -f /var/log/nginx/error.log"
echo ""

print_success "Setup script completed successfully!"

#!/bin/bash

# SecureConnect Setup Script for Ubuntu 24.04 LTS
# This script automates the initial setup process

set -e

echo "================================================"
echo "SecureConnect Setup Script"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}Please do not run this script as root${NC}"
    exit 1
fi

echo -e "${GREEN}Step 1: Checking Node.js installation...${NC}"
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    NODE_VERSION=$(node -v)
    echo "Node.js already installed: $NODE_VERSION"
fi

echo -e "${GREEN}Step 2: Installing build tools...${NC}"
sudo apt install -y build-essential

echo -e "${GREEN}Step 3: Installing PM2 process manager...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    echo "PM2 installed successfully"
else
    echo "PM2 already installed"
fi

echo -e "${GREEN}Step 4: Installing project dependencies...${NC}"
npm install

echo ""
echo -e "${YELLOW}Step 5: Configuration${NC}"
echo "Please update the following in server.js:"
echo "  - Line ~17: Change ADMIN_PASSWORD from 'admin123'"
echo "  - Line ~16: Update JWT_SECRET for production"
echo ""
read -p "Have you updated these values? (y/n) " -n 1 -r
echo
if [[ ! $RULE =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Please edit server.js before continuing${NC}"
    echo "Run: nano server.js"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 6: Starting SecureConnect...${NC}"
pm2 start server.js --name secureconnect
pm2 save

echo ""
echo -e "${GREEN}Step 7: Setting up auto-restart on boot...${NC}"
pm2 startup
echo ""
echo -e "${YELLOW}IMPORTANT: Copy and run the command shown above to enable auto-restart${NC}"
echo ""

# Get IP address
IP_ADDRESS=$(hostname -I | awk '{print $1}')

echo ""
echo "================================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "================================================"
echo ""
echo "Access your application at:"
echo -e "  Main app:     ${GREEN}http://$IP_ADDRESS:3000${NC}"
echo -e "  Admin panel:  ${GREEN}http://$IP_ADDRESS:3000/admin-panel${NC}"
echo ""
echo "Default admin credentials:"
echo "  Username: admin"
echo "  Password: [the one you set in server.js]"
echo ""
echo "Useful commands:"
echo "  pm2 status              - Check application status"
echo "  pm2 logs secureconnect  - View logs"
echo "  pm2 restart secureconnect - Restart application"
echo "  pm2 stop secureconnect    - Stop application"
echo ""
echo -e "${YELLOW}Don't forget to configure your EC2 security group to allow port 3000!${NC}"
echo ""

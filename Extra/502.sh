#!/bin/bash

# 502 Bad Gateway Fix Script
# This script diagnoses and fixes the 502 error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         502 Bad Gateway Troubleshooter             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Node.js app is running
echo -e "${YELLOW}Checking if app is running on port 3000...${NC}"
if nc -z localhost 3000 2>/dev/null; then
    echo -e "${GREEN}✓ App is running on port 3000${NC}"
    echo ""
    echo "App is running but Nginx can't connect to it."
    echo "This is unusual. Let's check Nginx configuration..."
    
    # Check Nginx config
    if sudo nginx -t; then
        echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
        echo ""
        echo "Try restarting Nginx:"
        echo "  sudo systemctl restart nginx"
    else
        echo -e "${RED}✗ Nginx configuration has errors${NC}"
        echo "Fix the errors shown above, then restart Nginx"
    fi
else
    echo -e "${RED}✗ App is NOT running on port 3000${NC}"
    echo ""
    echo -e "${YELLOW}This is the problem! Your Node.js app needs to be running.${NC}"
    echo ""
fi

# Check Node.js processes
echo ""
echo -e "${YELLOW}Checking for Node.js processes...${NC}"
NODE_PROCESSES=$(ps aux | grep node | grep -v grep)
if [ -z "$NODE_PROCESSES" ]; then
    echo -e "${RED}✗ No Node.js processes found${NC}"
else
    echo -e "${GREEN}✓ Found Node.js processes:${NC}"
    echo "$NODE_PROCESSES"
fi

# Check PM2 if installed
echo ""
echo -e "${YELLOW}Checking PM2...${NC}"
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✓ PM2 is installed${NC}"
    pm2 list
    echo ""
    
    if pm2 list | grep -q "secureconnect"; then
        echo -e "${YELLOW}PM2 shows secureconnect app, but it might be stopped or errored.${NC}"
        echo ""
        echo -e "${GREEN}To restart your app with PM2:${NC}"
        echo "  cd ~/secureconnect"
        echo "  pm2 restart secureconnect"
        echo "  pm2 logs secureconnect"
    else
        echo -e "${YELLOW}secureconnect app not found in PM2${NC}"
        echo ""
        echo -e "${GREEN}To start your app with PM2:${NC}"
        echo "  cd ~/secureconnect"
        echo "  pm2 start server.js --name secureconnect"
        echo "  pm2 save"
        echo "  pm2 startup"
    fi
else
    echo -e "${YELLOW}PM2 is not installed${NC}"
    echo ""
    echo -e "${GREEN}To start your app manually:${NC}"
    echo "  cd ~/secureconnect"
    echo "  node server.js"
    echo ""
    echo -e "${GREEN}Or install PM2 for automatic management:${NC}"
    echo "  npm install -g pm2"
    echo "  cd ~/secureconnect"
    echo "  pm2 start server.js --name secureconnect"
    echo "  pm2 save"
    echo "  pm2 startup"
fi

# Check if app directory exists
echo ""
echo -e "${YELLOW}Checking app directory...${NC}"
if [ -d "$HOME/secureconnect" ]; then
    echo -e "${GREEN}✓ App directory exists at ~/secureconnect${NC}"
    
    if [ -f "$HOME/secureconnect/server.js" ]; then
        echo -e "${GREEN}✓ server.js found${NC}"
    else
        echo -e "${RED}✗ server.js not found${NC}"
        echo "Your app files might be in a different location"
    fi
else
    echo -e "${RED}✗ App directory not found at ~/secureconnect${NC}"
    echo "Where is your app located?"
fi

# Summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                   QUICK FIX                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Run these commands to fix the 502 error:${NC}"
echo ""
echo "# Go to your app directory"
echo "cd ~/secureconnect"
echo ""
echo "# Install dependencies (if not done)"
echo "npm install"
echo ""
echo "# Start with PM2 (recommended)"
echo "npm install -g pm2"
echo "pm2 start server.js --name secureconnect"
echo "pm2 save"
echo "pm2 startup"
echo ""
echo "# OR start manually (for testing)"
echo "node server.js"
echo ""
echo -e "${YELLOW}After starting the app, your site should work!${NC}"

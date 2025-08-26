#!/bin/bash
# Log everything to file
exec >> /home/admin/onboot.log 2>&1
echo "[boot] Launching at $(date)"

bluetoothctl show

# Main logic
if [ -f /etc/homebase-token ]; then
    echo "[boot] Found token, launching WebSocket client..."
    /usr/bin/python /home/admin/ws_client.py
else
    echo "[boot] No token, starting BLE provisioning..."
    /usr/bin/python /home/admin/start.py
fi

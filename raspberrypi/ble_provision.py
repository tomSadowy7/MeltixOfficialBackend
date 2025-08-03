import asyncio
from bleak import BleakScanner, BleakClient
import json
import sys
import os
import requests
import signal

SSID = os.environ.get("PROVISION_SSID", "TestNetwork")
PASS = os.environ.get("PROVISION_PASS", "correctpassword")
WIFI_SSID_FILE = "/etc/wifi-ssid"
WIFI_PASS_FILE = "/etc/wifi-pass"

STATUS_CHAR = "0000cccc-0000-1000-8000-00805f9b34fb"
SSID_CHAR = "0000aaaa-0000-1000-8000-00805f9b34fb"
PASS_CHAR = "0000bbbb-0000-1000-8000-00805f9b34fb"
INFO_CHAR = "0000dddd-0000-1000-8000-00805f9b34fb"



def read_wifi_creds():
    try:
        with open(WIFI_SSID_FILE, "r") as f:
            ssid = f.read().strip()
        with open(WIFI_PASS_FILE, "r") as f:
            pw = f.read().strip()
        print(f"[BLE] Using SSID: {ssid}, PW: {'*' * len(pw)}")
        return ssid, pw
    except Exception as e:
        print("[BLE] Failed to load WiFi credentials:", e)
        return None, None

async def run():
    print("[BLE] Scanning for ESP32...")
    device = None
    devices = await BleakScanner.discover(timeout=10)
    for d in devices:
        if d.name == "ESP32-WiFi-Setup":
            print(f"[BLE] Found device: {d.address} (RSSI {d.rssi})")
            device = d
            break

    if not device:
        print("[BLE] ESP32 not found.")
        return

    async with BleakClient(device) as client:
        print(f"[BLE] Connected to ESP32 at {device.address}")

        ssid, pw = read_wifi_creds()
        if not ssid or not pw:
            print("[BLE] Missing WiFi credentials, aborting.")
            return

        device_provisioned = asyncio.Event()

        # 1. Subscribe to notifications BEFORE writing credentials
        print("[BLE] Subscribing to status notifications...")
        def handle_notify(sender, data):
            status = data.decode()
            print(f"[BLE] [NOTIFY] Status: {status}")
            if status == "CONNECTED":
                print("[BLE] [NOTIFY] Provisioned!")
                device_provisioned.set()
            elif status == "FAILED":
                print("[BLE] [NOTIFY] Failed to connect to WiFi.")
                device_provisioned.set()

        await client.start_notify(STATUS_CHAR, handle_notify)

        # 2. Now write credentials
        print("[BLE] Writing SSID...")
        await client.write_gatt_char(SSID_CHAR, ssid.encode())
        print("[BLE] Writing Password...")
        await client.write_gatt_char(PASS_CHAR, pw.encode())

        # 3. Wait for notification
        try:
            await asyncio.wait_for(device_provisioned.wait(), timeout=20)
        except asyncio.TimeoutError:
            print("[BLE] [ERROR] Did not receive a status notification from ESP32 within 20 seconds.")

        # Now read device info (uuid/type)
        await report_device(client)


async def report_device(client):
    print("[BLE] Reading device info characteristic...")
    info_bytes = await client.read_gatt_char(INFO_CHAR)
    info = json.loads(info_bytes.decode())
    print(f"[BLE] Device info: {info}")

    # Read homebase ID from local file
    with open("/etc/homebase-id") as f:
        homebase_id = f.read().strip()
    claim_device_with_backend(homebase_id, info)

def claim_device_with_backend(homebase_id, device_info):
    url = "http://35.223.147.76:3001/device/register"  # Update as needed
    lan_name = f"esp32-{device_info['uuid'][:4].lower()}.local" 
    payload = {
        "homeBaseId": homebase_id,
        "deviceId": device_info["uuid"],
        "name": device_info.get("name", "ESP32 Device"),
        "type": device_info.get("type", "unknown"),
        "lanName": lan_name,
        "online": True
    }
    try:
        resp = requests.post(url, json=payload, timeout=5)
        print("[BACKEND] Claim response:", resp.status_code, resp.text)
    except Exception as e:
        print("[BACKEND] Failed to register device:", e)

if __name__ == "__main__":
    try:
        asyncio.run(run())
    finally:
        # This prints even if run() raised but was handled inside asyncio.run
        # or if you interrupted with Ctrl-C and the KeyboardInterrupt bubbled up.
        print("[BLE] ble_provision.py finished – exiting process.")

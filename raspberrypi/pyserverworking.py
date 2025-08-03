import logging
import requests
from bluezero import async_tools, adapter, peripheral

# UUIDs
WIFI_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0'
WIFI_SSID_UUID = '12345678-1234-5678-1234-56789abcdef1'
WIFI_PASSWORD_UUID = '12345678-1234-5678-1234-56789abcdef2'
WIFI_STATUS_UUID = '12345678-1234-5678-1234-56789abcdef3'
HOMEBASE_ID_UUID = '12345678-1234-5678-1234-56789abcdef4'
USER_TOKEN_UUID = '12345678-1234-5678-1234-56789abcdef5'

# Globals
wifi_ssid = None
wifi_password = None
user_token = None
status_characteristic = None
homebase_id_characteristic = None
homebase_id = None

BACKEND_URL = "http://192.168.68.68:3001/homebase/claim"  # Update as needed

def read_homebase_id():
    try:
        with open('/etc/homebase-id', 'r') as f:
            return f.read().strip()
    except Exception as e:
        print(f"Error reading HomeBase ID: {e}")
        return "UNKNOWN-HOMEBASE-ID"

def connect_to_wifi(ssid, password):
    print(f"Connecting to SSID: {ssid}, Password: {password}")
    # Replace with actual Wi-Fi logic
    return ssid == "TestNetwork" and password == "correctpassword"

def claim_homebase(homebase_id, token):
    try:
        res = requests.post(
            BACKEND_URL,
            json={"homebaseId": homebase_id},
            headers={"Authorization": f"Bearer {token}"},
            timeout=5
        )
        if res.status_code == 200:
            print("✅ HomeBase claimed")
            return True
        else:
            print(f"❌ Claim failed: {res.status_code} {res.text}")
            return False
    except Exception as e:
        print(f"Error claiming HomeBase: {e}")
        return False

def try_connect():
    global wifi_ssid, wifi_password, user_token
    if wifi_ssid and wifi_password and user_token:
        try:
            # 1. WiFi Connecting
            status_characteristic.set_value([0x01])  # STATUS_WIFI_CONNECTING
            print("Sent status: 0x01 (WiFi connecting)")
            
            # 2. Attempt WiFi connection
            wifi_ok = connect_to_wifi(wifi_ssid, wifi_password)
            
            if wifi_ok:
                # 3. WiFi Success
                status_characteristic.set_value([0x02])  # STATUS_WIFI_SUCCESS
                print("Sent status: 0x02 (WiFi success)")
                
                # 4. Attempt HomeBase claim
                claimed = claim_homebase(homebase_id, user_token)
                
                if claimed:
                    # 5. Claim Success
                    status_characteristic.set_value([0x03])  # STATUS_CLAIM_SUCCESS
                    print("Sent status: 0x03 (Claim success)")
                else:
                    # 6. Claim Failed
                    status_characteristic.set_value([0x05])  # STATUS_CLAIM_FAILURE
                    print("Sent status: 0x05 (Claim failed)")
            else:
                # 7. WiFi Failed
                status_characteristic.set_value([0x04])  # STATUS_WIFI_FAILURE
                print("Sent status: 0x04 (WiFi failed)")
                
        except Exception as e:
            print(f"Error in provisioning: {e}")
            status_characteristic.set_value([0x00])  # Generic failure
        finally:
            # Reset for next session
            wifi_ssid = None
            wifi_password = None
            user_token = None

def ssid_write_callback(value, options):
    global wifi_ssid
    wifi_ssid = bytes(value).decode('utf-8')
    print("Received SSID:", wifi_ssid)
    try_connect()

def password_write_callback(value, options):
    global wifi_password
    wifi_password = bytes(value).decode('utf-8')
    print("Received Password:", wifi_password)
    try_connect()

def token_write_callback(value, options):
    global user_token
    user_token = bytes(value).decode('utf-8')
    print("Received User Token:", user_token)
    try_connect()

def notify_callback(notifying, characteristic):
    if notifying:
        print("Client subscribed to status notifications")
        characteristic.set_value([0x00])  # Initial default state

def main(adapter_address):
    global status_characteristic, homebase_id_characteristic, homebase_id

    homebase_id = read_homebase_id()

    wifi = peripheral.Peripheral(adapter_address, local_name='WiFi Config', appearance=0x0200)
    wifi.add_service(srv_id=1, uuid=WIFI_SERVICE_UUID, primary=True)

    wifi.add_characteristic(srv_id=1, chr_id=1, uuid=WIFI_SSID_UUID,
                            value=[], notifying=False,
                            flags=['write'], write_callback=ssid_write_callback)

    wifi.add_characteristic(srv_id=1, chr_id=2, uuid=WIFI_PASSWORD_UUID,
                            value=[], notifying=False,
                            flags=['write'], write_callback=password_write_callback)

    wifi.add_characteristic(srv_id=1, chr_id=3, uuid=WIFI_STATUS_UUID,
                            value=[0x00], notifying=False,
                            flags=['read', 'notify'], notify_callback=notify_callback)

    wifi.add_characteristic(srv_id=1, chr_id=4, uuid=HOMEBASE_ID_UUID,
                            value=list(homebase_id.encode('utf-8')),
                            notifying=False, flags=['read'])

    wifi.add_characteristic(srv_id=1, chr_id=5, uuid=USER_TOKEN_UUID,
                            value=[], notifying=False,
                            flags=['write'], write_callback=token_write_callback)
#D8:3A:DD:A0:BF:4B
    status_characteristic = wifi.characteristics[2]
    homebase_id_characteristic = wifi.characteristics[3]

    wifi.publish()
    print("BLE server running. Waiting for credentials...")

if __name__ == '__main__':
    adapters = list(adapter.Adapter.available())
    main(adapters[0].address)

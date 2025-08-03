import logging
import subprocess
from bluezero import adapter, peripheral

# UUIDs
CUSTOM_SRVC_UUID = '12341000-1234-1234-1234-123456789abc'
WIFI_SSID_UUID = '12341001-1234-1234-1234-123456789abc'
WIFI_PASSWORD_UUID = '12341002-1234-1234-1234-123456789abc'
WIFI_STATUS_UUID = '12341003-1234-1234-1234-123456789abc'

# Global state
wifi_ssid = None
wifi_password = None
status_characteristic = None

def ssid_write(value, options):
    global wifi_ssid
    wifi_ssid = bytes(value).decode('utf-8').strip()
    print(f"Received SSID: {wifi_ssid}")
    attempt_connection_if_ready()

def password_write(value, options):
    global wifi_password
    wifi_password = bytes(value).decode('utf-8').strip()
    print(f"Received Password: {wifi_password}")
    attempt_connection_if_ready()

def attempt_connection_if_ready():
    if wifi_ssid and wifi_password:
        print("Attempting Wi-Fi connection...")
        success = connect_to_wifi(wifi_ssid, wifi_password)
        notify_status("SUCCESS" if success else "FAILURE")
        reset_state()

def connect_to_wifi(ssid, password):
    try:
        # Delete previous connection if exists
        subprocess.run(['nmcli', 'connection', 'delete', ssid], check=False)

        # Add new connection
        result = subprocess.run([
            'nmcli', 'device', 'wifi', 'connect', ssid,
            'password', password, 'ifname', 'wlan0'
        ], capture_output=True, text=True)

        print("nmcli output:", result.stdout.strip(), result.stderr.strip())
        return result.returncode == 0
    except Exception as e:
        print(f"Wi-Fi connection error: {e}")
        return False

def notify_status(message):
    global status_characteristic
    if status_characteristic and status_characteristic.is_notifying:
        print(f"Sending status: {message}")
        status_characteristic.set_value(message.encode())  # Use bytes, not list
        status_characteristic.notify()
    else:
        print("Status characteristic not ready or not notifying")

def status_notify_callback(notifying, characteristic):
    global status_characteristic
    status_characteristic = characteristic
    print(f"Notifications {'enabled' if notifying else 'disabled'} for status")

def reset_state():
    global wifi_ssid, wifi_password
    wifi_ssid = None
    wifi_password = None

def main():
    logging.basicConfig(level=logging.DEBUG)
    adapter_address = list(adapter.Adapter.available())[0].address

    wifi_config = peripheral.Peripheral(adapter_address, local_name='WiFi Configurator')

    wifi_config.add_service(srv_id=1, uuid=CUSTOM_SRVC_UUID, primary=True)

    wifi_config.add_characteristic(
        srv_id=1, chr_id=1, uuid=WIFI_SSID_UUID,
        value=[], notifying=False,
        flags=['write'],
        write_callback=ssid_write
    )

    wifi_config.add_characteristic(
        srv_id=1, chr_id=2, uuid=WIFI_PASSWORD_UUID,
        value=[], notifying=False,
        flags=['write'],
        write_callback=password_write
    )

    wifi_config.add_characteristic(
        srv_id=1, chr_id=3, uuid=WIFI_STATUS_UUID,
        value=[], notifying=False,  # Start as False, will be updated when client subscribes
        flags=['notify'],
        notify_callback=status_notify_callback
    )

    wifi_config.publish()


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
HomeBase WiFi Provisioning Server - Final Working Version
"""

import logging
import requests
from bluezero import async_tools, adapter, peripheral
import time
import json
from typing import Optional, Dict

# Configuration
SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0'
CHARACTERISTIC_UUIDS = {
    'wifi_ssid': '12345678-1234-5678-1234-56789abcdef1',
    'wifi_password': '12345678-1234-5678-1234-56789abcdef2',
    'status': '12345678-1234-5678-1234-56789abcdef3',
    'homebase_id': '12345678-1234-5678-1234-56789abcdef4',
    'user_token': '12345678-1234-5678-1234-56789abcdef5'
}

BACKEND_URL = "http://192.168.1.120:3001/homebase/claim"

# Status codes
STATUS_IDLE = 0x00
STATUS_WIFI_CONNECTING = 0x01
STATUS_WIFI_SUCCESS = 0x02
STATUS_CLAIM_SUCCESS = 0x03
STATUS_WIFI_FAILED = 0x04
STATUS_CLAIM_FAILED = 0x05

class ProvisioningServer:
    def __init__(self):
        self.logger = self._setup_logging()
        self.ble_peripheral = None
        self.status_characteristic = None
        self.credentials = {
            'ssid': None,
            'password': None,
            'token': None
        }
        self.homebase_id = self._read_homebase_id()

    @staticmethod
    def _setup_logging():
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s [SERVER] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        return logging.getLogger()

    def _read_homebase_id(self):
        try:
            with open('/etc/homebase-id', 'r') as f:
                return f.read().strip()
        except Exception as e:
            self.logger.error(f"Error reading HomeBase ID: {e}")
            return "UNKNOWN-HOMEBASE-ID"

    def _write_status(self, code: int, description: str):
        if self.status_characteristic:
            self.status_characteristic.set_value([code])
            self.logger.info(f"Status: {description} (0x{code:02X})")

    def _simulate_wifi_connection(self, ssid: str, password: str) -> bool:
        self.logger.info(f"Simulating WiFi connection to: {ssid}")
        time.sleep(1)
        return True  # Always return True for testing

    def _claim_homebase(self) -> bool:
        try:
            response = requests.post(
                BACKEND_URL,
                json={"homebaseId": self.homebase_id},
                headers={
                    "Authorization": f"Bearer {self.credentials['token']}",
                    "Content-Type": "application/json"
                },
                timeout=10
            )
            return response.status_code == 200
        except Exception as e:
            self.logger.error(f"Backend error: {str(e)}")
            return False

    def _process_provisioning(self):
        try:
            self._write_status(STATUS_WIFI_CONNECTING, "Connecting WiFi")
            if not self._simulate_wifi_connection(self.credentials['ssid'], self.credentials['password']):
                self._write_status(STATUS_WIFI_FAILED, "WiFi failed")
                return
            
            self._write_status(STATUS_WIFI_SUCCESS, "WiFi connected")
            time.sleep(1)
            
            if self._claim_homebase():
                time.sleep(1.5)
                self._write_status(STATUS_CLAIM_SUCCESS, "Claim success")
            else:
                self._write_status(STATUS_CLAIM_FAILED, "Claim failed")
        except Exception as e:
            self.logger.error(f"Provisioning error: {str(e)}")
            self._write_status(STATUS_IDLE, "Error")
        finally:
            self.credentials = {k: None for k in self.credentials}

    # BLE Callbacks
    def _ssid_callback(self, value, options):
        self.credentials['ssid'] = bytes(value).decode('utf-8')
        self.logger.info(f"Got SSID: {self.credentials['ssid']}")
        if all(self.credentials.values()):
            self._process_provisioning()

    def _password_callback(self, value, options):
        self.credentials['password'] = bytes(value).decode('utf-8')
        self.logger.info("Got password")
        if all(self.credentials.values()):
            self._process_provisioning()

    def _token_callback(self, value, options):
        self.credentials['token'] = bytes(value).decode('utf-8')
        self.logger.info("Got token")
        if all(self.credentials.values()):
            self._process_provisioning()

    def _status_notify_callback(self, notifying, characteristic):
        if notifying:
            self.logger.info("Status notifications enabled")
            characteristic.set_value([STATUS_IDLE])

    def setup_ble_service(self, adapter_address: str):
        """Properly configured BLE service setup"""
        self.ble_peripheral = peripheral.Peripheral(
            adapter_address,
            local_name='HomeBase Provisioning',
            appearance=0x0200
        )
        
        # Add main service
        self.ble_peripheral.add_service(1, SERVICE_UUID, True)
        
        # Add characteristics with proper notification handling
        self.ble_peripheral.add_characteristic(
            srv_id=1, chr_id=1,
            uuid=CHARACTERISTIC_UUIDS['wifi_ssid'],
            value=[],
            flags=['write'],
            write_callback=self._ssid_callback,
            notifying=False
        )
        
        self.ble_peripheral.add_characteristic(
            srv_id=1, chr_id=2,
            uuid=CHARACTERISTIC_UUIDS['wifi_password'],
            value=[],
            flags=['write'],
            write_callback=self._password_callback,
            notifying=False
        )
        
        # Status characteristic with notification support
        self.ble_peripheral.add_characteristic(
            srv_id=1, chr_id=3,
            uuid=CHARACTERISTIC_UUIDS['status'],
            value=[STATUS_IDLE],
            flags=['read', 'notify'],
            notify_callback=self._status_notify_callback,
            notifying=False  # This is the critical fix
        )
        
        self.ble_peripheral.add_characteristic(
            srv_id=1, chr_id=4,
            uuid=CHARACTERISTIC_UUIDS['homebase_id'],
            value=list(self.homebase_id.encode('utf-8')),
            flags=['read'],
            notifying=False
        )
        
        self.ble_peripheral.add_characteristic(
            srv_id=1, chr_id=5,
            uuid=CHARACTERISTIC_UUIDS['user_token'],
            value=[],
            flags=['write'],
            write_callback=self._token_callback,
            notifying=False
        )
        
        # Store status characteristic reference
        self.status_characteristic = self.ble_peripheral.characteristics[2]

    def run(self):
        adapters = list(adapter.Adapter.available())
        if not adapters:
            raise RuntimeError("No Bluetooth adapters found")

        self.logger.info(f"Starting HomeBase: {self.homebase_id}")
        self.setup_ble_service(adapters[0].address)
        self.ble_peripheral.publish()
        
        self.logger.info("BLE service running...")
        async_tools.run_forever()

if __name__ == '__main__':
    try:
        ProvisioningServer().run()
    except Exception as e:
        logging.error(f"Failed to start: {str(e)}")
        exit(1)
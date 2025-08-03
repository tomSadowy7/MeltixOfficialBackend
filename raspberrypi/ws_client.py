import asyncio
import websockets
import json
import time
import subprocess
import requests

WEBSOCKET_URL_BASE = "ws://35.223.147.76:8081"  # Just the base, no query yet

HOMEBASE_ID_FILE = "/etc/homebase-id"
HOMEBASE_TOKEN_FILE = "/etc/homebase-token"


def read_file(path):
    try:
        with open(path, 'r') as f:
            return f.read().strip()
    except Exception as e:
        print(f"[ws_client] Could not read {path}: {e}")
        return None
    
def ping_esp32(host: str, timeout_s: int = 3) -> bool:
    """
    Return True iff GET http://<host>/ping answers 200 within <timeout_s>.
    """
    try:
        r = requests.get(f"http://{host}/ping", timeout=timeout_s)
        return r.status_code == 200
    except requests.RequestException:
        return False

async def connect_and_run():
    homebase_id = read_file(HOMEBASE_ID_FILE)
    homebase_token = read_file(HOMEBASE_TOKEN_FILE)
    if not homebase_id or not homebase_token:
        print("[ws_client] Missing homebase ID or homebase token. Exiting.")
        return

    #ws_url = f"{WEBSOCKET_URL_BASE}?token={homebase_token}"
    ws_url = f"{WEBSOCKET_URL_BASE}"

    while True:
        try:
            print(f"[ws_client] Connecting to backend at {ws_url} ...")
            async with websockets.connect(ws_url,
                                          extra_headers={"Authorization": f"Bearer" {homebase_token}}) as ws:
                # Identify yourself to the backend
                hello_msg = json.dumps({
                    "type": "register",
                    "homebaseId": homebase_id
                })
                await ws.send(hello_msg)
                print(f"[ws_client] Sent registration: {hello_msg}")
                while True:
                    msg = await ws.recv()
                    print(f"[ws_client] Received from server: {msg}")

                    try:
                        data = json.loads(msg)

                        # ----- 1️⃣ already-existing branch -----
                        if data.get("type") == "start_provisioning":
                            print("[ws_client] Starting BLE provisioning mode …")
                            subprocess.Popen(
                                ['python3', '/home/admin/ble_provision.py']
                            )

                        # ----- 2️⃣ NEW branch for sprinkler commands -----
                        elif data.get("type") == "sprinklerCmd":
                            msg_id = data.get("msgId")
                            # expected payload the backend sends **to this Pi**
                            # {
                            #   "type": "sprinklerCmd",
                            #   "lanName": "esp32-frontyard.local",
                            #   "zone": 3,
                            #   "on": true,
                            #   "key": "123456"          # same shared secret
                            # }
                            lan  = data["lanName"]          # mDNS / IP of ESP32
                            zone = data["zone"]             # 1-4
                            on   = data["on"]               # True/False
                            key  = data["key"]              # auth key

                            path = f"/led{zone}/" + ("on" if on else "off")
                            url  = f"http://{lan}{path}"

                            print(f"[ws_client]  → {url}")

                            # form-URL-encoded or JSON – ESP32 expects JSON body
                            import requests, json as pj
                            try:
                                resp = requests.post(url, json={"key": key}, timeout=3)
                                success = resp.status_code == 200
                                result_msg = {
                                    "type": "sprinklerAck",
                                    "msgId": msg_id,
                                    "success": success
                                }
                            except requests.RequestException as e:
                                result_msg = {
                                    "type": "sprinklerAck",
                                    "msgId": msg_id,
                                    "success": False
                                }

                            await ws.send(json.dumps(result_msg))
                        elif data.get("type") == "pingEsp":
                            # message from backend cron
                            # { "type":"pingEsp", "lanName":"esp32-frontyard.local", "msgId":"abc123" }
                            lan    = data["lanName"]
                            msg_id = data.get("msgId")

                            online = ping_esp32(lan)          # ←  ✅  use the helper here

                            # send result back to backend
                            await ws.send(json.dumps({
                                "type"   : "pongEsp",
                                "lanName": lan,
                                "online" : online,
                                "msgId"  : msg_id,            # echo so backend matches responses
                            }))
                        elif data.get("type") == "pingPi":
                            await ws.send(json.dumps({
                                "type": "pongPi",
                                "msgId": data.get("msgId")
                            }))

                    except Exception as ex:
                        print("[ws_client] Error processing message:", ex)           
                          
        except Exception as e:
            print(f"[ws_client] Connection lost or failed: {e}")
            print("[ws_client] Reconnecting in 5 seconds...")
            time.sleep(5)

if __name__ == "__main__":
    asyncio.run(connect_and_run())

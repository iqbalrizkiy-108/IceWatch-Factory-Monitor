import network
import urequests
import ujson
import dht
import machine
import time
import sys
try:
    import usocket as socket
except Exception:
    socket = None

try:
    from machine import I2C, Pin
    from i2c_lcd import I2cLcd
    LCD_ENABLED = True
except Exception:
    LCD_ENABLED = False

# ---- Wi-Fi credentials ----
SSID = "Binuj"
PWD = "wekyweky"
USE_STATIC_IP = False
STATIC_IP = "10.71.164.99"
SUBNET_MASK = "255.255.255.0"
GATEWAY = "10.71.164.12"
DNS = "8.8.8.8"

# ---- Server endpoint(s) ----
# Use hostname first so URL stays stable even when laptop IP changes.
# Laptop hostname on this setup: "vikQri"
SERVER_URLS = (
    "http://172.23.150.98:5000/api/reading",
)
POST_RETRIES = 3
POST_RETRY_DELAY_SEC = 2
SOCKET_TIMEOUT_SEC = 8
CONFIG_VERSION = "2026-05-06-main-v3"

# ---- Pins ----
DHT_PIN = 4
SDA_PIN = 21
SCL_PIN = 22
LCD_ROWS = 2
LCD_COLS = 16
SAFE_TEMP_MAX = 23
UNSAFE_TEMP_MIN = 25
LED_TEMP_PIN = 5
LED_BLINK_PIN = 19
LED_COLD_PIN = 17

# Initialize hardware
sensor = dht.DHT11(machine.Pin(DHT_PIN))
led_temp = machine.Pin(LED_TEMP_PIN, machine.Pin.OUT)
led_blink = machine.Pin(LED_BLINK_PIN, machine.Pin.OUT)
led_cold = machine.Pin(LED_COLD_PIN, machine.Pin.OUT)

lcd = None
last_safe_status = True
if LCD_ENABLED:
    try:
        i2c = I2C(0, sda=Pin(SDA_PIN), scl=Pin(SCL_PIN), freq=400000)
        devices = i2c.scan()
        if devices:
            addr = 0x27 if 0x27 in devices else (0x3F if 0x3F in devices else devices[0])
            lcd = I2cLcd(i2c, addr, LCD_ROWS, LCD_COLS)
            lcd.clear()
            lcd.putstr("Booting...")
            time.sleep(1)
            lcd.clear()
    except Exception as e:
        print("LCD init error:", e)
        lcd = None


def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    print("\nConnecting to Wi-Fi: {}".format(SSID))

    for attempt in range(1, 4):
        try:
            if wlan.isconnected():
                print("Wi-Fi already connected, IP:", wlan.ifconfig()[0])
                return wlan

            # Reset STA interface state to recover from "Wifi Internal State Error".
            try:
                wlan.disconnect()
            except Exception:
                pass
            try:
                wlan.active(False)
                time.sleep(1)
            except Exception:
                pass

            wlan.active(True)
            time.sleep(1)

            if USE_STATIC_IP:
                wlan.ifconfig((STATIC_IP, SUBNET_MASK, GATEWAY, DNS))

            wlan.connect(SSID, PWD)
            retry = 0
            while not wlan.isconnected() and retry < 20:
                time.sleep(1)
                retry += 1
                print(".", end="")
            print("")

            if wlan.isconnected():
                print("Wi-Fi connected, IP config:", wlan.ifconfig())
                return wlan
        except OSError as e:
            print("Wi-Fi attempt {} failed: {}".format(attempt, e))
            time.sleep(2)

    print("Wi-Fi connection failed after retries - Check SSID/Password or Signal Strength")

    return wlan


def can_reach_url(url):
    if socket is None:
        return True

    try:
        host_part = url.split("://", 1)[1].split("/", 1)[0]
    except Exception:
        return True

    if ":" in host_part:
        host, port_text = host_part.rsplit(":", 1)
        try:
            port = int(port_text)
        except Exception:
            port = 80
    else:
        host = host_part
        port = 80

    s = None
    try:
        addr = socket.getaddrinfo(host, port)[0][-1]
        s = socket.socket()
        s.settimeout(SOCKET_TIMEOUT_SEC)
        s.connect(addr)
        return True
    except Exception as e:
        print("Reachability check failed for {}:{} ->".format(host, port), e)
        return False
    finally:
        if s is not None:
            try:
                s.close()
            except Exception:
                pass


def send_reading(temp, hum, wlan):
    payload = ujson.dumps({"temp": temp, "humidity": hum})
    for attempt in range(1, POST_RETRIES + 1):
        sent = False
        try:
            if not wlan.isconnected():
                print("Wi-Fi down before POST, reconnecting...")
                wlan = connect_wifi()
                if not wlan.isconnected():
                    raise OSError("wifi reconnect failed")

            for url in SERVER_URLS:
                r = None
                try:
                    if not can_reach_url(url):
                        raise OSError("server not reachable")
                    print("POST ->", url)
                    r = urequests.post(
                        url,
                        data=payload,
                        headers={
                            "Content-Type": "application/json",
                            "Connection": "close",
                        },
                    )
                    status_code = r.status_code
                    print("POST response code:", status_code)
                    if 200 <= status_code < 300:
                        sent = True
                        break
                except Exception as e:
                    print("POST to {} failed:".format(url), e)
                finally:
                    if r is not None:
                        try:
                            r.close()
                        except Exception:
                            pass
            if sent:
                return True, wlan
            raise OSError("all server urls failed")
        except Exception as e:
            print("POST error (attempt {}/{}):".format(attempt, POST_RETRIES), e)
            if "ECONNABORTED" in str(e) or "113" in str(e):
                print("Connection aborted; forcing Wi-Fi reconnect...")
                wlan = connect_wifi()

        if attempt < POST_RETRIES:
            time.sleep(POST_RETRY_DELAY_SEC)

    return False, wlan


# Connect once at startup
if socket is not None:
    try:
        socket.setdefaulttimeout(SOCKET_TIMEOUT_SEC)
        print("Socket timeout set to {} sec".format(SOCKET_TIMEOUT_SEC))
    except Exception as e:
        print("Socket timeout not set:", e)

wlan = connect_wifi()
print("CONFIG_VERSION:", CONFIG_VERSION)
print("SERVER_URLS:", SERVER_URLS)

while True:
    try:
        if not wlan.isconnected():
            print("Wi-Fi dropped, reconnecting...")
            wlan = connect_wifi()

        sensor.measure()
        t = sensor.temperature()
        h = sensor.humidity()
        print("Temp:", t, "C  Humidity:", h, "%")

        if lcd is not None:
            if t < SAFE_TEMP_MAX:
                is_safe = True
            elif t > UNSAFE_TEMP_MIN:
                is_safe = False
            else:
                is_safe = last_safe_status
            last_safe_status = is_safe
            # Display style:
            # line1: "Suhu:xx | Tidak" (or blank when safe)
            # line2: "Hum :yy | Aman"
            top_status = "Tidak" if not is_safe else ""
            line1 = "Suhu:{:>2} | {}".format(t, top_status)
            line2 = "Hum :{:>2} | Aman".format(h)
            lcd.move_to(0, 0)
            lcd.putstr((line1 + " " * 16)[:16])
            lcd.move_to(0, 1)
            lcd.putstr((line2 + " " * 16)[:16])

        # LED Logic
        led_temp.value(1 if t > 25 else 0)
        led_blink.value(1 if t > 25 else 0)
        led_cold.value(1 if t < 20 else 0)

        ok, wlan = send_reading(t, h, wlan)
        if not ok:
            time.sleep(2)

        time.sleep(10)

    except OSError as e:
        print("Sensor error:", e)
        time.sleep(2)
    except Exception as e:
        print("Unhandled loop error:", e)
        try:
            sys.print_exception(e)
        except Exception:
            pass
        time.sleep(2)

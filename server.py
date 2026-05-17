from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import json
import os

app = Flask(__name__)
CORS(app)  # Allow cross-origin for local dev

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, 'sensor_data.json')

def init_db():
    if not os.path.exists(DATA_PATH):
        with open(DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump([], f)


def load_readings():
    try:
        with open(DATA_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def save_readings(readings):
    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(readings, f)

@app.route('/api/reading', methods=['POST'])
def receive_reading():
    data = request.get_json()
    print(f"[POST /api/reading] from={request.remote_addr} payload={data}", flush=True)
    if not data or 'temp' not in data or 'humidity' not in data:
        return jsonify({'error': 'Invalid payload'}), 400
    try:
        temp = float(data['temp'])
        humidity = float(data['humidity'])
        timestamp = datetime.utcnow().isoformat()
        readings = load_readings()
        readings.append({
            'timestamp': timestamp,
            'temperature': temp,
            'humidity': humidity,
        })
        if len(readings) > 5000:
            readings = readings[-5000:]
        save_readings(readings)
        return jsonify({'status': 'ok'}), 200
    except Exception as e:
        print("DB write error:", e, flush=True)
        return jsonify({'error': 'server db error'}), 500

@app.route('/api/latest', methods=['GET'])
def latest_reading():
    readings = load_readings()
    if not readings:
        return jsonify({'error': 'No data'}), 404
    row = readings[-1]
    return jsonify({
        'timestamp': row.get('timestamp'),
        'temperature': row.get('temperature'),
        'humidity': row.get('humidity'),
    })

@app.route('/api/history', methods=['GET'])
def history():
    limit = request.args.get('limit', 100)
    try:
        limit = int(limit)
    except ValueError:
        limit = 100
    readings = load_readings()
    data = readings[-limit:]
    return jsonify(data)

if __name__ == '__main__':
    init_db()
    print("Flask server starting on 0.0.0.0:5000", flush=True)
    print("SERVER_VERSION: json-store-v2", flush=True)
    print("DATA_PATH:", DATA_PATH, flush=True)
    app.run(host='0.0.0.0', port=5000, debug=False)

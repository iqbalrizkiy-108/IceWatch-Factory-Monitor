import React, { useEffect, useState, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Thermometer, Droplet, Wifi, CheckCircle, Settings, Home, BarChart3, Sun, Moon, MapPin, Clock, Calendar, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import ChatAI from "./components/ChatAI";

// Dashboard Suhu Ruangan Es Krim
// - Layout: Sidebar + Main Content
// - TailwindCSS untuk styling
// - Recharts untuk grafik

const SENSOR_STALE_SECONDS = 600;

function parseSensorTimestamp(rawTimestamp) {
    if (!rawTimestamp) return null;
    let ts = String(rawTimestamp).trim();

    // Flask backend may return naive UTC ISO string without timezone.
    if (!(/[zZ]|[+-]\d{2}:\d{2}$/.test(ts))) {
        ts += "Z";
    }

    // Ensure broad browser compatibility by trimming fractional seconds to millis.
    ts = ts.replace(/\.(\d{3})\d+(?=[zZ]|[+-]\d{2}:\d{2}$)/, ".$1");
    const parsed = new Date(ts);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function IceCreamRoomDashboard() {
    const API_BASE_URL =
        import.meta.env.VITE_API_BASE_URL ||
        `${window.location.protocol}//${window.location.hostname}:5000`;

    const [temp, setTemp] = useState(4.0);
    const [hum, setHum] = useState(60);
    const [lastSensorTimestamp, setLastSensorTimestamp] = useState(null);
    const [tempStatus, setTempStatus] = useState("Normal");
    const [connectionStatus, setConnectionStatus] = useState("Connecting");
    const [history, setHistory] = useState(() => {
        const now = Date.now();
        return Array.from({ length: 20 }).map((_, i) => ({
            time: new Date(now - (19 - i) * 1000).toLocaleTimeString('id-ID', { hour12: false }),
            temp: 4 + Math.random() * 0.5,
        }));
    });

    // Theme State
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = localStorage.getItem('dashboardTheme');
        return saved === 'dark';
    });

    // Time & Weather State
    const [currentTime, setCurrentTime] = useState(new Date());
    const [weather, setWeather] = useState(null);
    const [dieselAutoMode, setDieselAutoMode] = useState(false);

    // Set Point State
    const [minSetPoint, setMinSetPoint] = useState(() => {
        const saved = localStorage.getItem('minSetPoint');
        return saved ? Number(saved) : 28;
    });
    const [maxSetPoint, setMaxSetPoint] = useState(() => {
        const saved = localStorage.getItem('maxSetPoint');
        return saved ? Number(saved) : 33;
    });

    // Active section for sidebar
    const [activeSection, setActiveSection] = useState('home');

    // Chat visibility state
    const [isChatVisible, setIsChatVisible] = useState(false);

    // Save theme to localStorage
    useEffect(() => {
        localStorage.setItem('dashboardTheme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    // Save set points to localStorage
    useEffect(() => {
        localStorage.setItem('minSetPoint', minSetPoint);
        localStorage.setItem('maxSetPoint', maxSetPoint);
    }, [minSetPoint, maxSetPoint]);

    // Weather & Time Effects
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        const fetchWeather = async () => {
            try {
                const res = await fetch(
                    "https://api.open-meteo.com/v1/forecast?latitude=-7.56&longitude=112.48&current_weather=true&timezone=Asia%2FJakarta"
                );
                const data = await res.json();
                setWeather(data.current_weather);
            } catch (err) {
                console.error("Gagal ambil cuaca", err);
            }
        };

        fetchWeather();
        const weatherTimer = setInterval(fetchWeather, 600000);

        return () => {
            clearInterval(timer);
            clearInterval(weatherTimer);
        };
    }, []);

    // Data Fetching
    useEffect(() => {
        const API_URL = `${API_BASE_URL}/api/latest`;

        const fetchData = async () => {
            try {
                const response = await fetch(API_URL, { cache: "no-store" });
                if (response.status === 404) {
                    // Backend reachable but sensor data has not arrived yet.
                    setConnectionStatus("Connecting");
                    return;
                }
                if (!response.ok) throw new Error("Network response was not ok");
                const data = await response.json();

                setTemp(Number(data.temperature));
                setHum(Number(data.humidity));

                const parsedTs = parseSensorTimestamp(data.timestamp);
                if (parsedTs) {
                    const ageSeconds = (Date.now() - parsedTs.getTime()) / 1000;
                    setLastSensorTimestamp(parsedTs.toISOString());
                    setConnectionStatus(ageSeconds <= SENSOR_STALE_SECONDS ? "Online" : "Offline");
                } else {
                    // Data fetch succeeded; keep status online even if timestamp format is unexpected.
                    setLastSensorTimestamp(null);
                    setConnectionStatus("Online");
                }
                const point = {
                    time: parsedTs
                        ? parsedTs.toLocaleTimeString('id-ID', { hour12: false })
                        : new Date().toLocaleTimeString('id-ID', { hour12: false }),
                    temp: Number(data.temperature),
                };

                setHistory((prev) => {
                    const lastPoint = prev[prev.length - 1];
                    if (lastPoint && lastPoint.time === point.time) return prev;
                    return [...prev.slice(-19), point];
                });

            } catch (error) {
                console.warn("Failed to fetch data:", error);
                setConnectionStatus("Offline");
            }
        };

        fetchData();
        const intervalId = setInterval(fetchData, 2000);

        return () => clearInterval(intervalId);
    }, [API_BASE_URL]);

    useEffect(() => {
        if (temp <= 0) setTempStatus("Beku");
        else if (temp <= 3) setTempStatus("Dingin Optimal");
        else if (temp <= 7) setTempStatus("Perhatian");
        else setTempStatus("Panas");
    }, [temp]);

    // Format Date & Time
    const formattedDate = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(currentTime);

    const formattedTime = currentTime.toLocaleTimeString('id-ID', { hour12: false });
    const lastSensorTimeText = lastSensorTimestamp
        ? new Date(lastSensorTimestamp).toLocaleTimeString('id-ID', { hour12: false })
        : "-";

    // Scroll to chart section
    const chartRef = useRef(null);
    const scrollToChart = () => {
        chartRef.current?.scrollIntoView({ behavior: 'smooth' });
        setActiveSection('chart');
    };

    // Theme classes
    const themeClasses = isDarkMode
        ? {
            bg: 'bg-[radial-gradient(ellipse_at_left,_#334155_0%,_#1e293b_30%,_#0f172a_60%,_#020617_100%)]',
            card: 'bg-white/10 backdrop-blur-md border-white/20',
            cardSolid: 'bg-slate-800/80 backdrop-blur-md border-slate-700',
            text: 'text-white',
            textMuted: 'text-slate-300',
            textSubtle: 'text-slate-400',
            sidebar: 'bg-slate-900/50 backdrop-blur-xl border-slate-700/50',
            header: 'bg-slate-900/80 backdrop-blur-md border-slate-700',
        }
        : {
            bg: 'bg-[linear-gradient(180deg,_#ffffff_0%,_#e0f2fe_30%,_#93c5fd_60%,_#3b82f6_100%)]',
            card: 'bg-white/80 backdrop-blur-md border-white/50 shadow-lg',
            cardSolid: 'bg-white backdrop-blur-md border-slate-200 shadow-lg',
            text: 'text-slate-800',
            textMuted: 'text-slate-600',
            textSubtle: 'text-slate-500',
            sidebar: 'bg-white/30 backdrop-blur-2xl border-white/30 shadow-xl',
            header: 'bg-white/80 backdrop-blur-md border-slate-200 shadow-md',
        };

    return (
        <div className={`min-h-screen ${themeClasses.bg} font-sans transition-colors duration-500`}>
            {/* Sidebar - Position 8, 9, 10 */}
            <aside
                className="fixed left-0 top-0 h-full w-16 border-r flex flex-col items-center py-6 z-50"
                style={{
                    backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.2)' : 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderColor: isDarkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(148, 163, 184, 0.3)'
                }}
            >
                {/* Top Spacer - pushes icons to center */}
                <div className="flex-1" />

                {/* Home Icon - Position 8 */}
                <button
                    onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setActiveSection('home'); }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 ${activeSection === 'home'
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                        : `${isDarkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`
                        }`}
                    title="Home"
                >
                    <Home size={20} />
                </button>

                {/* Chart Icon - Position 9 */}
                <button
                    onClick={scrollToChart}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 ${activeSection === 'chart'
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                        : `${isDarkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`
                        }`}
                    title="Grafik Suhu"
                >
                    <BarChart3 size={20} />
                </button>

                {/* AI Chat Icon - Position 12 */}
                <button
                    onClick={() => { setIsChatVisible(!isChatVisible); setActiveSection('ai-chat'); }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 relative ${activeSection === 'ai-chat'
                        ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                        : `${isDarkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`
                        }`}
                    title="Chat dengan AI"
                >
                    <MessageSquare size={20} />
                    {isChatVisible && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse" />}
                </button>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Theme Toggle - Position 10 */}
                <button
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${isDarkMode
                        ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                        : 'bg-slate-800/10 text-slate-600 hover:bg-slate-800/20'
                        }`}
                    title={isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
                >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </button>
            </aside>

            {/* Main Content */}
            <div className="ml-16 min-h-screen">
                {/* Header - Position 7 and 11 */}
                <header
                    className="sticky top-0 border-b px-6 py-4 z-40"
                    style={{
                        backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderColor: isDarkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(148, 163, 184, 0.3)'
                    }}
                >
                    <div className="flex items-center justify-between w-full">
                        {/* Left: Logo + Title - Position 7 */}
                        <div className="flex items-center gap-3">
                            <img
                                src="/logo.png"
                                alt="Logo"
                                className="w-14 h-14 object-contain"
                            />
                            <div>
                                <h1 className={`text-xl font-bold ${themeClasses.text}`}>Dashboard Ice Watch Assistant</h1>

                            </div>
                        </div>

                        {/* Right: Date, Time, Location, ESP Status - Position 11 */}
                        <div className={`flex items-center gap-4 ${themeClasses.card} border rounded-xl px-4 py-2`}>
                            <div className="flex items-center gap-2">
                                <Calendar size={14} className={themeClasses.textSubtle} />
                                <span className={`text-xs font-medium ${themeClasses.textMuted}`}>{formattedDate}</span>
                            </div>
                            <div className="w-px h-6 bg-slate-300/30" />
                            <div className="flex items-center gap-2">
                                <Clock size={14} className={themeClasses.textSubtle} />
                                <span className={`text-sm font-mono font-bold ${themeClasses.text}`}>{formattedTime}</span>
                                <span className={`text-xs ${themeClasses.textSubtle}`}>WIB</span>
                            </div>
                            <div className="w-px h-6 bg-slate-300/30" />
                            <div className="flex items-center gap-2">
                                <MapPin size={14} className={themeClasses.textSubtle} />
                                <span className={`text-xs ${themeClasses.textMuted}`}>Kec. Dlanggu, Mojokerto</span>
                            </div>
                            <div className="w-px h-6 bg-slate-300/30" />
                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${connectionStatus === 'Offline'
                                ? 'bg-red-100 text-red-600'
                                : connectionStatus === 'Online'
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-yellow-100 text-yellow-600'
                                }`}>
                                <Wifi size={12} />
                                <span>{connectionStatus === 'Offline' ? 'ESP Offline' : connectionStatus === 'Online' ? 'ESP Online' : 'Connecting'}</span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="p-6">
                    <div className="max-w-7xl mx-auto">
                        {/* Row of 4 Cards - Position 1, 2, 3, 4 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

                            {/* Card 1: Temperature + Info - Position 1 */}
                            <div className={`rounded-2xl overflow-hidden ${temp < 28 ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                                temp <= 33 ? 'bg-gradient-to-br from-yellow-500 to-orange-500' :
                                    'bg-gradient-to-br from-orange-500 to-red-500'
                                } p-1`}>
                                <div className="flex h-full">
                                    {/* Temperature Display */}
                                    <div className="flex-1 p-4 flex flex-col justify-center">
                                        <div className="text-white/80 text-xs font-medium mb-1">Suhu Ruangan</div>
                                        <motion.div
                                            initial={{ scale: 0.95 }}
                                            animate={{ scale: 1 }}
                                            transition={{ duration: 0.4 }}
                                        >
                                            <div className="text-4xl font-extrabold text-white">{temp.toFixed(1)}°C</div>
                                        </motion.div>
                                        <div className="text-[11px] text-white/80 mt-1">Data sensor: {lastSensorTimeText}</div>
                                        <div className="mt-2">
                                            <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-white/20 text-white">
                                                {temp < 28 ? '❄️ Dingin' : temp <= 33 ? '🌤️ Sedang' : '🔥 Panas'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Info Panel */}
                                    <div className="w-40 bg-white/90 rounded-xl m-1 p-3">
                                        <div className={`text-xs font-semibold mb-2 ${temp < 28 ? 'text-blue-700' : temp <= 33 ? 'text-yellow-700' : 'text-orange-700'
                                            }`}>📋 Info Suhu</div>
                                        <div className={`text-[10px] leading-relaxed ${temp < 28 ? 'text-blue-800' : temp <= 33 ? 'text-yellow-800' : 'text-orange-800'
                                            }`}>
                                            {temp < 28 ? (
                                                <>
                                                    <p className="font-semibold mb-1">✅ Kondisi Ideal</p>
                                                    <p>Suhu optimal untuk menyimpan es krim. Kualitas produk terjaga dengan baik.</p>
                                                </>
                                            ) : temp <= 33 ? (
                                                <>
                                                    <p className="font-semibold mb-1">⚠️ Perlu Perhatian</p>
                                                    <p>Suhu mulai naik. Periksa pendingin dan pastikan pintu tertutup rapat.</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="font-semibold mb-1">🚨 Bahaya!</p>
                                                    <p>Suhu terlalu tinggi! Es krim bisa meleleh. Segera periksa sistem pendingin.</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Set Point - Position 2 */}
                            <div className={`${themeClasses.cardSolid} border rounded-2xl p-4 overflow-hidden`}>
                                {/* Row 1: Icon + Set Point Label + Value + Inputs */}
                                <div className="flex items-center gap-2 mb-3 flex-wrap">
                                    {/* Icon + Set Point dalam satu box - warna berubah sesuai suhu */}
                                    <div className={`px-3 py-2 rounded-xl shrink-0 flex items-center gap-2 text-white ${((Number(minSetPoint) + Number(maxSetPoint)) / 2) < 15
                                        ? 'bg-blue-500'
                                        : ((Number(minSetPoint) + Number(maxSetPoint)) / 2) <= 25
                                            ? 'bg-yellow-500'
                                            : 'bg-red-500'
                                        }`}>
                                        <Thermometer size={20} />
                                        <div>
                                            <div className="text-[10px] font-medium opacity-90">Set Point</div>
                                            <div className="text-sm font-bold whitespace-nowrap">{minSetPoint}-{maxSetPoint}°C</div>
                                        </div>
                                    </div>
                                    {/* Min/Max Inputs */}
                                    <div className="flex gap-2 flex-1 min-w-[120px]">
                                        <div className="flex-1 min-w-[50px]">
                                            <label className={`text-[10px] ${themeClasses.textSubtle} block`}>Min (°C)</label>
                                            <input
                                                type="number"
                                                value={minSetPoint}
                                                onChange={(e) => setMinSetPoint(e.target.value === '' ? '' : Number(e.target.value))}
                                                className={`w-full ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-100 border-slate-200 text-slate-800'} border rounded-lg px-2 py-1.5 text-sm font-medium focus:outline-none focus:border-blue-400`}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-[50px]">
                                            <label className={`text-[10px] ${themeClasses.textSubtle} block`}>Max (°C)</label>
                                            <input
                                                type="number"
                                                value={maxSetPoint}
                                                onChange={(e) => setMaxSetPoint(e.target.value === '' ? '' : Number(e.target.value))}
                                                className={`w-full ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-100 border-slate-200 text-slate-800'} border rounded-lg px-2 py-1.5 text-sm font-medium focus:outline-none focus:border-blue-400`}
                                            />
                                        </div>
                                    </div>
                                    {temp >= minSetPoint && temp <= maxSetPoint && (
                                        <div className="flex items-center gap-1 bg-yellow-500 text-white px-2 py-1 rounded-full text-xs font-bold shrink-0">
                                            <CheckCircle size={12} />
                                            <span>OK</span>
                                        </div>
                                    )}
                                </div>

                                {/* Set Point Info/Warning */}
                                {minSetPoint === 28 && maxSetPoint === 33 ? (
                                    <div className="p-3 bg-orange-50 rounded-xl border border-orange-200">
                                        <div className="text-xs font-semibold text-orange-700 mb-1">⚠️ Peringatan</div>
                                        <div className="text-xs text-orange-800 leading-relaxed">
                                            Rentang 28-33°C <span className="font-bold text-red-600">tidak cocok untuk es krim</span>. Hanya untuk demo prototype.
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                                        <div className={`text-xs font-semibold mb-1 ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>ℹ️ Info</div>
                                        <div className={`text-xs leading-relaxed ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                                            Target suhu aktif: <span className="font-medium">{minSetPoint}-{maxSetPoint}°C</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Card 3: Humidity - Position 3 */}
                            <div className={`${themeClasses.cardSolid} border rounded-2xl p-4 text-center`}>
                                <div className="flex flex-col items-center">
                                    <div className={`p-2 rounded-lg mb-2 ${hum < 40 ? 'bg-yellow-100 text-yellow-600' :
                                        hum <= 70 ? 'bg-green-100 text-green-600' :
                                            'bg-blue-100 text-blue-600'
                                        }`}>
                                        <Droplet size={24} />
                                    </div>
                                    <div className={`text-xs ${themeClasses.textSubtle}`}>Kelembaban Udara</div>
                                    <div className={`text-2xl font-bold ${themeClasses.text}`}>{hum}%</div>
                                </div>
                                <div className="mt-3 flex justify-center">
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${hum < 40 ? 'bg-yellow-500 text-white' :
                                        hum <= 70 ? 'bg-green-500 text-white' :
                                            'bg-blue-500 text-white'
                                        }`}>
                                        {hum < 40 ? 'Kering' : hum <= 70 ? 'Normal' : 'Lembab'}
                                    </span>
                                </div>
                                <div className={`mt-2 text-[10px] ${themeClasses.textSubtle}`}>
                                    {hum < 40 ? 'Udara terlalu kering' : hum <= 70 ? 'Kelembaban optimal' : 'Perhatikan kondensasi'}
                                </div>
                            </div>

                            {/* Card 4: Regional Temperature - Position 4 */}
                            <div className={`${themeClasses.cardSolid} border rounded-2xl p-4 text-center`}>
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <MapPin size={16} className={themeClasses.textSubtle} />
                                    <span className={`text-xs font-medium ${themeClasses.textSubtle}`}>Suhu Cuaca Luar </span>
                                </div>
                                {weather ? (
                                    <>
                                        <div className={`text-3xl font-bold ${themeClasses.text}`}>{weather.temperature}°C</div>
                                        <div className={`text-xs ${themeClasses.textSubtle} mt-1`}>
                                            Angin: {weather.windspeed} km/h
                                        </div>
                                        <div className={`text-[10px] ${themeClasses.textSubtle} mt-2`}>
                                            Kec. Dlanggu, Mojokerto
                                        </div>
                                    </>
                                ) : (
                                    <div className={`text-sm ${themeClasses.textSubtle}`}>Memuat data cuaca...</div>
                                )}
                            </div>
                        </div>

                        {/* Bottom Section - Position 5 and 6 */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* Chart + Diesel - Position 5 */}
                            <div ref={chartRef} className={`lg:col-span-2 ${themeClasses.cardSolid} border rounded-2xl p-5`}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className={`text-sm font-semibold ${themeClasses.text}`}>Grafik Suhu (Realtime)</h3>
                                    <div className={`text-xs ${themeClasses.textSubtle}`}>20 poin terakhir</div>
                                </div>

                                <div style={{ width: "100%", height: 200 }}>
                                    <ResponsiveContainer>
                                        <AreaChart data={history} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.05} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis
                                                dataKey="time"
                                                tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#64748b' }}
                                            />
                                            <YAxis
                                                domain={["auto", "auto"]}
                                                tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#64748b' }}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                                }}
                                            />
                                            <Area type="monotone" dataKey="temp" stroke="#6366F1" fillOpacity={1} fill="url(#colorTemp)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                                        <div className={`text-xs ${themeClasses.textSubtle}`}>Min Terakhir</div>
                                        <div className={`text-lg font-semibold ${themeClasses.text}`}>{Math.min(...history.map((h) => h.temp)).toFixed(1)}°C</div>
                                    </div>
                                    <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                                        <div className={`text-xs ${themeClasses.textSubtle}`}>Max Terakhir</div>
                                        <div className={`text-lg font-semibold ${themeClasses.text}`}>{Math.max(...history.map((h) => h.temp)).toFixed(1)}°C</div>
                                    </div>
                                </div>

                                {/* Diesel Generator Automation */}
                                <div className="mt-4 pt-4 border-t border-slate-200/20">
                                    <div className={`p-4 rounded-xl transition-all duration-500 ${dieselAutoMode
                                        ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30'
                                        : isDarkMode ? 'bg-slate-700/50 border border-slate-600' : 'bg-slate-100 border border-slate-200'
                                        }`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-lg">{dieselAutoMode ? '⚡' : '🔌'}</span>
                                                    <h3 className={`text-sm font-bold ${dieselAutoMode ? (isDarkMode ? 'text-green-400' : 'text-green-700') : themeClasses.text}`}>
                                                        Otomatisasi Genset Diesel
                                                    </h3>
                                                </div>
                                                <p className={`text-xs ${dieselAutoMode ? (isDarkMode ? 'text-green-300' : 'text-green-600') : themeClasses.textSubtle}`}>
                                                    {dieselAutoMode
                                                        ? 'Sistem siap memantau tegangan PLN.'
                                                        : 'Auto-start generator saat listrik padam.'}
                                                </p>
                                            </div>
                                            <button
                                                className={`px-4 py-2 font-bold rounded-lg shadow-md transition-all transform hover:scale-105 ${dieselAutoMode
                                                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                                                    : isDarkMode ? 'bg-slate-600 text-slate-300' : 'bg-white text-slate-500 border border-slate-200'
                                                    }`}
                                                onClick={() => setDieselAutoMode(!dieselAutoMode)}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span>{dieselAutoMode ? 'ON' : 'OFF'}</span>
                                                    <div className={`w-2.5 h-2.5 rounded-full ${dieselAutoMode ? 'bg-white animate-pulse' : 'bg-slate-400'}`}></div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Logs - Position 6 */}
                            <div className={`lg:col-span-1 ${themeClasses.cardSolid} border rounded-2xl p-5`}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className={`text-sm font-semibold ${themeClasses.text}`}>Log Terakhir</h3>
                                    <div className={`text-xs ${themeClasses.textSubtle}`}>Auto-update</div>
                                </div>

                                <div className="space-y-2">
                                    {history.slice(-6).reverse().map((h, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-slate-700/50' : 'bg-slate-50'
                                                }`}
                                        >
                                            <div>
                                                <div className={`text-sm font-medium ${themeClasses.text}`}>{h.temp.toFixed(1)}°C</div>
                                                <div className={`text-xs ${themeClasses.textSubtle}`}>{h.time}</div>
                                            </div>
                                            <div className={`text-xs ${themeClasses.textSubtle}`}>DHT11</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* AI Chat Section - Toggleable, Centered, Same Width as Chart */}
                        {isChatVisible && (
                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="lg:col-span-2">
                                    <ChatAI 
                                        currentTemp={temp}
                                        currentHum={hum}
                                        isDarkMode={isDarkMode}
                                        tempStatus={tempStatus}
                                    />
                                </div>
                                <div className="lg:col-span-1" />
                            </div>
                        )}

                        {/* Footer */}
                        <footer className={`mt-6 text-center text-xs ${themeClasses.text}`}>
                            <div>by kelompok 10</div>
                        </footer>
                    </div>
                </main>
            </div>
        </div>
    );
}

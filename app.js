// Menggunakan Firebase Modular SDK v10
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Konfigurasi Database
const firebaseConfig = {
    apiKey: "AIzaSyBIKntWPfzehEaiAXNcDriiK5KVbRHoe9g",
    databaseURL: "https://iot-fuzzy-logic-termo-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "iot-fuzzy-logic-termo"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 1. INISIALISASI GAUGE
// ==========================================
const gaugeOptions = {
    angle: 0.15, 
    lineWidth: 0.2, 
    radiusScale: 1, 
    pointer: {
        length: 0.6, 
        strokeWidth: 0.035, 
        color: '#003366' 
    },
    limitMax: false, 
    limitMin: false,
    highDpiSupport: true,
    renderTicks: {
        divisions: 5, divWidth: 1.1, divLength: 0.7, divColor: '#b3d4ff',
        subDivisions: 3, subLength: 0.5, subWidth: 0.6, subColor: '#e6f0ff'
    }
};

const tempGauge = new Gauge(document.getElementById('tempGauge')).setOptions({
    ...gaugeOptions, colorStart: '#33ccff', colorStop: '#0088cc', strokeColor: '#f0f8ff'
});
tempGauge.maxValue = 50; tempGauge.setMinValue(0); tempGauge.animationSpeed = 32; tempGauge.set(0);

// UPDATE: Maksimal Gauge PWM sekarang adalah 100 (Persentase)
const pwmGauge = new Gauge(document.getElementById('pwmGauge')).setOptions({
    ...gaugeOptions, colorStart: '#66b3ff', colorStop: '#0066cc', strokeColor: '#f0f8ff'
});
pwmGauge.maxValue = 100; pwmGauge.setMinValue(0); pwmGauge.animationSpeed = 32; pwmGauge.set(0);

const humGauge = new Gauge(document.getElementById('humGauge')).setOptions({
    ...gaugeOptions, colorStart: '#99ccff', colorStop: '#004080', strokeColor: '#f0f8ff'
});
humGauge.maxValue = 100; humGauge.setMinValue(0); humGauge.animationSpeed = 32; humGauge.set(0);

// ==========================================
// 2. INISIALISASI CHART.JS (SETTING 1 JAM)
// ==========================================
const ctxHistory = document.getElementById('tempHistoryChart').getContext('2d');
const MAX_HISTORY_POINTS = 60; // 60 Titik = 60 Menit (1 Jam)

const tempHistoryChart = new Chart(ctxHistory, {
    type: 'line',
    data: {
        labels: [], 
        datasets: [{
            label: 'Suhu (°C)',
            data: [], 
            borderColor: '#007bff',
            backgroundColor: 'rgba(0, 123, 255, 0.15)',
            fill: true,
            tension: 0.4, 
            pointRadius: 3,
            pointBackgroundColor: '#004080'
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { 
                title: { display: true, text: 'Waktu', color: '#0059b3' },
                ticks: { color: '#004080' },
                grid: { color: 'rgba(0, 102, 204, 0.1)' }
            },
            y: { 
                title: { display: true, text: 'Suhu (°C)', color: '#0059b3' }, 
                min: 10, max: 45,
                ticks: { color: '#004080' },
                grid: { color: 'rgba(0, 102, 204, 0.1)' }
            }
        },
        plugins: { legend: { display: false } },
        animation: { duration: 0 } 
    }
});

// ==========================================
// 3. INTEGRASI FIREBASE & PEMBARUAN UI
// ==========================================
const elSuhuText = document.getElementById('suhu-text');
const elPwmText = document.getElementById('pwm-text');
const elHumText = document.getElementById('hum-text');
const elStatus = document.getElementById('status-val');
const elSpeed = document.getElementById('speed-val');

// Variabel untuk mengontrol pembaruan grafik (1 titik per menit)
let lastChartUpdate = 0;
const CHART_UPDATE_INTERVAL = 60000; // 60.000 ms = 1 menit

const monitoringRef = ref(db, 'monitoring');
onValue(monitoringRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        const suhu = data.suhu || 0;
        const hum = data.humidity || 0;
        const pwmRaw = data.pwm || 0; // Nilai mentah 0-255 dari ESP32
        const status = data.status || "UNKNOWN";
        const now = Date.now();
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // KONVERSI PWM KE PERSENTASE (0-100%)
        const pwmPercent = (pwmRaw / 255) * 100;

        // Update Gauge & Teks secara Real-time
        tempGauge.set(suhu);
        pwmGauge.set(pwmPercent);
        humGauge.set(hum);

        elSuhuText.innerText = suhu.toFixed(1);
        elPwmText.innerText = Math.round(pwmPercent); // Dibulatkan agar rapi (misal 45%)
        elHumText.innerText = hum.toFixed(1);

        // Update Status Badge Warna
        elStatus.innerText = status;
        if (status === "COOL") {
            elStatus.style.backgroundColor = "#3498db";
            elSpeed.style.backgroundColor = "#3498db";
            elSpeed.innerText = "SPEED: OFF";
        } else if (status === "NORMAL") {
            elStatus.style.backgroundColor = "#f1c40f";
            elSpeed.style.backgroundColor = "#f1c40f";
            elSpeed.innerText = "SPEED: MED";
        } else if (status === "HOT") {
            elStatus.style.backgroundColor = "#e74c3c";
            elSpeed.style.backgroundColor = "#e74c3c";
            elSpeed.innerText = "SPEED: FAST";
        }

        // UPDATE CHART HANYA SETIAP 1 MENIT (Membangun riwayat 1 jam)
        if (now - lastChartUpdate >= CHART_UPDATE_INTERVAL || lastChartUpdate === 0) {
            lastChartUpdate = now;
            
            tempHistoryChart.data.labels.push(timeNow);
            tempHistoryChart.data.datasets[0].data.push(suhu);

            // Buang titik paling lama jika sudah lebih dari 60 titik (1 jam)
            if (tempHistoryChart.data.labels.length > MAX_HISTORY_POINTS) {
                tempHistoryChart.data.labels.shift();
                tempHistoryChart.data.datasets[0].data.shift();
            }
            tempHistoryChart.update();
        }
    }
});

// ==========================================
// 4. LOGIKA PENGATURAN BATAS FUZZY (2-ARAH)
// ==========================================
const inputDingin = document.getElementById('batas-dingin');
const inputNormal = document.getElementById('batas-normal');
const inputPanas = document.getElementById('batas-panas');
const formFuzzy = document.getElementById('fuzzy-form');
const alertMsg = document.getElementById('alert-msg');

get(ref(db, 'settings')).then((snapshot) => {
    if (snapshot.exists()) {
        const settings = snapshot.val();
        inputDingin.value = settings.batas_dingin_max || 24;
        inputNormal.value = settings.batas_normal_mid || 28;
        inputPanas.value = settings.batas_panas_min || 32;
    } else {
        inputDingin.value = 24; 
        inputNormal.value = 28; 
        inputPanas.value = 32;
    }
});

formFuzzy.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-btn');
    btn.innerText = "Menyimpan ke Cloud...";
    
    set(ref(db, 'settings'), {
        batas_dingin_max: parseFloat(inputDingin.value),
        batas_normal_mid: parseFloat(inputNormal.value),
        batas_panas_min: parseFloat(inputPanas.value)
    }).then(() => {
        alertMsg.classList.remove('hidden'); 
        btn.innerText = "Simpan Pengaturan";
        setTimeout(() => alertMsg.classList.add('hidden'), 3000);
    }).catch((error) => {
        console.error("Gagal menyimpan:", error);
        btn.innerText = "Gagal! Coba Lagi";
    });
});
// ==========================================
// FIREBASE INIT (MODULAR SDK v10)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBIKntWPfzehEaiAXNcDriiK5KVbRHoe9g",
    databaseURL: "https://iot-fuzzy-logic-termo-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "iot-fuzzy-logic-termo"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 1. GAUGE INIT (TEMA BIRU)
// ==========================================
const gaugeOptions = {
    angle: 0.15,
    lineWidth: 0.2,
    radiusScale: 1,
    pointer: { length: 0.6, strokeWidth: 0.035, color: '#003366' },
    limitMax: false, limitMin: false, highDpiSupport: true,
    renderTicks: {
        divisions: 5, divWidth: 1.1, divLength: 0.7, divColor: '#b3d4ff',
        subDivisions: 3, subLength: 0.5, subWidth: 0.6, subColor: '#e6f0ff'
    }
};

const tempGauge = new Gauge(document.getElementById('tempGauge')).setOptions({
    ...gaugeOptions, colorStart: '#33ccff', colorStop: '#0088cc', strokeColor: '#f0f8ff'
});
tempGauge.maxValue = 50; tempGauge.setMinValue(0); tempGauge.set(0);

const pwmGauge = new Gauge(document.getElementById('pwmGauge')).setOptions({
    ...gaugeOptions, colorStart: '#66b3ff', colorStop: '#0066cc', strokeColor: '#f0f8ff'
});
pwmGauge.maxValue = 100; pwmGauge.setMinValue(0); pwmGauge.set(0);

const humGauge = new Gauge(document.getElementById('humGauge')).setOptions({
    ...gaugeOptions, colorStart: '#99ccff', colorStop: '#004080', strokeColor: '#f0f8ff'
});
humGauge.maxValue = 100; humGauge.setMinValue(0); humGauge.set(0);

// ==========================================
// 2. CHART INIT (GRAFIK 24 JAM)
// ==========================================
const ctxHistory = document.getElementById('tempHistoryChart').getContext('2d');

const tempHistoryChart = new Chart(ctxHistory, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Suhu (°C)',
            data: [],
            borderColor: '#007bff',
            backgroundColor: 'rgba(0,123,255,0.15)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            spanGaps: true // Menghubungkan titik jika ada jam yang terlewat
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { 
                title: { display: true, text: 'Jam (00:00 - 23:00)' },
                grid: { color: 'rgba(0, 102, 204, 0.1)' }
            },
            y: { 
                title: { display: true, text: 'Suhu (°C)' }, 
                min: 10, max: 45,
                grid: { color: 'rgba(0, 102, 204, 0.1)' }
            }
        },
        plugins: { legend: { display: false } },
        animation: { duration: 800 }
    }
});

// ==========================================
// 3. MONITORING REALTIME (ESP32)
// ==========================================
const elSuhuText = document.getElementById('suhu-text');
const elPwmText = document.getElementById('pwm-text');
const elHumText = document.getElementById('hum-text');
const elStatus = document.getElementById('status-val');
const elSpeed = document.getElementById('speed-val');

const monitoringRef = ref(db, 'monitoring');

onValue(monitoringRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const suhu = data.suhu || 0;
    const hum = data.humidity || 0;
    const pwmRaw = data.pwm || 0;
    const status = data.status || "UNKNOWN";

    // Konversi PWM ke Persentase
    const pwmPercent = (pwmRaw / 255) * 100;

    // Update Jarum Gauge
    tempGauge.set(suhu);
    pwmGauge.set(pwmPercent);
    humGauge.set(hum);

    // Update Teks Bawah Gauge
    elSuhuText.innerText = suhu.toFixed(1);
    elPwmText.innerText = Math.round(pwmPercent);
    elHumText.innerText = hum.toFixed(1);

    // Update Status Badge Warna
    elStatus.innerText = status;
    if (status === "COOL") {
        elStatus.style.backgroundColor = "#29B6F6";
        elSpeed.style.backgroundColor = "#29B6F6";
        elSpeed.innerText = "SPEED: OFF";
    } else if (status === "NORMAL") {
        elStatus.style.backgroundColor = "#43A047";
        elSpeed.style.backgroundColor = "#43A047";
        elSpeed.innerText = "SPEED: MED";
    } else if (status === "HOT") {
        elStatus.style.backgroundColor = "#E53935";
        elSpeed.style.backgroundColor = "#E53935";
        elSpeed.innerText = "SPEED: FAST";
    }
});

// ==========================================
// 4. HISTORI PER HARI (DENGAN KALENDER)
// ==========================================
const datePicker = document.getElementById('history-date');

// Mengambil Tanggal Hari Ini & Menset ke Kalender
const today = new Date();
const todayStr = today.getFullYear() + "-" + 
                 String(today.getMonth() + 1).padStart(2, '0') + "-" + 
                 String(today.getDate()).padStart(2, '0');
datePicker.value = todayStr;

let unsubscribeHistory = null; 

// Fungsi Utama: Menarik data berdasarkan tanggal terpilih
function loadHistoryByDate(dateString) {
    if (unsubscribeHistory) {
        unsubscribeHistory(); // Matikan listener tanggal sebelumnya agar tidak tumpang tindih
    }

    // Path disesuaikan dengan folder tanggal di Firebase (ex: /history/2026-04-10)
    const historyRef = ref(db, 'history/' + dateString);

    unsubscribeHistory = onValue(historyRef, (snapshot) => {
        const data = snapshot.val() || {}; 

        tempHistoryChart.data.labels = [];
        tempHistoryChart.data.datasets[0].data = [];

        // Looping jam 00:00 sampai 23:00
        for (let i = 0; i < 24; i++) {
            const key = "jam_" + i;
            const label = (i < 10 ? "0" + i : i) + ":00";
            
            // Masukkan data jika ada, biarkan null jika kosong (spanGaps akan merapikannya)
            const value = data[key] !== undefined ? data[key] : null;

            tempHistoryChart.data.labels.push(label);
            tempHistoryChart.data.datasets[0].data.push(value);
        }

        tempHistoryChart.update();
    });
}

// Panggil fungsi saat web pertama kali direfresh
loadHistoryByDate(datePicker.value);

// Panggil fungsi ulang saat kamu memilih tanggal lain di kalender
datePicker.addEventListener('change', (e) => {
    loadHistoryByDate(e.target.value);
});

// ==========================================
// 5. SETTINGS FUZZY (UBAH BATAS SUHU)
// ==========================================
const inputDingin = document.getElementById('batas-dingin');
const inputNormal = document.getElementById('batas-normal');
const inputPanas = document.getElementById('batas-panas');
const formFuzzy = document.getElementById('fuzzy-form');
const alertMsg = document.getElementById('alert-msg');

get(ref(db, 'settings')).then((snapshot) => {
    if (snapshot.exists()) {
        const s = snapshot.val();
        inputDingin.value = s.batas_dingin_max || 24;
        inputNormal.value = s.batas_normal_mid || 28;
        inputPanas.value = s.batas_panas_min || 32;
    }
});

formFuzzy.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-btn');
    btn.innerText = "Menyimpan...";

    set(ref(db, 'settings'), {
        batas_dingin_max: parseFloat(inputDingin.value),
        batas_normal_mid: parseFloat(inputNormal.value),
        batas_panas_min: parseFloat(inputPanas.value)
    }).then(() => {
        alertMsg.classList.remove('hidden');
        btn.innerText = "Simpan Pengaturan";
        setTimeout(() => alertMsg.classList.add('hidden'), 3000);
    }).catch(() => {
        btn.innerText = "Gagal!";
    });
});

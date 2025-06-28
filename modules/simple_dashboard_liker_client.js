document.addEventListener('DOMContentLoaded', () => {
    // Elementler
    const userSelect = document.getElementById('userSelect');
    const userLikeLimitSlider = document.getElementById('userLikeLimitSlider');
    const userLikeLimitValue = document.getElementById('userLikeLimitValue');
    const refreshIntervalSlider = document.getElementById('refreshIntervalSlider');
    const refreshIntervalValue = document.getElementById('refreshIntervalValue');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const statusText = document.getElementById('statusText');
    const actionLogArea = document.getElementById('actionLogArea');

    // DEĞİŞİKLİK: Zaman aralıkları 1'den 120'ye kadar 1'er dakika artacak şekilde programatik olarak oluşturuldu.
    const REFRESH_INTERVAL_MAP = Array.from({ length: 120 }, (_, i) => {
        const minutes = i + 1;
        let label = `${minutes} Dakika`;
        if (minutes === 60) {
            label = "1 Saat";
        } else if (minutes === 90) {
            label = "1.5 Saat";
        } else if (minutes === 120) {
            label = "2 Saat";
        }
        return { value: minutes * 60 * 1000, label };
    });

    // Kullanıcıları çek ve select'e doldur
    async function populateUsers() {
        try {
            const response = await fetch('/api/users');
            const users = await response.json();
            userSelect.innerHTML = '<option value="">-- Hesap Seçin --</option>';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.appUsername;
                option.textContent = user.tumblrBlogName || user.appUsername.split('_')[0];
                userSelect.appendChild(option);
            });
        } catch (error) {
            userSelect.innerHTML = '<option>Kullanıcılar yüklenemedi.</option>';
            console.error('Kullanıcılar çekilirken hata:', error);
        }
    }

    // Slider değerlerini güncelle
    userLikeLimitSlider.addEventListener('input', () => {
        userLikeLimitValue.textContent = userLikeLimitSlider.value;
    });
    refreshIntervalSlider.addEventListener('input', () => {
        refreshIntervalValue.textContent = REFRESH_INTERVAL_MAP[refreshIntervalSlider.value].label;
    });

    function addLog(logString) {
        actionLogArea.innerHTML += `${logString}\n`;
        actionLogArea.scrollTop = actionLogArea.scrollHeight;
    }

    // Durum güncelleme
    async function updateStatus() {
        const selectedUser = userSelect.value;
        if (!selectedUser) return;

        try {
            const response = await fetch(`/api/bots/dashboard-liker/status?user=${selectedUser}`);
            const data = await response.json();

            statusText.textContent = data.status;
            // Sadece yeni logları ekle
            if (data.logs.length > lastLogCount) {
                const newLogs = data.logs.slice(lastLogCount);
                newLogs.forEach(log => addLog(log));
                lastLogCount = data.logs.length;
            }

            if(data.status === 'running' || data.status === 'starting') {
                startButton.disabled = true;
                stopButton.disabled = false;
            } else {
                 startButton.disabled = false;
                 stopButton.disabled = true;
            }
        } catch(e) {
            console.error("Durum güncellenirken hata oluştu:", e);
        }
    }

    // Botu başlat
    startButton.addEventListener('click', async () => {
        const appUsername = userSelect.value;
        if (!appUsername) {
            alert('Lütfen bir hesap seçin!');
            return;
        }

        const params = {
            appUsername,
            userLikeLimit: parseInt(userLikeLimitSlider.value, 10),
            refreshIntervalMs: REFRESH_INTERVAL_MAP[refreshIntervalSlider.value].value
        };

        addLog(`Bot başlatılıyor... Parametreler: ${JSON.stringify(params)}`);
        const response = await fetch('/api/bots/dashboard-liker/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        const result = await response.json();
        addLog(`Sunucu yanıtı: ${result.message}`);
        if (result.success) {
            lastLogCount = 0; // Logları sıfırla
            actionLogArea.innerHTML = ''; // Log alanını temizle
            updateStatus();
        }
    });

    // Botu durdur
    stopButton.addEventListener('click', async () => {
        const appUsername = userSelect.value;
        if (!appUsername) return;

        addLog('Bot durdurma komutu gönderiliyor...');
        const response = await fetch('/api/bots/dashboard-liker/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appUsername })
        });
        const result = await response.json();
        addLog(`Sunucu yanıtı: ${result.message}`);
    });
    
    // Kullanıcı değiştiğinde durumu otomatik güncelle
    userSelect.addEventListener('change', () => {
         lastLogCount = 0;
         actionLogArea.innerHTML = '';
         updateStatus();
    });

    // Sayfa yüklendiğinde
    async function init() {
        await populateUsers();
        // Durumu her 3 saniyede bir kontrol et
        statusInterval = setInterval(updateStatus, 3000);
        userLikeLimitValue.textContent = userLikeLimitSlider.value;
        refreshIntervalValue.textContent = REFRESH_INTERVAL_MAP[refreshIntervalSlider.value].label;
        stopButton.disabled = true;
    }

    init();
});
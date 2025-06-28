// modules/backgroundBotManager.js
const { Worker } = require('worker_threads');
const path = require('path');

const activeBots = {}; // Çalışan botları burada tutacağız { appUsername: { worker, status, logs } }

function startBot(appUsername, params) {
    if (activeBots[appUsername]) {
        console.log(`[BotManager] ${appUsername} için bot zaten çalışıyor.`);
        return { success: false, message: 'Bot zaten çalışıyor.' };
    }

    console.log(`[BotManager] ${appUsername} için yeni bir worker başlatılıyor...`);
    const worker = new Worker(path.resolve(__dirname, 'dashboard_liker.worker.js'));

    const botData = {
        worker,
        status: 'starting',
        logs: [`[${new Date().toLocaleTimeString()}] Bot başlatma komutu alındı.`]
    };
    activeBots[appUsername] = botData;

    worker.on('message', (message) => {
        if (message.type === 'log') {
            const logMessage = `[${new Date().toLocaleTimeString()}] [${message.logType.toUpperCase()}] ${message.message}`;
            botData.logs.push(logMessage);
            // Logları belirli bir sayıda tutmak için (örneğin son 100 log)
            if (botData.logs.length > 100) {
                botData.logs.shift();
            }
        } else if (message.type === 'stopped') {
            botData.status = 'stopped';
        }
    });

    worker.on('error', (error) => {
        console.error(`[BotManager] ${appUsername} worker'ında hata:`, error);
        botData.status = 'error';
        botData.logs.push(`[${new Date().toLocaleTimeString()}] [HATA] Worker çöktü: ${error.message}`);
        delete activeBots[appUsername];
    }
    );

    worker.on('exit', (code) => {
        console.log(`[BotManager] ${appUsername} worker'ı ${code} koduyla sonlandı.`);
        if (activeBots[appUsername]) { // Eğer stopBot ile temizlenmediyse
            activeBots[appUsername].status = 'stopped';
        }
        // Normalde stopBot fonksiyonu temizliği yapar, bu beklenmedik kapanmalar içindir.
    });
    
    // Worker'a başlangıç ayarlarını gönder
    worker.postMessage({ type: 'start', config: params });
    botData.status = 'running';

    return { success: true, message: 'Bot başarıyla başlatıldı.' };
}

function stopBot(appUsername) {
    const botData = activeBots[appUsername];
    if (!botData) {
        return { success: false, message: 'Bot çalışmıyor.' };
    }

    console.log(`[BotManager] ${appUsername} için durdurma komutu gönderiliyor...`);
    botData.worker.postMessage({ type: 'stop' });
    
    // Worker'ın kendi kendine sonlanmasını bekleyip 'exit' event'inde temizlemek daha güvenli olabilir.
    // Şimdilik direkt sonlandırıp silelim.
    setTimeout(() => {
        botData.worker.terminate();
        delete activeBots[appUsername];
        console.log(`[BotManager] ${appUsername} worker'ı sonlandırıldı ve listeden silindi.`);
    }, 1000); // Worker'a döngüyü bitirmesi için 1 saniye verelim

    return { success: true, message: 'Bot durdurma komutu gönderildi.' };
}

function getBotStatus(appUsername) {
    const botData = activeBots[appUsername];
    if (!botData) {
        return { status: 'inactive', logs: [] };
    }
    // Her seferinde sadece yeni logları göndermek yerine tüm logları gönderiyoruz, istemci yönetir.
    return { status: botData.status, logs: botData.logs };
}

module.exports = {
    startBot,
    stopBot,
    getBotStatus
};
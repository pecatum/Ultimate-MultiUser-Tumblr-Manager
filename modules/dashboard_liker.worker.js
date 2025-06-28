// modules/dashboard_liker.worker.js
const { parentPort } = require('worker_threads');
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

// Gerekli yardımcı modüller
const { makeTumblrApiRequest } = require('./serverUtils');
const { fetchUserLimits } = require('./userLimitsHandler');

// --- Durum Değişkenleri ---
let isRunning = false;
let botConfig = {};
let mainLoopTimeout;
const DAILY_TUMBLR_LIKE_LIMIT = 1000;

// --- Worker İçi XML ve Token Okuma Fonksiyonları ---
const USERS_DB_PATH = path.join(__dirname, '../users.xml');
const LIKES_DB_PATH = path.join(__dirname, '../daily_like_counts.xml');
const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
const builder = new xml2js.Builder();

/**
 * users.xml dosyasını okur ve kullanıcı verisini döndürür.
 * Bu fonksiyon, token hatası durumunda en güncel token'ı almak için kullanılır.
 * @param {string} appUsername - Token'ı alınacak kullanıcının adı.
 * @returns {Promise<string|null>} - Yeni accessToken veya bulunamazsa null.
 */
async function getFreshTokenFromStorage(appUsername) {
    try {
        const data = await fs.readFile(USERS_DB_PATH, 'utf-8');
        const result = await parser.parseStringPromise(data);
        if (result.users && result.users.user) {
            const userArray = Array.isArray(result.users.user) ? result.users.user : [result.users.user];
            const targetUser = userArray.find(u => u.appUsername === appUsername);
            return targetUser ? targetUser.accessToken : null;
        }
        return null;
    } catch (error) {
        log(`HATA: users.xml okunurken veya parse edilirken bir sorun oluştu: ${error.message}`, 'error');
        return null;
    }
}


// --- Günlük Beğeni Takibi (Worker İçinde) ---
async function getLikesDatabase() {
    try {
        const data = await fs.readFile(LIKES_DB_PATH, 'utf-8');
        return await parser.parseStringPromise(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { dailyLikes: { lastReset: '1970-01-01', users: { user: [] } } };
        }
        throw error;
    }
}

async function writeLikesDatabase(jsObject) {
    const xmlData = builder.buildObject(jsObject);
    await fs.writeFile(LIKES_DB_PATH, xmlData, 'utf-8');
}

async function checkAndResetDailyLikes() {
    const db = await getLikesDatabase();
    const today = new Date().toISOString().split('T')[0];
    if (!db.dailyLikes || db.dailyLikes.lastReset !== today) {
        log(`Yeni gün (${today}), günlük beğeni sayıları sıfırlanıyor.`, 'system');
        await writeLikesDatabase({ dailyLikes: { lastReset: today, users: { user: [] } } });
    }
}

async function getDailyLikeCountForBlog(appUsername, blogName) {
    const db = await getLikesDatabase();
    if (!db.dailyLikes.users || !db.dailyLikes.users.user) return 0;
    
    const userArray = Array.isArray(db.dailyLikes.users.user) ? db.dailyLikes.users.user : [db.dailyLikes.users.user];
    const user = userArray.find(u => u.appUsername === appUsername);
    if (!user || !user.liked) return 0;

    const likedArray = Array.isArray(user.liked) ? user.liked : [user.liked];
    const blog = likedArray.find(b => b.blog === blogName);
    return blog ? parseInt(blog._, 10) : 0;
}

async function incrementDailyLikeCountForBlog(appUsername, blogName) {
    const db = await getLikesDatabase();
    if (!db.dailyLikes.users) db.dailyLikes.users = {};
    if (!db.dailyLikes.users.user) db.dailyLikes.users.user = [];
    else if (!Array.isArray(db.dailyLikes.users.user)) db.dailyLikes.users.user = [db.dailyLikes.users.user];
    
    let user = db.dailyLikes.users.user.find(u => u.appUsername === appUsername);
    if (!user) {
        user = { appUsername: appUsername, liked: [] };
        db.dailyLikes.users.user.push(user);
    }
    
    if (!user.liked) user.liked = [];
    else if (!Array.isArray(user.liked)) user.liked = [user.liked];
    
    let blog = user.liked.find(b => b.blog === blogName);
    if (blog) {
        blog._ = (parseInt(blog._ || '0', 10) + 1).toString();
    } else {
        user.liked.push({ blog: blogName, _: '1' });
    }
    await writeLikesDatabase(db);
}

// --- Ana Bot Mantığı ---
function log(message, type = 'info') {
    parentPort.postMessage({ type: 'log', message, logType: type });
}

function delay(ms) {
    return new Promise(resolve => mainLoopTimeout = setTimeout(resolve, ms));
}

async function handleRateLimitBackoff() {
    log('Limit Aşıldı hatası alındı. Kademeli bekleme stratejisi başlatılıyor...', 'warn');
    
    log('30 saniye bekleniyor...', 'info');
    await delay(30 * 1000);
    if (!isRunning) return false;

    try {
        await makeTumblrApiRequest('GET', '/user/info', botConfig.accessToken, null, false, null, botConfig.appUsername);
        log('Test isteği başarılı. Bota devam ediliyor.', 'success');
        return true;
    } catch (e) {
        log('30 saniye sonrası deneme de başarısız oldu. 1 dakika daha beklenecek...', 'warn');
        await delay(60 * 1000);
        if (!isRunning) return false;
    }

     try {
        log('Son deneme: Genel günlük limitler kontrol ediliyor...', 'info');
        const limits = await fetchUserLimits({}, botConfig.accessToken, botConfig.appUsername);
        if (limits && limits.usage && limits.usage.likes && limits.usage.likes.count >= DAILY_TUMBLR_LIKE_LIMIT) {
            log(`Genel günlük ${DAILY_TUMBLR_LIKE_LIMIT} beğeni limitine ulaşıldı! Bot bugünlük durduruluyor.`, 'error');
            return false;
        } else {
            log(`Genel günlük limitin altında. Sorun devam ediyor, 5 dakika beklenip yeniden denenecek.`, 'warn');
            await delay(5 * 60 * 1000);
            return true;
        }
    } catch (limitError) {
        log(`Limit bilgisi çekilirken hata oluştu: ${limitError.message}. Güvenlik için 5 dakika bekleniyor.`, 'error');
        await delay(5 * 60 * 1000);
        return true;
    }
}

/**
 * Yetki hatası durumunda 10 dakika bekleyip yeni tokeni dosyadan okur.
 */
async function handleUnauthorizedErrorAndRestart() {
    log('Yetki hatası alındı. Bot durduruldu ve 10 dakika bekleme moduna geçildi...', 'warn');
    await delay(10 * 60 * 1000);

    // Eğer bu bekleme sırasında kullanıcı botu manuel olarak durdurduysa devam etme
    if (!isRunning) {
        log('Bekleme sırasında bot manuel olarak durduruldu, yeniden başlatılmayacak.', 'system');
        parentPort.postMessage({ type: 'stopped' });
        return;
    }

    log('10 dakika beklendi. users.xml dosyasından yeni token kontrol ediliyor...', 'system');
    const freshToken = await getFreshTokenFromStorage(botConfig.appUsername);
    
    if (freshToken && freshToken !== botConfig.accessToken) {
        log('Yeni ve farklı bir token bulundu! Bot yeni token ile yeniden başlatılıyor.', 'success');
        botConfig.accessToken = freshToken;
        runBot(); // Temiz bir başlangıçla botu yeniden çalıştır
    } else {
        log('Depolamada yeni bir token bulunamadı veya mevcut token ile aynı. Bot kapalı kalacak. Yeniden giriş gerekebilir.', 'error');
        isRunning = false; // Botu kapalı tut
        parentPort.postMessage({ type: 'stopped' }); // Durduğunu ana sürece bildir
    }
}

async function runBot() {
    isRunning = true;
    log('Arka plan bot döngüsü başlatıldı. 🚀', 'system');
    await checkAndResetDailyLikes();

    while (isRunning) {
        try {
            log('Yeni tur: Panel gönderileri çekiliyor...', 'info');
            const dashboardData = await makeTumblrApiRequest(
                'GET', '/user/dashboard', botConfig.accessToken,
                { limit: 50, reblog_info: true },
                false, null, botConfig.appUsername
            );

            if (!dashboardData || !dashboardData.posts || dashboardData.posts.length === 0) {
                log('Panelde yeni gönderi bulunamadı.', 'warn');
            } else {
                log(`${dashboardData.posts.length} gönderi panelden çekildi. Beğenme işlemi başlıyor.`, 'info');

                for (const post of dashboardData.posts) {
                    if (!isRunning) break; 

                    const postOwner = post.blog_name;
                    const dailyLikesForBlog = await getDailyLikeCountForBlog(botConfig.appUsername, postOwner);

                    if (dailyLikesForBlog >= botConfig.userLikeLimit) {
                        log(`GÜNLÜK LİMİT: "${postOwner}" kullanıcısından bugün zaten ${dailyLikesForBlog} gönderi beğenildi. Atlanıyor.`, 'debug');
                        continue;
                    }

                    try {
                        await makeTumblrApiRequest(
                            'POST', '/user/like', botConfig.accessToken,
                            { id: post.id_string, reblog_key: post.reblog_key },
                            false, null, botConfig.appUsername
                        );
                        log(`BAŞARILI: "${postOwner}" kullanıcısının "${post.id_string}" ID'li gönderisi beğenildi. ❤️`, 'success');
                        await incrementDailyLikeCountForBlog(botConfig.appUsername, postOwner);
                        
                        const randomDelay = Math.floor(Math.random() * 4001) + 2000;
                        log(`Sonraki beğeni için ${(randomDelay / 1000).toFixed(2)} saniye bekleniyor...`, 'debug');
                        if (isRunning) await delay(randomDelay);
                    
                    } catch (likeError) {
                        log(`BEĞENİ HATASI: "${post.id_string}" ID'li gönderi beğenilemedi: ${likeError.message}`, 'error');
                        
                        if (likeError.statusCode === 429 || likeError.statusCode === 403) {
                             const shouldContinue = await handleRateLimitBackoff();
                             if (!shouldContinue) isRunning = false;
                        } else if (likeError.needsReAuth) {
                           throw likeError;
                        }
                    }
                }
            }

        } catch (error) {
            log(`Ana döngüde kritik hata: ${error.message}.`, 'error');
            
            if (error.needsReAuth) {
                // Döngüyü durdur ve yeniden başlatma sürecini ayrı bir fonksiyona devret.
                isRunning = false;
                handleUnauthorizedErrorAndRestart();
                return; // Bu fonksiyonun mevcut çalışmasını sonlandır, çünkü handleUnauthorizedErrorAndRestart devraldı.
            }
        }
        
        if (isRunning) {
            log(`Tur tamamlandı. ${botConfig.refreshIntervalMs / 1000} saniye bekleniyor...`, 'system');
            await delay(botConfig.refreshIntervalMs);
        }
    }
    
    // Döngü bittiğinde ve yeniden başlatma sürecinde değilsek bu mesajı göster.
    // 'restarting' gibi bir flag olmadığı için bu koşulu daha basit hale getirelim.
    // Bot durdurulduğunda mesajı her zaman gösterelim. handleUnauthorizedErrorAndRestart kendi mesajlarını yönetiyor.
    if (!isRunning) {
        log('Bot döngüsü sonlandırıldı. 🛑', 'system');
        parentPort.postMessage({ type: 'stopped' });
    }
}

parentPort.on('message', (message) => {
    if (message.type === 'start' && !isRunning) {
        botConfig = message.config;
        runBot();
    } else if (message.type === 'stop') {
        isRunning = false;
        if (mainLoopTimeout) clearTimeout(mainLoopTimeout);
    }
});
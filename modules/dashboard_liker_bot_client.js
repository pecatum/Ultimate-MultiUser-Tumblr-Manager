// modules/dashboard_liker_bot_client.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Global Element Tanımlamaları ---
    const moduleUserCheckboxesContainer = document.getElementById('moduleUserCheckboxesContainer');
    const multiUserLimitsDisplayArea = document.getElementById('multiUserLimitsDisplayArea');
    const userControlCardsContainer = document.getElementById('userControlCardsContainer');
    const actionLogArea = document.getElementById('actionLogArea');
    // YENİ: Global UI Elementleri
    const selectAllButton = document.getElementById('selectAllButton');
    const globalPostsToLikeSlider = document.getElementById('globalPostsToLikeSlider');
    const globalPostsToLikeValue = document.getElementById('globalPostsToLikeValue');
    const globalRefreshIntervalSlider = document.getElementById('globalRefreshIntervalSlider');
    const globalRefreshIntervalValue = document.getElementById('globalRefreshIntervalValue');


    // Templates
    const userLimitDisplayTemplate = document.getElementById('userLimitDisplayTemplate');
    const userControlCardTemplate = document.getElementById('userControlCardTemplate');

    if (!userControlCardTemplate) {
        console.error("KRİTİK HATA: Kullanıcı kontrol kartı şablonu (userControlCardTemplate) bulunamadı!");
        return;
    }
    if (!userControlCardsContainer) {
        console.error("KRİTİK HATA: Kullanıcı kontrol kartları konteyneri (userControlCardsContainer) bulunamadı!");
        return;
    }
     if (!userLimitDisplayTemplate) {
        console.warn("UYARI: Kullanıcı limit gösterim şablonu (userLimitDisplayTemplate) bulunamadı! Limitler gösterilemeyebilir.");
    }

    // --- Durum Değişkenleri ---
    let selectedAppUsernames = new Set();
    let botInstances = {}; // Her kullanıcı için bot durumu, ayarları ve sayaçları

    // GÜNCELLEME: Varsayılan ayarlar için indexler HTML'den okunacak. Bu map sabit kalıyor.
    const REFRESH_INTERVAL_MAP = [
        { value: 30 * 1000, label: "30 Saniye" },
        { value: 60 * 1000, label: "1 Dakika" },
        { value: 2 * 60 * 1000, label: "2 Dakika" },
        { value: 5 * 60 * 1000, label: "5 Dakika" },
        { value: 10 * 60 * 1000, label: "10 Dakika" }
    ];

    const MAX_INITIAL_LIKE_RETRIES = 5;
    const MAX_COOLDOWN_LIKE_RETRIES = 5;
    const LIKE_RETRY_COOLDOWN_MS = 60 * 1000; // 1 dakika
    const SHORT_RETRY_DELAY_MS = 2000; // Kısa denemeler arası bekleme
    const LIMIT_REFRESH_INTERVAL_MS = 30 * 1000; // Limitleri yenileme aralığı
    // YENİ: Beğeniler arası bekleme süresi
    const DELAY_BETWEEN_LIKES_MS = 2000;

    // --- Yardımcı Fonksiyonlar ---
    function logAction(message, type = 'info', appUsername = null) {
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry py-0.5 border-b border-gray-100 last:border-b-0';
        let typePrefix = type.toUpperCase();
        let color = 'text-gray-700';

        if (type === 'error') { color = 'text-red-600 font-semibold'; }
        else if (type === 'success') { color = 'text-green-600 font-semibold'; }
        else if (type === 'warn') { color = 'text-yellow-600 font-semibold'; }
        else if (type === 'system') { color = 'text-blue-600 font-semibold'; }
        else if (type === 'debug') { color = 'text-purple-600'; typePrefix = 'DEBUG'; }

        const userPrefix = appUsername ? `<span class="font-medium text-indigo-600">[${appUsername.split('_')[0]}]</span> ` : '';
        logEntry.innerHTML = `<span class="text-xs text-gray-400 mr-1">[${timeString}]</span> <strong class="${color} text-xs">${userPrefix}${typePrefix}:</strong> <span class="${color} text-xs">${message}</span>`;
        if (actionLogArea) {
            actionLogArea.appendChild(logEntry);
            actionLogArea.scrollTop = actionLogArea.scrollHeight;
        } else {
            console.warn("Log alanı (actionLogArea) bulunamadı. Log konsola yazdırılıyor:", message);
        }

        if (type === 'debug' || type === 'error' || (appUsername && type !== 'info' && type !== 'success')) {
            console.log(`[LikerBot Log]${appUsername ? `[${appUsername}]` : ''} ${type}: ${message}`);
        }
    }

    function updateProgressBar(barElement, percentage) {
        if (!barElement) return;
        percentage = Math.max(0, Math.min(100, percentage));
        barElement.style.width = `${percentage}%`;
    }

    async function executeApiActionForModule(actionId, params = {}, appUsernameForAction) {
        if (!appUsernameForAction) {
            logAction("API eylemi için AppUsername belirtilmedi.", "error", null);
            throw { message: "AppUsername gerekli.", isUserError: true, type: "auth" };
        }
        const requestBody = { actionId, params, appUsername: appUsernameForAction };

        logAction(`API Eylemi çağrılıyor: ${actionId}`, "debug", appUsernameForAction);
        const response = await fetch('/api/execute-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        let result;
        try {
            result = await response.json();
        } catch (e) {
            const errorText = await response.text();
            logAction(`API yanıtı JSON olarak ayrıştırılamadı. Yanıt: ${errorText}`, "error", appUsernameForAction);
            throw { message: `Sunucudan geçersiz JSON yanıtı (Status: ${response.status})`, details: errorText, type: "api_parse_error", isLimitError: false, needsReAuth: false };
        }

        if (!response.ok || result.error) {
            const errorType = response.status === 401 ? "auth" : "api_error";
            let errorMessage = result.error || result.message || 'Bilinmeyen API hatası';
            if (typeof result.error === 'object' && result.error !== null && result.error.detail) {
                errorMessage = result.error.detail;
            } else if (typeof result.message === 'string') {
                errorMessage = result.message;
            }

            const isLikeLimitExceededError = (result.error && result.error.code === 1040 && (actionId === 'likeTumblrPost' || (result.error.title && result.error.title.toLowerCase().includes("limit exceeded")) ));
            const isRateLimitError = response.status === 429;
            const isLimitError = isLikeLimitExceededError || isRateLimitError;

            logAction(`API Eylemi '${actionId}' başarısız: ${errorMessage}. Detay: ${JSON.stringify(result.details || result.error)}`, "error", appUsernameForAction);
            
            if (result.needsReAuth || response.status === 401) {
                logAction("Yeniden kimlik doğrulama gerekli olabilir. Bot durduruluyor.", "warn", appUsernameForAction);
                if (botInstances[appUsernameForAction]) {
                    stopBotInstance(appUsernameForAction, true, "Token Hatası!");
                }
                 throw { message: errorMessage, type: "auth", details: result.details || result.error, needsReAuth: true, isLimitError: false };
            }
            throw { message: errorMessage, type: errorType, details: result.details || result.error, needsReAuth: false, isLimitError: isLimitError };
        }
        logAction(`API Eylemi '${actionId}' başarıyla tamamlandı.`, "debug", appUsernameForAction);
        return result.data;
    }

    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    async function fetchAndPopulateUsersForCheckboxes() {
        if (!moduleUserCheckboxesContainer) {
            console.error("Kullanıcı checkbox konteyneri (moduleUserCheckboxesContainer) bulunamadı.");
            return;
        }
        try {
            const response = await fetch('/api/users');
            if (!response.ok) throw new Error(`Kullanıcılar çekilemedi (${response.status})`);
            const users = await response.json();
            moduleUserCheckboxesContainer.innerHTML = '';
            if (users && users.length > 0) {
                users.forEach(user => {
                    const label = document.createElement('label');
                    label.className = 'checkbox-label flex items-center space-x-2 p-2.5 border border-gray-200 rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors duration-150';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = user.appUsername;
                    checkbox.className = 'form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500 focus:ring-offset-0 border-gray-300';
                    checkbox.addEventListener('change', handleUserSelectionChange);

                    const span = document.createElement('span');
                    span.className = 'text-sm text-slate-700 font-medium truncate';
                    span.title = user.tumblrBlogName || user.appUsername;
                    span.textContent = user.tumblrBlogName || user.appUsername.split('_')[0];

                    label.appendChild(checkbox);
                    label.appendChild(span);
                    moduleUserCheckboxesContainer.appendChild(label);
                });
            } else {
                moduleUserCheckboxesContainer.innerHTML = '<p class="text-slate-500 italic col-span-full py-4 text-center">Kayıtlı kullanıcı bulunamadı. Lütfen ana sayfadan hesap ekleyin.</p>';
            }
        } catch (error) {
            logAction(`Kullanıcı listesi çekilirken hata: ${error.message}`, "error");
            moduleUserCheckboxesContainer.innerHTML = '<p class="text-red-500 italic col-span-full py-4 text-center">Kullanıcı listesi yüklenemedi.</p>';
        }
    }

    function createBotInstanceCard(appUsername) {
        console.log(`[createBotInstanceCard] ${appUsername} için kart oluşturuluyor...`);
        if (!userControlCardTemplate) {
            logAction("Kullanıcı kontrol kartı şablonu bulunamadı!", "error", appUsername);
            return null;
        }
        const cardClone = userControlCardTemplate.cloneNode(true);
        cardClone.id = `user-control-card-${appUsername}`;
        cardClone.style.display = '';
        
        const titleElement = cardClone.querySelector('[data-template-field="cardTitleUsername"]');
        if (titleElement) {
            titleElement.textContent = appUsername.split('_')[0];
        } else {
            console.warn(`[createBotInstanceCard] ${appUsername} için kart başlığı elemanı bulunamadı.`);
        }
        
        // GÜNCELLEME: Varsayılan değerler artık Global Slider'lardan alınıyor.
        const initialPostsToLike = parseInt(globalPostsToLikeSlider.value, 10);
        const initialRefreshIntervalIndex = parseInt(globalRefreshIntervalSlider.value, 10);
        const initialRefreshIntervalMap = REFRESH_INTERVAL_MAP[initialRefreshIntervalIndex];

        const postsToLikeSliderEl = cardClone.querySelector('[data-template-field="postsToLikeSlider"]');
        const refreshIntervalSliderEl = cardClone.querySelector('[data-template-field="refreshIntervalSlider"]');
        const postsToLikeValueEl = cardClone.querySelector('[data-template-field="postsToLikeValue"]');
        const refreshIntervalValueEl = cardClone.querySelector('[data-template-field="refreshIntervalValue"]');

        postsToLikeSliderEl.value = initialPostsToLike;
        postsToLikeValueEl.textContent = initialPostsToLike;
        refreshIntervalSliderEl.value = initialRefreshIntervalIndex;
        refreshIntervalValueEl.textContent = initialRefreshIntervalMap.label;

        const instance = {
            appUsername: appUsername,
            isRunning: false,
            sinceId: null,
            processedUsernamesThisSession: new Set(),
            dashboardFetchTimeoutId: null,
            limitRefreshIntervalId: null, 
            currentLikePostId: null, 
            likeRetryAttempt: 0, 
            isUnderCooldown: false, 
            config: {
                postsToLike: initialPostsToLike,
                refreshIntervalValue: initialRefreshIntervalMap.value,
                refreshIntervalLabel: initialRefreshIntervalMap.label
            },
            elements: {
                card: cardClone,
                processingUserContainer: cardClone.querySelector('[data-template-field="currentlyProcessingUserContainer"]'),
                processingUserAvatar: cardClone.querySelector('[data-template-field="processingUserAvatar"]'),
                processingUserName: cardClone.querySelector('[data-template-field="processingUserName"]'),
                processingUserUrl: cardClone.querySelector('[data-template-field="processingUserUrl"]'),
                processingUserLikesDone: cardClone.querySelector('[data-template-field="processingUserLikesDone"]'),
                processingUserLikesTotal: cardClone.querySelector('[data-template-field="processingUserLikesTotal"]'),
                processingUserLikeProgressBar: cardClone.querySelector('[data-template-field="processingUserLikeProgressBar"]'),
                botControlsAndSettingsContainer: cardClone.querySelector('[data-template-field="botControlsAndSettings"]'),
                postsToLikeSlider: postsToLikeSliderEl,
                postsToLikeValue: postsToLikeValueEl,
                refreshIntervalSlider: refreshIntervalSliderEl,
                refreshIntervalValue: refreshIntervalValueEl,
                startButton: cardClone.querySelector('[data-template-field="startButton"]'),
                stopButton: cardClone.querySelector('[data-template-field="stopButton"]'),
                botStatusIndicator: cardClone.querySelector('[data-template-field="botStatusIndicator"]'),
                botStatusText: cardClone.querySelector('[data-template-field="botStatusText"]'),
            }
        };
        
        if(instance.elements.postsToLikeSlider) {
            instance.elements.postsToLikeSlider.addEventListener('input', function() {
                instance.config.postsToLike = parseInt(this.value, 10);
                if(instance.elements.postsToLikeValue) instance.elements.postsToLikeValue.textContent = instance.config.postsToLike;
            });
        }
        if(instance.elements.refreshIntervalSlider) {
            instance.elements.refreshIntervalSlider.addEventListener('input', function() {
                const selectedMapItem = REFRESH_INTERVAL_MAP[this.value];
                instance.config.refreshIntervalValue = selectedMapItem.value;
                instance.config.refreshIntervalLabel = selectedMapItem.label;
                if(instance.elements.refreshIntervalValue) instance.elements.refreshIntervalValue.textContent = instance.config.refreshIntervalLabel;
            });
        }
        if(instance.elements.startButton) instance.elements.startButton.addEventListener('click', () => startBotInstance(appUsername));
        if(instance.elements.stopButton) instance.elements.stopButton.addEventListener('click', () => stopBotInstance(appUsername));
        
        if(instance.elements.processingUserContainer) instance.elements.processingUserContainer.style.display = 'none';

        botInstances[appUsername] = instance;
        if (userControlCardsContainer) {
            userControlCardsContainer.appendChild(cardClone);
            requestAnimationFrame(() => cardClone.classList.add('visible'));
            console.log(`[createBotInstanceCard] ${appUsername} için kart DOM'a eklendi ve görünür yapıldı.`);
        } else {
            logAction("Kullanıcı kontrol kartları konteyneri bulunamadığı için kart eklenemedi!", "error", appUsername);
        }
        return instance;
    }

    function removeBotInstanceCard(appUsername) {
        const instance = botInstances[appUsername];
        if (instance) {
            if (instance.isRunning) {
                stopBotInstance(appUsername); 
            }
            instance.elements.card.classList.remove('visible');
            setTimeout(() => {
                instance.elements.card.remove();
            }, 400);
            delete botInstances[appUsername];
            logAction(`${appUsername} için kontrol kartı kaldırıldı.`, "system");
        }
    }

    function createOrUpdateUserLimitDisplay(appUsername, limitsData) {
        if (!multiUserLimitsDisplayArea || !userLimitDisplayTemplate) {
            logAction("Limit gösterim alanı veya şablonu bulunamadı.", "warn", appUsername);
            return;
        }

        let displayElement = document.getElementById(`limit-display-${appUsername}`);
        if (!displayElement) {
            displayElement = userLimitDisplayTemplate.cloneNode(true);
            displayElement.id = `limit-display-${appUsername}`;
            displayElement.style.display = '';
            const usernameEl = displayElement.querySelector('[data-template-field="username"]');
            if (usernameEl) usernameEl.textContent = appUsername.split('_')[0];
            
            multiUserLimitsDisplayArea.appendChild(displayElement);
            
            const placeholder = multiUserLimitsDisplayArea.querySelector('p.text-slate-400');
            if (placeholder) placeholder.style.display = 'none';
        }

        const followLimitTextEl = displayElement.querySelector('[data-template-field="followLimitText"]');
        const followLimitRemainingTextEl = displayElement.querySelector('[data-template-field="followLimitRemainingText"]');
        const followLimitProgressBarEl = displayElement.querySelector('[data-template-field="followLimitProgressBar"]');
        const followResetTimeTextEl = displayElement.querySelector('[data-template-field="followResetTimeText"]'); 

        const likeLimitTextEl = displayElement.querySelector('[data-template-field="likeLimitText"]');
        const likeLimitRemainingTextEl = displayElement.querySelector('[data-template-field="likeLimitRemainingText"]');
        const likeLimitProgressBarEl = displayElement.querySelector('[data-template-field="likeLimitProgressBar"]');
        const likeResetTimeTextEl = displayElement.querySelector('[data-template-field="likeResetTimeText"]'); 


        let likesUsed = 0, likesTotal = 1000, likesResetAt = null;
        let followsUsed = 0, followsTotal = 200, followsResetAt = null;
        let dataParsedSuccessfully = false;

        if (limitsData) {
            if (limitsData.likes && typeof limitsData.likes.limit !== 'undefined' && typeof limitsData.likes.remaining !== 'undefined') {
                likesTotal = parseInt(limitsData.likes.limit, 10) || likesTotal;
                likesUsed = Math.max(0, likesTotal - (parseInt(limitsData.likes.remaining, 10) || 0));
                likesResetAt = limitsData.likes.reset_at; 
                dataParsedSuccessfully = true;
            }
            if (limitsData.follows && typeof limitsData.follows.limit !== 'undefined' && typeof limitsData.follows.remaining !== 'undefined') {
                followsTotal = parseInt(limitsData.follows.limit, 10) || followsTotal;
                followsUsed = Math.max(0, followsTotal - (parseInt(limitsData.follows.remaining, 10) || 0));
                followsResetAt = limitsData.follows.reset_at; 
                dataParsedSuccessfully = true;
            }
            else if (limitsData.usage && limitsData.limits) { 
                if (limitsData.usage.likes && limitsData.limits.likes) {
                    likesUsed = parseInt(limitsData.usage.likes.count, 10) || 0;
                    likesTotal = parseInt(limitsData.limits.likes.total, 10) || likesTotal;
                    dataParsedSuccessfully = true;
                }
                if (limitsData.usage.follows && limitsData.limits.follows) {
                    followsUsed = parseInt(limitsData.usage.follows.count, 10) || 0;
                    followsTotal = parseInt(limitsData.limits.follows.total, 10) || followsTotal;
                    dataParsedSuccessfully = true;
                }
            }
             else if (limitsData.user) { 
                if (typeof limitsData.user.likes !== 'undefined' && typeof limitsData.user.likes_limit !== 'undefined') {
                    likesUsed = parseInt(limitsData.user.likes, 10) || 0;
                    likesTotal = parseInt(limitsData.user.likes_limit, 10) || likesTotal;
                    dataParsedSuccessfully = true;
                }
                if (typeof limitsData.user.following_limit !== 'undefined') {
                    followsTotal = parseInt(limitsData.user.following_limit, 10) || followsTotal;
                    followsUsed = 0; 
                    logAction("Takip kullanım sayısı (günlük) Tumblr API'den direkt gelmiyor, kullanılan '0' olarak varsayılıyor.", "debug", appUsername);
                    dataParsedSuccessfully = true;
                }
              }
             else if (typeof limitsData.likes_used !== 'undefined' && typeof limitsData.likes_total !== 'undefined') { 
                likesUsed = parseInt(limitsData.likes_used, 10) || 0;
                likesTotal = parseInt(limitsData.likes_total, 10) || likesTotal;
                if (typeof limitsData.follows_used !== 'undefined' && typeof limitsData.follows_total !== 'undefined') {
                    followsUsed = parseInt(limitsData.follows_used, 10) || 0;
                    followsTotal = parseInt(limitsData.follows_total, 10) || followsTotal;
                }
                dataParsedSuccessfully = true;
             }


            if (!dataParsedSuccessfully && limitsData) {
                 logAction("Alınan limit verisi bilinen formatlardan hiçbiriyle eşleşmedi. Varsayılanlar kullanılıyor.", "warn", appUsername);
                 console.warn(`[LikerBot Log][${appUsername}] Eşleşmeyen limit verisi yapısı:`, limitsData);
            }
        } else {
            logAction("Limit verisi alınamadı (null/undefined). Varsayılanlar kullanılıyor.", "warn", appUsername);
        }

        if(likeLimitTextEl) likeLimitTextEl.textContent = `${likesUsed}/${likesTotal}`;
        if(likeLimitRemainingTextEl) likeLimitRemainingTextEl.textContent = `${Math.max(0, likesTotal - likesUsed)}`;
        if(likeLimitProgressBarEl) updateProgressBar(likeLimitProgressBarEl, likesTotal > 0 ? (likesUsed / likesTotal) * 100 : 0);
        if(likeResetTimeTextEl) {
            likeResetTimeTextEl.textContent = likesResetAt ? `Sıfırlanma: ~${new Date(likesResetAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
        }


        if(followLimitTextEl) followLimitTextEl.textContent = `${followsUsed}/${followsTotal}`;
        if(followLimitRemainingTextEl) followLimitRemainingTextEl.textContent = `${Math.max(0, followsTotal - followsUsed)}`;
        if(followLimitProgressBarEl) updateProgressBar(followLimitProgressBarEl, followsTotal > 0 ? (followsUsed / followsTotal) * 100 : 0);
        if(followResetTimeTextEl) {
            followResetTimeTextEl.textContent = followsResetAt ? `Sıfırlanma: ~${new Date(followsResetAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
        }
        
        if (dataParsedSuccessfully && limitsData) {
            // logAction("Kullanıcı limitleri işlendi ve görüntülendi.", "success", appUsername); // fetchAndDisplayUserLimitsFor içinde loglanacak
        }
    }

    async function fetchAndDisplayUserLimitsFor(appUsername) {
        const instance = botInstances[appUsername];
        if (!instance) return;
        logAction("Kullanıcı API limitleri periyodik olarak çekiliyor...", "debug", appUsername);
        try {
            const response = await fetch(`/api/user-limits?user=${encodeURIComponent(appUsername)}`);
            const limitsData = await response.json();
            if (!response.ok) {
                throw new Error(limitsData.error || limitsData.message || `Limitler alınamadı (${response.status})`);
            }
            createOrUpdateUserLimitDisplay(appUsername, limitsData);
            logAction("Kullanıcı limitleri başarıyla güncellendi.", "success", appUsername);
        } catch (error) {
            logAction(`Kullanıcı limitleri güncellenirken hata: ${error.message}`, "error", appUsername);
        }
    }
    
    function removeUserLimitDisplay(appUsername) {
        if (!multiUserLimitsDisplayArea) return;
        const displayElement = document.getElementById(`limit-display-${appUsername}`);
        if (displayElement) {
            displayElement.remove();
        }
        const remainingLimitDisplays = multiUserLimitsDisplayArea.querySelectorAll('.user-limits-card-item');
        if (remainingLimitDisplays.length === 0) {
            const placeholder = multiUserLimitsDisplayArea.querySelector('p.text-slate-400');
            if (placeholder) placeholder.style.display = 'block';
        }
    }

    function updateBotStatusForUser(appUsername, statusClass, message) {
        const instance = botInstances[appUsername];
        if (!instance || !instance.elements) return; 
        if (instance.elements.botStatusIndicator) instance.elements.botStatusIndicator.className = `status-indicator ${statusClass}`;
        if (instance.elements.botStatusText) instance.elements.botStatusText.textContent = message;
    }

    function showCurrentlyProcessingUserFor(appUsername, blogData, totalLikesToAttempt) {
        const instance = botInstances[appUsername];
        if (!instance || !instance.elements || !blogData) return;
        if(instance.elements.processingUserAvatar) instance.elements.processingUserAvatar.src = (blogData.avatar && blogData.avatar[0] && blogData.avatar[0].url)
            ? blogData.avatar[0].url.replace(/_\d+\./, '_128.')
            : `https://api.tumblr.com/v2/blog/${blogData.name}/avatar/128`;
        if(instance.elements.processingUserName) instance.elements.processingUserName.textContent = blogData.title || blogData.name;
        if(instance.elements.processingUserUrl) {
            instance.elements.processingUserUrl.href = blogData.url;
            instance.elements.processingUserUrl.textContent = blogData.url ? blogData.url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '') : 'URL Yok';
        }
        if(instance.elements.processingUserLikesDone) instance.elements.processingUserLikesDone.textContent = '0';
        if(instance.elements.processingUserLikesTotal) instance.elements.processingUserLikesTotal.textContent = totalLikesToAttempt.toString();
        if(instance.elements.processingUserLikeProgressBar) updateProgressBar(instance.elements.processingUserLikeProgressBar, 0);
        if(instance.elements.processingUserContainer) instance.elements.processingUserContainer.style.display = 'block';
    }

    function updateProcessingUserLikeProgressFor(appUsername, likedCount, totalToLike) {
        const instance = botInstances[appUsername];
        if (!instance || !instance.elements) return;
        if(instance.elements.processingUserLikesDone) instance.elements.processingUserLikesDone.textContent = likedCount.toString();
        if(instance.elements.processingUserLikesTotal) instance.elements.processingUserLikesTotal.textContent = totalToLike.toString();
        if(instance.elements.processingUserLikeProgressBar) {
            const percentage = totalToLike > 0 ? (likedCount / totalToLike) * 100 : 0;
            updateProgressBar(instance.elements.processingUserLikeProgressBar, percentage);
        }
    }

    function hideCurrentlyProcessingUserFor(appUsername) {
        const instance = botInstances[appUsername];
        if (!instance || !instance.elements || !instance.elements.processingUserContainer) return;
        instance.elements.processingUserContainer.style.display = 'none';
    }

    async function handleUserSelectionChange(event) {
        const checkbox = event.target;
        const appUsername = checkbox.value;

        if (checkbox.checked) {
            selectedAppUsernames.add(appUsername);
            logAction(`Hesap seçildi: ${appUsername}.`, "system", null);
            createBotInstanceCard(appUsername);
            updateBotStatusForUser(appUsername, 'status-idle', 'Hazır');
            await fetchAndDisplayUserLimitsFor(appUsername); 
        } else {
            selectedAppUsernames.delete(appUsername);
            logAction(`Hesap seçimi kaldırıldı: ${appUsername}.`, "system", null);
            removeBotInstanceCard(appUsername);
            removeUserLimitDisplay(appUsername);
        }
    }

    async function attemptLikeWithRetries(instance, targetUsername, postId, reblogKey) { 
        const appUsername = instance.appUsername; 
        instance.currentLikePostId = postId;
        instance.likeRetryAttempt = 0;
        instance.isUnderCooldown = false;

        for (let i = 0; i < MAX_INITIAL_LIKE_RETRIES; i++) {
            if (!instance.isRunning) return false;
            instance.likeRetryAttempt = i + 1;
            logAction(`${targetUsername} > "${postId}" beğeniliyor (Deneme ${instance.likeRetryAttempt}/${MAX_INITIAL_LIKE_RETRIES})...`, "debug", appUsername);
            try {
                await executeApiActionForModule('likeTumblrPost', { post_id: postId, reblog_key: reblogKey }, appUsername);
                return true; 
            } catch (error) {
                if (error.isLimitError) {
                    logAction(`${targetUsername} > "${postId}" beğenilemedi (Deneme ${instance.likeRetryAttempt}): Limit Aşıldı. Kısa bir süre sonra tekrar denenecek.`, "warn", appUsername);
                    if (i < MAX_INITIAL_LIKE_RETRIES - 1) await delay(SHORT_RETRY_DELAY_MS * (i + 1));
                } else {
                    logAction(`${targetUsername} > "${postId}" beğenilirken kritik hata (Deneme ${instance.likeRetryAttempt}): ${error.message}`, "error", appUsername);
                    return false; 
                }
            }
        }

        if (!instance.isRunning) return false;
        logAction(`${targetUsername} > "${postId}" için ilk ${MAX_INITIAL_LIKE_RETRIES} deneme başarısız. ${LIKE_RETRY_COOLDOWN_MS / 1000} saniye bekleniyor...`, "warn", appUsername);
        instance.isUnderCooldown = true;
        updateBotStatusForUser(appUsername, 'status-running', `Beğeni limiti, ${LIKE_RETRY_COOLDOWN_MS / 1000}sn beklemede...`);
        await delay(LIKE_RETRY_COOLDOWN_MS);
        instance.isUnderCooldown = false;
        if (!instance.isRunning) return false;
        updateBotStatusForUser(appUsername, 'status-running', `${targetUsername} gönderileri beğeniliyor...`);

        logAction(`${targetUsername} > "${postId}" için cooldown sonrası denemeler başlıyor...`, "info", appUsername);
        for (let i = 0; i < MAX_COOLDOWN_LIKE_RETRIES; i++) {
            if (!instance.isRunning) return false;
            instance.likeRetryAttempt = MAX_INITIAL_LIKE_RETRIES + i + 1; 
            logAction(`${targetUsername} > "${postId}" beğeniliyor (Cooldown Sonrası Deneme ${i + 1}/${MAX_COOLDOWN_LIKE_RETRIES})...`, "debug", appUsername);
            try {
                await executeApiActionForModule('likeTumblrPost', { post_id: postId, reblog_key: reblogKey }, appUsername);
                return true; 
            } catch (error) {
                if (error.isLimitError) {
                    logAction(`${targetUsername} > "${postId}" beğenilemedi (Cooldown Sonrası Deneme ${i + 1}): Limit Aşıldı.`, "warn", appUsername);
                     if (i < MAX_COOLDOWN_LIKE_RETRIES - 1) await delay(SHORT_RETRY_DELAY_MS * (i + 1));
                } else {
                    logAction(`${targetUsername} > "${postId}" beğenilirken kritik hata (Cooldown Sonrası Deneme ${i + 1}): ${error.message}`, "error", appUsername);
                    return false;
                }
            }
        }

        logAction(`${targetUsername} > "${postId}" için tüm yeniden denemeler başarısız oldu.`, "error", appUsername);
        return false;
    }


    async function processLikerBotIterationForUser(appUsername) {
        const instance = botInstances[appUsername];
        if (!instance || !instance.isRunning) {
            if (instance && !instance.isRunning) {
                 logAction("Bot bu tur için çalışmıyor.", "debug", appUsername);
            }
            return;
        }
        updateBotStatusForUser(appUsername, 'status-running', 'Panel taranıyor...');
        logAction("Yeni tur başlıyor: Panel gönderileri çekiliyor.", "system", appUsername);
        hideCurrentlyProcessingUserFor(appUsername);

        try {
            const dashboardParams = { limit: 20, notes_info: false, reblog_info: true };
            if (instance.sinceId) {
                dashboardParams.since_id = instance.sinceId;
            }
            const dashboardData = await executeApiActionForModule('getDashboardPosts', dashboardParams, appUsername);

            if (!dashboardData || !dashboardData.posts || dashboardData.posts.length === 0) {
                logAction("Panelde yeni gönderi bulunamadı.", "warn", appUsername);
                scheduleNextFetchForUser(appUsername);
                return;
            }

            logAction(`${dashboardData.posts.length} gönderi panelden çekildi.`, "success", appUsername);
            if (dashboardData.posts.length > 0) {
                instance.sinceId = dashboardData.posts[0].id_string;
            }

            const uniqueUsernamesInBatch = new Set();
            dashboardData.posts.forEach(post => {
                const originalPosterUsername = post.reblogged_from_name || post.blog_name;
                if (originalPosterUsername &&
                    !instance.processedUsernamesThisSession.has(originalPosterUsername) &&
                    originalPosterUsername !== appUsername.split('_')[0]) {
                    uniqueUsernamesInBatch.add(originalPosterUsername);
                }
            });

            if (uniqueUsernamesInBatch.size === 0) {
                logAction("Bu panelde işlenecek yeni kullanıcı bulunamadı.", "info", appUsername);
                scheduleNextFetchForUser(appUsername);
                return;
            }

            logAction(`Panelden ${uniqueUsernamesInBatch.size} benzersiz kullanıcı bulundu.`, "info", appUsername);
            updateBotStatusForUser(appUsername, 'status-running', `${uniqueUsernamesInBatch.size} kullanıcı işleniyor...`);

            for (const usernameToProcess of uniqueUsernamesInBatch) { 
                if (!instance.isRunning) break;
                logAction(`Sıradaki: ${usernameToProcess}`, "system", appUsername);
                try {
                    const statusData = await executeApiActionForModule('getBlogFollowingStatus', { blog_identifier: usernameToProcess }, appUsername);
                    const postsToLikeTargetCount = instance.config.postsToLike;
                    showCurrentlyProcessingUserFor(appUsername, statusData.blog, postsToLikeTargetCount);

                    logAction(`${usernameToProcess}: Ben onu ${statusData.am_i_following_them ? 'takip ediyorum 👍' : 'takip ETMİYORUM 👎'}. O beni ${statusData.is_following_me ? 'takip ediyor ✅' : 'takip ETMİYOR ❌'}.`, "info", appUsername);

                    if (!statusData.is_following_me) {
                        logAction(`${usernameToProcess} beni takip etmiyor. Gönderileri beğenilecek.`, "info", appUsername);
                        updateBotStatusForUser(appUsername, 'status-running', `${usernameToProcess} gönderileri beğeniliyor...`);

                        const blogPostsResponse = await executeApiActionForModule('fetchBlogPostsForLiking', {
                            blog_identifier: usernameToProcess,
                            limit: 20, reblog_info: true, npf: true
                        }, appUsername);

                        if (blogPostsResponse && blogPostsResponse.posts && blogPostsResponse.posts.length > 0) {
                            let likedCountForThisUser = 0;
                            const originalUserPosts = blogPostsResponse.posts.filter(p => p.blog_name === usernameToProcess && !p.reblogged_from_id);
                            logAction(`${usernameToProcess}: ${originalUserPosts.length} orijinal gönderi bulundu. Hedef: ${postsToLikeTargetCount}`, "debug", appUsername);

                            for (const post of originalUserPosts) {
                                if (!instance.isRunning || likedCountForThisUser >= postsToLikeTargetCount) break;

                                if (post.id_string && post.reblog_key) {
                                    const likedSuccessfully = await attemptLikeWithRetries(instance, usernameToProcess, post.id_string, post.reblog_key);
                                    
                                    if (likedSuccessfully) {
                                        logAction(`${usernameToProcess} > "${post.id_string}" ID'li gönderi BEĞENİLDİ. ❤️`, "success", appUsername);
                                        likedCountForThisUser++;
                                        updateProcessingUserLikeProgressFor(appUsername, likedCountForThisUser, postsToLikeTargetCount);
                                    } else {
                                        if (instance.isRunning) { 
                                            logAction(`${usernameToProcess} > "${post.id_string}" için tüm denemeler başarısız oldu. Bot bu kullanıcı için durduruluyor.`, "error", appUsername);
                                            stopBotInstance(appUsername, true, "Limit Doldu (Tekrarlayan)");
                                            return; 
                                        }
                                    }
                                    // GÜNCELLEME: Her beğeni sonrası bekleme
                                    if (instance.isRunning) await delay(DELAY_BETWEEN_LIKES_MS);
                                }
                            }
                            logAction(`${usernameToProcess}: ${likedCountForThisUser} gönderi beğenildi.`, "success", appUsername);
                        } else {
                            logAction(`${usernameToProcess}: Beğenilecek gönderi bulunamadı.`, "warn", appUsername);
                        }
                    } else {
                        logAction(`${usernameToProcess} zaten beni takip ediyor, işlem atlandı.`, "info", appUsername);
                    }
                    instance.processedUsernamesThisSession.add(usernameToProcess);
                    logAction(`${usernameToProcess} işlemleri tamamlandı.`, "system", appUsername);

                } catch (userProcessingError) {
                    logAction(`${usernameToProcess} işlenirken genel bir hata oluştu: ${userProcessingError.message}`, "error", appUsername);
                    if (!instance.isRunning) break; 
                }
                if (instance.isRunning) await delay(2000 + Math.random() * 1000);
            }
            logAction("Paneldeki tüm yeni kullanıcılar işlendi.", "system", appUsername);
            if (instance.isRunning) hideCurrentlyProcessingUserFor(appUsername);

        } catch (error) { 
            logAction(`Ana bot döngüsünde hata: ${error.message}`, "error", appUsername);
            if (!instance.isRunning) return; 
        }

        if (instance.isRunning) {
            scheduleNextFetchForUser(appUsername);
        } else {
            hideCurrentlyProcessingUserFor(appUsername);
        }
    }

    function scheduleNextFetchForUser(appUsername) {
        const instance = botInstances[appUsername];
        if (!instance || !instance.isRunning) {
            hideCurrentlyProcessingUserFor(appUsername);
            return;
        }
        const intervalMs = instance.config.refreshIntervalValue;
        const intervalLabel = instance.config.refreshIntervalLabel;

        logAction(`Sonraki panel taraması ${intervalLabel} sonra.`, "system", appUsername);
        updateBotStatusForUser(appUsername, 'status-running', `Beklemede (${intervalLabel})...`);

        clearTimeout(instance.dashboardFetchTimeoutId);
        instance.dashboardFetchTimeoutId = setTimeout(async () => {
            if (instance && instance.isRunning) {
                await processLikerBotIterationForUser(appUsername);
            }
        }, intervalMs);
    }

    async function startBotInstance(appUsername) {
        const instance = botInstances[appUsername];
        if (!instance) {
            logAction("Bot başlatılamadı: Geçersiz kullanıcı.", "error", null);
            return;
        }
        if (instance.isRunning) {
            logAction("Bot zaten çalışıyor.", "warn", appUsername);
            return;
        }
        instance.isRunning = true;
        instance.likeRetryAttempt = 0; 
        instance.isUnderCooldown = false; 

        if(instance.elements.startButton) instance.elements.startButton.disabled = true;
        if(instance.elements.stopButton) instance.elements.stopButton.disabled = false;
        if(instance.elements.postsToLikeSlider) instance.elements.postsToLikeSlider.disabled = true;
        if(instance.elements.refreshIntervalSlider) instance.elements.refreshIntervalSlider.disabled = true;
        
        const checkbox = moduleUserCheckboxesContainer ? moduleUserCheckboxesContainer.querySelector(`input[value="${appUsername}"]`) : null;
        if(checkbox) checkbox.disabled = true;


        instance.processedUsernamesThisSession.clear();
        instance.sinceId = null;
        logAction("LikerBot başlatılıyor... 🚀", "system", appUsername);
        updateBotStatusForUser(appUsername, 'status-running', 'Başlatılıyor...');
        
        if (instance.limitRefreshIntervalId) clearInterval(instance.limitRefreshIntervalId);
        instance.limitRefreshIntervalId = setInterval(() => {
            if (instance.isRunning) { 
                fetchAndDisplayUserLimitsFor(appUsername);
            }
        }, LIMIT_REFRESH_INTERVAL_MS);
        
        await fetchAndDisplayUserLimitsFor(appUsername); 
        await processLikerBotIterationForUser(appUsername);
    }

    function stopBotInstance(appUsername, dueToError = false, customStatusMessage = null) {
        const instance = botInstances[appUsername];
        if (!instance) return;

        const wasRunning = instance.isRunning;
        instance.isRunning = false; 
        clearTimeout(instance.dashboardFetchTimeoutId);
        instance.dashboardFetchTimeoutId = null;
        
        if (instance.limitRefreshIntervalId) {
            clearInterval(instance.limitRefreshIntervalId);
            instance.limitRefreshIntervalId = null;
        }
        
        if(instance.elements.startButton) instance.elements.startButton.disabled = false;
        if(instance.elements.stopButton) instance.elements.stopButton.disabled = true;
        if(instance.elements.postsToLikeSlider) instance.elements.postsToLikeSlider.disabled = false;
        if(instance.elements.refreshIntervalSlider) instance.elements.refreshIntervalSlider.disabled = false;

        const checkbox = moduleUserCheckboxesContainer ? moduleUserCheckboxesContainer.querySelector(`input[value="${appUsername}"]`) : null;
        if(checkbox) checkbox.disabled = false;

        let finalStatusMessage = 'Durduruldu';
        let finalStatusClass = 'status-stopped';

        if (customStatusMessage) {
            finalStatusMessage = customStatusMessage;
            if (customStatusMessage.toLowerCase().includes("limit")) {
                finalStatusClass = 'status-limit-exceeded';
            } else if (customStatusMessage.toLowerCase().includes("token")) {
                finalStatusClass = 'status-stopped'; 
            }
        } else if (wasRunning && !dueToError) {
             logAction("LikerBot kullanıcı tarafından durduruldu. 🛑", "system", appUsername);
        } else if (!wasRunning && !dueToError) {
             logAction("LikerBot zaten durmuştu veya başlatılamamıştı.", "warn", appUsername);
        } else if (dueToError) { 
            finalStatusMessage = 'Hata Oluştu!';
        }
        
        updateBotStatusForUser(appUsername, finalStatusClass, finalStatusMessage);
        hideCurrentlyProcessingUserFor(appUsername);
    }
    
    // --- YENİ: Event Listener'lar ---

    function setupGlobalControls() {
        if(selectAllButton) {
            selectAllButton.addEventListener('click', () => {
                const checkboxes = moduleUserCheckboxesContainer.querySelectorAll('input[type="checkbox"]');
                if(checkboxes.length === 0) return;

                // Eğer hepsi seçili ise hepsini kaldır, değilse hepsini seç
                const allChecked = Array.from(checkboxes).every(cb => cb.checked);

                checkboxes.forEach(checkbox => {
                    if (checkbox.checked !== !allChecked) {
                         checkbox.checked = !allChecked;
                         // Değişikliği tetikle ki kartlar oluşsun/kaldırılsın
                         checkbox.dispatchEvent(new Event('change'));
                    }
                });
                logAction(`Tüm hesaplar için seçim ${!allChecked ? 'yapıldı' : 'kaldırıldı'}.`, 'system');
            });
        }
        
        if(globalPostsToLikeSlider) {
            globalPostsToLikeSlider.addEventListener('input', (e) => {
                const newValue = e.target.value;
                if(globalPostsToLikeValue) globalPostsToLikeValue.textContent = newValue;

                // Tüm aktif bot instanslarının ayarlarını güncelle
                for (const username in botInstances) {
                    const instance = botInstances[username];
                    instance.config.postsToLike = parseInt(newValue, 10);
                    instance.elements.postsToLikeSlider.value = newValue;
                    instance.elements.postsToLikeValue.textContent = newValue;
                }
            });
        }

        if(globalRefreshIntervalSlider) {
            globalRefreshIntervalSlider.addEventListener('input', (e) => {
                const newIndex = e.target.value;
                const newMapItem = REFRESH_INTERVAL_MAP[newIndex];
                if(globalRefreshIntervalValue) globalRefreshIntervalValue.textContent = newMapItem.label;

                // Tüm aktif bot instanslarının ayarlarını güncelle
                for (const username in botInstances) {
                    const instance = botInstances[username];
                    instance.config.refreshIntervalValue = newMapItem.value;
                    instance.config.refreshIntervalLabel = newMapItem.label;
                    instance.elements.refreshIntervalSlider.value = newIndex;
                    instance.elements.refreshIntervalValue.textContent = newMapItem.label;
                }
            });
        }
    }


    // --- Başlangıç Ayarları ---
    async function initializeModule() {
        logAction("LikerBot Modülü (Gelişmiş Hata Yönetimi) Yükleniyor... 🛠️", "system");
        setupGlobalControls(); // Yeni kontrolleri etkinleştir
        await fetchAndPopulateUsersForCheckboxes();
        if (selectedAppUsernames.size === 0 && multiUserLimitsDisplayArea) {
            const placeholder = multiUserLimitsDisplayArea.querySelector('p.text-slate-400');
            if (placeholder) placeholder.style.display = 'block'; else {
                multiUserLimitsDisplayArea.insertAdjacentHTML('beforeend', '<p class="text-slate-400 italic text-sm py-4 text-center">Limitleri görmek için kullanıcı seçin.</p>');
            }
        }
         logAction("Modül hazır. Lütfen işlem yapmak için hesap seçin.", "info");
    }

    initializeModule();
});
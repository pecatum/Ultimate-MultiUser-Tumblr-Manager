// modules/multi_post_scheduler_client.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('[MultiPostScheduler-Reblog] DOM Yüklendi.');

    // --- Element Tanımlamaları ---
    const moduleUserSelectorContainer = document.getElementById('moduleUserSelectorContainer');
    const noUsersForSelectionMessage = document.getElementById('noUsersForSelectionMessage');
    const noUserSelectedWarning = document.getElementById('noUserSelectedWarning');
    const userLimitsContainer = document.getElementById('userLimitsContainer');

    const step1Container = document.getElementById('step1Container');
    const postUrlsInput = document.getElementById('postUrlsInput');
    const addUrlsToListButton = document.getElementById('addUrlsToListButton');
    const addedUrlsDisplayContainer = document.getElementById('addedUrlsDisplayContainer');
    const noUrlsAddedMessage = document.getElementById('noUrlsAddedMessage');
    const step1ProgressBar = document.getElementById('step1ProgressBar');
    const goToStep2Button = document.getElementById('goToStep2Button');

    const step2Container = document.getElementById('step2Container');
    const sendModeRadios = document.querySelectorAll('input[name="sendMode"]');
    const commonReblogCommentInput = document.getElementById('commonReblogComment');
    const commonReblogTagsInput = document.getElementById('commonReblogTags');
    const removeTagsCheckbox = document.getElementById('removeTagsCheckbox');
    const goToStep3Button = document.getElementById('goToStep3Button');
    const executeActionButtonDirect = document.getElementById('executeActionButtonDirect');

    const step3Container = document.getElementById('step3Container');
    const scheduleScopeRadios = document.querySelectorAll('input[name="scheduleScope"]');
    const goToStep4Button = document.getElementById('goToStep4Button');

    const step4Container = document.getElementById('step4Container');
    const step4Title = document.getElementById('step4Title');
    const bulkScheduleOptionsContainer = document.getElementById('bulkScheduleOptionsContainer');
    const bulkScheduleDateTimeInput = document.getElementById('bulkScheduleDateTime');
    const bulkScheduleIntervalInput = document.getElementById('bulkScheduleInterval');
    const individualScheduleOptionsContainer = document.getElementById('individualScheduleOptionsContainer');
    const finalActionProgressBar = document.getElementById('finalActionProgressBar');
    const executeFinalActionButton = document.getElementById('executeFinalActionButton');

    // DEĞİŞİKLİK: Worker ayarları için yeni elementler
    const workerCountSlider = document.getElementById('workerCountSlider');
    const workerCountValue = document.getElementById('workerCountValue');


    // --- Durum Değişkenleri ---
    let selectedAppUsernames = new Set();
    let allAvailableUsers = [];
    let addedPostDetailsMap = new Map();
    let currentVisibleStep = 1;
    let currentSendMode = null;
    let currentScheduleScope = null;
    let isProcessing = false;
    let allActionsConfig = null;

    // --- Yardımcı Fonksiyonlar ---
    function logAction(message, type = 'info') {
        if (!actionLogArea) return;
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const logEntry = document.createElement('div');
        logEntry.innerHTML = `<span class="log-time">[${timeString}]</span> <span class="log-type">${type.toUpperCase()}:</span> ${message}`;
        const typeSpan = logEntry.querySelector('.log-type');
        if (typeSpan) typeSpan.classList.add(`log-${type.toLowerCase().replace(/\s+/g, '_')}`);
        actionLogArea.appendChild(logEntry);
        actionLogArea.scrollTop = actionLogArea.scrollHeight;
        if (type !== 'debug') console.log(`[MultiPostScheduler-Reblog Log] ${type}: ${message}`);
    }

    function updateProgressBar(barElement, percentage) {
        if (!barElement) return;
        percentage = Math.max(0, Math.min(100, percentage));
        barElement.style.width = `${percentage}%`;
    }

    async function getActionConfig(actionId) {
        if (!allActionsConfig) {
            try {
                const response = await fetch('/api/list-actions');
                if (!response.ok) {
                    const errorText = await response.text();
                    logAction(`Eylem listesi alınamadı: ${response.status} ${errorText}`, "error");
                    allActionsConfig = []; 
                    return null;
                }
                allActionsConfig = await response.json();
            } catch (e) {
                logAction(`Eylem konfigürasyonları çekilemedi: ${e.message}`, "error");
                allActionsConfig = [];
                return null;
            }
        }
        return allActionsConfig.find(action => action.id === actionId);
    }

    async function executeApiActionForModule(actionId, params = {}, appUsernameForAuth = null) {
        const requestBody = { actionId, params };
        const actionConfig = await getActionConfig(actionId);

        if (!actionConfig) {
            logAction(`API Eylemi '${actionId}' için konfigürasyon bulunamadı. modules.xml dosyasını kontrol edin.`, "error");
            throw { message: `API Eylemi '${actionId}' için konfigürasyon bulunamadı.`, isUserError: true, type: "config" };
        }

        if (actionConfig.authenticationType === 'userToken') {
            if (!appUsernameForAuth) {
                if (selectedAppUsernames.size > 0) {
                    appUsernameForAuth = Array.from(selectedAppUsernames)[0];
                    logAction(`API Eylemi '${actionId}' için appUsername belirtilmedi, ilk seçili kullanıcı (${appUsernameForAuth}) kullanılıyor.`, "warn");
                } else {
                    logAction(`API Eylemi '${actionId}' userToken gerektiriyor ancak yetkilendirme için kullanıcı seçilmemiş.`, "error");
                    throw { message: `API Eylemi '${actionId}' için yetkilendirme yapacak kullanıcı seçilmemiş.`, isUserError: true, type: "auth" };
                }
            }
            requestBody.appUsername = appUsernameForAuth;
        }

        // logAction(`API Eylemi: ${actionId}, Kullanıcı: ${requestBody.appUsername || 'API Anahtarı'}`, "debug");

        const response = await fetch('/api/execute-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const resultText = await response.text();
        let result;
        try {
            result = JSON.parse(resultText);
        } catch (e) {
            logAction(`Sunucudan gelen yanıt JSON değil: ${resultText.substring(0, 200)}`, "error");
            throw { message: `Sunucudan geçersiz yanıt (JSON değil). Durum: ${response.status}`, isUserError: false, type: "network", details: resultText };
        }

        if (!response.ok || result.error) {
            const errorType = (response.status === 401 && actionConfig.authenticationType === 'userToken') ? "auth" : "api";
            logAction(`API Eylemi '${actionId}' hatası. Durum: ${response.status}. Mesaj: ${result.error || result.message}. Detaylar: ${JSON.stringify(result.details)}`, "error");
            throw { message: result.error || result.message || `API eylemi '${actionId}' hatası (${response.status})`, isUserError: true, type: errorType, details: result.details, needsReAuth: result.needsReAuth };
        }
        return result.data;
    }

    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    
    // --- Kullanıcı Seçimi ---
    async function fetchAndPopulateUserSelector() {
        try {
            const users = await fetch('/api/users').then(res => {
                if (!res.ok) {
                    return res.text().then(text => Promise.reject(new Error(`Kullanıcıları çekerken sunucu hatası: ${res.status} ${text}`)));
                }
                return res.json();
            });
            allAvailableUsers = users;
            if(moduleUserSelectorContainer) moduleUserSelectorContainer.innerHTML = '';

            if (users && users.length > 0) {
                if(noUsersForSelectionMessage) noUsersForSelectionMessage.style.display = 'none';
                users.forEach(user => {
                    const label = document.createElement('label');
                    label.className = 'flex items-center space-x-2 p-1.5 border rounded-md hover:bg-slate-50 cursor-pointer text-sm';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = user.appUsername;
                    checkbox.dataset.blogId = user.tumblrBlogId || user.tumblrUserId || user.appUsername.split('_')[0];
                    checkbox.className = 'form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500 user-select-checkbox';
                    checkbox.addEventListener('change', handleUserSelectionChange);

                    const span = document.createElement('span');
                    span.className = 'text-slate-700 truncate';
                    span.title = user.tumblrBlogName || user.appUsername;
                    span.textContent = user.tumblrBlogName || user.appUsername;
                    label.appendChild(checkbox);
                    label.appendChild(span);
                    if(moduleUserSelectorContainer) moduleUserSelectorContainer.appendChild(label);
                });
            } else {
                if(noUsersForSelectionMessage) {
                    noUsersForSelectionMessage.textContent = 'Kayıtlı kullanıcı bulunamadı.';
                    noUsersForSelectionMessage.style.display = 'block';
                }
            }
        } catch (error) {
            logAction(`Kullanıcı listesi çekilirken hata: ${error.message}`, "error");
            if(noUsersForSelectionMessage) {
                noUsersForSelectionMessage.textContent = 'Kullanıcı listesi yüklenemedi.';
                noUsersForSelectionMessage.style.display = 'block';
            }
        }
        updateActionButtonStates();
    }

    function handleUserSelectionChange(event) {
        const appUsername = event.target.value;
        if (event.target.checked) {
            selectedAppUsernames.add(appUsername);
        } else {
            selectedAppUsernames.delete(appUsername);
        }
        if(noUserSelectedWarning) noUserSelectedWarning.style.display = selectedAppUsernames.size === 0 ? 'block' : 'none';
        updateActionButtonStates();
        updateStepVisibility();
        logAction(`Seçili kullanıcılar: ${selectedAppUsernames.size > 0 ? Array.from(selectedAppUsernames).join(', ') : 'Yok'}`, 'debug');
    }

    function updateActionButtonStates() {
        const usersSelected = selectedAppUsernames.size > 0;
        if(addUrlsToListButton) addUrlsToListButton.disabled = !usersSelected || isProcessing;
    }

    // --- Adım 1: URL İşleme (Reblog için Detay Çekme) ---
    function parseTumblrUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.toLowerCase().split('/').filter(part => part.length > 0);
            let blogIdentifier, postId;

            if (urlObj.hostname.endsWith('.tumblr.com')) {
                blogIdentifier = urlObj.hostname.split('.')[0];
                 if (blogIdentifier === 'www' || blogIdentifier === 'assets') {
                    if (pathParts.length > 0) blogIdentifier = pathParts[0]; else return null;
                 }
            } else {
                if (urlObj.hostname === 'www.tumblr.com' || urlObj.hostname === 'tumblr.com') {
                    if (pathParts.length > 0) blogIdentifier = pathParts[0]; else return null;
                } else {
                    blogIdentifier = urlObj.hostname;
                }
            }

            let potentialPostIdIndex = -1;
            const postKeywordIndex = pathParts.indexOf('post');
            if (postKeywordIndex !== -1 && pathParts.length > postKeywordIndex + 1) {
                potentialPostIdIndex = postKeywordIndex + 1;
            } else {
                 const blogIdentifierInPathIndex = pathParts.indexOf(blogIdentifier.toLowerCase());
                 if (blogIdentifierInPathIndex !== -1 && pathParts.length > blogIdentifierInPathIndex + 1) {
                    potentialPostIdIndex = blogIdentifierInPathIndex + 1;
                 } else if (blogIdentifierInPathIndex === -1 && pathParts.length > 0 && blogIdentifier === urlObj.hostname) {
                    potentialPostIdIndex = 0;
                 }
            }

            if (potentialPostIdIndex !== -1 && pathParts.length > potentialPostIdIndex) {
                const idCandidate = pathParts[potentialPostIdIndex];
                if (/^\d+$/.test(idCandidate)) postId = idCandidate;
            }
            
            if (!postId && pathParts.length > 0) {
                 const lastPart = pathParts[pathParts.length - 1];
                 const numericMatch = lastPart.match(/^(\d+)/);
                 if(numericMatch) postId = numericMatch[1];
            }

            if (blogIdentifier && postId) {
                return { blogIdentifier: blogIdentifier.toLowerCase(), postId };
            }
        } catch (e) {
             logAction(`URL ayrıştırma hatası (${url}): ${e.message}`, "warn");
        }
        logAction(`URL ayrıştırılamadı veya geçersiz format: ${url}`, "warn");
        return null;
    }

    async function handleAddUrls() {
        if (isProcessing) { logAction("Devam eden bir işlem var, lütfen bekleyin.", "warn"); return; }
        if (selectedAppUsernames.size === 0) { logAction("Lütfen önce işlem yapılacak hesapları seçin.", "warn"); if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'block'; return; }
        if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'none';

        const urlsText = postUrlsInput.value.trim();
        if (!urlsText) { logAction("Lütfen reblog yapılacak gönderi URL'lerini girin.", "warn"); return; }
        const urls = urlsText.split(/[\n\s,]+/).map(url => url.trim()).filter(url => url.length > 0 && (url.startsWith('http://') || url.startsWith('https://')));
        if (urls.length === 0) { logAction("Geçerli URL bulunamadı. URL'ler http:// veya https:// ile başlamalıdır.", "warn"); return; }

        isProcessing = true;
        if(addUrlsToListButton) addUrlsToListButton.disabled = true;
        if(goToStep2Button) goToStep2Button.style.display = 'none';
        currentVisibleStep = 1;
        updateStepVisibility();

        if(step1ProgressBar) updateProgressBar(step1ProgressBar, 0);
        addedPostDetailsMap.clear();
        renderAddedUrlsList(); 

        let fetchedDetailsCount = 0;
        const uniqueUrls = Array.from(new Set(urls));

        for (const url of uniqueUrls) {
            const entry = { originalUrl: url, sourceBlogIdentifier: null, sourcePostId: null, parent_tumblelog_uuid: null, parent_post_id: null, reblog_key: null, original_tags: [], summary: '', status: 'new', error: null };
            addedPostDetailsMap.set(url, entry);
            renderAddedUrlsList();

            const parsed = parseTumblrUrl(url);
            if (parsed) {
                entry.sourceBlogIdentifier = parsed.blogIdentifier;
                entry.sourcePostId = parsed.postId;
                entry.status = 'parsed';
            } else {
                entry.status = 'error_parsing';
                entry.error = 'Geçersiz URL formatı veya ayrıştırılamadı.';
            }
            renderAddedUrlsList();
        }

        const urlsToFetchDetails = Array.from(addedPostDetailsMap.values()).filter(d => d.status === 'parsed');
        for (const detail of urlsToFetchDetails) {
            if (!isProcessing) { logAction("URL işleme kullanıcı tarafından durduruldu.", "warn"); break;}
            detail.status = 'fetching_details';
            renderAddedUrlsList();
            try {
                logAction(`"${detail.originalUrl}" için reblog detayları çekiliyor...`, "info");
                const reblogData = await executeApiActionForModule('getPostDetailsForReblogApi', { post_url: detail.originalUrl });
                if (reblogData && reblogData.reblog_key && reblogData.parent_post_id && reblogData.parent_tumblelog_uuid) {
                    detail.parent_tumblelog_uuid = reblogData.parent_tumblelog_uuid;
                    detail.parent_post_id = reblogData.parent_post_id;
                    detail.reblog_key = reblogData.reblog_key;
                    detail.original_tags = reblogData.original_tags || [];
                    detail.summary = reblogData.summary || `Reblog: ${reblogData.parent_blog_name}/${reblogData.parent_post_id}`;
                    detail.status = 'details_fetched';
                    logAction(`Reblog detayları "${detail.originalUrl}" için çekildi. Kaynak: ${reblogData.parent_blog_name}, ID: ${reblogData.parent_post_id}`, "success");
                } else {
                    throw new Error("API'den geçerli reblog detayları (reblog_key, parent_post_id, parent_tumblelog_uuid) alınamadı.");
                }
            } catch (error) {
                detail.status = 'error_fetching_details';
                detail.error = error.message || 'Reblog detayı çekme hatası';
                logAction(`"${detail.originalUrl}" için reblog detayı çekme hatası: ${detail.error}`, "error");
            }
            fetchedDetailsCount++;
            if(step1ProgressBar) updateProgressBar(step1ProgressBar, (fetchedDetailsCount / urlsToFetchDetails.length) * 100);
            renderAddedUrlsList();
            if (isProcessing) await delay(300 + Math.random() * 200);
        }

        isProcessing = false;
        updateActionButtonStates();
        updateStepVisibility();

        const successfulFetches = Array.from(addedPostDetailsMap.values()).filter(d => d.status === 'details_fetched').length;
        logAction(`URL işleme ve reblog detayı çekme tamamlandı. ${successfulFetches} gönderi için detaylar başarıyla çekildi.`, successfulFetches > 0 ? "system_success" : "warn");
        if(postUrlsInput) postUrlsInput.value = '';
    }

    function renderAddedUrlsList() {
        if (!addedUrlsDisplayContainer) return;
        addedUrlsDisplayContainer.innerHTML = '';
        if (addedPostDetailsMap.size === 0) {
            if(noUrlsAddedMessage) noUrlsAddedMessage.style.display = 'block';
            return;
        }
        if(noUrlsAddedMessage) noUrlsAddedMessage.style.display = 'none';

        addedPostDetailsMap.forEach((data, url) => {
            const item = document.createElement('div'); item.className = 'added-url-item py-2 px-3'; let statusText = ''; let statusClass = 'text-gray-500';
            switch(data.status) {
                case 'new': statusText = 'Sırada'; break;
                case 'parsed': statusText = `Ayrıştırıldı (${data.sourceBlogIdentifier}/${data.sourcePostId}), detaylar bekleniyor`; statusClass = 'url-status-parsed'; break;
                case 'fetching_details': statusText = 'Reblog Detayları Çekiliyor...'; statusClass = 'url-status-fetching'; break;
                case 'details_fetched': statusText = `Reblog Detayları Alındı (ID: ${data.parent_post_id})`; statusClass = 'url-status-details-fetched'; break;
                case 'error_parsing': statusText = `URL Hatası: ${data.error || 'Bilinmeyen'}`; statusClass = 'url-status-error'; break;
                case 'error_fetching_details': statusText = `Detay Çekme Hatası: ${data.error ? data.error.substring(0,40)+'...' : 'Bilinmeyen'}`; statusClass = 'url-status-error'; break;
                default: statusText = data.status;
            }
            const shortUrl = url.length > 60 ? url.substring(0, 28) + '...' + url.substring(url.length - 28) : url;
            item.innerHTML = `<span class="truncate flex-grow mr-2" title="${url}">${shortUrl}</span><span class="text-xs ${statusClass} flex-shrink-0">${statusText}</span>`;
            addedUrlsDisplayContainer.appendChild(item);
        });
    }

    // --- Adım Yönetimi ve Navigasyon ---
    function updateStepVisibility() {
        step1Container.style.display = 'none';
        step2Container.style.display = 'none';
        step3Container.style.display = 'none';
        step4Container.style.display = 'none';

        goToStep2Button.style.display = 'none';
        goToStep3Button.style.display = 'none';
        goToStep4Button.style.display = 'none';
        executeActionButtonDirect.style.display = 'none';
        executeFinalActionButton.style.display = 'none';

        const validPostsCount = Array.from(addedPostDetailsMap.values()).filter(p => p.status === 'details_fetched').length;
        const usersSelected = selectedAppUsernames.size > 0;

        if (currentVisibleStep === 1) {
            step1Container.style.display = 'block';
            if (validPostsCount > 0 && usersSelected) {
                goToStep2Button.textContent = `Adım 2: Reblog Modu (${validPostsCount} gönderi) →`;
                goToStep2Button.style.display = 'block';
            }
        } else if (currentVisibleStep === 2) {
            step2Container.style.display = 'block';
            if (currentSendMode) {
                if (currentSendMode === 'instant' || currentSendMode === 'queue') {
                    executeActionButtonDirect.textContent = currentSendMode === 'instant' ? 'Anlık Reblog Yap' : 'Sıraya Ekle (Reblog)';
                    executeActionButtonDirect.style.display = 'block';
                } else if (currentSendMode === 'schedule') {
                    goToStep3Button.style.display = 'block';
                }
            }
        } else if (currentVisibleStep === 3) {
            step3Container.style.display = 'block';
            if (currentScheduleScope) {
                goToStep4Button.style.display = 'block';
            }
        } else if (currentVisibleStep === 4) {
            step4Container.style.display = 'block';
            executeFinalActionButton.style.display = 'block';
            if (currentScheduleScope === 'bulk') {
                if(step4Title) step4Title.textContent = 'Adım 4: Toplu Planlama ve Yürütme';
                if(bulkScheduleOptionsContainer) bulkScheduleOptionsContainer.style.display = 'block';
                if(individualScheduleOptionsContainer) individualScheduleOptionsContainer.style.display = 'none';
                if(executeFinalActionButton) executeFinalActionButton.textContent = 'Reblog Planlamasını Başlat (Toplu)';
            } else if (currentScheduleScope === 'individual') {
                if(step4Title) step4Title.textContent = 'Adım 4: Bireysel Planlama ve Yürütme';
                if(bulkScheduleOptionsContainer) bulkScheduleOptionsContainer.style.display = 'none';
                if(individualScheduleOptionsContainer) individualScheduleOptionsContainer.style.display = 'block';
                renderIndividualScheduleUI();
                if(executeFinalActionButton) executeFinalActionButton.textContent = 'Reblog Planlamasını Başlat (Bireysel)';
            }
        }
        if(addUrlsToListButton) addUrlsToListButton.disabled = !usersSelected || isProcessing;
        if(executeActionButtonDirect) executeActionButtonDirect.disabled = !usersSelected || validPostsCount === 0 || isProcessing;
        if(executeFinalActionButton) executeFinalActionButton.disabled = !usersSelected || validPostsCount === 0 || isProcessing;
    }

    // --- Olay Dinleyicileri (Navigasyon Butonları) ---
    if (goToStep2Button) {
        goToStep2Button.addEventListener('click', () => {
            if (selectedAppUsernames.size === 0) { logAction("Lütfen önce işlem yapılacak hesapları seçin.", "warn"); if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'block'; return; }
            if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'none';
            const validPostsCount = Array.from(addedPostDetailsMap.values()).filter(p => p.status === 'details_fetched').length;
            if (validPostsCount === 0) { logAction("İleri gitmeden önce en az bir gönderinin reblog detaylarının başarıyla çekilmiş olması gerekir.", "warn"); return; }
            currentVisibleStep = 2; logAction("Adım 2'ye (Reblog Modu) geçildi.", "debug"); updateStepVisibility();
        });
    }
    if (sendModeRadios) {
        sendModeRadios.forEach(radio => radio.addEventListener('change', (e) => { currentSendMode = e.target.value; currentScheduleScope = null; if(scheduleScopeRadios) scheduleScopeRadios.forEach(r => r.checked = false); logAction(`Reblog modu seçildi: ${currentSendMode}`, "debug"); updateStepVisibility(); }));
    }
    if (goToStep3Button) {
        goToStep3Button.addEventListener('click', () => { if (currentSendMode === 'schedule') { currentVisibleStep = 3; logAction("Adım 3'e (Planlama Kapsamı) geçildi.", "debug"); updateStepVisibility(); } else { logAction("Adım 3'e geçmek için reblog modunun 'Planla' olması gerekir.", "warn"); }});
    }
    if (scheduleScopeRadios) {
        scheduleScopeRadios.forEach(radio => radio.addEventListener('change', (e) => { currentScheduleScope = e.target.value; logAction(`Planlama kapsamı seçildi: ${currentScheduleScope}`, "debug"); updateStepVisibility(); }));
    }
    if (goToStep4Button) {
        goToStep4Button.addEventListener('click', () => { if (currentSendMode === 'schedule' && currentScheduleScope) { currentVisibleStep = 4; logAction("Adım 4'e (Planlama Detayları) geçildi.", "debug"); updateStepVisibility(); } else { logAction("Adım 4'e geçmek için planlama kapsamının seçilmiş olması gerekir.", "warn"); }});
    }

    // --- Bireysel Planlama Arayüzü ---
    function renderIndividualScheduleUI() {
        if(!individualScheduleOptionsContainer) return;
        individualScheduleOptionsContainer.innerHTML = '';
        const postsToSchedule = Array.from(addedPostDetailsMap.values()).filter(p => p.status === 'details_fetched');
        if (postsToSchedule.length === 0 || selectedAppUsernames.size === 0) {
            individualScheduleOptionsContainer.innerHTML = '<p class="text-slate-500 italic p-4 text-center">Planlanacak reblog veya seçili hesap yok.</p>';
            return;
        }

        selectedAppUsernames.forEach(username => {
            const userBlog = allAvailableUsers.find(u => u.appUsername === username);
            const userSection = document.createElement('div');
            userSection.className = 'mb-6 p-3 border rounded-md bg-slate-50';
            userSection.innerHTML = `<h4 class="text-md font-semibold text-indigo-700 mb-2">Hesap: ${userBlog?.tumblrBlogName || username}</h4>`;

            postsToSchedule.forEach((postDetail, postIndex) => {
                const postUrlShort = postDetail.originalUrl.length > 50 ? postDetail.originalUrl.substring(0,23) + '...' + postDetail.originalUrl.substring(postDetail.originalUrl.length-24) : postDetail.originalUrl;
                const uniqueIdSuffix = `${username.replace(/\W/g, '_')}_${postIndex}`;
                const postScheduleContainer = document.createElement('div');
                postScheduleContainer.className = 'user-schedule-item-header mb-3 ml-2 p-2 border-b';
                postScheduleContainer.innerHTML = `
                    <div>
                        <p class="text-sm font-medium text-slate-600" title="${postDetail.originalUrl}">Reblog #${postIndex + 1}: ${postDetail.summary || postUrlShort}</p>
                        <div class="mt-2">
                            <label for="schedule_time_${uniqueIdSuffix}" class="block text-xs text-gray-600">Yayın Zamanı (Opsiyonel):</label>
                            <input type="datetime-local" id="schedule_time_${uniqueIdSuffix}" data-username="${username}" data-posturl="${postDetail.originalUrl}"
                                   class="mt-0.5 block w-auto p-1.5 border border-gray-300 rounded-md shadow-sm text-sm schedule-input">
                        </div>
                        <div class="mt-2">
                            <label for="reblog_comment_${uniqueIdSuffix}" class="block text-xs text-gray-600">Reblog Yorumu (Opsiyonel):</label>
                            <textarea id="reblog_comment_${uniqueIdSuffix}" rows="2" data-username="${username}" data-posturl="${postDetail.originalUrl}"
                                      class="mt-0.5 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-sm schedule-input-comment" placeholder="Reblog yaparken eklenecek yorum..."></textarea>
                        </div>
                        <div class="mt-2">
                            <label for="reblog_tags_${uniqueIdSuffix}" class="block text-xs text-gray-600">Reblog Etiketleri (Opsiyonel, virgülle ayırın):</label>
                            <input type="text" id="reblog_tags_${uniqueIdSuffix}" data-username="${username}" data-posturl="${postDetail.originalUrl}"
                                   class="mt-0.5 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-sm schedule-input-tags" value="${postDetail.original_tags.join(', ')}" placeholder="orijinal etiketler, yeni etiket">
                        </div>
                    </div>
                `;
                userSection.appendChild(postScheduleContainer);
            });
            individualScheduleOptionsContainer.appendChild(userSection);
        });
    }

    // --- Ana İşlem Mantığı (Reblog) ---
    // DEĞİŞİKLİK: Fonksiyon, "Lider-İşçi" (Leader-Worker) modeli kullanarak daha gelişmiş paralel işlem yapacak şekilde güncellendi.
    async function handleSubmitAction() {
        if (isProcessing) { logAction("Devam eden bir işlem var.", "warn"); return; }
        if (selectedAppUsernames.size === 0) { logAction("Lütfen işlem yapılacak hesapları seçin.", "warn"); if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'block'; return; }
        if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'none';

        const postsToReblog = Array.from(addedPostDetailsMap.values()).filter(p => p.status === 'details_fetched' && p.reblog_key && p.parent_post_id && p.parent_tumblelog_uuid);
        if (postsToReblog.length === 0) { logAction("Reblog yapılacak geçerli gönderi (detayları çekilmiş) bulunamadı.", "warn"); return; }
        if (!currentSendMode) { logAction("Lütfen bir reblog modu seçin (Anlık, Sıraya Ekle, Planla).", "warn"); return; }
        if (currentSendMode === 'schedule' && !currentScheduleScope) { logAction("Lütfen planlama kapsamını seçin (Bireysel, Toplu).", "warn"); return;}

        // LİDER: İşlemi başlat ve ayarları yapılandır.
        isProcessing = true;
        if(executeFinalActionButton) executeFinalActionButton.disabled = true;
        if(executeActionButtonDirect) executeActionButtonDirect.disabled = true;
        if(addUrlsToListButton) addUrlsToListButton.disabled = true;
        if(finalActionProgressBar) updateProgressBar(finalActionProgressBar, 0);

        let processedOverallCount = 0;
        const totalOperations = selectedAppUsernames.size * postsToReblog.length;
        const concurrentWorkers = parseInt(workerCountSlider.value, 10); // LİDER: İşçi sayısını slider'dan al.
        
        logAction(`Lider-İşçi modeliyle paralel reblog işlemi başlıyor.`, "system");
        logAction(`LİDER: ${concurrentWorkers} işçi ile ${totalOperations} toplam görev yönetilecek.`, "system");

        const commonCommentText = commonReblogCommentInput ? commonReblogCommentInput.value.trim() : '';
        const commonTagsText = commonReblogTagsInput ? commonReblogTagsInput.value.trim() : '';
        
        // LİDER: Tüm görevleri tek bir "görev kuyruğu" (task queue) haline getir.
        const allTasks = [];
        for (const appUsername of selectedAppUsernames) {
            postsToReblog.forEach((postDetail, postIndex) => {
                allTasks.push({ appUsername, postDetail, postIndex });
            });
        }
        
        // İŞÇİ: Tek bir görevi işleyecek olan fonksiyon.
        const worker = async (workerId) => {
            // Görev kuyruğunda iş olduğu sürece çalış.
            while (allTasks.length > 0) {
                if (!isProcessing) {
                    logAction(`İŞÇİ #${workerId}: Lider tarafından durduruldu.`, 'warn');
                    break;
                }

                const task = allTasks.shift(); // Kuyruktan bir görev al (atomik işlem değil ama JS'nin single-threaded yapısı için yeterli).
                if (!task) continue;

                const { appUsername, postDetail, postIndex } = task;
                const userBlogData = allAvailableUsers.find(u => u.appUsername === appUsername);

                const submissionParams = {};
                const logMessagePrefix = `[${userBlogData?.tumblrBlogName || appUsername} / Gönderi ${postIndex + 1}]`;

                try {
                    // Bu göreve özel gönderim parametrelerini oluştur.
                    let reblogCommentNpf = [];
                    let reblogTagsArray = [];

                    if (removeTagsCheckbox && removeTagsCheckbox.checked) {
                        // reblogTagsArray boş kalacak
                    } else {
                        reblogTagsArray = [...postDetail.original_tags];
                        if (currentSendMode === 'schedule' && currentScheduleScope === 'individual') {
                            const uniqueIdSuffix = `${appUsername.replace(/\W/g, '_')}_${postIndex}`;
                            const individualTagsElem = document.getElementById(`reblog_tags_${uniqueIdSuffix}`);
                            const individualTagsText = individualTagsElem ? individualTagsElem.value.trim() : '';
                            if (individualTagsText) {
                                reblogTagsArray = individualTagsText.split(',').map(t => t.trim()).filter(t => t);
                            } else if (commonTagsText) {
                                reblogTagsArray = commonTagsText.split(',').map(t => t.trim()).filter(t => t);
                            }
                        } else if (commonTagsText) {
                            reblogTagsArray = commonTagsText.split(',').map(t => t.trim()).filter(t => t);
                        }
                    }

                    if (currentSendMode === 'schedule' && currentScheduleScope === 'individual') {
                        const uniqueIdSuffix = `${appUsername.replace(/\W/g, '_')}_${postIndex}`;
                        const individualCommentElem = document.getElementById(`reblog_comment_${uniqueIdSuffix}`);
                        const individualCommentText = individualCommentElem ? individualCommentElem.value.trim() : '';
                        if (individualCommentText) {
                            reblogCommentNpf.push({ type: 'text', text: individualCommentText });
                        } else if (commonCommentText) {
                            reblogCommentNpf.push({ type: 'text', text: commonCommentText });
                        }
                    } else if (commonCommentText) {
                        reblogCommentNpf.push({ type: 'text', text: commonCommentText });
                    }

                    Object.assign(submissionParams, {
                        parent_tumblelog_uuid: postDetail.parent_tumblelog_uuid,
                        parent_post_id: postDetail.parent_post_id,
                        reblog_key: postDetail.reblog_key,
                        comment_npf: reblogCommentNpf,
                        tags_array: reblogTagsArray,
                    });
                    
                    if (currentSendMode === 'instant') {
                        submissionParams.post_state = 'published';
                    } else if (currentSendMode === 'queue') {
                        submissionParams.post_state = 'queue';
                    } else if (currentSendMode === 'schedule') {
                        submissionParams.post_state = 'queue';
                        let scheduleTimeISO = null;
                        if (currentScheduleScope === 'bulk') {
                            if (bulkScheduleDateTimeInput && bulkScheduleDateTimeInput.value) {
                                let baseTime = new Date(bulkScheduleDateTimeInput.value);
                                if (bulkScheduleIntervalInput && bulkScheduleIntervalInput.value) {
                                    const intervalMinutes = parseInt(bulkScheduleIntervalInput.value);
                                    if (!isNaN(intervalMinutes) && intervalMinutes > 0) {
                                        baseTime.setMinutes(baseTime.getMinutes() + (postIndex * intervalMinutes));
                                    }
                                }
                                scheduleTimeISO = baseTime.toISOString();
                            }
                        } else { // individual
                            const inputId = `schedule_time_${appUsername.replace(/\W/g, '_')}_${postIndex}`;
                            const inputElement = document.getElementById(inputId);
                            if (inputElement && inputElement.value) {
                                scheduleTimeISO = new Date(inputElement.value).toISOString();
                            }
                        }
                        if (scheduleTimeISO) submissionParams.publish_on_iso = scheduleTimeISO;
                    }
                    
                    logAction(`İŞÇİ #${workerId}: ${logMessagePrefix} görevini başlattı.`, "debug");
                    await executeApiActionForModule('reblogPostApi', submissionParams, appUsername);
                    logAction(`İŞÇİ #${workerId}: ${logMessagePrefix} görevini başarıyla tamamladı.`, "success");

                } catch (error) {
                    logAction(`İŞÇİ #${workerId}: ${logMessagePrefix} görevinde HATA: ${error.message}.`, "error");
                } finally {
                    processedOverallCount++;
                    if(finalActionProgressBar) updateProgressBar(finalActionProgressBar, (processedOverallCount / totalOperations) * 100);
                }
            }
        };

        // LİDER: İşçileri (worker) başlat.
        const workerPromises = [];
        for (let i = 0; i < concurrentWorkers; i++) {
            workerPromises.push(worker(i + 1)); // Her işçiye bir kimlik (ID) ver.
        }

        // LİDER: Tüm işçilerin görevlerini tamamlamasını bekle.
        try {
            await Promise.all(workerPromises);
        } catch (err) {
            logAction(`LİDER: İşlem sırasında beklenmedik genel bir hata oluştu: ${err.message}`, "error");
        } finally {
            logAction("LİDER: Tüm işçiler görevlerini tamamladı. Operasyon sona erdi.", "system_success");
            isProcessing = false;
            if(executeFinalActionButton) executeFinalActionButton.disabled = false;
            if(executeActionButtonDirect) executeActionButtonDirect.disabled = false;
            if(addUrlsToListButton) addUrlsToListButton.disabled = (selectedAppUsernames.size === 0);
        }
    }


    // --- Olay Dinleyici Atamaları (Ana İşlem Butonları) ---
    if(addUrlsToListButton) addUrlsToListButton.addEventListener('click', handleAddUrls);
    if(executeActionButtonDirect) executeActionButtonDirect.addEventListener('click', handleSubmitAction);
    if(executeFinalActionButton) executeFinalActionButton.addEventListener('click', handleSubmitAction);

    // DEĞİŞİKLİK: Worker slider'ı için olay dinleyici
    if (workerCountSlider && workerCountValue) {
        workerCountSlider.addEventListener('input', (e) => {
            workerCountValue.textContent = e.target.value;
        });
    }


    // --- Başlangıç ---
    function initializeModule() {
        logAction("Modül başlatılıyor...", "system");
        fetchAndPopulateUserSelector();
        currentVisibleStep = 1; currentSendMode = null; currentScheduleScope = null;
        addedPostDetailsMap.clear(); renderAddedUrlsList();
        updateStepVisibility();
        if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'block';
        logAction("Reblog Planlayıcı hazır. Lütfen işlem yapılacak hesap(lar)ı seçin, sonra rebloglanacak URL'leri girin.", "system");
    }
    initializeModule();
});
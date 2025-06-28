// modules/multi_post_republisher_client.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('[MultiPostRepublisher] DOM Yüklendi.');

    // --- Element Tanımlamaları ---
    const moduleUserSelectorContainer = document.getElementById('moduleUserSelectorContainer');
    const noUsersForSelectionMessage = document.getElementById('noUsersForSelectionMessage');
    const noUserSelectedWarning = document.getElementById('noUserSelectedWarning');

    const step1Container = document.getElementById('step1Container');
    const postUrlsInput = document.getElementById('postUrlsInput');
    const addUrlsToListButton = document.getElementById('addUrlsToListButton');
    const addedUrlsDisplayContainer = document.getElementById('addedUrlsDisplayContainer');
    const noUrlsAddedMessage = document.getElementById('noUrlsAddedMessage');
    const step1ProgressBar = document.getElementById('step1ProgressBar');
    const goToStep2Button = document.getElementById('goToStep2Button');

    const step2Container = document.getElementById('step2Container');
    const sendModeRadios = document.querySelectorAll('input[name="sendMode"]');
    const commonPostCaptionInput = document.getElementById('commonPostCaptionInput');
    const commonPostTagsInput = document.getElementById('commonPostTagsInput');
    const useOriginalTagsCheckbox = document.getElementById('useOriginalTagsCheckbox');
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
    
    const workerCountSlider = document.getElementById('workerCountSlider');
    const workerCountValue = document.getElementById('workerCountValue');
    const actionLogArea = document.getElementById('actionLogArea');

    // --- Durum Değişkenleri ---
    let selectedAppUsername = null;
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
        if (type !== 'debug') console.log(`[MultiPostRepublisher Log] ${type}: ${message}`);
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
            const authUser = appUsernameForAuth || selectedAppUsername;
            if (!authUser) {
                logAction(`API Eylemi '${actionId}' userToken gerektiriyor ancak yetkilendirme için kullanıcı seçilmemiş.`, "error");
                throw { message: `API Eylemi '${actionId}' için yetkilendirme yapacak kullanıcı seçilmemiş.`, isUserError: true, type: "auth" };
            }
            requestBody.appUsername = authUser;
        }

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
            logAction(`API Eylemi '${actionId}' hatası. Durum: ${response.status}. Mesaj: ${result.error || result.message}.`, "error");
            throw { message: result.error || result.message || `API eylemi '${actionId}' hatası (${response.status})`, isUserError: true, type: errorType, details: result.details, needsReAuth: result.needsReAuth };
        }
        return result.data;
    }

    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    
    async function fetchAndPopulateUserSelector() {
        try {
            const users = await fetch('/api/users').then(res => res.ok ? res.json() : Promise.reject('Kullanıcılar alınamadı'));
            allAvailableUsers = users;
            if(moduleUserSelectorContainer) moduleUserSelectorContainer.innerHTML = '';

            if (users && users.length > 0) {
                if(noUsersForSelectionMessage) noUsersForSelectionMessage.style.display = 'none';
                users.forEach(user => {
                    const label = document.createElement('label');
                    label.className = 'flex items-center space-x-2 p-1.5 border rounded-md hover:bg-slate-50 cursor-pointer text-sm';
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = 'userSelector';
                    radio.value = user.appUsername;
                    radio.className = 'form-radio h-4 w-4 text-indigo-600 focus:ring-indigo-500 user-select-radio';
                    radio.addEventListener('change', handleUserSelectionChange);

                    const span = document.createElement('span');
                    span.className = 'text-slate-700 truncate';
                    span.title = user.tumblrBlogName || user.appUsername;
                    span.textContent = user.tumblrBlogName || user.appUsername;
                    label.appendChild(radio);
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
            logAction(`Kullanıcı listesi çekilirken hata: ${error.message || error}`, "error");
            if(noUsersForSelectionMessage) {
                noUsersForSelectionMessage.textContent = 'Kullanıcı listesi yüklenemedi.';
                noUsersForSelectionMessage.style.display = 'block';
            }
        }
        updateActionButtonStates();
    }

    function handleUserSelectionChange(event) {
        selectedAppUsername = event.target.value;
        if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'none';
        updateActionButtonStates();
        updateStepVisibility();
        logAction(`Seçili hesap: ${selectedAppUsername}`, 'debug');
    }

    function updateActionButtonStates() {
        const userSelected = !!selectedAppUsername;
        if(addUrlsToListButton) addUrlsToListButton.disabled = !userSelected || isProcessing;
    }

    async function handleAddUrls() {
        if (isProcessing) { logAction("Devam eden bir işlem var, lütfen bekleyin.", "warn"); return; }
        if (!selectedAppUsername) { logAction("Lütfen önce işlem yapılacak hesabı seçin.", "warn"); if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'block'; return; }
        if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'none';

        const urlsText = postUrlsInput.value.trim();
        if (!urlsText) { logAction("Lütfen klonlanacak gönderi URL'lerini girin.", "warn"); return; }
        const urls = urlsText.split(/[\n\s,]+/).map(url => url.trim()).filter(url => url.length > 0 && (url.startsWith('http://') || url.startsWith('https://')));
        if (urls.length === 0) { logAction("Geçerli URL bulunamadı. URL'ler http:// veya https:// ile başlamalıdır.", "warn"); return; }

        isProcessing = true;
        addUrlsToListButton.disabled = true;
        goToStep2Button.style.display = 'none';
        currentVisibleStep = 1;
        updateStepVisibility();
        updateProgressBar(step1ProgressBar, 0);
        addedPostDetailsMap.clear();
        renderAddedUrlsList(); 

        let fetchedDetailsCount = 0;
        const uniqueUrls = Array.from(new Set(urls));
        
        for (const url of uniqueUrls) {
            const entry = { originalUrl: url, content_blocks: [], tags: [], summary: '', status: 'new', error: null };
            addedPostDetailsMap.set(url, entry);
        }
        renderAddedUrlsList();
        
        const urlsToFetchContent = Array.from(addedPostDetailsMap.keys());
        for (const url of urlsToFetchContent) {
            if (!isProcessing) { logAction("URL işleme kullanıcı tarafından durduruldu.", "warn"); break;}
            const detail = addedPostDetailsMap.get(url);
            detail.status = 'fetching_content';
            renderAddedUrlsList();
            
            try {
                logAction(`"${detail.originalUrl}" için içerik çekiliyor...`, "info");
                const postData = await executeApiActionForModule('getPostContentForRepublishApi', { post_url: detail.originalUrl });

                if (postData && postData.content_blocks && postData.content_blocks.length > 0) {
                    detail.content_blocks = postData.content_blocks;
                    detail.tags = postData.tags || [];
                    detail.summary = postData.summary || `Klon: ${url.split('/').pop()}`;
                    detail.status = 'content_fetched';
                    logAction(`İçerik "${detail.originalUrl}" için başarıyla çekildi.`, "success");
                } else {
                    throw new Error("API'den geçerli içerik (content_blocks) alınamadı.");
                }
            } catch (error) {
                detail.status = 'error_fetching_content';
                detail.error = error.message || 'İçerik çekme hatası';
                logAction(`"${detail.originalUrl}" için içerik çekme hatası: ${detail.error}`, "error");
            }
            fetchedDetailsCount++;
            updateProgressBar(step1ProgressBar, (fetchedDetailsCount / urlsToFetchContent.length) * 100);
            renderAddedUrlsList();
            if (isProcessing) await delay(300 + Math.random() * 200);
        }

        isProcessing = false;
        updateActionButtonStates();
        updateStepVisibility();
        const successfulFetches = Array.from(addedPostDetailsMap.values()).filter(d => d.status === 'content_fetched').length;
        logAction(`URL işleme tamamlandı. ${successfulFetches} gönderi için içerik başarıyla çekildi.`, successfulFetches > 0 ? "system_success" : "warn");
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
            const item = document.createElement('div');
            item.className = 'added-url-item py-2 px-3';
            let statusText = '';
            let statusClass = 'text-gray-500';
            switch (data.status) {
                case 'new': statusText = 'Sırada'; break;
                case 'fetching_content': statusText = 'İçerik Çekiliyor...'; statusClass = 'url-status-fetching'; break;
                case 'content_fetched': statusText = `İçerik Alındı`; statusClass = 'url-status-content-fetched'; break;
                case 'error_fetching_content': statusText = `İçerik Çekme Hatası: ${data.error ? data.error.substring(0, 40) + '...' : 'Bilinmeyen'}`; statusClass = 'url-status-error'; break;
                default: statusText = data.status;
            }
            const shortUrl = url.length > 60 ? url.substring(0, 28) + '...' + url.substring(url.length - 28) : url;
            item.innerHTML = `<span class="truncate flex-grow mr-2" title="${url}">${shortUrl}</span><span class="text-xs ${statusClass} flex-shrink-0">${statusText}</span>`;
            addedUrlsDisplayContainer.appendChild(item);
        });
    }

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

        const validPostsCount = Array.from(addedPostDetailsMap.values()).filter(p => p.status === 'content_fetched').length;
        const userSelected = !!selectedAppUsername;

        if (currentVisibleStep === 1) {
            step1Container.style.display = 'block';
            if (validPostsCount > 0 && userSelected) {
                goToStep2Button.textContent = `Adım 2: Gönderim Modu (${validPostsCount} gönderi) →`;
                goToStep2Button.style.display = 'block';
            }
        } else if (currentVisibleStep === 2) {
            step2Container.style.display = 'block';
            if (currentSendMode) {
                // DEĞİŞİKLİK: 'draft' ve 'private' durumları eklendi.
                const directActionModes = ['published', 'queue', 'draft', 'private'];
                if (directActionModes.includes(currentSendMode)) {
                    const modeTexts = {
                        published: 'Anlık Yayınla',
                        queue: 'Sıraya Ekle',
                        draft: 'Taslak Olarak Kaydet',
                        private: 'Özel Olarak Yayınla'
                    };
                    executeActionButtonDirect.textContent = modeTexts[currentSendMode];
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
                if(executeFinalActionButton) executeFinalActionButton.textContent = 'Gönderim Planını Başlat (Toplu)';
            } else if (currentScheduleScope === 'individual') {
                if(step4Title) step4Title.textContent = 'Adım 4: Bireysel Planlama ve Yürütme';
                if(bulkScheduleOptionsContainer) bulkScheduleOptionsContainer.style.display = 'none';
                if(individualScheduleOptionsContainer) individualScheduleOptionsContainer.style.display = 'block';
                renderIndividualScheduleUI();
                if(executeFinalActionButton) executeFinalActionButton.textContent = 'Gönderim Planını Başlat (Bireysel)';
            }
        }
        if(addUrlsToListButton) addUrlsToListButton.disabled = !userSelected || isProcessing;
        if(executeActionButtonDirect) executeActionButtonDirect.disabled = !userSelected || validPostsCount === 0 || isProcessing;
        if(executeFinalActionButton) executeFinalActionButton.disabled = !userSelected || validPostsCount === 0 || isProcessing;
    }

    if (goToStep2Button) goToStep2Button.addEventListener('click', () => {
        const validPostsCount = Array.from(addedPostDetailsMap.values()).filter(p => p.status === 'content_fetched').length;
        if (validPostsCount === 0) { logAction("İleri gitmeden önce en az bir gönderinin içeriğinin başarıyla çekilmiş olması gerekir.", "warn"); return; }
        currentVisibleStep = 2; logAction("Adım 2'ye (Gönderim Modu) geçildi.", "debug"); updateStepVisibility();
    });
    if (sendModeRadios) sendModeRadios.forEach(radio => radio.addEventListener('change', (e) => { currentSendMode = e.target.value; currentScheduleScope = null; if(scheduleScopeRadios) scheduleScopeRadios.forEach(r => r.checked = false); logAction(`Gönderim modu seçildi: ${currentSendMode}`, "debug"); updateStepVisibility(); }));
    if (goToStep3Button) goToStep3Button.addEventListener('click', () => { currentVisibleStep = 3; logAction("Adım 3'e (Planlama Kapsamı) geçildi.", "debug"); updateStepVisibility(); });
    if (scheduleScopeRadios) scheduleScopeRadios.forEach(radio => radio.addEventListener('change', (e) => { currentScheduleScope = e.target.value; logAction(`Planlama kapsamı seçildi: ${currentScheduleScope}`, "debug"); updateStepVisibility(); }));
    if (goToStep4Button) goToStep4Button.addEventListener('click', () => { currentVisibleStep = 4; logAction("Adım 4'e (Planlama Detayları) geçildi.", "debug"); updateStepVisibility(); });

    function renderIndividualScheduleUI() {
        if(!individualScheduleOptionsContainer) return;
        individualScheduleOptionsContainer.innerHTML = '';
        const postsToSchedule = Array.from(addedPostDetailsMap.values()).filter(p => p.status === 'content_fetched');
        if (postsToSchedule.length === 0) {
            individualScheduleOptionsContainer.innerHTML = '<p class="text-slate-500 italic p-4 text-center">Planlanacak gönderi yok.</p>';
            return;
        }
        
        const userBlog = allAvailableUsers.find(u => u.appUsername === selectedAppUsername);
        const userSection = document.createElement('div');
        userSection.className = 'mb-6 p-3 border rounded-md bg-slate-50';
        userSection.innerHTML = `<h4 class="text-md font-semibold text-indigo-700 mb-2">Hesap: ${userBlog?.tumblrBlogName || selectedAppUsername}</h4>`;

        postsToSchedule.forEach((postDetail, postIndex) => {
            const postUrlShort = postDetail.originalUrl.length > 50 ? postDetail.originalUrl.substring(0,23) + '...' + postDetail.originalUrl.substring(postDetail.originalUrl.length-24) : postDetail.originalUrl;
            const uniqueIdSuffix = `${postIndex}`;
            const postScheduleContainer = document.createElement('div');
            postScheduleContainer.className = 'user-schedule-item-header mb-3 ml-2 p-2 border-b';
            postScheduleContainer.innerHTML = `
                <div>
                    <p class="text-sm font-medium text-slate-600" title="${postDetail.originalUrl}">Gönderi #${postIndex + 1}: ${postDetail.summary || postUrlShort}</p>
                    <div class="mt-2">
                        <label for="schedule_time_${uniqueIdSuffix}" class="block text-xs text-gray-600">Yayın Zamanı (Opsiyonel):</label>
                        <input type="datetime-local" id="schedule_time_${uniqueIdSuffix}" data-posturl="${postDetail.originalUrl}"
                               class="mt-0.5 block w-auto p-1.5 border border-gray-300 rounded-md shadow-sm text-sm schedule-input">
                    </div>
                    <div class="mt-2">
                        <label for="post_caption_${uniqueIdSuffix}" class="block text-xs text-gray-600">Gönderi Açıklaması (Opsiyonel):</label>
                        <textarea id="post_caption_${uniqueIdSuffix}" rows="2" data-posturl="${postDetail.originalUrl}"
                                  class="mt-0.5 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-sm schedule-input-caption" placeholder="Gönderiye özel açıklama..."></textarea>
                    </div>
                    <div class="mt-2">
                        <label for="post_tags_${uniqueIdSuffix}" class="block text-xs text-gray-600">Etiketler (Opsiyonel, virgülle ayırın):</label>
                        <input type="text" id="post_tags_${uniqueIdSuffix}" data-posturl="${postDetail.originalUrl}"
                               class="mt-0.5 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-sm schedule-input-tags" value="${postDetail.tags.join(', ')}" placeholder="orijinal etiketler, yeni etiket">
                    </div>
                </div>
            `;
            userSection.appendChild(postScheduleContainer);
        });
        individualScheduleOptionsContainer.appendChild(userSection);
    }
    
    async function handleSubmitAction() {
        if (isProcessing) { logAction("Devam eden bir işlem var.", "warn"); return; }
        if (!selectedAppUsername) { logAction("Lütfen işlem yapılacak hesabı seçin.", "warn"); if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'block'; return; }
        if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'none';

        const postsToPublish = Array.from(addedPostDetailsMap.values()).filter(p => p.status === 'content_fetched' && p.content_blocks && p.content_blocks.length > 0);
        if (postsToPublish.length === 0) { logAction("Yayınlanacak geçerli gönderi (içeriği çekilmiş) bulunamadı.", "warn"); return; }
        if (!currentSendMode) { logAction("Lütfen bir gönderim modu seçin (Anlık, Sıraya Ekle, Planla).", "warn"); return; }
        if (currentSendMode === 'schedule' && !currentScheduleScope) { logAction("Lütfen planlama kapsamını seçin (Bireysel, Toplu).", "warn"); return;}

        isProcessing = true;
        executeFinalActionButton.disabled = true;
        executeActionButtonDirect.disabled = true;
        addUrlsToListButton.disabled = true;
        updateProgressBar(finalActionProgressBar, 0);

        let processedOverallCount = 0;
        const totalOperations = postsToPublish.length;
        const concurrentWorkers = parseInt(workerCountSlider.value, 10);
        
        logAction(`Paralel gönderi oluşturma işlemi başlıyor.`, "system");
        logAction(`LİDER: ${concurrentWorkers} işçi ile ${totalOperations} toplam görev yönetilecek.`, "system");

        const commonCaptionText = commonPostCaptionInput ? commonPostCaptionInput.value.trim() : '';
        const commonTagsText = commonPostTagsInput ? commonPostTagsInput.value.trim() : '';
        
        const allTasks = [...postsToPublish.map((postDetail, postIndex) => ({ postDetail, postIndex }))];
        
        const worker = async (workerId) => {
            while (allTasks.length > 0) {
                if (!isProcessing) {
                    logAction(`İŞÇİ #${workerId}: Lider tarafından durduruldu.`, 'warn');
                    break;
                }
                const task = allTasks.shift();
                if (!task) continue;

                const { postDetail, postIndex } = task;
                const userBlogData = allAvailableUsers.find(u => u.appUsername === selectedAppUsername);
                const logMessagePrefix = `[${userBlogData?.tumblrBlogName || selectedAppUsername} / Gönderi ${postIndex + 1}]`;

                try {
                    const submissionParams = {};
                    let finalContent = [...postDetail.content_blocks];
                    let finalTags = [];

                    const individualTagsElem = document.getElementById(`post_tags_${postIndex}`);
                    const individualTagsText = (currentSendMode === 'schedule' && currentScheduleScope === 'individual' && individualTagsElem) ? individualTagsElem.value.trim() : '';

                    if (individualTagsText) {
                        finalTags = individualTagsText.split(',').map(t => t.trim()).filter(t => t);
                    } else {
                        if (useOriginalTagsCheckbox.checked) {
                            finalTags = [...postDetail.tags];
                        }
                        if (commonTagsText) {
                            finalTags.push(...commonTagsText.split(',').map(t => t.trim()).filter(t => t));
                        }
                        finalTags = [...new Set(finalTags)];
                    }

                    const individualCaptionElem = document.getElementById(`post_caption_${postIndex}`);
                    const individualCaptionText = (currentSendMode === 'schedule' && currentScheduleScope === 'individual' && individualCaptionElem) ? individualCaptionElem.value.trim() : '';

                    const captionText = individualCaptionText || commonCaptionText;
                    if (captionText) {
                        finalContent.push({ type: 'text', text: captionText });
                    }

                    submissionParams.content_blocks = finalContent;
                    submissionParams.tags_array = finalTags;
                    
                    // DEĞİŞİKLİK: 'post_state' ataması basitleştirildi.
                    if (currentSendMode === 'schedule') {
                        submissionParams.post_state = 'queue'; // 'schedule' modu API'de 'queue' durumunu kullanır
                        let scheduleTimeISO = null;
                        if (currentScheduleScope === 'bulk') {
                            if (bulkScheduleDateTimeInput && bulkScheduleDateTimeInput.value) {
                                let baseTime = new Date(bulkScheduleDateTimeInput.value);
                                const intervalMinutes = parseInt(bulkScheduleIntervalInput.value);
                                if (!isNaN(intervalMinutes) && intervalMinutes > 0) {
                                    baseTime.setMinutes(baseTime.getMinutes() + (postIndex * intervalMinutes));
                                }
                                scheduleTimeISO = baseTime.toISOString();
                            }
                        } else { // individual
                            const inputId = `schedule_time_${postIndex}`;
                            const inputElement = document.getElementById(inputId);
                            if (inputElement && inputElement.value) {
                                scheduleTimeISO = new Date(inputElement.value).toISOString();
                            }
                        }
                        if (scheduleTimeISO) submissionParams.publish_on_iso = scheduleTimeISO;
                    } else {
                        // Diğer tüm modlar ('published', 'queue', 'draft', 'private') doğrudan kullanılır.
                        submissionParams.post_state = currentSendMode;
                    }
                    
                    logAction(`İŞÇİ #${workerId}: ${logMessagePrefix} görevini başlattı.`, "debug");
                    await executeApiActionForModule('createNewPostApi', submissionParams, selectedAppUsername);
                    logAction(`İŞÇİ #${workerId}: ${logMessagePrefix} görevini başarıyla tamamladı.`, "success");

                } catch (error) {
                    logAction(`İŞÇİ #${workerId}: ${logMessagePrefix} görevinde HATA: ${error.message}.`, "error");
                } finally {
                    processedOverallCount++;
                    updateProgressBar(finalActionProgressBar, (processedOverallCount / totalOperations) * 100);
                }
            }
        };

        const workerPromises = [];
        for (let i = 0; i < concurrentWorkers; i++) {
            workerPromises.push(worker(i + 1));
        }

        try {
            await Promise.all(workerPromises);
        } catch (err) {
            logAction(`LİDER: İşlem sırasında beklenmedik genel bir hata oluştu: ${err.message}`, "error");
        } finally {
            logAction("LİDER: Tüm işçiler görevlerini tamamladı. Operasyon sona erdi.", "system_success");
            isProcessing = false;
            executeFinalActionButton.disabled = false;
            executeActionButtonDirect.disabled = false;
            addUrlsToListButton.disabled = (!selectedAppUsername);
        }
    }

    if(addUrlsToListButton) addUrlsToListButton.addEventListener('click', handleAddUrls);
    if(executeActionButtonDirect) executeActionButtonDirect.addEventListener('click', handleSubmitAction);
    if(executeFinalActionButton) executeFinalActionButton.addEventListener('click', handleSubmitAction);
    if (workerCountSlider && workerCountValue) {
        workerCountSlider.addEventListener('input', (e) => {
            workerCountValue.textContent = e.target.value;
        });
    }

    function initializeModule() {
        logAction("Modül başlatılıyor...", "system");
        fetchAndPopulateUserSelector();
        currentVisibleStep = 1; currentSendMode = null; currentScheduleScope = null;
        addedPostDetailsMap.clear(); renderAddedUrlsList();
        updateStepVisibility();
        if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'block';
        logAction("Gönderi Klonlayıcı hazır. Lütfen işlem yapılacak hesabı seçin, sonra klonlanacak URL'leri girin.", "system");
    }
    initializeModule();
});

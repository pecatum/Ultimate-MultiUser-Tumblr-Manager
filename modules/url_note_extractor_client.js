// modules/url_note_extractor_client.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('[UrlNoteExtractor] DOM Yüklendi.');

    // --- Element Tanımlamaları ---
    const moduleUserSelector = document.getElementById('moduleUserSelector');
    const noUserSelectedWarning = document.getElementById('noUserSelectedWarning');

    const userLimitsContainer = document.getElementById('userLimitsContainer');
    const followLimitText = document.getElementById('followLimitText');
    const followLimitRemainingText = document.getElementById('followLimitRemainingText');
    const followLimitProgressBar = document.getElementById('followLimitProgressBar');
    const followResetText = document.getElementById('followResetText');
    const likeLimitText = document.getElementById('likeLimitText');
    const likeLimitRemainingText = document.getElementById('likeLimitRemainingText');
    const likeLimitProgressBar = document.getElementById('likeLimitProgressBar');
    const likeResetText = document.getElementById('likeResetText');

    // Step 1
    const step1Container = document.getElementById('step1Container');
    const postUrlInput = document.getElementById('postUrlInput');
    const addPostUrlsButton = document.getElementById('addPostUrlsButton');
    const addedUrlsListContainer = document.getElementById('addedUrlsListContainer');
    const noUrlsAddedMessage = document.getElementById('noUrlsAddedMessage');
    const step1ProgressBar = document.getElementById('step1ProgressBar');
    const totalNotesFoundCountSpan = document.getElementById('totalNotesFoundCount');
    const goToStep2Button = document.getElementById('goToStep2Button');

    // Step 2
    const step2Container = document.getElementById('step2Container');
    const step2ProgressBar = document.getElementById('step2ProgressBar');
    const lastActiveFilterInput = document.getElementById('lastActiveFilter');
    const lastActiveFilterValueSpan = document.getElementById('lastActiveFilterValue');
    const findSuggestedUsersButton = document.getElementById('findSuggestedUsersButton');
    const selectAllStep2UsersButton = document.getElementById('selectAllStep2UsersButton');
    const suggestedUsersList = document.getElementById('suggestedUsersList');
    const goToStep3Button = document.getElementById('goToStep3Button');

    // Left Panel
    const selectedUserDetailsPanel = document.getElementById('selectedUserDetailsPanel');
    const selectedUserAvatar = document.getElementById('selectedUserAvatar');
    const selectedUserName = document.getElementById('selectedUserName');
    const selectedUserUrl = document.getElementById('selectedUserUrl');
    const selectedUserLastActive = document.getElementById('selectedUserLastActive');
    const selectedUserPostCount = document.getElementById('selectedUserPostCount');
    const selectedUserDescription = document.getElementById('selectedUserDescription');

    // Step 3
    const step3Container = document.getElementById('step3Container');
    const step3ProgressBar = document.getElementById('step3ProgressBar');
    const likesPerUserSliderInput = document.getElementById('likesPerUserSlider');
    const likesPerUserValueSpan = document.getElementById('likesPerUserValue');
    const followAndLikeButton = document.getElementById('followAndLikeButton');
    const followedCountSpan = document.getElementById('followedCount');
    const likedPostsCountStep3Span = document.getElementById('likedPostsCountStep3');
    
    // Avatar tarama elementleri
    const removeDefaultAvatarUsersButton = document.getElementById('removeDefaultAvatarUsersButton');
    const avatarScanProgressContainer = document.getElementById('avatarScanProgressContainer');
    const avatarScanProgressBar = document.getElementById('avatarScanProgressBar');
    const avatarScanProgressText = document.getElementById('avatarScanProgressText');

    const actionLogArea = document.getElementById('actionLogArea');

    // --- Durum Değişkenleri ---
    let selectedAppUsernameForModule = null;
    let addedPostUrlsMap = new Map(); 
    let allBlogNamesFromNotes = new Set();
    
    let potentialFollowTargets = new Map(); 
    let selectedUsersToProcessFromStep2 = new Set();
    let isProcessingStep = false;
    let currentDetailedUser = null;

    const LAST_ACTIVE_SLIDER_VALUES = [
        { value: 0, label: "Limitsiz" }, { value: 0.25, label: "Son 6 Saat" },
        { value: 1, label: "Son 1 Gün" }, { value: 3, label: "Son 3 Gün" },
        { value: 7, label: "Son 1 Hafta" }, { value: 14, label: "Son 2 Hafta" },
        { value: 30, label: "Son 1 Ay" }
    ];
    if (lastActiveFilterInput) {
        lastActiveFilterInput.max = LAST_ACTIVE_SLIDER_VALUES.length - 1;
        lastActiveFilterInput.value = LAST_ACTIVE_SLIDER_VALUES.findIndex(v => v.value === 7) || 4;
    }

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
        if (type !== 'debug') console.log(`[UrlNoteExtractor Log] ${type}: ${message}`);
    }

    function updateProgressBar(barElement, percentage) {
        if (!barElement) return;
        percentage = Math.max(0, Math.min(100, percentage));
        barElement.style.width = `${percentage}%`;
    }

    async function executeApiActionForModule(actionId, params = {}, needsAuth = true) {
        if (needsAuth && !selectedAppUsernameForModule) {
            throw { message: "Bu işlem için bir kullanıcı seçimi gereklidir.", isUserError: true, type: "auth" };
        }
        const requestBody = { actionId: actionId, params: params };
        if (needsAuth) requestBody.appUsername = selectedAppUsernameForModule;

        logAction(`API Eylemi: ${actionId}, Parametreler: ${JSON.stringify(params)}`, "debug");
        const response = await fetch('/api/execute-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        let resultText = await response.text();
        let result;
        try {
            result = JSON.parse(resultText);
        } catch (e) {
            console.error("Failed to parse JSON response: ", resultText);
            throw { message: `Sunucudan geçersiz JSON yanıtı alındı (Status: ${response.status})`, details: resultText, isUserError: false, type: "api" };
        }

        if (!response.ok || result.error) {
            const errorType = response.status === 401 && needsAuth ? "auth" : "api";
            console.error(`API Action Error for ${actionId}:`, result.error || result.message, result.details);
            throw { message: result.error || result.message || `API eylemi '${actionId}' hatası (${response.status})`, isUserError: true, type: errorType, details: result.details };
        }
        return result.data;
    }
    
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    async function fetchAndPopulateUsersForModule() { 
        if (!moduleUserSelector) return;
        try {
            const response = await fetch('/api/users');
            if (!response.ok) throw new Error(`Kullanıcılar çekilemedi (${response.status})`);
            const users = await response.json();
            moduleUserSelector.innerHTML = '<option value="">Hesap Seçin...</option>';
            if (users && users.length > 0) {
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.appUsername;
                    option.textContent = user.tumblrBlogName || user.appUsername;
                    moduleUserSelector.appendChild(option);
                });
            }
        } catch (error) {
            logAction(`Kullanıcı listesi çekilirken hata: ${error.message}`, "error");
        }
    }

    function displayUserLimits(userApiData) {
        if (!userLimitsContainer || !userApiData) {
            if (userLimitsContainer) userLimitsContainer.style.display = 'none';
            return;
        }
        const knownDailyFollowLimit = 200;
        const knownDailyLikeLimit = 1000;

        if (userApiData.follows && followLimitText && followLimitProgressBar && followLimitRemainingText) {
            const followsInfo = userApiData.follows;
            const remainingF = parseInt(followsInfo.remaining, 10);
            const limitF = parseInt(followsInfo.limit, 10) || knownDailyFollowLimit;
            const usedF = limitF > 0 ? limitF - remainingF : 0;
            
            followLimitText.textContent = `${usedF} / ${limitF}`;
            followLimitRemainingText.textContent = `${remainingF} kaldı`;
            updateProgressBar(followLimitProgressBar, limitF > 0 ? (usedF / limitF) * 100 : 0);
            if (followsInfo.reset_at && followResetText) {
                followResetText.textContent = `Sıfırlanma: ~${new Date(followsInfo.reset_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else if (followResetText) { followResetText.textContent = "";}
        } else {
             if (followLimitText) followLimitText.textContent = `? / ${knownDailyFollowLimit}`;
             if (followLimitRemainingText) followLimitRemainingText.textContent = `? kaldı`;
             if (followLimitProgressBar) updateProgressBar(followLimitProgressBar, 0);
             if (followResetText) followResetText.textContent = "";
        }

        if (likeLimitText && likeLimitProgressBar && likeLimitRemainingText) {
            if (userApiData.likes) { 
                 const likesInfo = userApiData.likes;
                 const remainingL = parseInt(likesInfo.remaining, 10);
                 const limitL = parseInt(likesInfo.limit, 10) || knownDailyLikeLimit;
                 const usedL = limitL > 0 ? limitL - remainingL : 0;
                 likeLimitText.textContent = `${usedL} / ${limitL}`;
                 likeLimitRemainingText.textContent = `${remainingL} kaldı`;
                 updateProgressBar(likeLimitProgressBar, limitL > 0 ? (usedL / limitL) * 100 : 0);
                 if (likesInfo.reset_at && likeResetText) {
                     likeResetText.textContent = `Sıfırlanma: ~${new Date(likesInfo.reset_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                 } else if (likeResetText) { likeResetText.textContent = ""; }
            } else {
                likeLimitText.textContent = `? / ${knownDailyLikeLimit}`; 
                likeLimitRemainingText.textContent = `? kaldı`;
                updateProgressBar(likeLimitProgressBar, 0);
                if (likeResetText) likeResetText.textContent = "";
            }
        }
        if (userLimitsContainer) userLimitsContainer.style.display = 'block';
    }

    function resetModuleState(fullReset = true) {
        if (fullReset && userLimitsContainer) userLimitsContainer.style.display = 'none';
        
        addedPostUrlsMap.clear();
        allBlogNamesFromNotes.clear(); 
        if(addedUrlsListContainer) addedUrlsListContainer.innerHTML = '';
        if(noUrlsAddedMessage) noUrlsAddedMessage.style.display = 'block';
        if(totalNotesFoundCountSpan) totalNotesFoundCountSpan.textContent = "Toplam Benzersiz Blog Bulundu (Notlardan): 0";
        if(step1ProgressBar) updateProgressBar(step1ProgressBar, 0);
        if(goToStep2Button) goToStep2Button.style.display = 'none';
        if(postUrlInput) postUrlInput.value = '';
        if(addPostUrlsButton) addPostUrlsButton.disabled = true; 
        
        if(step1Container && !fullReset && selectedAppUsernameForModule) step1Container.style.display = 'block';
        else if(step1Container) step1Container.style.display = 'none';

        potentialFollowTargets.clear(); selectedUsersToProcessFromStep2.clear();
        if(suggestedUsersList) suggestedUsersList.innerHTML = '<p class="text-slate-400 italic p-4 text-center">Bloglar Adım 2\'de burada listelenecek.</p>';
        if(selectedUserDetailsPanel) selectedUserDetailsPanel.style.display = 'none'; currentDetailedUser = null;
        if(step2ProgressBar) updateProgressBar(step2ProgressBar, 0);
        if (lastActiveFilterInput) {
             lastActiveFilterInput.value = LAST_ACTIVE_SLIDER_VALUES.findIndex(v => v.value === 7) || 4;
        }
        updateLastActiveFilterDisplay();
        if(goToStep3Button) goToStep3Button.style.display = 'none';
        if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'none';
        if(step2Container) step2Container.style.display = 'none';

        if(likesPerUserSliderInput) likesPerUserSliderInput.value = 2; updateLikesPerUserDisplay();
        if(step3ProgressBar) updateProgressBar(step3ProgressBar, 0);
        if(followedCountSpan) followedCountSpan.textContent = '0';
        if(likedPostsCountStep3Span) likedPostsCountStep3Span.textContent = '0';
        if(step3Container) step3Container.style.display = 'none';
        if(avatarScanProgressContainer) avatarScanProgressContainer.style.display = 'none';

        isProcessingStep = false;
        if (findSuggestedUsersButton) findSuggestedUsersButton.disabled = true;
        if (followAndLikeButton) followAndLikeButton.disabled = true;
    }

    if (moduleUserSelector) {
        moduleUserSelector.addEventListener('change', async function() {
            selectedAppUsernameForModule = this.value;
            if (userLimitsContainer) userLimitsContainer.style.display = 'none';
            resetModuleState(selectedAppUsernameForModule ? false : true);

            if (selectedAppUsernameForModule) {
                noUserSelectedWarning.style.display = 'none';
                if(addPostUrlsButton) addPostUrlsButton.disabled = false;
                logAction(`Hesap seçildi: ${selectedAppUsernameForModule}. Limitler yükleniyor...`, "system");
                if(step1Container) step1Container.style.display = 'block';

                try {
                    const limitsData = await executeApiActionForModule('getUserLimits', {}, true);
                    if (limitsData) displayUserLimits(limitsData);
                } catch (error) {
                    logAction(`Kullanıcı limitleri çekilemedi: ${error.message}`, "error");
                }
            } else {
                noUserSelectedWarning.style.display = 'block';
                 if(addPostUrlsButton) addPostUrlsButton.disabled = true;
            }
        });
    }

    function parseTumblrUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
            let blogIdentifier, postId;

            if (urlObj.hostname.endsWith('.tumblr.com') && urlObj.hostname.split('.').length > 2 && urlObj.hostname.split('.')[0] !== 'www') {
                blogIdentifier = urlObj.hostname.split('.')[0];
                if (pathParts.length >= 2 && pathParts[0] === 'post') {
                    postId = pathParts[1];
                } else if (pathParts.length >= 1 && /^\d+$/.test(pathParts[0])) {
                    postId = pathParts[0];
                } else if (pathParts.length >=1 ) { 
                     for(let i = pathParts.length -1; i>=0; i--){
                        if(/^\d+$/.test(pathParts[i])) {
                            postId = pathParts[i];
                            break;
                        }
                    }
                }
            } 
            else if (urlObj.hostname === 'www.tumblr.com') {
                if (pathParts.length >= 2) { 
                    blogIdentifier = pathParts[0];
                    if (pathParts[1] === 'post' && pathParts.length >= 3) {
                        postId = pathParts[2];
                    } else { 
                        postId = pathParts[1];
                    }
                }
            }
            
            if (blogIdentifier && postId) {
                const numericPostIdMatch = postId.match(/^\d+/);
                if (numericPostIdMatch) {
                    return { blogIdentifier, postId: numericPostIdMatch[0] };
                }
            }

        } catch (e) {
            logAction(`Geçersiz URL formatı: ${url} (${e.message})`, "warn");
        }
        logAction(`URL ayrıştırılamadı: ${url}`, "warn");
        return null;
    }

    async function handleAddPostUrls() {
        if (!selectedAppUsernameForModule && !addPostUrlsButton.dataset.skipAuthCheck) {
             logAction("Lütfen önce işlem yapılacak bir hesap seçin.", "warn");
             return;
        }
        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor, lütfen bekleyin.", "warn"); return; }
        
        const urlsText = postUrlInput.value.trim();
        if (!urlsText) { logAction("Lütfen en az bir gönderi URL'si girin.", "warn"); return; }

        const urls = urlsText.split(/[\n\s,]+/).map(url => url.trim()).filter(url => url.length > 0);
        if (urls.length === 0) { logAction("Geçerli URL bulunamadı.", "warn"); return; }

        isProcessingStep = true;
        addPostUrlsButton.disabled = true;
        if(noUrlsAddedMessage) noUrlsAddedMessage.style.display = 'none';
        if(goToStep2Button) goToStep2Button.style.display = 'none';
        updateProgressBar(step1ProgressBar, 0);

        let processedUrlCount = 0;
        const totalUrlsToProcess = urls.length;

        for (const url of urls) {
            if (!isProcessingStep) { logAction("URL işleme durduruldu.", "warn"); break; }
            const parsed = parseTumblrUrl(url);
            if (!parsed) {
                logAction(`Geçersiz Tumblr URL'si atlanıyor: ${url}`, "warn");
                addedPostUrlsMap.set(url, { blogIdentifier: null, postId: null, status: 'error', error: 'Geçersiz URL formatı', notesCount: 0 });
                processedUrlCount++;
                renderAddedUrlsList();
                updateProgressBar(step1ProgressBar, (processedUrlCount / totalUrlsToProcess) * 100);
                continue;
            }

            const { blogIdentifier, postId } = parsed;
            
            addedPostUrlsMap.set(url, { blogIdentifier, postId, status: 'fetching', notesCount: 0 });
            renderAddedUrlsList();
            logAction(`"${url}" için notlar çekiliyor (Blog: ${blogIdentifier}, Post: ${postId})...`, "info");

            try {
                const notesData = await executeApiActionForModule('fetchNotesFromPostUrl', 
                    { blog_identifier: blogIdentifier, post_id: postId, mode: 'all' }, 
                    false 
                );

                if (notesData && notesData.notes) {
                    let currentNotesCount = 0;
                    if (Array.isArray(notesData.notes)) {
                        currentNotesCount = notesData.notes.length;
                        notesData.notes.forEach(note => {
                            if (note.blog_name && note.blog_name.toLowerCase() !== blogIdentifier.toLowerCase()) {
                                allBlogNamesFromNotes.add(note.blog_name);
                            }
                        });
                    }
                    addedPostUrlsMap.set(url, { blogIdentifier, postId, status: 'success', notesCount: currentNotesCount });
                    logAction(`"${url}" için ${currentNotesCount} not bulundu. Toplam benzersiz blog adayı: ${allBlogNamesFromNotes.size}`, "success");
                } else {
                    throw new Error("API'den notlar alınamadı veya not dizisi boş/hatalı.");
                }
            } catch (error) {
                logAction(`"${url}" için not çekme hatası: ${error.message || 'Bilinmeyen sunucu hatası'}`, "error");
                addedPostUrlsMap.set(url, { blogIdentifier, postId, status: 'error', error: error.message, notesCount: 0 });
            }
            processedUrlCount++;
            updateProgressBar(step1ProgressBar, (processedUrlCount / totalUrlsToProcess) * 100);
            renderAddedUrlsList();
            if(totalNotesFoundCountSpan) totalNotesFoundCountSpan.textContent = `Toplam Benzersiz Blog Bulundu (Notlardan): ${allBlogNamesFromNotes.size}`;
            if (isProcessingStep) await delay(300);
        }
        
        isProcessingStep = false;
        addPostUrlsButton.disabled = !selectedAppUsernameForModule; 
        postUrlInput.value = ''; 
        if (isProcessingStep === false) {
          logAction("Girilen URL'ler için not çekme işlemi tamamlandı.", "system_success");
        }

        if (allBlogNamesFromNotes.size > 0) {
            if(goToStep2Button) goToStep2Button.style.display = 'block';
            goToStep2Button.textContent = `Adım 2: ${allBlogNamesFromNotes.size} Blogu İşle →`;
        } else {
            if(goToStep2Button) goToStep2Button.style.display = 'none';
            if (isProcessingStep === false) logAction("Hiçbir URL'den işlenecek blog bulunamadı.", "warn");
        }
    }

    function renderAddedUrlsList() {
        if (!addedUrlsListContainer) return;
        addedUrlsListContainer.innerHTML = '';
        if (addedPostUrlsMap.size === 0) {
            if(noUrlsAddedMessage) noUrlsAddedMessage.style.display = 'block';
            return;
        }
        if(noUrlsAddedMessage) noUrlsAddedMessage.style.display = 'none';

        addedPostUrlsMap.forEach((data, url) => {
            const item = document.createElement('div');
            item.className = 'added-url-item';
            let statusText = '';
            let statusClass = '';

            switch(data.status) {
                case 'fetching': statusText = 'Çekiliyor...'; statusClass = 'url-status-fetching'; break;
                case 'success': statusText = `${data.notesCount} not bulundu`; statusClass = 'url-status-success'; break;
                case 'error': statusText = `Hata: ${(data.error || '').substring(0,50)}...`; statusClass = 'url-status-error'; break;
                default: statusText = 'Beklemede';
            }
            
            const shortUrl = url.length > 70 ? url.substring(0, 35) + '...' + url.substring(url.length - 30) : url;
            item.innerHTML = `
                <span class="truncate flex-grow mr-2" title="${url}">${shortUrl}</span>
                <span class="text-xs ${statusClass} flex-shrink-0">${statusText}</span>
            `;
            addedUrlsListContainer.appendChild(item);
        });
    }

    async function findAndFilterSuggestedUsers() {
        if (allBlogNamesFromNotes.size === 0) { 
            logAction("Adım 1'den gelen işlenecek blog bulunmuyor.", "warn"); 
            if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = false;
            return;
        }
        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor.", "warn"); return; }
        isProcessingStep = true;
        logAction(`Adım 2: ${allBlogNamesFromNotes.size} blog adından potansiyel hedefler filtreleniyor (eşzamanlı en fazla 10 istek)...`, "info");

        if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = true;
        if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'none';
        if(goToStep3Button) goToStep3Button.style.display = 'none';
        if(step2ProgressBar) updateProgressBar(step2ProgressBar, 0);
        if(suggestedUsersList) suggestedUsersList.innerHTML = '<p class="text-slate-400 italic text-center py-4">Bloglar filtreleniyor...</p>';
        
        potentialFollowTargets.clear(); 
        selectedUsersToProcessFromStep2.clear();

        const selectedFilterIndex = parseInt(lastActiveFilterInput.value);
        const maxDaysOldFilter = LAST_ACTIVE_SLIDER_VALUES[selectedFilterIndex]?.value;
        logAction(`Aktiflik filtresi: ${LAST_ACTIVE_SLIDER_VALUES[selectedFilterIndex]?.label}`, "system");

        let processedBlogCount = 0;
        const blogsToProcessArray = Array.from(allBlogNamesFromNotes);
        const totalBlogsToProcess = blogsToProcessArray.length;
        const concurrencyLimitStep2 = 10;

        async function processBlog(blogNameFromNote) {
            if (selectedAppUsernameForModule && blogNameFromNote.toLowerCase() === selectedAppUsernameForModule.split('_')[0].toLowerCase()) {
                logAction(`Kendi blogunuz ("${blogNameFromNote}") atlanıyor.`, "debug");
                return;
            }
            
            logAction(`"${blogNameFromNote}" blog bilgileri ve takip durumu çekiliyor...`, "debug");
            try {
                const blogStatusData = await executeApiActionForModule('getBlogFollowingStatus', { blog_identifier: blogNameFromNote }, true); 
                
                if (blogStatusData) {
                    const blog = blogStatusData; 
                    const lastUpdatedTimestamp = blog.updated; 

                    if (maxDaysOldFilter > 0 && lastUpdatedTimestamp) {
                        const blogAgeDays = (Date.now() / 1000 - lastUpdatedTimestamp) / (60 * 60 * 24);
                        if (blogAgeDays > maxDaysOldFilter) {
                            logAction(` -> "${blogNameFromNote}" aktiflik filtresine takıldı (${Math.floor(blogAgeDays)}g > ${maxDaysOldFilter}g). Atlanıyor.`, "debug");
                            return; 
                        }
                    }

                    let canAddToList = true;
                    let isSelectable = true;
                    let frameColorClass = '';

                    if (blog.is_following_me === true && blog.am_i_following_them === false) { 
                        frameColorClass = 'frame-green';
                        isSelectable = false; 
                    } else if (blog.is_following_me === false && blog.am_i_following_them === true) { 
                        frameColorClass = 'frame-red';
                        isSelectable = false;
                    } else if (blog.is_following_me === true && blog.am_i_following_them === true) { 
                        frameColorClass = 'frame-blue';
                        isSelectable = false;
                    }
                    
                    if (canAddToList) {
                        const avatarUrl = blog.avatar?.length > 0 ? blog.avatar[0]?.url || `https://api.tumblr.com/v2/blog/${blog.name}/avatar/96` : `https://api.tumblr.com/v2/blog/${blog.name}/avatar/96`;
                        potentialFollowTargets.set(blogNameFromNote, {
                            name: blog.name, title: blog.title || blog.name, url: blog.url,
                            avatar: avatarUrl, updated: lastUpdatedTimestamp, 
                            posts: blog.posts, description: blog.description || "",
                            isSelectable: isSelectable,
                            frameColorClass: frameColorClass,
                            is_following_me: blog.is_following_me,
                            am_i_following_them: blog.am_i_following_them
                        });
                        logAction(`Potansiyel blog bulundu: ${blogNameFromNote} (Siz:${blog.am_i_following_them ? 'E' : 'H'}, O:${blog.is_following_me ? 'E' : 'H'})`, "success");
                    }
                }
            } catch (userError) {
                logAction(`"${blogNameFromNote}" blog/takip bilgisi çekme hatası: ${userError.message}`, "error");
                if (userError.isUserError && userError.type === "auth") { 
                    isProcessingStep = false; 
                    throw userError; 
                }
            } finally {
                processedBlogCount++;
                if(step2ProgressBar) updateProgressBar(step2ProgressBar, (processedBlogCount / totalBlogsToProcess) * 100);
            }
        }

        const batches = [];
        for (let i = 0; i < totalBlogsToProcess; i += concurrencyLimitStep2) {
            batches.push(blogsToProcessArray.slice(i, i + concurrencyLimitStep2));
        }

        for (const batch of batches) {
            if (!isProcessingStep) break; 
            const promises = batch.map(blogName => processBlog(blogName).catch(e => {
                if (e.type === "auth") throw e; 
                console.error(`Batch işleme sırasında ${blogName} için yakalanan hata:`, e);
            }));
            try {
                await Promise.all(promises);
            } catch (batchError) {
                if (batchError.type === "auth") {
                    logAction("Kimlik doğrulama hatası nedeniyle Adım 2 durduruldu.", "error");
                    isProcessingStep = false; 
                    break; 
                }
                logAction(`Batch işleme sırasında genel bir hata oluştu: ${batchError.message}`, "error");
            }
        }
        
        if (isProcessingStep) {
            logAction(`Adım 2 tamamlandı. ${potentialFollowTargets.size} potansiyel blog bulundu ve filtrelendi.`, "system_success");
        }
        renderSuggestedUsers();
        if (potentialFollowTargets.size > 0 && isProcessingStep) {
            if(goToStep3Button) goToStep3Button.style.display = 'block';
            if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'inline-block';
        }
        
        isProcessingStep = false;
        if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = false;
    }

    function renderSuggestedUsers() {
        if(!suggestedUsersList) return;
        suggestedUsersList.innerHTML = '';
        if (potentialFollowTargets.size === 0) {
            suggestedUsersList.innerHTML = '<p class="text-slate-400 italic text-center py-4">Filtreye uygun blog bulunamadı.</p>';
            if(goToStep3Button) goToStep3Button.style.display = 'none';
            if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'none';
            return;
        }
        const sortedTargets = Array.from(potentialFollowTargets.values()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
        
        sortedTargets.forEach(user => {
            const item = document.createElement('div');
            item.className = `suggested-user-item ${currentDetailedUser === user.name ? 'detailed-view' : ''} ${user.frameColorClass || ''}`;
            if (!user.isSelectable) {
                item.classList.add('not-selectable');
            }
            item.dataset.blogName = user.name;

            item.innerHTML = `
                <input type="checkbox" class="form-checkbox h-5 w-5 text-indigo-600 rounded mr-3 user-select-checkbox self-center flex-shrink-0" 
                       data-blog-name="${user.name}" 
                       ${selectedUsersToProcessFromStep2.has(user.name) ? 'checked' : ''}
                       ${!user.isSelectable ? 'disabled' : ''}>
                <img src="${user.avatar}" alt="${user.name} avatar" class="user-avatar flex-shrink-0">
                <div class="ml-2 overflow-hidden flex-grow">
                    <p class="text-sm font-semibold text-slate-800 truncate" title="${user.title ? user.title.replace(/"/g, '&quot;') : ''}">${user.title || user.name}</p>
                    <p class="text-xs text-indigo-500 truncate">${user.name}</p>
                    <p class="text-xs text-gray-500 mt-0.5">Son aktif: ${user.updated ? new Date(user.updated * 1000).toLocaleDateString() : 'Bilinmiyor'}</p>
                    <p class="text-xs text-gray-400 mt-0.5">Siz: ${user.am_i_following_them ? 'Takip' : 'Takip Etmiyor'} | O: ${user.is_following_me ? 'Takip Ediyor' : 'Etmiyor'}</p>
                </div>
            `;
            const checkbox = item.querySelector('.user-select-checkbox');
            if (user.isSelectable) {
                checkbox.addEventListener('change', (e) => {
                    const blogNameToToggle = e.target.dataset.blogName;
                    if (e.target.checked) {
                        selectedUsersToProcessFromStep2.add(blogNameToToggle);
                        item.classList.add('selected-for-action');
                    } else {
                        selectedUsersToProcessFromStep2.delete(blogNameToToggle);
                        item.classList.remove('selected-for-action');
                    }
                    updateFollowAndLikeButtonState();
                });
            }
            
            item.addEventListener('click', (e) => {
                 if (e.target.type !== 'checkbox' && !e.target.closest('a')) { 
                    displaySelectedUserDetails(user.name);
                    suggestedUsersList.querySelectorAll('.suggested-user-item').forEach(el => el.classList.remove('detailed-view'));
                    item.classList.add('detailed-view'); 
                    currentDetailedUser = user.name;
                }
            });
            suggestedUsersList.appendChild(item);
        });
        updateFollowAndLikeButtonState();
        if (potentialFollowTargets.size > 0 && selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'inline-block';
    }
    
    if(selectAllStep2UsersButton) {
        selectAllStep2UsersButton.addEventListener('click', () => {
            const checkboxes = suggestedUsersList.querySelectorAll('.user-select-checkbox:not(:disabled)');
            if (checkboxes.length === 0) return;
            const allCurrentlySelected = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => {
                if (cb.checked === allCurrentlySelected) cb.checked = !allCurrentlySelected;
                else cb.checked = true;
                cb.dispatchEvent(new Event('change'));
            });
        });
    }
    
    function updateFollowAndLikeButtonState() {
        const selectableUserCount = Array.from(potentialFollowTargets.values()).filter(u => u.isSelectable && selectedUsersToProcessFromStep2.has(u.name)).length;
        
        if (followAndLikeButton) {
            followAndLikeButton.disabled = selectableUserCount === 0;
            followAndLikeButton.textContent = selectableUserCount > 0 ?
                `${selectableUserCount} Blogu Takip Et ve Beğen` :
                "Takip Edilecek Seçili Blog Yok";
        }
        
        if (removeDefaultAvatarUsersButton) {
            removeDefaultAvatarUsersButton.disabled = selectableUserCount === 0;
        }
    }

    function displaySelectedUserDetails(blogName) {
        const user = potentialFollowTargets.get(blogName);
        if (user && selectedUserAvatar && selectedUserName && selectedUserUrl && selectedUserLastActive && selectedUserPostCount && selectedUserDescription && selectedUserDetailsPanel) {
            selectedUserAvatar.src = user.avatar.includes('/avatar/') ? user.avatar.replace(/avatar\/\d+/, 'avatar/128') : user.avatar;
            selectedUserName.textContent = user.title || user.name;
            selectedUserUrl.href = user.url;
            selectedUserUrl.textContent = user.url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
            selectedUserLastActive.textContent = user.updated ? new Date(user.updated * 1000).toLocaleString() : 'Bilinmiyor';
            selectedUserPostCount.textContent = user.posts?.toLocaleString() || '0';
            selectedUserDescription.innerHTML = user.description ? user.description.replace(/\n/g, '<br>') : '<p class="italic text-gray-500">Açıklama yok.</p>';
            selectedUserDetailsPanel.style.display = 'block';
        } else {
             if(selectedUserDetailsPanel) selectedUserDetailsPanel.style.display = 'none';
        }
    }

    async function followAndLikeSelectedTargets() {
        const usersToActuallyProcess = Array.from(selectedUsersToProcessFromStep2)
            .map(name => potentialFollowTargets.get(name))
            .filter(user => user && user.isSelectable);

        if (usersToActuallyProcess.length === 0) {logAction("Takip edilecek geçerli blog seçilmedi.", "warn"); return;}
        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor.", "warn"); return; }
        
        isProcessingStep = true;
        logAction(`Adım 3: ${usersToActuallyProcess.length} blog için takip/beğeni işlemi başlıyor...`, "info");
        if(followAndLikeButton) followAndLikeButton.disabled = true;
        if(removeDefaultAvatarUsersButton) removeDefaultAvatarUsersButton.disabled = true; 
        if(step3ProgressBar) updateProgressBar(step3ProgressBar, 0);

        let totalFollowed = 0, totalLikedPostsOverall = 0, processedUserCountOuter = 0;
        const likesPerUserCountTarget = parseInt(likesPerUserSliderInput.value);
        const concurrencyLimitLikes = 3; 

        for (const userBlog of usersToActuallyProcess) {
            if (!isProcessingStep) {
                logAction("Adım 3 kullanıcı tarafından veya bir hata nedeniyle durduruldu.", "warn");
                break;
            }
            if (!userBlog || !userBlog.url) {
                logAction(`Geçersiz kullanıcı verisi veya URL yok (${userBlog.name || 'Bilinmeyen'}), atlandı.`, "warn");
                processedUserCountOuter++;
                continue;
            }

            if (!userBlog.am_i_following_them) {
                logAction(`"${userBlog.name}" takip ediliyor...`, "info");
                try {
                    await executeApiActionForModule('followTumblrBlog', { blog_url: userBlog.url }, true);
                    totalFollowed++;
                    logAction(`"${userBlog.name}" başarıyla takip edildi.`, "success");
                    if(followedCountSpan) followedCountSpan.textContent = totalFollowed;
                    const updatedUser = potentialFollowTargets.get(userBlog.name);
                    if(updatedUser) updatedUser.am_i_following_them = true;
                } catch (followError) {
                    logAction(`"${userBlog.name}" takip edilemedi: ${followError.message}`, "error");
                    if (followError.isUserError && followError.type === "auth") { 
                        isProcessingStep = false; break; 
                    }
                }
            } else {
                 logAction(`"${userBlog.name}" zaten takip ediliyor, takip işlemi atlandı.`, "info");
            }
            
            if (isProcessingStep && usersToActuallyProcess.indexOf(userBlog) < usersToActuallyProcess.length -1) {
                 logAction("Bir sonraki kullanıcıya geçmeden önce 1 saniye bekleniyor...", "debug");
                 await delay(1000); 
            }

            if (likesPerUserCountTarget > 0 && isProcessingStep) {
                logAction(`"${userBlog.name}" için ${likesPerUserCountTarget} orijinal gönderi beğenilecek (eşzamanlı en fazla ${concurrencyLimitLikes})...`, "info");
                let likedForThisUserCount = 0;
                let fetchOffset = 0;
                const originalPostsForLiking = [];

                while(isProcessingStep && likedForThisUserCount < likesPerUserCountTarget && originalPostsForLiking.length < likesPerUserCountTarget && fetchOffset < 100) { 
                    try {
                        const postsToFetchPerBatchInternal = Math.max(concurrencyLimitLikes, likesPerUserCountTarget - originalPostsForLiking.length + 2);
                        const postData = await executeApiActionForModule('getBlogOriginalPosts', {
                            blog_identifier: userBlog.name, limit: postsToFetchPerBatchInternal, offset: fetchOffset
                        }, true);

                        if (postData && postData.posts && postData.posts.length > 0) {
                            for (const post of postData.posts) {
                                if (post.blog_name === userBlog.name && post.id_string && post.reblog_key && !post.reblogged_from_id) {
                                    originalPostsForLiking.push(post);
                                    if (originalPostsForLiking.length >= likesPerUserCountTarget) break;
                                }
                            }
                            if (postData.posts.length < postsToFetchPerBatchInternal || originalPostsForLiking.length >= likesPerUserCountTarget) break; 
                            fetchOffset += postsToFetchPerBatchInternal;
                        } else {
                            logAction(`"${userBlog.name}" için daha fazla orijinal gönderi bulunamadı (offset: ${fetchOffset}).`, "info");
                            break;
                        }
                    } catch (fetchErr) {
                        logAction(`"${userBlog.name}" için orijinal gönderi çekme hatası: ${fetchErr.message}`, "error");
                        if (fetchErr.isUserError && fetchErr.type === "auth") { isProcessingStep = false; }
                        break; 
                    }
                    if (isProcessingStep && originalPostsForLiking.length < likesPerUserCountTarget) await delay(200); 
                }

                if (originalPostsForLiking.length > 0 && isProcessingStep) {
                    logAction(`"${userBlog.name}" için ${originalPostsForLiking.length} potansiyel gönderi bulundu, ${Math.min(originalPostsForLiking.length, likesPerUserCountTarget)} tanesi beğenilecek.`, "debug");
                    
                    const postsToActuallyLike = originalPostsForLiking.slice(0, likesPerUserCountTarget);
                    const likeBatches = [];
                    for (let i = 0; i < postsToActuallyLike.length; i += concurrencyLimitLikes) {
                        likeBatches.push(postsToActuallyLike.slice(i, i + concurrencyLimitLikes));
                    }

                    for (const likeBatch of likeBatches) {
                        if (!isProcessingStep) break;
                        const likePromises = likeBatch.map(post => 
                            executeApiActionForModule('likeTumblrPost', { post_id: post.id_string, reblog_key: post.reblog_key }, true)
                                .then(() => {
                                    likedForThisUserCount++;
                                    totalLikedPostsOverall++;
                                    logAction(` -> "${post.id_string}" (${userBlog.name}) beğenildi. Bu blog için: ${likedForThisUserCount}, Toplam: ${totalLikedPostsOverall}`, "success");
                                    if(likedPostsCountStep3Span) likedPostsCountStep3Span.textContent = totalLikedPostsOverall;
                                })
                                .catch(likeError => {
                                    logAction(` -> "${post.id_string}" (${userBlog.name}) beğenilemedi: ${likeError.message}`, "error");
                                    if (likeError.details && typeof likeError.details === 'string' && likeError.details.includes('already liked')) {
                                         logAction(` -> "${post.id_string}" zaten beğenilmişti.`, "info");
                                    } else if (likeError.details?.meta?.status === 429 || likeError.message?.includes("429")) {
                                        logAction("Beğeni rate limitine takıldınız! Kalan beğeniler durduruluyor.", "error");
                                        isProcessingStep = false; 
                                        throw new Error("RateLimit"); 
                                    } else if (likeError.isUserError && likeError.type === "auth") {
                                        isProcessingStep = false; throw new Error("AuthError");
                                    }
                                })
                        );
                        try {
                            await Promise.all(likePromises);
                        } catch (batchLikeError) {
                            if (batchLikeError.message === "RateLimit" || batchLikeError.message === "AuthError") {
                                break; 
                            }
                        }
                         if (isProcessingStep && likeBatches.indexOf(likeBatch) < likeBatches.length -1 && likedForThisUserCount < likesPerUserCountTarget) {
                            await delay(500); 
                         }
                    }
                } else if (isProcessingStep) {
                     logAction(`"${userBlog.name}" için beğenilecek uygun orijinal gönderi bulunamadı.`, "info");
                }
            } 

            processedUserCountOuter++;
            if(step3ProgressBar) updateProgressBar(step3ProgressBar, (processedUserCountOuter / usersToActuallyProcess.length) * 100);
        } 
        
        if (isProcessingStep) {
            logAction(`Adım 3 tamamlandı. ${totalFollowed} blog takip edildi, ${totalLikedPostsOverall} gönderi beğenildi.`, "system_success");
        }
        
        isProcessingStep = false;
        try {
            const limitsData = await executeApiActionForModule('getUserLimits', {}, true);
            if (limitsData) displayUserLimits(limitsData);
        } catch (error) { logAction(`Kullanıcı limitleri güncellenemedi: ${error.message}`, "warn"); }
        
        renderSuggestedUsers(); 
        if(followAndLikeButton) followAndLikeButton.disabled = false;
        if(removeDefaultAvatarUsersButton) removeDefaultAvatarUsersButton.disabled = false; 
    }

    // GÜNCELLENDİ: `inactive_unfollower` scriptindeki worker havuzu mantığı buraya uyarlandı
    async function handleRemoveDefaultAvatarUsers() {
        if (isProcessingStep) {
            logAction("Zaten bir işlem devam ediyor, lütfen bekleyin.", "warn");
            return;
        }
        const selectedBlogNames = Array.from(selectedUsersToProcessFromStep2);
        if (selectedBlogNames.length === 0) {
            logAction("Varsayılan avatar kontrolü için önce blog seçmelisiniz.", "warn");
            return;
        }

        isProcessingStep = true;
        removeDefaultAvatarUsersButton.disabled = true;
        if (followAndLikeButton) followAndLikeButton.disabled = true;
        if (avatarScanProgressContainer) avatarScanProgressContainer.style.display = 'block';
        if (avatarScanProgressBar) updateProgressBar(avatarScanProgressBar, 0);
        logAction(`Seçili ${selectedBlogNames.length} blog arasında varsayılan avatar kontrolü başlatıldı (20 paralel işçi)...`, "system");
        
        const taskQueue = [...selectedBlogNames];
        const totalToScan = taskQueue.length;
        let processedCount = 0;
        let deselectedCount = 0;
        const avatarWorkerCount = 20;

        const worker = async (workerId) => {
            while(taskQueue.length > 0) {
                if(!isProcessingStep) break;

                const blogName = taskQueue.shift();
                if (!blogName) continue;
                
                logAction(`İşçi #${workerId}, '${blogName}' avatarını kontrol ediyor...`, 'debug');

                try {
                    const response = await fetch(`https://api.tumblr.com/v2/blog/${blogName}/avatar/64`);
                    if (response.url && response.url.includes("assets.tumblr.com/images/default_avatar/")) {
                        deselectedCount++;
                        logAction(`'${blogName}' varsayılan avatar kullanıyor. Seçimden kaldırılıyor.`, "info");
                        
                        selectedUsersToProcessFromStep2.delete(blogName);
                        const checkbox = suggestedUsersList.querySelector(`.user-select-checkbox[data-blog-name="${blogName}"]`);
                        if (checkbox) {
                            checkbox.checked = false;
                            checkbox.closest('.suggested-user-item')?.classList.remove('selected-for-action');
                        }
                    }
                } catch (error) {
                    logAction(`Avatar tarama hatası (${blogName}): ${error.message}`, 'debug');
                } finally {
                    processedCount++;
                    if(avatarScanProgressBar) updateProgressBar(avatarScanProgressBar, (processedCount / totalToScan) * 100);
                    if(avatarScanProgressText) avatarScanProgressText.textContent = `${processedCount}/${totalToScan}`;
                    await delay(500); // Her işçi her istekten sonra 0.5 saniye bekler
                }
            }
        };

        const workers = [];
        for (let i = 0; i < avatarWorkerCount; i++) {
            workers.push(worker(i + 1));
        }

        await Promise.all(workers);

        logAction(`Avatar tarama tamamlandı. ${deselectedCount} blog varsayılan avatar kullandığı için seçimden kaldırıldı.`, "system_success");
        updateFollowAndLikeButtonState();

        isProcessingStep = false;
        removeDefaultAvatarUsersButton.disabled = (selectedUsersToProcessFromStep2.size === 0);
        if (avatarScanProgressContainer) setTimeout(() => { avatarScanProgressContainer.style.display = 'none'; }, 2000);
    }


    function updateLastActiveFilterDisplay() { 
        if (!lastActiveFilterInput || !lastActiveFilterValueSpan) return;
        const selectedIndex = parseInt(lastActiveFilterInput.value);
        lastActiveFilterValueSpan.textContent = LAST_ACTIVE_SLIDER_VALUES[selectedIndex]?.label || "Limitsiz";
    }
    function updateLikesPerUserDisplay() { 
        if (likesPerUserSliderInput && likesPerUserValueSpan) {
            likesPerUserValueSpan.textContent = likesPerUserSliderInput.value;
        }
    }
    
    if (addPostUrlsButton) addPostUrlsButton.addEventListener('click', handleAddPostUrls);
    if (goToStep2Button) goToStep2Button.addEventListener('click', () => {
        if(step1Container) step1Container.style.display = 'none';
        if(step2Container) step2Container.style.display = 'block';
        if (findSuggestedUsersButton) findSuggestedUsersButton.disabled = (allBlogNamesFromNotes.size === 0); 
        logAction("Adım 2'ye geçildi. Filtreleri ayarlayıp 'Önerilen Blogları Bul ve Filtrele' butonuna tıklayın.", "info");
    });
    if (findSuggestedUsersButton) findSuggestedUsersButton.addEventListener('click', findAndFilterSuggestedUsers);
    if (goToStep3Button) goToStep3Button.addEventListener('click', () => {
        if(step2Container) step2Container.style.display = 'none';
        if(step3Container) step3Container.style.display = 'block';
        updateFollowAndLikeButtonState();
    });
    if (followAndLikeButton) followAndLikeButton.addEventListener('click', followAndLikeSelectedTargets);

    if (removeDefaultAvatarUsersButton) {
        removeDefaultAvatarUsersButton.addEventListener('click', handleRemoveDefaultAvatarUsers);
    }

    if (lastActiveFilterInput) {
        lastActiveFilterInput.addEventListener('input', updateLastActiveFilterDisplay);
    }
    if (likesPerUserSliderInput) {
        likesPerUserSliderInput.addEventListener('input', updateLikesPerUserDisplay);
    }

    fetchAndPopulateUsersForModule();
    resetModuleState(true); 
    updateLastActiveFilterDisplay(); 
    updateLikesPerUserDisplay(); 
    logAction("URL Not Çekici Modülü yüklendi. Lütfen işlem yapılacak hesabı seçin.", "system");
});

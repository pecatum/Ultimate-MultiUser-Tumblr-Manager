// modules/inactive_unfollower_client.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('[InactiveUnfollower] DOM Yüklendi.');

    // --- Element Tanımlamaları ---
    const moduleUserSelector = document.getElementById('moduleUserSelectorUnfollow');
    const noUserSelectedWarning = document.getElementById('noUserSelectedWarningUnfollow');
    const userLimitsContainer = document.getElementById('userLimitsContainerUnfollow');
    const followLimitText = document.getElementById('followLimitTextUnfollow');
    const followLimitRemainingText = document.getElementById('followLimitRemainingTextUnfollow');
    const followLimitProgressBarEl = document.getElementById('followLimitProgressBarUnfollow');
    const followResetText = document.getElementById('followResetTextUnfollow');
    const totalFollowingCountSpan = document.getElementById('totalFollowingCount');
    const selectAllFollowingButton = document.getElementById('selectAllFollowingButton');
    const followingLoadProgressContainer = document.getElementById('followingLoadProgressContainer');
    const followingLoadProgressBar = document.getElementById('followingLoadProgressBar');
    const followingLoadProgressText = document.getElementById('followingLoadProgressText');
    const followingListContainer = document.getElementById('followingListContainer');
    const paginationContainer = document.getElementById('paginationContainer');
    const blogDetailsSection = document.getElementById('blogDetailsSection');
    const selectedBlogInfoContainer = document.getElementById('selectedBlogInfoContainer');
    const closeBlogDetailsButton = document.getElementById('closeBlogDetails');
    const lastActiveDaysFilterInput = document.getElementById('lastActiveDaysFilter');
    const lastActiveDaysValueSpan = document.getElementById('lastActiveDaysValue');
    const scanForDefaultAvatarsButton = document.getElementById('scanForDefaultAvatarsButton');
    const selectAllBlogsForUnfollowButton = document.getElementById('selectAllBlogsForUnfollowButton'); // YENİ BUTON TANIMLAMASI
    const avatarScanProgressContainer = document.getElementById('avatarScanProgressContainer');
    const avatarScanProgressBar = document.getElementById('avatarScanProgressBar');
    const avatarScanProgressText = document.getElementById('avatarScanProgressText');
    const selectedToUnfollowCountSpan = document.getElementById('selectedToUnfollowCount');
    const unfollowSelectedButton = document.getElementById('unfollowSelectedButton');
    const stopUnfollowButton = document.getElementById('stopUnfollowButton');
    const unfollowProgressBarEl = document.getElementById('unfollowProgressBar');
    const unfollowedCountSpan = document.getElementById('unfollowedCount');
    const totalSelectedForUnfollowDisplaySpan = document.getElementById('totalSelectedForUnfollowDisplay');
    const actionLogArea = document.getElementById('actionLogAreaUnfollow');

    // --- Durum Değişkenleri ---
    let selectedAppUsernameForModule = null;
    let allFollowedBlogsData = []; //
    let fetchedBlogNames = new Set();
    let displayedBlogItems = new Map();
    let selectedBlogsToUnfollow = new Set(); 
    
    // API ve Yükleme Değişkenleri
    const blogsPerApiBatch = 20;
    let totalBlogsUserFollows = 0;
    let isLoadingAllFollowingApi = false;
    
    // Sayfalama Değişkenleri
    let currentPage = 1;
    const itemsPerPage = 50; 

    let continueProcessing = true;
    let currentDetailedBlogName = null; 

    // --- Yardımcı Fonksiyonlar ---
    function logAction(message, type = 'info') { //
        if (!actionLogArea) return;
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const logEntry = document.createElement('div');
        const typeColor = type === 'error' ? 'text-red-400' : (type === 'system_success' ? 'text-green-400' : (type === 'warn' ? 'text-yellow-400' : 'text-sky-300'));
        logEntry.innerHTML = `<span class="text-gray-500 mr-2">[${timeString}]</span> <span class="font-bold ${typeColor}">${type.toUpperCase()}:</span> <span class="text-gray-300">${message}</span>`;
        actionLogArea.appendChild(logEntry);
        actionLogArea.scrollTop = actionLogArea.scrollHeight;
        if (type !== 'debug') console.log(`[InactiveUnfollower Log] ${type}: ${message}`);
    }

    function updateProgressBar(barElement, percentage) {
        if (!barElement) return;
        percentage = Math.max(0, Math.min(100, percentage));
        barElement.style.width = `${percentage}%`;
        barElement.textContent = `${Math.round(percentage)}%`;
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
        const result = await response.json();
        if (!response.ok || result.error) {
            const errorMessage = (result.error || result.message || '').toLowerCase();
            const isRateLimitError = response.status === 429 || errorMessage.includes('limit exceeded') || errorMessage.includes('enhance your calm');
            
            const error = new Error(result.error || result.message || `API eylemi '${actionId}' hatası (${response.status})`);
            error.isRateLimitError = isRateLimitError;
            error.isUserError = true;
            throw error;
        }
        return result.data;
    }

    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    
    function displayUserLimits(userApiData) {
        if (!userLimitsContainer || !userApiData || !userApiData.follows) {
            if (userLimitsContainer) userLimitsContainer.style.display = 'none';
            return;
        }
        const knownDailyFollowLimit = 200;
        const followsInfo = userApiData.follows;
        const remainingF = parseInt(followsInfo.remaining, 10);
        const limitF = parseInt(followsInfo.limit, 10) || knownDailyFollowLimit;
        const usedF = limitF > 0 ? limitF - remainingF : 0;
        
        if (followLimitText) followLimitText.textContent = `${usedF} / ${limitF}`;
        if (followLimitRemainingText) followLimitRemainingText.textContent = `${remainingF} kaldı`;
        if (followLimitProgressBarEl) updateProgressBar(followLimitProgressBarEl, limitF > 0 ? (usedF / limitF) * 100 : 0);
        if (followsInfo.reset_at && followResetText) {
            followResetText.textContent = `Sıfırlanma: ~${new Date(followsInfo.reset_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else if (followResetText) { followResetText.textContent = "";}
        userLimitsContainer.style.display = 'block';
    }

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

    function resetModuleState(fullReset = true) {
        if (fullReset) {
            if (userLimitsContainer) userLimitsContainer.style.display = 'none';
        }
        if (blogDetailsSection) blogDetailsSection.style.display = 'none';
        selectedBlogInfoContainer.innerHTML = '<p class="text-slate-500 italic">Detayları görmek için soldaki listeden bir bloga tıklayın.</p>';
        
        allFollowedBlogsData = [];
        fetchedBlogNames.clear(); 
        displayedBlogItems.clear();
        selectedBlogsToUnfollow.clear();
        totalBlogsUserFollows = 0;
        isLoadingAllFollowingApi = false;
        continueProcessing = true;
        currentDetailedBlogName = null;
        currentPage = 1;

        if(paginationContainer) paginationContainer.innerHTML = '';
        if(followingListContainer) followingListContainer.innerHTML = '<p class="text-slate-400 italic p-4 text-center">Takip edilen bloglar burada listelenecek.</p>';
        if(totalFollowingCountSpan) totalFollowingCountSpan.textContent = '0';
        if(followingLoadProgressContainer) followingLoadProgressContainer.style.display = 'none';
        if(followingLoadProgressBar) updateProgressBar(followingLoadProgressBar, 0);
        if(followingLoadProgressText) followingLoadProgressText.textContent = '0/0';
        
        if(selectAllFollowingButton) selectAllFollowingButton.style.display = 'none';
        
        if(lastActiveDaysFilterInput) lastActiveDaysFilterInput.value = 30;
        updateLastActiveFilterDisplay();
        updateSelectedToUnfollowCount();
        if(unfollowSelectedButton) unfollowSelectedButton.disabled = true;
        if(stopUnfollowButton) stopUnfollowButton.style.display = 'none';
        if(unfollowProgressBarEl) updateProgressBar(unfollowProgressBarEl, 0);
        if(unfollowedCountSpan) unfollowedCountSpan.textContent = '0';
        if(totalSelectedForUnfollowDisplaySpan) totalSelectedForUnfollowDisplaySpan.textContent = '0';
        if(avatarScanProgressContainer) avatarScanProgressContainer.style.display = 'none';
        if(scanForDefaultAvatarsButton) scanForDefaultAvatarsButton.disabled = true;
        if(selectAllBlogsForUnfollowButton) selectAllBlogsForUnfollowButton.disabled = true; // YENİ BUTON RESETLEME
    }
    
    async function fetchAllFollowedBlogsData() {
        if (!selectedAppUsernameForModule || isLoadingAllFollowingApi) return;
        isLoadingAllFollowingApi = true;
        allFollowedBlogsData = [];
        fetchedBlogNames.clear();

        if (followingLoadProgressContainer) followingLoadProgressContainer.style.display = 'block';
        if (followingLoadProgressBar) updateProgressBar(followingLoadProgressBar, 0);
        if (followingListContainer.firstChild?.tagName === 'P') followingListContainer.innerHTML = '';
        if (paginationContainer) paginationContainer.innerHTML = '';
        logAction(`Takip edilenler çekiliyor (10 paralel işçi)...`, 'info');

        try {
            const initialData = await executeApiActionForModule('getUserFollowing', { limit: 1, offset: 0 });
            totalBlogsUserFollows = initialData.total_blogs || 0;

            if (totalBlogsUserFollows === 0) {
                logAction("Kullanıcı hiçbir blogu takip etmiyor.", "info");
                isLoadingAllFollowingApi = false;
                if (followingLoadProgressContainer) followingLoadProgressContainer.style.display = 'none';
                return;
            }

            totalFollowingCountSpan.textContent = totalBlogsUserFollows.toLocaleString();
            if (scanForDefaultAvatarsButton) scanForDefaultAvatarsButton.disabled = false;
            if (selectAllBlogsForUnfollowButton) selectAllBlogsForUnfollowButton.disabled = false; // YENİ BUTONU AKTİFLEŞTİR
            if (followingLoadProgressText) followingLoadProgressText.textContent = `0/${totalBlogsUserFollows.toLocaleString()}`;
            
            const fetchWorkerCount = 10;
            const taskQueue = [];
            const blogsPerWorker = Math.ceil(totalBlogsUserFollows / fetchWorkerCount);

            for (let i = 0; i < fetchWorkerCount; i++) {
                const startOffset = i * blogsPerWorker;
                if (startOffset < totalBlogsUserFollows) {
                    taskQueue.push({
                        initialOffset: startOffset,
                        quotaEndOffset: startOffset + blogsPerWorker,
                    });
                }
            }
            
            let pauseState = { paused: false };

            const worker = async (workerId) => {
                let task = taskQueue.shift();
                if (!task) return; 

                let currentOffset = task.initialOffset;

                while (currentOffset !== null && currentOffset < task.quotaEndOffset && continueProcessing) {
                    if (pauseState.paused) {
                        await delay(1000);
                        continue;
                    }

                    logAction(`İşçi #${workerId}, offset ${currentOffset} görevini aldı...`, 'debug');
                    
                    try {
                        const data = await executeApiActionForModule('getUserFollowing', { limit: blogsPerApiBatch, offset: currentOffset });
                        
                        if (data && data.blogs) {
                            const newlyFetchedBlogs = [];
                            data.blogs.forEach(blog => {
                                if (!fetchedBlogNames.has(blog.name)) {
                                    newlyFetchedBlogs.push(blog);
                                    fetchedBlogNames.add(blog.name);
                                }
                            });
                            if (newlyFetchedBlogs.length > 0) {
                                allFollowedBlogsData.push(...newlyFetchedBlogs);
                                if (allFollowedBlogsData.length % 100 < blogsPerApiBatch) {
                                     renderPaginationControls();
                                     renderPage(currentPage);
                                }
                            }
                        }

                        if (data && data._links && data._links.next && data._links.next.query_params && data._links.next.query_params.offset) {
                            currentOffset = parseInt(data._links.next.query_params.offset, 10);
                        } else {
                            currentOffset = null; 
                        }

                    } catch (error) {
                        if (error.isRateLimitError && !pauseState.paused) {
                            pauseState.paused = true;
                            logAction(`API Limiti Aşıldı. Tüm işçiler 100 saniye duraklatılıyor...`, 'warn');
                            setTimeout(() => {
                                logAction('Duraklatma bitti. İşçiler devam ediyor...', 'info');
                                pauseState.paused = false;
                            }, 100000);
                        } else if (!error.isRateLimitError) {
                             logAction(`Görev başarısız (offset ${currentOffset}): ${error.message}. Tekrar denenecek.`, 'error');
                        }
                        await delay(5000); 
                    } finally {
                        updateProgressBar(followingLoadProgressBar, (allFollowedBlogsData.length / totalBlogsUserFollows) * 100);
                        followingLoadProgressText.textContent = `${allFollowedBlogsData.length.toLocaleString()}/${totalBlogsUserFollows.toLocaleString()}`;
                        await delay(1500); 
                    }
                }
            };
            
            const workers = [];
            for (let i = 0; i < fetchWorkerCount; i++) {
                workers.push(worker(i + 1));
            }
            await Promise.all(workers);

            logAction(`Tüm ${allFollowedBlogsData.length} blog verisi çekildi. Son sıralama yapılıyor...`, 'system');
            allFollowedBlogsData.sort((a, b) => (b.updated || 0) - (a.updated || 0));
            logAction('Bloglar son aktiflik tarihine göre sıralandı.', 'system_success');
            
            currentPage = 1;
            renderPaginationControls();
            renderPage(currentPage);

        } catch (error) {
            if (!error.isRateLimitError) {
                logAction(`Takip edilen verileri çekilirken ilk hata: ${error.message}`, 'error');
            }
        } finally {
            isLoadingAllFollowingApi = false;
            if (followingLoadProgressContainer) {
                 setTimeout(() => { followingLoadProgressContainer.style.display = 'none'; }, 1500);
            }
            if (allFollowedBlogsData.length > 0 && selectAllFollowingButton) {
                 selectAllFollowingButton.style.display = 'inline-block';
            }
        }
    }

    async function scanAndSelectDefaultAvatars() {
        if (allFollowedBlogsData.length === 0) {
            logAction("Önce takip edilenler listesi yüklenmeli.", "warn");
            return;
        }

        continueProcessing = true;
        scanForDefaultAvatarsButton.disabled = true;
        stopUnfollowButton.style.display = 'inline-block';
        avatarScanProgressContainer.style.display = 'block';
        updateProgressBar(avatarScanProgressBar, 0);

        logAction("Varsayılan avatar taraması başlatıldı (50 paralel işçi)...", "system");
        
        const taskQueue = [...allFollowedBlogsData];
        const totalToScan = taskQueue.length;
        let processedCount = 0;
        let foundCount = 0;
        
        const avatarWorkerCount = 50; 

        const worker = async (workerId) => {
            while (taskQueue.length > 0) {
                if (!continueProcessing) break;
                
                const blog = taskQueue.shift();
                if (!blog) continue;

                logAction(`İşçi #${workerId}, '${blog.name}' avatarını kontrol ediyor...`, 'debug');

                try {
                    const response = await fetch(`https://api.tumblr.com/v2/blog/${blog.name}/avatar/64`);
                    
                    if (response.url && response.url.includes("assets.tumblr.com/images/default_avatar/")) {
                        foundCount++;
                        logAction(`'${blog.name}' varsayılan avatar kullanıyor. Seçiliyor.`, 'info');
                        handleBlogSelection(blog.name, true);
                    }
                } catch (error) {
                    logAction(`Avatar tarama hatası (${blog.name}): ${error.message}`, 'debug');
                } finally {
                    processedCount++;
                    updateProgressBar(avatarScanProgressBar, (processedCount / totalToScan) * 100);
                    avatarScanProgressText.textContent = `${processedCount}/${totalToScan}`;
                    await delay(1000); 
                }
            }
        };
        
        const workers = [];
        for (let i = 0; i < avatarWorkerCount; i++) {
            workers.push(worker(i + 1));
        }

        await Promise.all(workers);
        
        logAction(`Tarama tamamlandı. ${foundCount} varsayılan avatarlı blog seçildi.`, "system_success");
        scanForDefaultAvatarsButton.disabled = false;
        stopUnfollowButton.style.display = 'none';
        setTimeout(() => { avatarScanProgressContainer.style.display = 'none'; }, 2000);
    }


    function renderPage(pageNumber) {
        currentPage = pageNumber;
        followingListContainer.innerHTML = '';
        displayedBlogItems.clear();

        const startIndex = (pageNumber - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, allFollowedBlogsData.length);
        
        const fragment = document.createDocumentFragment();
        for (let i = startIndex; i < endIndex; i++) {
            const blog = allFollowedBlogsData[i];
            if (blog) {
                const itemElement = createBlogItemElement(blog);
                fragment.appendChild(itemElement);
                displayedBlogItems.set(blog.name, itemElement);
            }
        }
        
        followingListContainer.appendChild(fragment);
        updatePaginationUI();
    }
    
    function renderPaginationControls() {
        if (!paginationContainer) return;
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(allFollowedBlogsData.length / itemsPerPage);
        if (totalPages <= 1) return;

        for (let i = 1; i <= totalPages; i++) {
            const button = document.createElement('button');
            button.textContent = i;
            button.dataset.page = i;
            button.className = 'px-3 py-1 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50 m-1';
            
            button.addEventListener('click', (e) => {
                const page = parseInt(e.target.dataset.page, 10);
                renderPage(page);
            });
            paginationContainer.appendChild(button);
        }
    }
    
    function updatePaginationUI() {
        const paginationButtons = document.querySelectorAll('#paginationContainer button');
        paginationButtons.forEach(button => {
            button.classList.toggle('bg-indigo-600', button.dataset.page == currentPage);
            button.classList.toggle('text-white', button.dataset.page == currentPage);
            button.classList.toggle('bg-white', button.dataset.page != currentPage);
        });
    }

    function createBlogItemElement(blog) {
        const item = document.createElement('div');
        item.className = `followed-blog-item`;
        item.dataset.blogName = blog.name;
        item.dataset.blogUrl = blog.url;
        item.dataset.lastUpdated = blog.updated || 0;

        if (selectedBlogsToUnfollow.has(blog.name)) item.classList.add('selected');
        if (currentDetailedBlogName === blog.name) item.classList.add('detailed-view');

        const lastActiveDate = blog.updated ? new Date(blog.updated * 1000) : null;
        const lastActiveString = lastActiveDate ? lastActiveDate.toLocaleDateString('tr-TR') : 'Bilinmiyor';
        const daysSinceActive = lastActiveDate ? Math.floor((Date.now() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24)) : Infinity;

        item.innerHTML = `
            <input type="checkbox" class="form-checkbox h-5 w-5 text-red-600 rounded mr-3 blog-select-checkbox flex-shrink-0 pointer-events-none" 
                   data-blog-name="${blog.name}" 
                   ${selectedBlogsToUnfollow.has(blog.name) ? 'checked' : ''}>
            <img src="https://api.tumblr.com/v2/blog/${blog.name}/avatar/40" alt="${blog.name} avatar" class="blog-avatar flex-shrink-0" onerror="this.src='https://assets.tumblr.com/images/default_avatar/cone_closed_64.png'">
            <div class="ml-2 overflow-hidden flex-grow">
                <p class="text-sm font-semibold text-slate-800 truncate" title="${blog.title || blog.name}">${blog.title || blog.name}</p>
                <p class="text-xs text-indigo-500 truncate">${blog.name}</p>
                <p class="text-xs text-gray-500 mt-0.5">Son Aktif: ${lastActiveString} (${daysSinceActive === Infinity ? 'N/A' : daysSinceActive + ' gün önce'})</p>
            </div>
        `;
        return item;
    }

    if (followingListContainer) {
        followingListContainer.addEventListener('click', (event) => {
            const targetItem = event.target.closest('.followed-blog-item');
            if (!targetItem) return;
            const blogName = targetItem.dataset.blogName;
            
            const isCurrentlySelected = selectedBlogsToUnfollow.has(blogName);
            handleBlogSelection(blogName, !isCurrentlySelected);
            
            displayBlogDetailsInMainArea(blogName);
            
            if (currentDetailedBlogName && currentDetailedBlogName !== blogName) {
                const prevDetailedItem = displayedBlogItems.get(currentDetailedBlogName);
                if (prevDetailedItem) prevDetailedItem.classList.remove('detailed-view');
            }
            targetItem.classList.add('detailed-view');
            currentDetailedBlogName = blogName;
        });
    }
    
    function handleBlogSelection(blogName, isSelected) { //
        if (isSelected) {
            selectedBlogsToUnfollow.add(blogName);
        } else {
            selectedBlogsToUnfollow.delete(blogName);
        }
        
        const itemElement = displayedBlogItems.get(blogName);
        if (itemElement) {
            itemElement.classList.toggle('selected', isSelected);
            const checkbox = itemElement.querySelector('.blog-select-checkbox');
            if (checkbox) checkbox.checked = isSelected;
        }
        updateSelectedToUnfollowCount();
    }

    function updateSelectedToUnfollowCount() { //
        const count = selectedBlogsToUnfollow.size;
        if (selectedToUnfollowCountSpan) selectedToUnfollowCountSpan.textContent = count;
        if (unfollowSelectedButton) unfollowSelectedButton.disabled = count === 0;
        if (totalSelectedForUnfollowDisplaySpan) totalSelectedForUnfollowDisplaySpan.textContent = count;
    }
    
    function updateLastActiveFilterDisplay() {
        if (lastActiveDaysFilterInput && lastActiveDaysValueSpan) {
            lastActiveDaysValueSpan.textContent = `${lastActiveDaysFilterInput.value} gün`;
        }
    }

    function applyLastActiveFilter() { //
        const daysThreshold = parseInt(lastActiveDaysFilterInput.value);
        const now = Date.now();
        selectedBlogsToUnfollow.clear();

        allFollowedBlogsData.forEach(blog => {
            const lastUpdatedTimestamp = (blog.updated || 0) * 1000;
            let shouldBeSelected = false;

            if (lastUpdatedTimestamp > 0) {
                const daysInactive = Math.floor((now - lastUpdatedTimestamp) / (1000 * 60 * 60 * 24));
                if (daysInactive >= daysThreshold) {
                    shouldBeSelected = true;
                }
            } else { 
                shouldBeSelected = true;
            }
            
            if(shouldBeSelected) {
                selectedBlogsToUnfollow.add(blog.name);
            }
        });

        displayedBlogItems.forEach((element, blogName) => {
            const isSelected = selectedBlogsToUnfollow.has(blogName);
            element.classList.toggle('selected', isSelected);
            const checkbox = element.querySelector('.blog-select-checkbox');
            if (checkbox) checkbox.checked = isSelected;
        });

        updateSelectedToUnfollowCount();
    }
    
    async function displayBlogDetailsInMainArea(blogName) {
        if (!blogName) return;
        currentDetailedBlogName = blogName;
        blogDetailsSection.style.display = 'block';
        selectedBlogInfoContainer.innerHTML = '<p class="text-slate-500 italic animate-pulse">Blog detayları yükleniyor...</p>';
        logAction(`'${blogName}' için detaylar çekiliyor...`, 'info');

        try {
            const data = await executeApiActionForModule('fetchExternalBlogInfoApi', { blog_identifier: blogName }, false);
            if (data && data.info && data.info.blog) {
                const blog = data.info.blog;
                let detailsHtml = `
                    <div class="flex items-center mb-4">
                        <img src="https://api.tumblr.com/v2/blog/${blog.name}/avatar/64" alt="${blog.name}" class="w-16 h-16 rounded-full mr-4 border-2 border-indigo-300">
                        <div>
                            <h3 class="text-xl font-bold text-indigo-700">${blog.title || blog.name}</h3>
                            <a href="${blog.url}" target="_blank" class="text-sm text-sky-600 hover:underline">${blog.url}</a>
                        </div>
                    </div>
                    <div class="prose prose-sm max-w-none text-slate-700">${blog.description || '<p><em>Açıklama yok.</em></p>'}</div>
                    <hr class="my-3">
                    <p><span class="info-label">Toplam Gönderi:</span><span class="info-value">${(blog.posts || 0).toLocaleString()}</span></p>
                    <p><span class="info-label">Son Güncelleme:</span><span class="info-value">${blog.updated ? new Date(blog.updated * 1000).toLocaleString('tr-TR') : 'Bilinmiyor'}</span></p>
                    <p><span class="info-label">NSFW:</span><span class="info-value">${blog.is_nsfw ? 'Evet' : 'Hayır'}</span></p>
                    <p><span class="info-label">Soru Sorulabilir:</span><span class="info-value">${blog.ask ? 'Evet' : 'Hayır'}</span>`;
                if(blog.ask) {
                    detailsHtml += `<span class="info-value text-xs ml-2">(Anonim: ${blog.ask_anon ? 'Evet' : 'Hayır'})</span>`;
                }
                 detailsHtml += `</p>`;
                selectedBlogInfoContainer.innerHTML = detailsHtml;
            } else {
                selectedBlogInfoContainer.innerHTML = '<p class="text-red-500">Blog detayları alınamadı.</p>';
            }
        } catch (error) {
            logAction(`Blog detayı çekme hatası (${blogName}): ${error.message}`, 'error');
            selectedBlogInfoContainer.innerHTML = `<p class="text-red-500">Blog detayları çekilirken hata oluştu: ${error.message}</p>`;
        }
    }
    
    async function processUnfollowQueue() {
        if (selectedBlogsToUnfollow.size === 0) {
            logAction("Takipten çıkarılacak blog seçilmedi.", "warn");
            return;
        }
        continueProcessing = true;
        unfollowSelectedButton.disabled = true;
        stopUnfollowButton.style.display = 'inline-block';
        logAction(`${selectedBlogsToUnfollow.size} blog takipten çıkarılmak üzere sıraya alındı (10 paralel işçi)...`, "system");
        
        const taskQueue = Array.from(selectedBlogsToUnfollow);
        const totalToProcess = taskQueue.length;
        if(totalSelectedForUnfollowDisplaySpan) totalSelectedForUnfollowDisplaySpan.textContent = totalToProcess;
        
        let succeededCount = 0;
        let failedCount = 0;
        let processedCount = 0;
        let pauseState = { paused: false };

        const worker = async (workerId) => {
            while (taskQueue.length > 0) {
                if (!continueProcessing) break;

                if (pauseState.paused) {
                    await delay(2000);
                    continue;
                }

                const blogNameToUnfollow = taskQueue.shift();
                if (!blogNameToUnfollow) continue;
                
                logAction(`İşçi #${workerId}, '${blogNameToUnfollow}' blogunu takipten çıkarıyor...`, 'debug');

                try {
                    const blogData = allFollowedBlogsData.find(b => b.name === blogNameToUnfollow) || { url: `https://${blogNameToUnfollow}.tumblr.com`, name: blogNameToUnfollow };
                    await executeApiActionForModule('unfollowTumblrBlog', { urlString: blogData.url });
                    
                    succeededCount++;
                    logAction(`'${blogNameToUnfollow}' başarıyla takipten çıkarıldı.`, "success");
                        
                    const itemElement = displayedBlogItems.get(blogNameToUnfollow);
                    if(itemElement) itemElement.remove();
                    
                    allFollowedBlogsData = allFollowedBlogsData.filter(b => b.name !== blogNameToUnfollow);
                    displayedBlogItems.delete(blogNameToUnfollow);
                    selectedBlogsToUnfollow.delete(blogNameToUnfollow);

                } catch (error) {
                    if (error.isRateLimitError && !pauseState.paused) {
                        pauseState.paused = true;
                        logAction(`API Limiti Aşıldı. Takipten çıkarma 100 saniye duraklatılıyor...`, 'warn');
                        taskQueue.unshift(blogNameToUnfollow); 
                        setTimeout(() => {
                            logAction('Duraklatma bitti. İşçiler devam ediyor...', 'info');
                            pauseState.paused = false;
                        }, 100000);
                    } else if (!error.isRateLimitError) {
                        failedCount++;
                        logAction(`'${blogNameToUnfollow}' takipten çıkarılırken hata: ${error.message}`, "error");
                    } else if (error.isRateLimitError && pauseState.paused) {
                        taskQueue.unshift(blogNameToUnfollow);
                    }
                } finally {
                    processedCount = succeededCount + failedCount;
                    if(unfollowedCountSpan) unfollowedCountSpan.textContent = succeededCount;
                    if (unfollowProgressBarEl) updateProgressBar(unfollowProgressBarEl, (processedCount / totalToProcess) * 100);
                    await delay(1000); 
                }
            }
        };
        
        const unfollowWorkerCount = 10;
        const workers = [];
        for (let i = 0; i < unfollowWorkerCount; i++) {
            workers.push(worker(i + 1));
        }
        await Promise.all(workers);

        logAction(`İşlem tamamlandı. ${succeededCount} blog takipten çıkarıldı, ${failedCount} işlem başarısız oldu.`, "system_success");
        updateSelectedToUnfollowCount(); 
        if(unfollowSelectedButton) unfollowSelectedButton.disabled = selectedBlogsToUnfollow.size === 0;
        if(stopUnfollowButton) stopUnfollowButton.style.display = 'none';
        renderPaginationControls();
        renderPage(currentPage);
    }
    
    // --- Event Listener'lar ---
    moduleUserSelector.addEventListener('change', async function() {
        selectedAppUsernameForModule = this.value;
        resetModuleState(false); 
        if (selectedAppUsernameForModule) {
            noUserSelectedWarning.style.display = 'none';
            logAction(`Hesap seçildi: ${selectedAppUsernameForModule}. Veriler yükleniyor...`, "system");
            if(userLimitsContainer) userLimitsContainer.style.display = 'block'; 
            try {
                const limitsData = await executeApiActionForModule('getUserLimits', {});
                if (limitsData) displayUserLimits(limitsData);
            } catch (error) {
                logAction(`Kullanıcı limitleri çekilemedi: ${error.message}`, "error");
                 if (userLimitsContainer) userLimitsContainer.style.display = 'none';
            }
            fetchAllFollowedBlogsData(); 
        } else {
            noUserSelectedWarning.style.display = 'block';
            resetModuleState(true); 
        }
    });

    if (lastActiveDaysFilterInput) {
        lastActiveDaysFilterInput.addEventListener('input', () => {
            updateLastActiveFilterDisplay();
            applyLastActiveFilter();
        });
    }

    if(scanForDefaultAvatarsButton) scanForDefaultAvatarsButton.addEventListener('click', scanAndSelectDefaultAvatars);

    // YENİ BUTON İÇİN EVENT LISTENER
    if (selectAllBlogsForUnfollowButton) {
        selectAllBlogsForUnfollowButton.addEventListener('click', () => {
            if (allFollowedBlogsData.length === 0) {
                logAction("Tümünü seçmek için önce blog listesinin yüklenmesi gerekir.", "warn");
                return;
            }

            logAction(`Takip edilen ${allFollowedBlogsData.length} blog'un tümü seçiliyor...`, 'info');
            
            // Tüm blogları seçili hale getir
            allFollowedBlogsData.forEach(blog => {
                selectedBlogsToUnfollow.add(blog.name);
            });

            // Görünen listedeki elemanların stillerini güncelle
            displayedBlogItems.forEach((element, blogName) => {
                element.classList.add('selected');
                const checkbox = element.querySelector('.blog-select-checkbox');
                if (checkbox) checkbox.checked = true;
            });

            // Seçilen sayısını güncelle
            updateSelectedToUnfollowCount();
            logAction(`Tüm bloglar takipten çıkmak için seçildi.`, 'system_success');
        });
    }

    if (selectAllFollowingButton) {
        selectAllFollowingButton.addEventListener('click', () => {
            const allBlogNamesOnScreen = Array.from(displayedBlogItems.keys());
            if (allBlogNamesOnScreen.length === 0) return;
            const allVisibleSelected = allBlogNamesOnScreen.every(name => selectedBlogsToUnfollow.has(name));
            
            allBlogNamesOnScreen.forEach(blogName => {
                handleBlogSelection(blogName, !allVisibleSelected);
            });
        });
    }

    if (closeBlogDetailsButton) {
        closeBlogDetailsButton.addEventListener('click', () => {
            if (blogDetailsSection) blogDetailsSection.style.display = 'none';
            if (currentDetailedBlogName) {
                const prevDetailedItem = displayedBlogItems.get(currentDetailedBlogName);
                if (prevDetailedItem) prevDetailedItem.classList.remove('detailed-view');
                currentDetailedBlogName = null;
            }
        });
    }
    
    if (unfollowSelectedButton) unfollowSelectedButton.addEventListener('click', processUnfollowQueue);

    if (stopUnfollowButton) stopUnfollowButton.addEventListener('click', () => {
        continueProcessing = false;
        logAction("İşlem durduruluyor...", "warn");
    });
    
    // --- Başlangıç ---
    fetchAndPopulateUsersForModule();
    resetModuleState(true);
    updateLastActiveFilterDisplay(); 
    logAction("İnaktif Blog Takipten Çıkarıcı modülü yüklendi. Lütfen bir hesap seçin.", "system");
});
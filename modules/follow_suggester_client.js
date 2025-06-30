// modules/follow_suggester_client.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('[FollowSuggester] DOM Yüklendi.');

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
    const step1Container = document.getElementById('step1Container');
    const fetchDashboardButton = document.getElementById('fetchDashboardButton');
    const stopFetchDashboardButton = document.getElementById('stopFetchDashboardButton');
    const totalFetchedPostsCountSpan = document.getElementById('totalFetchedPostsCount');
    const selectAllStep1PostsButton = document.getElementById('selectAllStep1PostsButton');
    const step1ProgressBar = document.getElementById('step1ProgressBar');
    const dashboardPostsContainer = document.getElementById('dashboardPostsContainer');
    const goToStep2Button = document.getElementById('goToStep2Button');
    const step2Container = document.getElementById('step2Container');
    const step2ProgressBar = document.getElementById('step2ProgressBar');
    const lastActiveFilterInput = document.getElementById('lastActiveFilter');
    const lastActiveFilterValueSpan = document.getElementById('lastActiveFilterValue');
    const findSuggestedUsersButton = document.getElementById('findSuggestedUsersButton');
    const selectAllStep2UsersButton = document.getElementById('selectAllStep2UsersButton');
    const suggestedUsersList = document.getElementById('suggestedUsersList');
    const goToStep3Button = document.getElementById('goToStep3Button');
    const selectedUserDetailsPanel = document.getElementById('selectedUserDetailsPanel');
    const selectedUserAvatar = document.getElementById('selectedUserAvatar');
    const selectedUserName = document.getElementById('selectedUserName');
    const selectedUserUrl = document.getElementById('selectedUserUrl');
    const selectedUserLastActive = document.getElementById('selectedUserLastActive');
    const selectedUserPostCount = document.getElementById('selectedUserPostCount');
    const selectedUserDescription = document.getElementById('selectedUserDescription');
    const step3Container = document.getElementById('step3Container');
    const step3ProgressBar = document.getElementById('step3ProgressBar');
    const likesPerUserSliderInput = document.getElementById('likesPerUserSlider');
    const likesPerUserValueSpan = document.getElementById('likesPerUserValue');
    const followAndLikeButton = document.getElementById('followAndLikeButton');
    const followedCountSpan = document.getElementById('followedCount');
    const likedPostsCountStep3Span = document.getElementById('likedPostsCountStep3');
    const actionLogArea = document.getElementById('actionLogArea');
    const filterDefaultAvatarsButton = document.getElementById('filterDefaultAvatarsButton');
    const selectTurkishPostsButton = document.getElementById('selectTurkishPostsButton');


    // --- Durum Değişkenleri ---
    let selectedAppUsernameForModule = null;
    let allFetchedDashboardPosts = new Map();
    let selectedDashboardPostsData = [];
    let potentialFollowTargets = new Map();
    let selectedUsersToProcessFromStep2 = new Set();
    let isProcessingStep = false;
    let currentDetailedUser = null;
    let continueFetchingDashboard = false;

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
        logEntry.innerHTML = `<span class="log-time">[${timeString}]</span> <span class="log-type log-${type.toLowerCase().replace(/\s+/g, '_')}">${type.toUpperCase()}:</span> ${message}`;
        actionLogArea.appendChild(logEntry);
        actionLogArea.scrollTop = actionLogArea.scrollHeight;
        if (type !== 'debug') console.log(`[FollowSuggester Log] ${type}: ${message}`);
    }

    function updateProgressBar(barElement, percentage) {
        if (!barElement) return;
        percentage = Math.max(0, Math.min(100, percentage));
        barElement.style.width = `${percentage}%`;
    }
    
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    function checkImage(url) {
        return new Promise((resolve) => {
            if (!url || typeof url !== 'string') {
                resolve(false);
                return;
            }
            const img = new Image();
            const timeout = setTimeout(() => {
                img.src = ''; 
                resolve(false);
            }, 3000); 

            img.onload = () => {
                clearTimeout(timeout);
                resolve(true);
            };
            img.onerror = () => {
                clearTimeout(timeout);
                resolve(false);
            };
            img.src = url;
        });
    }

    async function getCheckedAvatarUrl(avatarUrl, blogName = 'X') {
        const isValid = await checkImage(avatarUrl);
        if (isValid) {
            return avatarUrl;
        }
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(blogName.charAt(0))}&background=random&size=96`;
    }

    async function processQueueInParallel(items, asyncFn, concurrency = 5, onProgress = () => {}) {
        const queue = [...items];
        const results = [];
        let processedCount = 0;
        const totalCount = items.length;

        const runWorker = async () => {
            while (queue.length > 0) {
                const item = queue.shift();
                if (item) {
                    try {
                        const result = await asyncFn(item);
                        results.push({ status: 'fulfilled', value: result });
                    } catch (error) {
                        results.push({ status: 'rejected', reason: error });
                    } finally {
                        processedCount++;
                        const progressPercentage = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;
                        onProgress(progressPercentage);
                    }
                }
            }
        };

        const workers = Array(concurrency).fill(null).map(() => runWorker());
        await Promise.all(workers);
        return results;
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
            const errorType = response.status === 401 ? "auth" : "api";
            throw { message: result.error || result.message || `API eylemi '${actionId}' hatası (${response.status})`, isUserError: true, type: errorType, details: result.details };
        }
        return result.data;
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
    
    if (moduleUserSelector) {
        moduleUserSelector.addEventListener('change', async function() {
            selectedAppUsernameForModule = this.value;
            if (userLimitsContainer) userLimitsContainer.style.display = 'none';
            resetModuleState(selectedAppUsernameForModule ? false : true);

            if (selectedAppUsernameForModule) {
                noUserSelectedWarning.style.display = 'none';
                if(fetchDashboardButton) fetchDashboardButton.disabled = false;
                logAction(`Hesap seçildi: ${selectedAppUsernameForModule}. Limitler yükleniyor...`, "system");
                if(step1Container) step1Container.style.display = 'block';

                try {
                    const limitsData = await executeApiActionForModule('getUserLimits', {});
                    if (limitsData) displayUserLimits(limitsData);
                } catch (error) {
                    logAction(`Kullanıcı limitleri çekilemedi: ${error.message}`, "error");
                }
            } else {
                noUserSelectedWarning.style.display = 'block';
                if(fetchDashboardButton) fetchDashboardButton.disabled = true;
            }
        });
    }
    
    function resetModuleState(fullReset = true) {
        if (fullReset && userLimitsContainer) userLimitsContainer.style.display = 'none';
        
        allFetchedDashboardPosts.clear(); selectedDashboardPostsData = [];
        if(dashboardPostsContainer) dashboardPostsContainer.innerHTML = '<p class="text-slate-400 italic p-4 text-center w-full">Gönderiler burada listelenecek.</p>';
        if(totalFetchedPostsCountSpan) totalFetchedPostsCountSpan.textContent = "Toplam Çekilen Gönderi: 0";
        if(step1ProgressBar) updateProgressBar(step1ProgressBar, 0);
        if(goToStep2Button) goToStep2Button.style.display = 'none';
        if(selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'none';
        if(selectTurkishPostsButton) selectTurkishPostsButton.style.display = 'none';
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

        isProcessingStep = false;
        continueFetchingDashboard = false;
        if(stopFetchDashboardButton) stopFetchDashboardButton.style.display = 'none';
        if (fetchDashboardButton) {
            fetchDashboardButton.disabled = !selectedAppUsernameForModule;
            fetchDashboardButton.style.display = 'inline-flex';
        }
        if (findSuggestedUsersButton) findSuggestedUsersButton.disabled = true;
        if (followAndLikeButton) followAndLikeButton.disabled = true;
        if (filterDefaultAvatarsButton) filterDefaultAvatarsButton.disabled = true;
    }

    // --- Adım 1 Fonksiyonları ---
    async function fetchDashboardPostsForSelection() {
        if (isProcessingStep && continueFetchingDashboard) { logAction("Zaten bir gönderi çekme işlemi devam ediyor.", "warn"); return; }
        isProcessingStep = true;
        continueFetchingDashboard = true;
        logAction("Adım 1: Panel gönderileri çekiliyor...", "info");
        if(fetchDashboardButton) fetchDashboardButton.style.display = 'none';
        if(stopFetchDashboardButton) stopFetchDashboardButton.style.display = 'inline-flex';
        if(selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'none';
        if(selectTurkishPostsButton) selectTurkishPostsButton.style.display = 'none';
        if(goToStep2Button) goToStep2Button.style.display = 'none';
        if(dashboardPostsContainer.children.length === 0 || dashboardPostsContainer.firstChild.tagName === 'P') {
            dashboardPostsContainer.innerHTML = '<p class="text-slate-400 italic text-center py-4 w-full">Gönderiler yükleniyor...</p>';
        }
        if(step1ProgressBar) updateProgressBar(step1ProgressBar, 0);

        const postsPerBatch = 20;
        let lastFetchedId = null; 
        let postsFetchedInThisRun = 0;
        let initialPostCount = allFetchedDashboardPosts.size;

        if (allFetchedDashboardPosts.size > 0) {
            const postArray = Array.from(allFetchedDashboardPosts.values());
            let oldestPostLastRun = null;
            if (postArray.length > 0) {
                oldestPostLastRun = postArray.reduce((oldest, current) => (current.id_string < oldest.id_string ? current : oldest), postArray[0]);
                lastFetchedId = oldestPostLastRun.id_string;
            }
        }

        while (continueFetchingDashboard) {
            logAction(`Panel gönderi grubu çekiliyor... (since_id: ${lastFetchedId || 'yok'})`, "info");
            try {
                const params = { limit: postsPerBatch, notes_info: true, reblog_info: true, npf: true };
                if (lastFetchedId) {
                     params.since_id = lastFetchedId;
                }

                const data = await executeApiActionForModule('getDashboardPosts', params);

                if (data && data.posts && data.posts.length > 0) {
                    let newPostsAddedCount = 0;
                    data.posts.forEach(post => {
                        if (!allFetchedDashboardPosts.has(post.id_string)) {
                            allFetchedDashboardPosts.set(post.id_string, post);
                            newPostsAddedCount++;
                        }
                    });
                    
                    if (newPostsAddedCount === 0 && data.posts.length > 0) {
                        logAction("Bu gruptaki tüm gönderiler daha önce çekilmiş.", "info");
                    }

                    if (data.posts.length > 0) {
                        lastFetchedId = data.posts[data.posts.length - 1].id_string;
                    } else {
                         logAction("Panelin sonuna ulaşıldı (bu grupta yeni gönderi yok).", "info");
                         continueFetchingDashboard = false;
                         break;
                    }
                    postsFetchedInThisRun += newPostsAddedCount;
                    if (totalFetchedPostsCountSpan) totalFetchedPostsCountSpan.textContent = `Toplam Çekilen Gönderi: ${allFetchedDashboardPosts.size}`;
                    renderDashboardPosts(Array.from(allFetchedDashboardPosts.values()));
                } else {
                    logAction(`Bu grupta yeni gönderi bulunamadı. Çekilen: ${allFetchedDashboardPosts.size}`, "info");
                    continueFetchingDashboard = false;
                    break; 
                }
            } catch (error) {
                logAction(`Panel gönderileri çekilirken hata: ${error.message}`, "error");
                if (error.isUserError && error.type === "auth") { /* no-op */ }
                continueFetchingDashboard = false;
                break; 
            }
            if (continueFetchingDashboard) await delay(500);
        }
        
        if (allFetchedDashboardPosts.size > initialPostCount) {
             logAction(`Adım 1 tamamlandı. Bu çalıştırmada ${postsFetchedInThisRun} yeni panel gönderisi çekildi. Toplam: ${allFetchedDashboardPosts.size}. Lütfen işlemek istediklerinizi seçin.`, "system_success");
        } else if (!continueFetchingDashboard && postsFetchedInThisRun === 0) {
            logAction("Adım 1: Yeni gönderi bulunamadı veya işlem durduruldu.", "info");
        }

        isProcessingStep = false;
        if (fetchDashboardButton) fetchDashboardButton.style.display = 'inline-flex';
        if (stopFetchDashboardButton) stopFetchDashboardButton.style.display = 'none';
        if (allFetchedDashboardPosts.size > 0) {
            if (selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'inline-block';
            if (selectTurkishPostsButton) selectTurkishPostsButton.style.display = 'inline-block';
        }
        updateStep2ButtonVisibility();
    }

    if(stopFetchDashboardButton) {
        stopFetchDashboardButton.addEventListener('click', () => {
            continueFetchingDashboard = false;
            logAction("Gönderi çekme işlemi kullanıcı tarafından durduruldu.", "warn");
            if (fetchDashboardButton) fetchDashboardButton.style.display = 'inline-flex';
            if (stopFetchDashboardButton) stopFetchDashboardButton.style.display = 'none';
            isProcessingStep = false;
        });
    }

    function renderDashboardPosts(posts) {
        if(!dashboardPostsContainer) return;
        const previouslyCheckedPostIds = new Set();
        dashboardPostsContainer.querySelectorAll('.dashboard-post-select:checked').forEach(cb => {
            const parentItem = cb.closest('.dashboard-post-item');
            if (parentItem && parentItem.dataset.postId) {
                previouslyCheckedPostIds.add(parentItem.dataset.postId);
            }
        });

        dashboardPostsContainer.innerHTML = '';
        
        if (!posts || posts.length === 0) {
            dashboardPostsContainer.innerHTML = '<p class="text-slate-400 italic text-center py-4 w-full">Panelde gösterilecek gönderi bulunamadı.</p>';
            if(goToStep2Button) goToStep2Button.style.display = 'none';
            if(selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'none';
            if(selectTurkishPostsButton) selectTurkishPostsButton.style.display = 'none';
            return;
        }

        posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        posts.forEach((post, index) => {
            const item = document.createElement('div');
            item.className = 'dashboard-post-item';
            item.dataset.postId = post.id_string;
            item.dataset.postIndex = index;

            let imageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.blog_name || 'T')}&background=random&size=150`;
            let postSummaryHtml = '';

            if (post.content && Array.isArray(post.content) && post.content.length > 0) {
                post.content.forEach(block => {
                    if (block.type === 'text') {
                        let textClass = "mb-1";
                        if (block.subtype === 'heading1') textClass += ' text-md font-semibold';
                        postSummaryHtml += `<p class="${textClass}">${block.text.replace(/\n/g, "<br>")}</p>`;
                    } else if (block.type === 'image' && block.media && block.media.length > 0) {
                        const bestImage = block.media.sort((a, b) => b.width - a.width)[0];
                        if (imageUrl.startsWith('https://ui-avatars.com')) imageUrl = bestImage.url;
                    }
                });
            } else {
                if (post.type === 'photo' && post.photos && post.photos.length > 0) {
                    imageUrl = post.photos[0].alt_sizes?.find(s => s.width >= 250)?.url || post.photos[0].original_size?.url || imageUrl;
                    postSummaryHtml = post.caption ? post.caption.replace(/\n/g, "<br>") : '';
                } else if (post.type === 'text' || post.type === 'quote') {
                    postSummaryHtml = post.body || post.text || '';
                }
            }
            if (imageUrl.startsWith('https://ui-avatars.com') && post.trail && post.trail.length > 0 && post.trail[0].blog && post.trail[0].blog.avatar_url_128) {
                imageUrl = post.trail[0].blog.avatar_url_128;
            }

            const hasImage = !imageUrl.startsWith('https://ui-avatars.com');
            let titleHtml = post.title ? `<h3 class="text-md font-semibold mb-2">${post.title}</h3>` : '';

            item.innerHTML = `
                <div class="post-checkbox-container">
                    <input type="checkbox" class="form-checkbox h-5 w-5 text-indigo-600 rounded dashboard-post-select" data-post-id="${post.id_string}" ${previouslyCheckedPostIds.has(post.id_string) ? 'checked' : ''}>
                </div>
                <div class="post-thumbnail-container">
                    ${hasImage ? `<img src="${imageUrl}" alt="Gönderi Görseli" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'post-thumbnail-placeholder\\'>${post.type}</div>';">` : `<div class="post-thumbnail-placeholder">${post.type}</div>`}
                </div>
                <div class="post-summary-text custom-scroll">
                    ${titleHtml}
                    ${postSummaryHtml || '<p class="italic text-sm">İçerik özeti yok.</p>'}
                </div>
                <div class="post-blog-info">
                    <span>Blog: <strong>${post.blog_name || 'Bilinmeyen'}</strong></span>
                    <span class="text-gray-300">|</span>
                    <span>Not Sayısı: <strong>${post.note_count || 0}</strong></span>
                    <span class="text-gray-300">|</span>
                    <span>Gönderi Türü: <strong>${post.type}</strong></span>
                </div>
            `;

            const checkbox = item.querySelector('.dashboard-post-select');
            checkbox.addEventListener('change', () => {
                const currentPostData = allFetchedDashboardPosts.get(item.dataset.postId);
                if (!currentPostData) return;

                if (checkbox.checked) {
                    item.classList.add('selected');
                    if (!selectedDashboardPostsData.some(p => p.id_string === currentPostData.id_string)) {
                        selectedDashboardPostsData.push(currentPostData);
                    }
                } else {
                    item.classList.remove('selected');
                    selectedDashboardPostsData = selectedDashboardPostsData.filter(p => p.id_string !== currentPostData.id_string);
                }
                updateStep2ButtonVisibility();
            });
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox' && !e.target.closest('a')) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
            dashboardPostsContainer.appendChild(item);
        });
        
        selectedDashboardPostsData = [];
        dashboardPostsContainer.querySelectorAll('.dashboard-post-select:checked').forEach(cb => {
            const parentItem = cb.closest('.dashboard-post-item');
            if (parentItem && parentItem.dataset.postId) {
                const postToAdd = allFetchedDashboardPosts.get(parentItem.dataset.postId);
                if (postToAdd && !selectedDashboardPostsData.some(p => p.id_string === postToAdd.id_string)) {
                     selectedDashboardPostsData.push(postToAdd);
                }
            }
        });

        updateStep2ButtonVisibility();
        if (posts.length > 0) {
            if (selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'inline-block';
            if (selectTurkishPostsButton) selectTurkishPostsButton.style.display = 'inline-block';
        }
    }

    function updateStep2ButtonVisibility() {
        if(!goToStep2Button) return;
        if (selectedDashboardPostsData.length > 0) {
            goToStep2Button.style.display = 'block';
            goToStep2Button.textContent = `Adım 2: ${selectedDashboardPostsData.length} Gönderinin Notlarını İşle →`;
        } else {
            goToStep2Button.style.display = 'none';
        }
    }
    
    if(selectAllStep1PostsButton) {
        selectAllStep1PostsButton.addEventListener('click', () => {
            const checkboxes = dashboardPostsContainer.querySelectorAll('.dashboard-post-select');
            if (checkboxes.length === 0) return;
            const allCurrentlySelected = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => {
                cb.checked = !allCurrentlySelected;
                cb.dispatchEvent(new Event('change'));
            });
        });
    }

    // --- YENİ: Adım 1 Türkçe Gönderi Seçme Fonksiyonu (GÜNCELLENDİ) ---
    function extractTextFromPost(post) {
        let combinedText = [];
        if (post.title) combinedText.push(post.title);
        if (post.tags && Array.isArray(post.tags)) combinedText.push(post.tags.join(' '));
        if (post.caption) combinedText.push(post.caption);
        if (post.body) combinedText.push(post.body);
        if (post.content && Array.isArray(post.content)) {
            post.content.forEach(block => {
                if (block.type === 'text' && block.text) {
                    combinedText.push(block.text);
                }
            });
        }
        // HTML etiketlerini temizle
        return combinedText.join(' ').replace(/<[^>]*>?/gm, '');
    }

    async function selectTurkishPosts() {
        // Hata düzeltmesi: franc fonksiyonunun varlığını kontrol et
        if (typeof window.franc !== 'function') {
            logAction("Dil tespit kütüphanesi (franc) bulunamadı. Lütfen internet bağlantınızı kontrol edin veya sayfayı yenileyin.", "error");
            return;
        }

        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor.", "warn"); return; }
        if (allFetchedDashboardPosts.size === 0) { logAction("Önce gönderileri çekin.", "warn"); return; }
        
        isProcessingStep = true;
        logAction("Dil analizi başlıyor. Sadece Türkçe gönderiler seçilecek...", "system");
        if(selectTurkishPostsButton) selectTurkishPostsButton.disabled = true;
        if(selectAllStep1PostsButton) selectAllStep1PostsButton.disabled = true;
        if(step1ProgressBar) updateProgressBar(step1ProgressBar, 0);

        // Önce tüm seçimleri temizle
        dashboardPostsContainer.querySelectorAll('.dashboard-post-select:checked').forEach(cb => {
            cb.checked = false;
            cb.dispatchEvent(new Event('change'));
        });
        await delay(100); // UI'ın güncellenmesi için kısa bir bekleme

        const allPosts = Array.from(allFetchedDashboardPosts.values());
        let processedCount = 0;
        let turkishPostCount = 0;

        for (const post of allPosts) {
            const textToAnalyze = extractTextFromPost(post);
            if (textToAnalyze.trim().length > 20) { // Analiz için minimum metin uzunluğu
                // Hata düzeltmesi: Fonksiyonu window nesnesi üzerinden çağır
                const detectedLang = window.franc(textToAnalyze);
                if (detectedLang === 'tur') {
                    const checkbox = dashboardPostsContainer.querySelector(`.dashboard-post-select[data-post-id="${post.id_string}"]`);
                    if (checkbox && !checkbox.checked) {
                        checkbox.checked = true;
                        checkbox.dispatchEvent(new Event('change'));
                        turkishPostCount++;
                    }
                }
            }
            processedCount++;
            if(step1ProgressBar) updateProgressBar(step1ProgressBar, (processedCount / allPosts.length) * 100);
        }

        logAction(`Dil analizi tamamlandı. ${turkishPostCount} Türkçe gönderi seçildi.`, "system_success");
        isProcessingStep = false;
        if(selectTurkishPostsButton) selectTurkishPostsButton.disabled = false;
        if(selectAllStep1PostsButton) selectAllStep1PostsButton.disabled = false;
    }


    // --- Adım 2 Fonksiyonları ---
    function updateLastActiveFilterDisplay() {
        if (!lastActiveFilterInput || !lastActiveFilterValueSpan) return;
        const selectedIndex = parseInt(lastActiveFilterInput.value);
        lastActiveFilterValueSpan.textContent = LAST_ACTIVE_SLIDER_VALUES[selectedIndex]?.label || "Limitsiz";
    }

    async function processSelectedPostsForNotes() {
        if (selectedDashboardPostsData.length === 0) { logAction("Adım 1'den gönderi seçin.", "warn"); return;}
        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor.", "warn"); return; }
        isProcessingStep = true;
        
        if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = true;
        if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'none';
        if(goToStep3Button) goToStep3Button.style.display = 'none';
        if(step2ProgressBar) updateProgressBar(step2ProgressBar, 0);
        if(suggestedUsersList) suggestedUsersList.innerHTML = '<p class="text-slate-400 italic text-center py-4">Notlar toplanıyor...</p>';
        potentialFollowTargets.clear(); selectedUsersToProcessFromStep2.clear();

        logAction(`Adım 2: ${selectedDashboardPostsData.length} gönderinin notları toplanıyor...`, "info");
        const uniqueBlogNamesFromNotes = new Set();
        const loggedInUserBlogName = (selectedAppUsernameForModule.split('_')[0] || "").toLowerCase();

        let processedPostCount = 0;
        for (const selectedPost of selectedDashboardPostsData) {
            try {
                const notesData = await executeApiActionForModule('getPostNotes', {
                    blog_identifier: selectedPost.blog_name,
                    post_id: selectedPost.id_string,
                    mode: 'all', 
                });
                if (notesData && notesData.notes && notesData.notes.length > 0) {
                    notesData.notes.forEach(note => {
                        const blogName = note.blog_name;
                        if (blogName && blogName.toLowerCase() !== loggedInUserBlogName) {
                            uniqueBlogNamesFromNotes.add(blogName);
                        }
                    });
                }
            } catch (error) {
                logAction(`"${selectedPost.id_string}" notları çekme hatası: ${error.message}`, "error");
            }
            processedPostCount++;
            if(step2ProgressBar) updateProgressBar(step2ProgressBar, (processedPostCount / selectedDashboardPostsData.length) * 50);
        }
        
        logAction(`${uniqueBlogNamesFromNotes.size} benzersiz blog bulundu. Bilgiler paralel olarak çekiliyor...`, "system");
        
        const selectedFilterIndex = parseInt(lastActiveFilterInput.value);
        const maxDaysOldFilter = LAST_ACTIVE_SLIDER_VALUES[selectedFilterIndex]?.value;

        const blogCheckFunction = async (blogName) => {
            try {
                const blogStatusData = await executeApiActionForModule('getBlogFollowingStatus', { blog_identifier: blogName });
                if (!blogStatusData) return null;
                
                const blog = blogStatusData;
                const lastUpdatedTimestamp = blog.updated; 
                if (maxDaysOldFilter > 0 && lastUpdatedTimestamp) {
                    const blogAgeDays = (Date.now() / 1000 - lastUpdatedTimestamp) / (60 * 60 * 24);
                    if (blogAgeDays > maxDaysOldFilter) {
                        logAction(`-> "${blogName}" aktiflik filtresine takıldı. Atlanıyor.`, "debug");
                        return null;
                    }
                }

                let canAddToList = false, isSelectable = true, frameColorClass = '';
                if (blog.is_following_me && !blog.am_i_following_them) { canAddToList = true; isSelectable = false; frameColorClass = 'frame-green'; }
                else if (!blog.is_following_me && !blog.am_i_following_them) { canAddToList = true; isSelectable = true; }
                else if (blog.is_following_me && blog.am_i_following_them) { canAddToList = true; isSelectable = true; frameColorClass = 'frame-blue'; }
                
                if (canAddToList) {
                    return {
                        name: blog.name, title: blog.title || blog.name, url: blog.url,
                        avatar: blog.avatar || `https://api.tumblr.com/v2/blog/${blog.name}/avatar/96`, updated: lastUpdatedTimestamp, 
                        posts: blog.posts, description: blog.description || "",
                        isSelectable: isSelectable, frameColorClass: frameColorClass,
                        is_following_me: blog.is_following_me, am_i_following_them: blog.am_i_following_them
                    };
                }
            } catch (userError) {
                logAction(`"${blogName}" blog bilgisi çekme hatası: ${userError.message}`, "error");
            }
            return null;
        };

        const results = await processQueueInParallel(
            Array.from(uniqueBlogNamesFromNotes), 
            blogCheckFunction, 
            8,
            (progress) => {
                if(step2ProgressBar) updateProgressBar(step2ProgressBar, 50 + (progress / 2));
            }
        );

        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                potentialFollowTargets.set(result.value.name, result.value);
            }
        });

        logAction(`Adım 2 tamamlandı. ${potentialFollowTargets.size} potansiyel blog bulundu.`, "system_success");
        renderSuggestedUsers();
        if (potentialFollowTargets.size > 0) {
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
            if (!user.isSelectable) item.classList.add('not-selectable');
            item.dataset.blogName = user.name;

            const placeholderAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name.charAt(0))}&background=random&size=96`;

            item.innerHTML = `
                <input type="checkbox" class="form-checkbox h-5 w-5 text-indigo-600 rounded mr-3 user-select-checkbox self-center flex-shrink-0" 
                       data-blog-name="${user.name}" 
                       ${selectedUsersToProcessFromStep2.has(user.name) ? 'checked' : ''}
                       ${!user.isSelectable ? 'disabled' : ''}>
                <img src="${placeholderAvatar}" alt="${user.name} avatar" class="user-avatar flex-shrink-0" id="avatar-${user.name}">
                <div class="ml-2 overflow-hidden flex-grow">
                    <p class="text-sm font-semibold text-slate-800 truncate" title="${user.title.replace(/"/g, '&quot;')}">${user.title}</p>
                    <p class="text-xs text-indigo-500 truncate">${user.name}</p>
                    <p class="text-xs text-gray-500 mt-0.5">Son aktif: ${user.updated ? new Date(user.updated * 1000).toLocaleDateString() : 'Bilinmiyor'}</p>
                    <p class="text-xs text-gray-400 mt-0.5">Siz: ${user.am_i_following_them ? 'Takip' : 'Takip Etmiyor'} | O: ${user.is_following_me ? 'Takip Ediyor' : 'Etmiyor'}</p>
                </div>
            `;
            
            getCheckedAvatarUrl(user.avatar, user.name).then(finalAvatarUrl => {
                const avatarImg = document.getElementById(`avatar-${user.name}`);
                if (avatarImg) avatarImg.src = finalAvatarUrl;
            });

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
                cb.checked = !allCurrentlySelected;
                cb.dispatchEvent(new Event('change'));
            });
        });
    }
    
    function updateFollowAndLikeButtonState() {
         if (followAndLikeButton) {
            const selectableUserCount = Array.from(potentialFollowTargets.values()).filter(u => u.isSelectable && selectedUsersToProcessFromStep2.has(u.name)).length;
            followAndLikeButton.disabled = selectableUserCount === 0;
            if (filterDefaultAvatarsButton) filterDefaultAvatarsButton.disabled = selectableUserCount === 0;

            followAndLikeButton.textContent = selectableUserCount > 0 ?
                `${selectableUserCount} Blogu Takip Et ve Beğen` :
                "Takip Edilecek Seçili Blog Yok";
        }
    }

    async function displaySelectedUserDetails(blogName) {
        const user = potentialFollowTargets.get(blogName);
        if (user && selectedUserAvatar && selectedUserName && selectedUserUrl && selectedUserLastActive && selectedUserPostCount && selectedUserDescription && selectedUserDetailsPanel) {
            
            const finalAvatarUrl = await getCheckedAvatarUrl(user.avatar, user.name);
            selectedUserAvatar.src = finalAvatarUrl.includes('/avatar/') ? finalAvatarUrl.replace(/avatar\/\d+/, 'avatar/128') : finalAvatarUrl;

            selectedUserName.textContent = user.title;
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

    // --- Adım 3 Fonksiyonları ---
    function updateLikesPerUserDisplay() {
        if (likesPerUserSliderInput && likesPerUserValueSpan) {
            likesPerUserValueSpan.textContent = likesPerUserSliderInput.value;
        }
    }

    async function filterUsersWithDefaultAvatars() {
        const usersToCheck = Array.from(selectedUsersToProcessFromStep2)
            .map(name => potentialFollowTargets.get(name))
            .filter(user => user && user.isSelectable);

        if (usersToCheck.length === 0) {
            logAction("Filtreleme için seçili kullanıcı yok.", "warn");
            return;
        }
        if (isProcessingStep) {
            logAction("Zaten bir işlem devam ediyor.", "warn");
            return;
        }
        isProcessingStep = true;
        if(filterDefaultAvatarsButton) filterDefaultAvatarsButton.disabled = true;
        if(followAndLikeButton) followAndLikeButton.disabled = true;

        logAction(`Avatar kontrolü: ${usersToCheck.length} kullanıcı varsayılan avatar için taranıyor (50 işçi)...`, "system");
        if(step3ProgressBar) updateProgressBar(step3ProgressBar, 0);

        const checkAvatarTask = async (userBlog) => {
            const isDefault = userBlog.avatar && userBlog.avatar.includes('/default_avatar_');
            return { blogName: userBlog.name, isDefault: isDefault };
        };

        const avatarCheckResults = await processQueueInParallel(
            usersToCheck,
            checkAvatarTask,
            50,
            (progress) => {
                if(step3ProgressBar) updateProgressBar(step3ProgressBar, progress);
            }
        );

        const usersWithDefaultAvatar = avatarCheckResults
            .filter(res => res.status === 'fulfilled' && res.value.isDefault)
            .map(res => res.value.blogName);

        if (usersWithDefaultAvatar.length > 0) {
            logAction(`${usersWithDefaultAvatar.length} kullanıcının varsayılan avatar kullandığı tespit edildi. Seçimden çıkarılıyor...`, "warn");
            usersWithDefaultAvatar.forEach(blogName => {
                selectedUsersToProcessFromStep2.delete(blogName);
                const userCheckbox = suggestedUsersList.querySelector(`.user-select-checkbox[data-blog-name="${blogName}"]`);
                if (userCheckbox) {
                    userCheckbox.checked = false;
                    const item = userCheckbox.closest('.suggested-user-item');
                    if(item) item.classList.remove('selected-for-action');
                }
            });
        }

        logAction(`Avatar kontrolü tamamlandı. ${usersWithDefaultAvatar.length} kullanıcı filtrelendi.`, "system_success");
        isProcessingStep = false;
        if(filterDefaultAvatarsButton) filterDefaultAvatarsButton.disabled = false;
        updateFollowAndLikeButtonState();
    }


    async function followAndLikeSelectedTargets() {
        const usersToActuallyProcess = Array.from(selectedUsersToProcessFromStep2)
            .map(name => potentialFollowTargets.get(name))
            .filter(user => user && user.isSelectable);

        if (usersToActuallyProcess.length === 0) {logAction("Takip edilecek geçerli blog seçilmedi.", "warn"); return;}
        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor.", "warn"); return; }
        isProcessingStep = true;
        logAction(`Adım 3: ${usersToActuallyProcess.length} blog için takip/beğeni paralel olarak başlıyor...`, "info");
        if(followAndLikeButton) followAndLikeButton.disabled = true;
        if(filterDefaultAvatarsButton) filterDefaultAvatarsButton.disabled = true;
        if(step3ProgressBar) updateProgressBar(step3ProgressBar, 0);

        let totalFollowed = 0, totalLikedPosts = 0;
        const likesPerUserCount = parseInt(likesPerUserSliderInput.value);

        const userProcessFunction = async (userBlog) => {
            if (!userBlog || !userBlog.url) {
                logAction(`"${userBlog.name}" URL yok, atlandı.`, "warn");
                return;
            }
            try {
                if (!userBlog.am_i_following_them) {
                    await executeApiActionForModule('followTumblrBlog', { blog_url: userBlog.url });
                    totalFollowed++;
                    logAction(`"${userBlog.name}" takip edildi.`, "success");
                    if(followedCountSpan) followedCountSpan.textContent = totalFollowed;
                    const updatedUser = potentialFollowTargets.get(userBlog.name);
                    if(updatedUser) updatedUser.am_i_following_them = true;
                    await delay(200);
                } else {
                     logAction(`"${userBlog.name}" zaten takip ediliyor, atlandı.`, "info");
                }

                if (likesPerUserCount > 0) {
                    let likedForThisUser = 0, offset = 0;
                    const postsToFetchPerBatch = Math.max(5, likesPerUserCount + 3); 
                    while (likedForThisUser < likesPerUserCount) {
                        const data = await executeApiActionForModule('getBlogOriginalPosts', {
                            blog_identifier: userBlog.name, limit: postsToFetchPerBatch, offset: offset
                        }, false); 

                        if (data && data.posts && data.posts.length > 0) {
                            for (const post of data.posts) {
                                if (likedForThisUser >= likesPerUserCount) break;
                                if (post.blog_name === userBlog.name && post.id_string && post.reblog_key) {
                                    await executeApiActionForModule('likeTumblrPost', { post_id: post.id_string, reblog_key: post.reblog_key });
                                    likedForThisUser++; totalLikedPosts++;
                                    logAction(` -> "${post.id_string}" beğenildi (${userBlog.name}).`, "success");
                                    if(likedPostsCountStep3Span) likedPostsCountStep3Span.textContent = totalLikedPosts;
                                    await delay(300 + Math.random() * 200);
                                }
                            }
                            if (data.posts.length < postsToFetchPerBatch || offset > 100) break; 
                            offset += postsToFetchPerBatch;
                        } else break;
                    }
                }
            } catch (error) {
                logAction(`"${userBlog.name}" işlenirken hata: ${error.message}`, "error");
            }
        };

        await processQueueInParallel(
            usersToActuallyProcess, 
            userProcessFunction, 
            4,
            (progress) => {
                if(step3ProgressBar) updateProgressBar(step3ProgressBar, progress);
            }
        );

        logAction(`Adım 3 tamamlandı. ${totalFollowed} blog takip edildi, ${totalLikedPosts} gönderi beğenildi.`, "system_success");
        isProcessingStep = false;
        try {
            const limitsData = await executeApiActionForModule('getUserLimits', {});
            if (limitsData) displayUserLimits(limitsData);
        } catch (error) { logAction(`Kullanıcı limitleri güncellenemedi: ${error.message}`, "warn"); }
        
        renderSuggestedUsers(); 
        if(followAndLikeButton) followAndLikeButton.disabled = false;
        if(filterDefaultAvatarsButton) filterDefaultAvatarsButton.disabled = false;
    }

    // --- Buton Event Listener'ları ---
    if (fetchDashboardButton) fetchDashboardButton.addEventListener('click', fetchDashboardPostsForSelection);
    if (goToStep2Button) goToStep2Button.addEventListener('click', () => {
        if(step1Container) step1Container.style.display = 'none';
        if(step2Container) step2Container.style.display = 'block';
        if (findSuggestedUsersButton) findSuggestedUsersButton.disabled = false;
        logAction("Adım 2'ye geçildi. Filtreleri ayarlayıp 'Önerilen Blogları Bul'a tıklayın.", "info");
    });
    if (findSuggestedUsersButton) findSuggestedUsersButton.addEventListener('click', processSelectedPostsForNotes);
    if (goToStep3Button) goToStep3Button.addEventListener('click', () => {
        if(step2Container) step2Container.style.display = 'none';
        if(step3Container) step3Container.style.display = 'block';
        updateFollowAndLikeButtonState();
    });
    if (followAndLikeButton) followAndLikeButton.addEventListener('click', followAndLikeSelectedTargets);
    if (filterDefaultAvatarsButton) filterDefaultAvatarsButton.addEventListener('click', filterUsersWithDefaultAvatars);
    // --- YENİ: Dil Filtreleme Butonu Olay Dinleyicisi ---
    if (selectTurkishPostsButton) selectTurkishPostsButton.addEventListener('click', selectTurkishPosts);


    // Slider Event Listener'ları
    if (lastActiveFilterInput) {
        lastActiveFilterInput.addEventListener('input', updateLastActiveFilterDisplay);
        updateLastActiveFilterDisplay();
    }
    if (likesPerUserSliderInput) {
        likesPerUserSliderInput.addEventListener('input', updateLikesPerUserDisplay);
        updateLikesPerUserDisplay();
    }

    // --- Başlangıç ---
    fetchAndPopulateUsersForModule();
    resetModuleState(true); 
    logAction("Takip Önerileri Modülü yüklendi. Lütfen işlem yapılacak hesabı seçin.", "system");
});
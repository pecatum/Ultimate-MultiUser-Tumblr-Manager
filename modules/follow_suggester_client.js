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
    const removeDefaultAvatarUsersButton = document.getElementById('removeDefaultAvatarUsersButton');
    const avatarScanProgressContainer = document.getElementById('avatarScanProgressContainer');
    const avatarScanProgressBar = document.getElementById('avatarScanProgressBar');
    const avatarScanProgressText = document.getElementById('avatarScanProgressText');
    const selectTurkishPostsButton = document.getElementById('selectTurkishPostsButton');

    // --- Durum Değişkenleri ---
    let selectedAppUsernameForModule = null;
    let allFetchedDashboardPosts = new Map();
    let selectedDashboardPostsData = [];
    let allBlogNamesFromNotes = new Set();
    let potentialFollowTargets = new Map();
    let selectedUsersToProcessFromStep2 = new Set();
    let isProcessingStep = false;
    let currentDetailedUser = null;
    let continueFetchingDashboard = false;

    // =================================================================
    // DEĞİŞİKLİK BAŞLANGICI: İsteğiniz doğrultusunda bu bölüm güncellendi.
    // =================================================================

    /**
     * "Son Aktiflik Filtresi" için zaman adımlarını dinamik olarak oluşturur.
     * Bu fonksiyon, 2 günlük (48 saat) bir zaman aralığını 30 dakikalık adımlarla oluşturur.
     * @returns {Array<Object>} Slider için değer ve etiketleri içeren bir dizi.
     */
    function generateTimeSteps() {
        const steps = [];
        steps.push({ value: 0, label: "Limitsiz" }); // "Limitsiz" seçeneği

        // 48 saatlik aralık için 30 dakikalık hassasiyetle 96 adım oluştur
        for (let i = 1; i <= 96; i++) {
            const totalMinutes = i * 30;
            const totalHours = totalMinutes / 60;
            const days = totalMinutes / (60 * 24); // Filtreleme mantığı gün cinsinden çalışıyor

            let label = "";
            if (totalMinutes < 60) {
                label = `Son ${totalMinutes} Dakika`;
            } else if (totalHours === 1) {
                label = `Son 1 Saat`;
            } else if (totalHours === 24) {
                label = "Son 1 Gün";
            } else if (totalHours === 48) {
                label = "Son 2 Gün";
            } else if (totalHours % 1 === 0) {
                label = `Son ${totalHours} Saat`;
            } else {
                // "1.5 Saat" gibi ondalıklı gösterimler için
                label = `Son ${parseFloat(totalHours.toFixed(1))} Saat`;
            }
            steps.push({ value: days, label: label });
        }
        return steps;
    }

    // Eskiden statik olan bu dizi, şimdi dinamik olarak oluşturuluyor.
    const LAST_ACTIVE_SLIDER_VALUES = generateTimeSteps();

    if (lastActiveFilterInput) {
        // Slider'ın maksimum değerini yeni adım sayısına göre ayarla
        lastActiveFilterInput.max = LAST_ACTIVE_SLIDER_VALUES.length - 1;
        // Varsayılan değeri "Son 6 Saat" olarak ayarla (bu, 12. adıma denk geliyor)
        lastActiveFilterInput.value = 12;
    }

    // =================================================================
    // DEĞİŞİKLİK SONU
    // =================================================================


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

    async function waitForFranc(timeout = 7000) {
        const startTime = Date.now();
        logAction("Dil tespit kütüphanesi kontrol ediliyor...", "debug");
        while (typeof window.franc !== 'function') {
            if (Date.now() - startTime > timeout) {
                throw new Error("Dil tespit kütüphanesi (franc) yüklenemedi. Lütfen internet bağlantınızı kontrol edin veya sayfayı yenileyin.");
            }
            await delay(100);
        }
        logAction("Dil tespit kütüphanesi hazır.", "debug");
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
        
        let result;
        try {
            result = await response.json();
        } catch (e) {
            console.error("Failed to parse JSON response:", await response.text());
            throw { message: `Sunucudan geçersiz JSON yanıtı alındı (Status: ${response.status})`, isUserError: false, type: "api" };
        }

        if (!response.ok || result.error) {
            const errorType = response.status === 401 && needsAuth ? "auth" : "api";
            console.error(`API Action Error for ${actionId}:`, result.error || result.message, result.details);
            throw { message: result.error || result.message || `API eylemi '${actionId}' hatası (${response.status})`, isUserError: true, type: errorType, details: result.details };
        }
        return result.data;
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

        allBlogNamesFromNotes.clear();
        potentialFollowTargets.clear(); 
        selectedUsersToProcessFromStep2.clear();
        if(suggestedUsersList) suggestedUsersList.innerHTML = '<p class="text-slate-400 italic p-4 text-center">Bloglar Adım 2\'de burada listelenecek.</p>';
        if(selectedUserDetailsPanel) selectedUserDetailsPanel.style.display = 'none'; currentDetailedUser = null;
        if(step2ProgressBar) updateProgressBar(step2ProgressBar, 0);
        
        // DEĞİŞİKLİK: Modül sıfırlandığında slider'ı varsayılan değere (6 saat) ayarla.
        if (lastActiveFilterInput) {
             lastActiveFilterInput.value = 12; 
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
        continueFetchingDashboard = false;
        if(stopFetchDashboardButton) stopFetchDashboardButton.style.display = 'none';
        if (fetchDashboardButton) {
            fetchDashboardButton.disabled = !selectedAppUsernameForModule;
            fetchDashboardButton.style.display = 'inline-flex';
        }
        if (findSuggestedUsersButton) findSuggestedUsersButton.disabled = true;
        if (followAndLikeButton) followAndLikeButton.disabled = true;
        if (removeDefaultAvatarUsersButton) removeDefaultAvatarUsersButton.disabled = true;
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
        return combinedText.join(' ').replace(/<[^>]*>?/gm, '');
    }

    async function selectTurkishPosts() {
        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor.", "warn"); return; }
        if (allFetchedDashboardPosts.size === 0) { logAction("Önce gönderileri çekin.", "warn"); return; }
        
        isProcessingStep = true;
        if(selectTurkishPostsButton) selectTurkishPostsButton.disabled = true;
        if(selectAllStep1PostsButton) selectAllStep1PostsButton.disabled = true;

        try {
            await waitForFranc();
        } catch (error) {
            logAction(error.message, "error");
            isProcessingStep = false;
            if(selectTurkishPostsButton) selectTurkishPostsButton.disabled = false;
            if(selectAllStep1PostsButton) selectAllStep1PostsButton.disabled = false;
            return;
        }
        
        logAction("Dil analizi başlıyor. Sadece Türkçe gönderiler seçilecek...", "system");
        if(step1ProgressBar) updateProgressBar(step1ProgressBar, 0);

        dashboardPostsContainer.querySelectorAll('.dashboard-post-select:checked').forEach(cb => {
            cb.checked = false;
            cb.dispatchEvent(new Event('change'));
        });
        await delay(100);

        const allPosts = Array.from(allFetchedDashboardPosts.values());
        let processedCount = 0;
        let turkishPostCount = 0;

        for (const post of allPosts) {
            const textToAnalyze = extractTextFromPost(post);
            if (textToAnalyze.trim().length > 20) {
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
    async function findAndFilterPotentialTargets() {
        if (selectedDashboardPostsData.length === 0) { logAction("Adım 1'den gönderi seçin.", "warn"); return;}
        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor.", "warn"); return; }
        
        isProcessingStep = true;
        if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = true;
        if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'none';
        if(goToStep3Button) goToStep3Button.style.display = 'none';
        if(step2ProgressBar) updateProgressBar(step2ProgressBar, 0);
        if(suggestedUsersList) suggestedUsersList.innerHTML = '<p class="text-slate-400 italic text-center py-4">Notlar toplanıyor...</p>';
        
        potentialFollowTargets.clear(); 
        selectedUsersToProcessFromStep2.clear();
        allBlogNamesFromNotes.clear();

        // 1. Notları Topla
        const concurrencyLimitNotes = 5;

        const fetchNotesTask = async (post) => {
            try {
                const notesData = await executeApiActionForModule('getPostNotes', {
                    blog_identifier: post.blog_name,
                    post_id: post.id_string,
                    mode: 'all',
                });
                if (notesData && notesData.notes) {
                    notesData.notes.forEach(note => {
                        if (note.blog_name && note.blog_name.toLowerCase() !== (selectedAppUsernameForModule.split('_')[0] || "").toLowerCase()) {
                            allBlogNamesFromNotes.add(note.blog_name);
                        }
                    });
                }
            } catch (error) {
                logAction(`'${post.id_string}' notları çekme hatası: ${error.message}`, "error");
            }
        };

        const processQueueInParallel = async (items, asyncFn, concurrency, onProgress = () => {}) => {
            const queue = [...items];
            let processedCount = 0;
            const totalCount = items.length;
            const runWorker = async () => {
                while (queue.length > 0) {
                    const item = queue.shift();
                    if (item) {
                        try {
                            await asyncFn(item);
                        } catch (error) {
                            console.error("Worker error:", error);
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
        };

        await processQueueInParallel(
            selectedDashboardPostsData, 
            fetchNotesTask, 
            concurrencyLimitNotes,
            (progress) => {
                if(step2ProgressBar) updateProgressBar(step2ProgressBar, progress * 0.5); // 50% for note fetching
            }
        );
        
        logAction(`${allBlogNamesFromNotes.size} benzersiz blog bulundu. Bilgiler filtreleniyor...`, "system");

        // 2. Blogları Filtrele
        const selectedFilterIndex = parseInt(lastActiveFilterInput.value);
        const maxDaysOldFilter = LAST_ACTIVE_SLIDER_VALUES[selectedFilterIndex]?.value;

        const blogsToProcessArray = Array.from(allBlogNamesFromNotes);
        const concurrencyLimitStep2 = 10;
        
        const processBlogTask = async (blogName) => {
            try {
                const blogStatusData = await executeApiActionForModule('getBlogFollowingStatus', { blog_identifier: blogName });
                if (!blogStatusData) return;

                const blog = blogStatusData;
                const lastUpdatedTimestamp = blog.updated;

                if (maxDaysOldFilter > 0 && lastUpdatedTimestamp) {
                    const blogAgeDays = (Date.now() / 1000 - lastUpdatedTimestamp) / (60 * 60 * 24);
                    if (blogAgeDays > maxDaysOldFilter) {
                        logAction(`-> '${blogName}' aktiflik filtresine takıldı.`, "debug");
                        return;
                    }
                }

                let isSelectable = true, frameColorClass = '';
                if (blog.is_following_me && !blog.am_i_following_them) { frameColorClass = 'frame-green'; isSelectable = false; }
                else if (blog.am_i_following_them) { frameColorClass = 'frame-blue'; isSelectable = false; }

                const avatarUrl = blog.avatar?.length > 0 ? blog.avatar[0]?.url || `https://api.tumblr.com/v2/blog/${blog.name}/avatar/96` : `https://api.tumblr.com/v2/blog/${blog.name}/avatar/96`;
                potentialFollowTargets.set(blogName, {
                    name: blog.name, title: blog.title || blog.name, url: blog.url,
                    avatar: avatarUrl, updated: lastUpdatedTimestamp, 
                    posts: blog.posts, description: blog.description || "",
                    isSelectable: isSelectable, frameColorClass: frameColorClass,
                    is_following_me: blog.is_following_me, am_i_following_them: blog.am_i_following_them
                });
            } catch (error) {
                logAction(`'${blogName}' bilgisi çekme hatası: ${error.message}`, "error");
            }
        };

        await processQueueInParallel(
            blogsToProcessArray, 
            processBlogTask, 
            concurrencyLimitStep2,
            (progress) => {
                if(step2ProgressBar) updateProgressBar(step2ProgressBar, 50 + (progress * 0.5)); // Remaining 50%
            }
        );

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

            item.innerHTML = `
                <input type="checkbox" class="form-checkbox h-5 w-5 text-indigo-600 rounded mr-3 user-select-checkbox self-center flex-shrink-0" 
                       data-blog-name="${user.name}" 
                       ${selectedUsersToProcessFromStep2.has(user.name) ? 'checked' : ''}
                       ${!user.isSelectable ? 'disabled' : ''}>
                <img src="${user.avatar}" alt="${user.name} avatar" class="user-avatar flex-shrink-0" onerror="this.onerror=null;this.src='https://placehold.co/80x80/e2e8f0/707070?text=?';">
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
    
    function updateFollowAndLikeButtonState() {
        const selectableUserCount = Array.from(selectedUsersToProcessFromStep2).filter(name => {
            const user = potentialFollowTargets.get(name);
            return user && user.isSelectable;
        }).length;
        
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

    async function displaySelectedUserDetails(blogName) {
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

    // --- Adım 3 Fonksiyonları ---
    async function handleRemoveDefaultAvatarUsers() {
        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor.", "warn"); return; }
        
        const selectedBlogNames = Array.from(selectedUsersToProcessFromStep2);
        if (selectedBlogNames.length === 0) { logAction("Avatar kontrolü için blog seçin.", "warn"); return; }

        isProcessingStep = true;
        removeDefaultAvatarUsersButton.disabled = true;
        if (followAndLikeButton) followAndLikeButton.disabled = true;
        if (avatarScanProgressContainer) avatarScanProgressContainer.style.display = 'block';
        if (avatarScanProgressBar) updateProgressBar(avatarScanProgressBar, 0);
        logAction(`Seçili ${selectedBlogNames.length} blog için avatar kontrolü (20 işçi)...`, "system");
        
        let deselectedCount = 0;

        const workerTask = async (blogName) => {
            try {
                // API üzerinden avatar URL'sini çekmek yerine doğrudan fetch ile kontrol ediyoruz, çünkü bu daha hızlı olabilir.
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
            }
        };
        
        const processQueueInParallelWithProgress = async (items, asyncFn, concurrency) => {
            const queue = [...items];
            let processedCount = 0;
            const totalCount = items.length;
            const runWorker = async () => {
                while (queue.length > 0) {
                    const item = queue.shift();
                    if (item) {
                        try {
                            await asyncFn(item);
                        } catch (error) {
                            console.error("Worker error:", error);
                        } finally {
                             processedCount++;
                             const progress = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;
                             if(avatarScanProgressBar) updateProgressBar(avatarScanProgressBar, progress);
                             if(avatarScanProgressText) avatarScanProgressText.textContent = `${processedCount}/${totalCount}`;
                        }
                    }
                }
            };
            const workers = Array(concurrency).fill(null).map(() => runWorker());
            await Promise.all(workers);
        };

        await processQueueInParallelWithProgress(selectedBlogNames, workerTask, 20);

        logAction(`Avatar tarama tamamlandı. ${deselectedCount} blog seçimden kaldırıldı.`, "system_success");
        updateFollowAndLikeButtonState();

        isProcessingStep = false;
        removeDefaultAvatarUsersButton.disabled = (selectedUsersToProcessFromStep2.size === 0);
        if (followAndLikeButton) followAndLikeButton.disabled = (selectedUsersToProcessFromStep2.size === 0);
        if (avatarScanProgressContainer) setTimeout(() => { avatarScanProgressContainer.style.display = 'none'; }, 2000);
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

        for (const userBlog of usersToActuallyProcess) {
            if (!isProcessingStep) {
                logAction("İşlem durduruldu.", "warn");
                break;
            }
            
            if (!userBlog.am_i_following_them) {
                logAction(`'${userBlog.name}' takip ediliyor...`, "info");
                try {
                    await executeApiActionForModule('followTumblrBlog', { blog_url: userBlog.url });
                    totalFollowed++;
                    logAction(`'${userBlog.name}' başarıyla takip edildi.`, "success");
                    if(followedCountSpan) followedCountSpan.textContent = totalFollowed;
                    const updatedUser = potentialFollowTargets.get(userBlog.name);
                    if(updatedUser) updatedUser.am_i_following_them = true;
                } catch (followError) {
                    logAction(`'${userBlog.name}' takip edilemedi: ${followError.message}`, "error");
                    if (followError.type === "auth") { isProcessingStep = false; break; }
                }
            } else {
                 logAction(`'${userBlog.name}' zaten takip ediliyor.`, "info");
            }

            if (likesPerUserCountTarget > 0 && isProcessingStep) {
                try {
                    const postsToLikeData = await executeApiActionForModule('getBlogOriginalPosts', {
                        blog_identifier: userBlog.name, limit: likesPerUserCountTarget, npf: true
                    });
                    if (postsToLikeData && postsToLikeData.posts && postsToLikeData.posts.length > 0) {
                        const postsToLike = postsToLikeData.posts.filter(p => p.reblog_key);
                        for (const post of postsToLike) {
                             if (!isProcessingStep) break;
                             try {
                                await executeApiActionForModule('likeTumblrPost', { post_id: post.id_string, reblog_key: post.reblog_key });
                                totalLikedPostsOverall++;
                                logAction(` -> '${post.id_string}' (${userBlog.name}) beğenildi. Toplam: ${totalLikedPostsOverall}`, "success");
                                if(likedPostsCountStep3Span) likedPostsCountStep3Span.textContent = totalLikedPostsOverall;
                                await delay(300);
                             } catch(likeError) {
                                logAction(` -> '${post.id_string}' beğenilemedi: ${likeError.message}`, "error");
                                if (likeError.message?.includes("429")) {
                                    logAction("Beğeni rate limitine takıldınız! Bu kullanıcı için kalan beğeniler durduruluyor.", "error");
                                    break;
                                }
                             }
                        }
                    }
                } catch(fetchErr) {
                    logAction(`'${userBlog.name}' için gönderi çekme hatası: ${fetchErr.message}`, "error");
                }
            }
            
            processedUserCountOuter++;
            if(step3ProgressBar) updateProgressBar(step3ProgressBar, (processedUserCountOuter / usersToActuallyProcess.length) * 100);
            if(isProcessingStep) await delay(1000);
        }
        
        logAction(`Adım 3 tamamlandı. ${totalFollowed} blog takip edildi, ${totalLikedPostsOverall} gönderi beğenildi.`, "system_success");
        isProcessingStep = false;
        try {
            const limitsData = await executeApiActionForModule('getUserLimits', {});
            if (limitsData) displayUserLimits(limitsData);
        } catch (error) { logAction(`Kullanıcı limitleri güncellenemedi: ${error.message}`, "warn"); }
        
        renderSuggestedUsers(); 
        if(followAndLikeButton) followAndLikeButton.disabled = false;
        if(removeDefaultAvatarUsersButton) removeDefaultAvatarUsersButton.disabled = false; 
    }

    // --- Olay Dinleyicileri ---
    if (fetchDashboardButton) fetchDashboardButton.addEventListener('click', fetchDashboardPostsForSelection);
    if (goToStep2Button) goToStep2Button.addEventListener('click', () => {
        if(step1Container) step1Container.style.display = 'none';
        if(step2Container) step2Container.style.display = 'block';
        if (findSuggestedUsersButton) findSuggestedUsersButton.disabled = (selectedDashboardPostsData.length === 0); 
        logAction("Adım 2'ye geçildi.", "info");
    });
    if (findSuggestedUsersButton) findSuggestedUsersButton.addEventListener('click', findAndFilterPotentialTargets);
    if (goToStep3Button) goToStep3Button.addEventListener('click', () => {
        if(step2Container) step2Container.style.display = 'none';
        if(step3Container) step3Container.style.display = 'block';
        updateFollowAndLikeButtonState();
    });
    if (followAndLikeButton) followAndLikeButton.addEventListener('click', followAndLikeSelectedTargets);
    if (removeDefaultAvatarUsersButton) removeDefaultAvatarUsersButton.addEventListener('click', handleRemoveDefaultAvatarUsers);
    if (selectTurkishPostsButton) selectTurkishPostsButton.addEventListener('click', selectTurkishPosts);
    if (selectAllStep1PostsButton) selectAllStep1PostsButton.addEventListener('click', () => {
        const checkboxes = dashboardPostsContainer.querySelectorAll('.dashboard-post-select');
        if (checkboxes.length === 0) return;
        const allCurrentlySelected = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => {
            cb.checked = !allCurrentlySelected;
            cb.dispatchEvent(new Event('change'));
        });
    });
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

    if (lastActiveFilterInput) lastActiveFilterInput.addEventListener('input', updateLastActiveFilterDisplay);
    if (likesPerUserSliderInput) likesPerUserSliderInput.addEventListener('input', updateLikesPerUserDisplay);

    // --- Başlangıç ---
    async function initialize() {
        await fetchAndPopulateUsersForModule();
        resetModuleState(true); 
        updateLastActiveFilterDisplay();
        updateLikesPerUserDisplay();
        logAction("Takip Önerileri Modülü yüklendi. Lütfen işlem yapılacak hesabı seçin.", "system");
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
    
    if (stopFetchDashboardButton) stopFetchDashboardButton.addEventListener('click', () => {
        continueFetchingDashboard = false;
        logAction("Gönderi çekme işlemi kullanıcı tarafından durduruldu.", "warn");
    });
    
    if (moduleUserSelector) {
        moduleUserSelector.addEventListener('change', async function() {
            selectedAppUsernameForModule = this.value;
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
            }
        });
    }

    initialize();
});

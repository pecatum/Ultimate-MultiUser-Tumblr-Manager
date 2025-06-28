// modules/follow_suggester_client.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('[FollowSuggester] DOM Yüklendi.');

    // --- Element Tanımlamaları ---
    const moduleUserSelector = document.getElementById('moduleUserSelector');
    const noUserSelectedWarning = document.getElementById('noUserSelectedWarning');

    // User Limits
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
    const fetchDashboardButton = document.getElementById('fetchDashboardButton');
    const stopFetchDashboardButton = document.getElementById('stopFetchDashboardButton');
    const totalFetchedPostsCountSpan = document.getElementById('totalFetchedPostsCount');
    const selectAllStep1PostsButton = document.getElementById('selectAllStep1PostsButton');
    const step1ProgressBar = document.getElementById('step1ProgressBar');
    const dashboardPostsContainer = document.getElementById('dashboardPostsContainer');
    const dashboardPostsOuterContainer = document.getElementById('dashboardPostsOuterContainer');
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

    // Left Panel (User Details)
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

    const actionLogArea = document.getElementById('actionLogArea');

    // --- Durum Değişkenleri ---
    let selectedAppUsernameForModule = null;
    let allFetchedDashboardPosts = new Map(); // Tekrarları engellemek için Map (id -> post)
    let selectedDashboardPostsData = [];
    let potentialFollowTargets = new Map(); // (blogName -> {data, isSelectable, frameColor})
    let selectedUsersToProcessFromStep2 = new Set();
    let isProcessingStep = false;
    let currentDetailedUser = null; 
    let continueFetchingDashboard = false;

    const LAST_ACTIVE_SLIDER_VALUES = [
        { value: 0, label: "Limitsiz" },        { value: 0.25, label: "Son 6 Saat" },
        { value: 1, label: "Son 1 Gün" },       { value: 3, label: "Son 3 Gün" },
        { value: 7, label: "Son 1 Hafta" },     { value: 14, label: "Son 2 Hafta" },
        { value: 30, label: "Son 1 Ay" }
    ];
    if (lastActiveFilterInput) {
        lastActiveFilterInput.max = LAST_ACTIVE_SLIDER_VALUES.length - 1;
        lastActiveFilterInput.value = LAST_ACTIVE_SLIDER_VALUES.findIndex(v => v.value === 7) || 4; // Varsayılan Son 1 Hafta
    }

    // --- Yardımcı Fonksiyonlar ---
    function logAction(message, type = 'info') {
        if (!actionLogArea) return;
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const logEntry = document.createElement('div');
        logEntry.innerHTML = `<span class="log-time">[${timeString}]</span> <span class="log-type">${type.toUpperCase()}:</span> ${message}`;
        
        const typeSpan = logEntry.querySelector('.log-type');
        if (typeSpan) {
            typeSpan.classList.add(`log-${type.toLowerCase().replace(/\s+/g, '_')}`);
        }

        actionLogArea.appendChild(logEntry);
        actionLogArea.scrollTop = actionLogArea.scrollHeight;
        if (type !== 'debug') console.log(`[FollowSuggester Log] ${type}: ${message}`);
    }

    function updateProgressBar(barElement, percentage) {
        if (!barElement) return;
        percentage = Math.max(0, Math.min(100, percentage));
        barElement.style.width = `${percentage}%`;
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
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // --- Kullanıcı Limitlerini Gösterme ---
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
             logAction("Takip limitleri API'den tam olarak alınamadı.", "warn");
        }

        if (likeLimitText && likeLimitProgressBar && likeLimitRemainingText) { // Likes objesi API'den gelmeyebilir, varsayılan gösterim
            if (userApiData.likes) { // Eğer API'den geliyorsa (genelde /user/limits'te olmaz)
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
                likeLimitText.textContent = `? / ${knownDailyLikeLimit}`; // Kullanılan bilinmiyor
                likeLimitRemainingText.textContent = `? kaldı`;
                updateProgressBar(likeLimitProgressBar, 0);
                if (likeResetText) likeResetText.textContent = "";
                logAction("Beğeni kalan/sıfırlanma bilgisi API'de belirtilmemiş. Genel limit gösteriliyor.", "warn");
            }
        }
        if (userLimitsContainer) userLimitsContainer.style.display = 'block';
    }
    

    // --- Event Listener: Kullanıcı Seçimi ---
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
        if(goToStep2Button) goToStep2Button.style.display = 'none';
        if(dashboardPostsContainer.children.length === 0 || dashboardPostsContainer.firstChild.tagName === 'P') {
            dashboardPostsContainer.innerHTML = '<p class="text-slate-400 italic text-center py-4 w-full">Gönderiler yükleniyor...</p>';
        }
        if(step1ProgressBar) updateProgressBar(step1ProgressBar, 0); // Sürekli çekmede progress bar anlamsız olabilir veya toplam hedef sayısı belirtilmeli

        const postsPerBatch = 20; // Tumblr API genelde max 20-50 arası döner
        let lastFetchedId = null; 
        let postsFetchedInThisRun = 0;
        let initialPostCount = allFetchedDashboardPosts.size;

        // En son çekilen gönderinin ID'sini bul (eğer varsa)
        if (allFetchedDashboardPosts.size > 0) {
            const postArray = Array.from(allFetchedDashboardPosts.values());
            postArray.sort((a, b) => b.timestamp - a.timestamp); // En yeniye göre sırala (ID'ler her zaman sıralı olmayabilir)
            if (postArray.length > 0) {
                 // since_id en eskisini değil, en yenisinin ID'sini bekler ve ondan sonrakileri getirir.
                 // dashboard endpoint'i `offset` ve `since_id` (post ID of the last post you retrieved) parametrelerini alır.
                 // Sürekli çekme için, en son çekilen postun ID'sini `since_id` olarak kullanmak mantıklı.
                 // Ancak, Tumblr API'nin since_id'si "bu ID'den daha yeni olanları getir" anlamına gelir.
                 // Dashboardda ters kronolojik sıra olduğu için bir önceki batch'in en son (en eski) ID'si since_id olmalı.
                 // Veya offset kullanılmalı. Ya da `before` parametresi (timestamp)
                 // Şimdilik `offset` kullanalım.
                 // VEYA `since_id` en son aldığımız en eski postun ID'si olacak.
                 // `since_id`: Returns posts older than the specified ID.
                 // Eğer en son aldıklarımızın en eskisinin ID'sini verirsek, ondan daha eskileri çeker.
                 let oldestPostLastRun = null;
                 if (postArray.length > 0) {
                    oldestPostLastRun = postArray.reduce((oldest, current) => (current.id_string < oldest.id_string ? current : oldest), postArray[0]);
                    lastFetchedId = oldestPostLastRun.id_string;
                 }

            }
        }


        while (continueFetchingDashboard) {
            logAction(`Panel gönderi grubu çekiliyor... (since_id: ${lastFetchedId || 'yok'})`, "info");
            try {
                const params = { limit: postsPerBatch, notes_info: true, reblog_info: true, npf: true };
                if (lastFetchedId) {
                     params.since_id = lastFetchedId; // since_id, belirtilen ID'den daha eski gönderileri getirir
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
                        // En son çekilen (en eski) postun ID'sini al
                        lastFetchedId = data.posts[data.posts.length - 1].id_string;
                    } else { // API daha az post döndürdüyse veya boşsa
                         logAction("Panelin sonuna ulaşıldı (bu grupta yeni gönderi yok).", "info");
                         continueFetchingDashboard = false; // Döngüyü sonlandır
                         break;
                    }
                    postsFetchedInThisRun += newPostsAddedCount;
                    if (totalFetchedPostsCountSpan) totalFetchedPostsCountSpan.textContent = `Toplam Çekilen Gönderi: ${allFetchedDashboardPosts.size}`;
                    renderDashboardPosts(Array.from(allFetchedDashboardPosts.values())); // Her seferinde listeyi güncelle
                } else {
                    logAction(`Bu grupta yeni gönderi bulunamadı. Çekilen: ${allFetchedDashboardPosts.size}`, "info");
                    continueFetchingDashboard = false; // Döngüyü sonlandır
                    break; 
                }
                // Progress barı burada güncellemek yerine, toplam bir hedef yoksa çok anlamlı değil.
                // Belki çekilen batch sayısını gösterebiliriz.
                // if(step1ProgressBar) updateProgressBar(step1ProgressBar, ???); 
            } catch (error) {
                logAction(`Panel gönderileri çekilirken hata: ${error.message}`, "error");
                if (error.isUserError && error.type === "auth") { /* Kullanıcı seçimi/auth hatası */ }
                continueFetchingDashboard = false; // Hata durumunda da durdur
                break; 
            }
            if (continueFetchingDashboard) await delay(500); // API rate limit için batch'ler arası bekle
        }
        
        if (allFetchedDashboardPosts.size > initialPostCount) {
             logAction(`Adım 1 tamamlandı. Bu çalıştırmada ${postsFetchedInThisRun} yeni panel gönderisi çekildi. Toplam: ${allFetchedDashboardPosts.size}. Lütfen işlemek istediklerinizi seçin.`, "system_success");
        } else if (!continueFetchingDashboard && postsFetchedInThisRun === 0) {
            logAction("Adım 1: Yeni gönderi bulunamadı veya işlem durduruldu.", "info");
        }

        isProcessingStep = false;
        if (fetchDashboardButton) fetchDashboardButton.style.display = 'inline-flex';
        if (stopFetchDashboardButton) stopFetchDashboardButton.style.display = 'none';
        if (allFetchedDashboardPosts.size > 0 && selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'inline-block';
        updateStep2ButtonVisibility(); // Seçili gönderi varsa butonu göster
    }

    if(stopFetchDashboardButton) {
        stopFetchDashboardButton.addEventListener('click', () => {
            continueFetchingDashboard = false;
            logAction("Gönderi çekme işlemi kullanıcı tarafından durduruldu.", "warn");
            if (fetchDashboardButton) fetchDashboardButton.style.display = 'inline-flex';
            if (stopFetchDashboardButton) stopFetchDashboardButton.style.display = 'none';
            isProcessingStep = false; // İşlemi serbest bırak
        });
    }


    function renderDashboardPosts(posts) {
        if(!dashboardPostsContainer) return;
        // Mevcut seçili checkbox'ların durumunu korumak için ID'lerini alalım
        const previouslyCheckedPostIds = new Set();
        dashboardPostsContainer.querySelectorAll('.dashboard-post-select:checked').forEach(cb => {
            const parentItem = cb.closest('.dashboard-post-item');
            if (parentItem && parentItem.dataset.postId) {
                previouslyCheckedPostIds.add(parentItem.dataset.postId);
            }
        });

        dashboardPostsContainer.innerHTML = ''; // Önce temizle
        
        if (!posts || posts.length === 0) {
            dashboardPostsContainer.innerHTML = '<p class="text-slate-400 italic text-center py-4 w-full">Panelde gösterilecek gönderi bulunamadı.</p>';
            if(goToStep2Button) goToStep2Button.style.display = 'none';
            if(selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'none';
            return;
        }

        // Gönderileri tarihe göre sırala (en yeni üstte)
        posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        posts.forEach((post, index) => {
            const item = document.createElement('div');
            item.className = 'dashboard-post-item';
            item.dataset.postId = post.id_string;
            item.dataset.postIndex = index; // Bu index, sıralanmış `posts` dizisindeki index olacak

            let imageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.blog_name || 'T')}&background=random&size=150`;
            let postTitleText = post.summary || post.slug || `Gönderi ID: ${post.id_string}`;
            let postSummaryHtml = '<p class="italic text-sm">İçerik yok.</p>';
            let postFullTextHtml = '';

            if (post.content && Array.isArray(post.content) && post.content.length > 0) { // NPF
                postSummaryHtml = ''; 
                let summaryCollected = false;
                post.content.forEach(block => {
                    if (block.type === 'text') {
                        let textClass = "mb-1";
                        if (block.subtype === 'heading1') textClass += ' text-md font-semibold';
                        else if (block.subtype === 'heading2') textClass += ' text-base font-medium';
                        else if (block.subtype === 'quote') textClass += ' italic border-l-2 pl-2 border-slate-300';
                        
                        const blockTextHtml = `<p class="${textClass}">${block.text.replace(/\n/g, "<br>")}</p>`;
                        if (!summaryCollected && block.text.length > 20) { // İlk anlamlı metni özet yap
                            postSummaryHtml += blockTextHtml;
                            summaryCollected = true;
                        }
                        postFullTextHtml += blockTextHtml;
                        if (!postTitleText || postTitleText.startsWith("Gönderi ID:")) postTitleText = block.text.substring(0,50) + (block.text.length > 50 ? "..." : "");

                    } else if (block.type === 'image' && block.media && block.media.length > 0) {
                        const bestImage = block.media.sort((a, b) => b.width - a.width)[0];
                        if (imageUrl.startsWith('https://ui-avatars.com')) imageUrl = bestImage.url; // Ana görseli ilk NPF image ile değiştir
                        // postFullTextHtml += `<img src="${bestImage.url}" alt="${block.alt_text || 'Gönderi görseli'}" class="max-w-full h-auto rounded my-1 border">`;
                    } else if (block.type === 'link') {
                         const linkHtml = `<p class="mb-1"><a href="${block.url}" target="_blank" class="text-indigo-600 hover:underline">${block.display_url || block.url}</a></p>`;
                         if (!summaryCollected) postSummaryHtml += linkHtml;
                         postFullTextHtml += linkHtml;
                         if (block.title) postFullTextHtml += `<p class="text-sm text-slate-600 font-medium">${block.title}</p>`;
                         if (block.description) postFullTextHtml += `<p class="text-xs text-slate-500">${block.description}</p>`;
                    }
                });
                if(postSummaryHtml === '') postSummaryHtml = '<p class="italic text-sm">Özet bulunamadı.</p>';

            } else { // Eski Format Fallback
                if (post.type === 'photo' && post.photos && post.photos.length > 0) {
                    imageUrl = post.photos[0].alt_sizes?.find(s => s.width >= 250)?.url || post.photos[0].original_size?.url || imageUrl;
                    postSummaryHtml = post.caption ? post.caption.replace(/\n/g, "<br>").substring(0, 150) + (post.caption.length > 150 ? '...' : '') : '';
                    postFullTextHtml = post.caption ? post.caption.replace(/\n/g, "<br>") : '';
                } else if (post.type === 'text') {
                    postSummaryHtml = post.body ? post.body.replace(/\n/g, "<br>").substring(0, 150) + (post.body.length > 150 ? '...' : '') : '';
                    postFullTextHtml = post.body ? post.body.replace(/\n/g, "<br>") : '';
                    if(post.title) postTitleText = post.title;
                } else if (post.type === 'quote') {
                    const quoteHtml = `<blockquote class="italic border-l-2 pl-2 border-slate-300">"${post.text}"</blockquote><cite class="text-sm">- ${post.source || ''}</cite>`;
                    postSummaryHtml = quoteHtml; postFullTextHtml = quoteHtml;
                }
            }
            if (imageUrl.startsWith('https://ui-avatars.com') && post.trail && post.trail.length > 0 && post.trail[0].blog && post.trail[0].blog.avatar_url_128) {
                imageUrl = post.trail[0].blog.avatar_url_128;
            }


            item.innerHTML = `
                <div class="post-checkbox-container">
                    <input type="checkbox" class="form-checkbox h-5 w-5 text-indigo-600 rounded dashboard-post-select" ${previouslyCheckedPostIds.has(post.id_string) ? 'checked' : ''}>
                </div>
                <img src="${imageUrl}" alt="Gönderi Ana Görseli" class="post-thumbnail">
                <div class="post-content-details flex flex-col flex-grow">
                    <p class="post-title" title="${postTitleText.replace(/"/g, '&quot;')}">${postTitleText}<span class="post-type-badge">${post.type}</span></p>
                    <div class="post-summary-text custom-scroll">${postSummaryHtml || '<p class="italic text-sm">İçerik yok.</p>'}</div>
                    <div class="post-full-text-container custom-scroll">${postFullTextHtml || ''}</div>
                    <p class="post-blog-info mt-auto">Blog: <strong>${post.blog_name || 'Bilinmeyen'}</strong> | ${new Date((post.timestamp || 0) * 1000).toLocaleDateString()} | Not: ${post.note_count || 0}</p>
                </div>
            `;
            const checkbox = item.querySelector('.dashboard-post-select');
            checkbox.addEventListener('change', () => {
                // `post` objesi bu scope'ta `posts` dizisinden gelen güncel obje olmalı.
                // Ya da `allFetchedDashboardPosts` Map'inden ID ile tekrar almalıyız.
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
        
        // Seçili postların listesini güncelle (render sonrası checkbox durumları değişmiş olabilir)
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
        if (posts.length > 0 && selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'inline-block';
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
                if (cb.checked === allCurrentlySelected) cb.checked = !allCurrentlySelected; 
                else cb.checked = true; 
                cb.dispatchEvent(new Event('change'));
            });
        });
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
        logAction(`Adım 2: ${selectedDashboardPostsData.length} gönderinin notları işleniyor...`, "info");

        if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = true;
        if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'none';
        if(goToStep3Button) goToStep3Button.style.display = 'none';
        if(step2ProgressBar) updateProgressBar(step2ProgressBar, 0);
        if(suggestedUsersList) suggestedUsersList.innerHTML = '<p class="text-slate-400 italic text-center py-4">Bloglar bulunuyor...</p>';
        potentialFollowTargets.clear(); selectedUsersToProcessFromStep2.clear(); // Her seferinde sıfırla

        const selectedFilterIndex = parseInt(lastActiveFilterInput.value);
        const maxDaysOldFilter = LAST_ACTIVE_SLIDER_VALUES[selectedFilterIndex]?.value; // Gün cinsinden
        logAction(`Aktiflik filtresi: ${LAST_ACTIVE_SLIDER_VALUES[selectedFilterIndex]?.label}`, "system");

        let processedPostCount = 0;
        for (const selectedPost of selectedDashboardPostsData) {
            if (!isProcessingStep) break;
            logAction(`"${selectedPost.blog_name}" / "${selectedPost.id_string}" notları çekiliyor...`, "info");
            try {
                const notesData = await executeApiActionForModule('getPostNotes', {
                    blog_identifier: selectedPost.blog_name,
                    post_id: selectedPost.id_string,
                    mode: 'all', 
                });

                if (notesData && notesData.notes && notesData.notes.length > 0) {
                    const notesToConsider = notesData.notes.slice(0, 100); 
                    logAction(` -> ${notesToConsider.length} not işlenecek.`, "debug");
                    for (const note of notesToConsider) {
                        if (!isProcessingStep) break;
                        const blogNameFromNote = note.blog_name;
                        if (blogNameFromNote && blogNameFromNote.toLowerCase() !== (selectedAppUsernameForModule.split('_')[0] || "").toLowerCase() && !potentialFollowTargets.has(blogNameFromNote)) {
                            try {
                                // Takip durumu ve temel blog bilgisi için API çağrısı
                                // Bu eylemin server.js'de 'followingStatusHandler.getBlogFollowingStatus'u çağırması lazım
                                const blogStatusData = await executeApiActionForModule('getBlogFollowingStatus', { blog_identifier: blogNameFromNote });
                                
                                if (blogStatusData) { // API'den blog bilgisi ve takip durumu geldi
                                    const blog = blogStatusData; // API yanıtı doğrudan beklenen obje ise
                                    const lastUpdatedTimestamp = blog.updated; 
                                    if (maxDaysOldFilter > 0 && lastUpdatedTimestamp) {
                                        const blogAgeDays = (Date.now() / 1000 - lastUpdatedTimestamp) / (60 * 60 * 24);
                                        if (blogAgeDays > maxDaysOldFilter) {
                                            logAction(` -> "${blogNameFromNote}" aktiflik filtresine takıldı (${Math.floor(blogAgeDays)}g > ${maxDaysOldFilter}g). Atlanıyor.`, "debug");
                                            continue;
                                        }
                                    }

                                    let canAddToList = false;
                                    let isSelectable = true;
                                    let frameColorClass = ''; // Tailwind veya özel CSS sınıfı

                                    // Kriterlere göre kontrol
                                    if (blog.is_following_me && !blog.am_i_following_them) { // Sadece o sizi takip ediyor
                                        canAddToList = true;
                                        isSelectable = false;
                                        frameColorClass = 'frame-green';
                                    } else if (!blog.is_following_me && blog.am_i_following_them) { // Sadece siz onu takip ediyorsunuz
                                        canAddToList = false; // Listeye eklenmeyecek
                                    } else if (!blog.is_following_me && !blog.am_i_following_them) { // Karşılıklı takip yok
                                        canAddToList = true;
                                        isSelectable = true;
                                        // frameColorClass = ''; // Varsayılan
                                    } else if (blog.is_following_me && blog.am_i_following_them) { // Karşılıklı takipleşiyorsunuz
                                        canAddToList = true; // Veya isteğe bağlı olarak eklenmeyebilir
                                        isSelectable = true; 
                                        frameColorClass = 'frame-blue';
                                    }
                                    
                                    if (canAddToList) {
                                        const avatarUrl = blog.avatar || `https://api.tumblr.com/v2/blog/${blog.name}/avatar/96`; // API'den gelen avatarı kullan
                                        potentialFollowTargets.set(blogNameFromNote, {
                                            name: blog.name, title: blog.title || blog.name, url: blog.url,
                                            avatar: avatarUrl, updated: lastUpdatedTimestamp, 
                                            posts: blog.posts, description: blog.description || "",
                                            isSelectable: isSelectable,
                                            frameColorClass: frameColorClass,
                                            is_following_me: blog.is_following_me,
                                            am_i_following_them: blog.am_i_following_them
                                        });
                                        logAction(`Potansiyel blog: ${blogNameFromNote} (Takip durumu: Siz:${blog.am_i_following_them}, O:${blog.is_following_me})`, "success");
                                    }
                                }
                            } catch (userError) {
                                logAction(`"${blogNameFromNote}" blog/takip bilgisi çekme hatası: ${userError.message}`, "error");
                            }
                            if (isProcessingStep) await delay(200); 
                        }
                    }
                    renderSuggestedUsers(); 
                } else {
                    logAction(`"${selectedPost.id_string}" için not bulunamadı.`, "info");
                }
            } catch (error) {
                logAction(`"${selectedPost.id_string}" notları çekme hatası: ${error.message}`, "error");
                 if (error.isUserError && error.type === "auth") { isProcessingStep = false; if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = false; return; }
            }
            processedPostCount++;
            if(step2ProgressBar) updateProgressBar(step2ProgressBar, (processedPostCount / selectedDashboardPostsData.length) * 100);
            if (isProcessingStep) await delay(300); 
        }
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
                    <p class="text-sm font-semibold text-slate-800 truncate" title="${user.title.replace(/"/g, '&quot;')}">${user.title}</p>
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
         if (followAndLikeButton) {
            const selectableUserCount = Array.from(potentialFollowTargets.values()).filter(u => u.isSelectable && selectedUsersToProcessFromStep2.has(u.name)).length;
            followAndLikeButton.disabled = selectableUserCount === 0;
            followAndLikeButton.textContent = selectableUserCount > 0 ?
                `${selectableUserCount} Blogu Takip Et ve Beğen` :
                "Takip Edilecek Seçili Blog Yok";
        }
    }

    function displaySelectedUserDetails(blogName) {
        const user = potentialFollowTargets.get(blogName);
        if (user && selectedUserAvatar && selectedUserName && selectedUserUrl && selectedUserLastActive && selectedUserPostCount && selectedUserDescription && selectedUserDetailsPanel) {
            selectedUserAvatar.src = user.avatar.includes('/avatar/') ? user.avatar.replace(/avatar\/\d+/, 'avatar/128') : user.avatar;
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

    async function followAndLikeSelectedTargets() {
        const usersToActuallyProcess = Array.from(selectedUsersToProcessFromStep2)
            .map(name => potentialFollowTargets.get(name))
            .filter(user => user && user.isSelectable);

        if (usersToActuallyProcess.length === 0) {logAction("Takip edilecek geçerli blog seçilmedi.", "warn"); return;}
        if (isProcessingStep) { logAction("Zaten bir işlem devam ediyor.", "warn"); return; }
        isProcessingStep = true;
        logAction(`Adım 3: ${usersToActuallyProcess.length} blog için takip/beğeni...`, "info");
        if(followAndLikeButton) followAndLikeButton.disabled = true;
        if(step3ProgressBar) updateProgressBar(step3ProgressBar, 0);

        let totalFollowed = 0, totalLikedPosts = 0, processedUserCount = 0;
        const likesPerUserCount = parseInt(likesPerUserSliderInput.value);

        for (const userBlog of usersToActuallyProcess) {
            if (!isProcessingStep) break;
             if (!userBlog || !userBlog.url) {logAction(`"${userBlog.name}" URL yok, atlandı.`, "warn"); processedUserCount++; continue;}

            logAction(`"${userBlog.name}" takip ediliyor...`, "info");
            try {
                // Sadece siz onu takip etmiyorsanız takip etmeyi deneyin (API zaten hata verebilir ama ön kontrol)
                if (!userBlog.am_i_following_them) {
                    await executeApiActionForModule('followTumblrBlog', { blog_url: userBlog.url });
                    totalFollowed++;
                    logAction(`"${userBlog.name}" takip edildi.`, "success");
                    if(followedCountSpan) followedCountSpan.textContent = totalFollowed;
                    // Takip sonrası durumu güncelle (isteğe bağlı, anlık yansıma için)
                    const updatedUser = potentialFollowTargets.get(userBlog.name);
                    if(updatedUser) updatedUser.am_i_following_them = true;
                } else {
                     logAction(`"${userBlog.name}" zaten takip ediliyor, atlandı.`, "info");
                }


                if (likesPerUserCount > 0) {
                    logAction(`"${userBlog.name}" için ${likesPerUserCount} orijinal gönderi beğenilecek...`, "info");
                    let likedForThisUser = 0, offset = 0;
                    const postsToFetchPerBatch = Math.max(5, likesPerUserCount + 3); 

                    while (likedForThisUser < likesPerUserCount) {
                        if (!isProcessingStep) break;
                        try {
                            const data = await executeApiActionForModule('getBlogOriginalPosts', {
                                blog_identifier: userBlog.name, limit: postsToFetchPerBatch, offset: offset
                            }, false); 

                            if (data && data.posts && data.posts.length > 0) {
                                for (const post of data.posts) {
                                    if (!isProcessingStep || likedForThisUser >= likesPerUserCount) break;
                                    if (post.blog_name === userBlog.name && post.id_string && post.reblog_key) {
                                        logAction(` -> "${post.id_string}" beğeniliyor (${userBlog.name})...`, "debug");
                                        try {
                                            // Beğenmeden önce zaten beğenilip beğenilmediğini kontrol etmek ideal olurdu, ama API bunu sağlamıyor olabilir.
                                            await executeApiActionForModule('likeTumblrPost', {
                                                post_id: post.id_string, reblog_key: post.reblog_key
                                            });
                                            likedForThisUser++; totalLikedPosts++;
                                            logAction(` -> "${post.id_string}" beğenildi.`, "success");
                                            if(likedPostsCountStep3Span) likedPostsCountStep3Span.textContent = totalLikedPosts;
                                        } catch (likeError) { 
                                            logAction(` -> "${post.id_string}" beğenme hatası: ${likeError.message}`, "error");
                                            // Eğer "already liked" hatası ise sayacı artırabilir veya görmezden gelebiliriz.
                                            if (likeError.message && likeError.message.toLowerCase().includes('already liked')) {
                                                // Bu durumda da beğenilmiş sayılabilir.
                                            }
                                        }
                                        if (isProcessingStep) await delay(300 + Math.random() * 200); // Beğeniler arası biraz daha rastgele bekleme
                                    }
                                }
                                if (data.posts.length < postsToFetchPerBatch || offset > 100) { 
                                    logAction(`"${userBlog.name}" için daha fazla orijinal gönderi bulunamadı veya limite ulaşıldı.`, "info"); break;
                                }
                                offset += postsToFetchPerBatch;
                            } else { logAction(`"${userBlog.name}" için orijinal gönderi yok (offset: ${offset}).`, "info"); break; }
                        } catch (fetchErr) {
                            logAction(`"${userBlog.name}" orijinal gönderi çekme hatası: ${fetchErr.message}`, "error");
                             if (fetchErr.isUserError && fetchErr.type === "auth") { isProcessingStep = false; if(followAndLikeButton) followAndLikeButton.disabled = false; return; }
                            break;
                        }
                         if (isProcessingStep) await delay(300); 
                    }
                }
            } catch (followError) {
                logAction(`"${userBlog.name}" takip hatası: ${followError.message}`, "error");
                if (followError.isUserError && followError.type === "auth") { isProcessingStep = false; if(followAndLikeButton) followAndLikeButton.disabled = false; return; }
            }
            processedUserCount++;
            if(step3ProgressBar) updateProgressBar(step3ProgressBar, (processedUserCount / usersToActuallyProcess.length) * 100);
            if (isProcessingStep) await delay(1000 + Math.random() * 500); // Kullanıcılar arası daha uzun ve rastgele bekleme
        }
        logAction(`Adım 3 tamamlandı. ${totalFollowed} blog takip edildi, ${totalLikedPosts} gönderi beğenildi.`, "system_success");
        isProcessingStep = false;
        // Kullanıcı limitlerini tekrar çekip göstermek iyi olabilir.
        try {
            const limitsData = await executeApiActionForModule('getUserLimits', {});
            if (limitsData) displayUserLimits(limitsData);
        } catch (error) { logAction(`Kullanıcı limitleri güncellenemedi: ${error.message}`, "warn"); }
        
        // İşlem sonrası potansiyel kullanıcı listesini yenile (takip durumları değişmiş olabilir)
        renderSuggestedUsers(); 
        if(followAndLikeButton) followAndLikeButton.disabled = false; // Ya da işlem sonrası pasif kalsın.
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
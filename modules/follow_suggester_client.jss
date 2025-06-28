// modules/follow_suggester_client.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('[FollowSuggester] DOM Yüklendi.');

    // --- Element Tanımlamaları ---
    const moduleUserSelector = document.getElementById('moduleUserSelector');
    const noUserSelectedWarning = document.getElementById('noUserSelectedWarning');

    const userLimitsContainer = document.getElementById('userLimitsContainer');
    const followLimitText = document.getElementById('followLimitText');
    const followLimitProgressBar = document.getElementById('followLimitProgressBar');
    const followResetText = document.getElementById('followResetText');
    const likeLimitText = document.getElementById('likeLimitText');
    const likeLimitProgressBar = document.getElementById('likeLimitProgressBar');
    const likeResetText = document.getElementById('likeResetText');

    const step1Container = document.getElementById('step1Container');
    const fetchDashboardButton = document.getElementById('fetchDashboardButton');
    const stopFetchingButton = document.getElementById('stopFetchingButton');
    const fetchedPostCountSpan = document.getElementById('fetchedPostCount');
    const selectAllStep1PostsButton = document.getElementById('selectAllStep1PostsButton');
    const dashboardPostsContainer = document.getElementById('dashboardPostsContainer');
    const goToStep2Button = document.getElementById('goToStep2Button');

    const step2Container = document.getElementById('step2Container');
    const step2ProgressBarElement = document.getElementById('step2ProgressBar');
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
    const step3ProgressBarElement = document.getElementById('step3ProgressBar');
    const likesPerUserSliderInput = document.getElementById('likesPerUserSlider');
    const likesPerUserValueSpan = document.getElementById('likesPerUserValue');
    const followAndLikeButton = document.getElementById('followAndLikeButton');
    const followedCountSpan = document.getElementById('followedCount');
    const likedPostsCountStep3Span = document.getElementById('likedPostsCountStep3');

    const actionLogArea = document.getElementById('actionLogArea');

    let selectedAppUsernameForModule = null;
    let allFetchedDashboardPosts = new Map();
    let selectedDashboardPostsData = [];
    let potentialFollowTargets = new Map();
    let selectedUsersToProcessFromStep2 = new Set();
    let isProcessingStep1 = false;
    let isProcessingStep2 = false;
    let isProcessingStep3 = false;
    let stopFetchingFlag = false;
    let currentDetailedUser = null;
    let lastFetchedSinceIdForDashboard = null;

    const LAST_ACTIVE_SLIDER_VALUES = [
        { value: 0, label: "Limitsiz" }, { value: 0.25, label: "Son 6 Saat" },
        { value: 1, label: "Son 1 Gün" }, { value: 3, label: "Son 3 Gün" },
        { value: 7, label: "Son 1 Hafta" }
    ];
    if (lastActiveFilterInput) lastActiveFilterInput.max = LAST_ACTIVE_SLIDER_VALUES.length - 1;

    // --- Tüm Yardımcı Fonksiyonlar ---
    function logAction(message, type = 'info') {
        if (!actionLogArea) { console.warn("actionLogArea bulunamadı!"); return; }
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const logEntry = document.createElement('div');
        const typeClass = `log-${type.toLowerCase().replace(/\s+/g, '_')}`;
        logEntry.innerHTML = `<span class="log-time">[${timeString}]</span> <span class="log-type ${typeClass}">${type.toUpperCase()}:</span> ${message}`;
        actionLogArea.appendChild(logEntry);
        actionLogArea.scrollTop = actionLogArea.scrollHeight;
        if (type !== 'debug') console.log(`[FollowSuggester Log] ${type}: ${message}`);
    }

    function updateProgressBar(barElement, percentage, text = null) {
        if (!barElement) return;
        percentage = Math.max(0, Math.min(100, percentage));
        barElement.style.width = `${percentage}%`;
        if (text !== null && barElement.classList.contains('progress-bar')) {
            barElement.textContent = text;
        }
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
            throw { message: "Bu işlem için bir hesap seçimi gereklidir.", isUserError: true, type: "auth" };
        }
        const requestBody = { actionId: actionId, params: params };
        if (needsAuth) requestBody.appUsername = selectedAppUsernameForModule;

        const response = await fetch('/api/execute-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const result = await response.json();
        if (!response.ok || result.error) {
            const errorType = response.status === 401 ? "auth" : "api";
            const errorDetailMsg = (result.details && Array.isArray(result.details) && result.details.length > 0 && result.details[0].detail) ? result.details[0].detail : '';
            const errorMessage = result.error || result.message || errorDetailMsg || `API eylemi '${actionId}' hatası (${response.status})`;
            console.error(`API Error for ${actionId}:`, result); // Hata detayını konsola yazdır
            throw { message: errorMessage, isUserError: true, type: errorType, details: result.details };
        }
        return result.data;
    }
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    function displayUserLimits(userApiData) {
        if (!userLimitsContainer || !userApiData) {
            if (userLimitsContainer) userLimitsContainer.style.display = 'none';
            return;
        }
        const knownDailyFollowLimit = 200;
        const knownDailyLikeLimit = 1000;

        if (userApiData.follows && followLimitText && followLimitProgressBar) {
            const fInfo = userApiData.follows;
            const remainingF = typeof fInfo.remaining === 'number' ? parseInt(fInfo.remaining, 10) : knownDailyFollowLimit;
            const limitF = parseInt(fInfo.limit, 10) || knownDailyFollowLimit;
            const usedF = limitF - remainingF;
            const percentF = limitF > 0 ? (usedF / limitF) * 100 : 0;
            
            followLimitText.textContent = `${remainingF} kaldı / ${limitF}`;
            updateProgressBar(followLimitProgressBar, percentF);
            if (followResetText) {
                if (fInfo.reset_at) {
                    followResetText.textContent = `Sıfırlanma: ~${new Date(fInfo.reset_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                } else { followResetText.textContent = "";}
            }
        } else { 
            if (followLimitText) followLimitText.textContent = `? / ${knownDailyFollowLimit}`;
            if (followLimitProgressBar) updateProgressBar(followLimitProgressBar, 0);
            if (followResetText) followResetText.textContent = "";
        }

        if (userApiData.likes && userApiData.likes.hasOwnProperty('remaining') && likeLimitText && likeLimitProgressBar) { 
             const lInfo = userApiData.likes;
             const remainingL = parseInt(lInfo.remaining, 10);
             const limitL = parseInt(lInfo.limit, 10) || knownDailyLikeLimit;
             const usedL = limitL - remainingL;
             const percentL = limitL > 0 ? (usedL / limitL) * 100 : 0;
             likeLimitText.textContent = `${remainingL} kaldı / ${limitL}`;
             updateProgressBar(likeLimitProgressBar, percentL);
             if (likeResetText) {
                if (lInfo.reset_at) {
                    likeResetText.textContent = `Sıfırlanma: ~${new Date(lInfo.reset_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                } else { likeResetText.textContent = ""; }
             }
        } else { 
            if (likeLimitText) likeLimitText.textContent = `? kaldı / ${knownDailyLikeLimit}`;
            if (likeLimitProgressBar) updateProgressBar(likeLimitProgressBar, 0);
            if (likeResetText) likeResetText.textContent = "";
        }
        if (userLimitsContainer) userLimitsContainer.style.display = 'block';
    }
    
    if (moduleUserSelector) {
        moduleUserSelector.addEventListener('change', async function() {
            selectedAppUsernameForModule = this.value;
            if (userLimitsContainer) userLimitsContainer.style.display = 'none';
            resetModuleState(!selectedAppUsernameForModule);

            if (selectedAppUsernameForModule) {
                if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'none';
                if(fetchDashboardButton) fetchDashboardButton.disabled = false;
                logAction(`Hesap seçildi: ${selectedAppUsernameForModule}. Limitler yükleniyor...`, "system");
                if(step1Container) step1Container.style.display = 'block';
                lastFetchedSinceIdForDashboard = null; 

                try {
                    const limitsData = await executeApiActionForModule('getUserLimits', {});
                    if (limitsData) displayUserLimits(limitsData);
                } catch (error) {
                    logAction(`Kullanıcı limitleri çekilemedi: ${error.message}`, "error");
                }
            } else {
                if(noUserSelectedWarning) noUserSelectedWarning.style.display = 'block';
                if(fetchDashboardButton) fetchDashboardButton.disabled = true;
            }
        });
    }
    
    function resetModuleState(fullReset = true) {
        stopFetchingFlag = false; 
        isProcessingStep1 = false; isProcessingStep2 = false; isProcessingStep3 = false;
        lastFetchedSinceIdForDashboard = null; 

        if (fullReset && userLimitsContainer) userLimitsContainer.style.display = 'none';
        
        allFetchedDashboardPosts.clear(); selectedDashboardPostsData = [];
        if(dashboardPostsContainer) dashboardPostsContainer.innerHTML = '<p class="text-slate-400 italic p-4 text-center">Gönderiler burada listelenecek.</p>';
        if(fetchedPostCountSpan) fetchedPostCountSpan.textContent = "0 gönderi";
        if(goToStep2Button) goToStep2Button.style.display = 'none';
        if(selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'none';
        if(stopFetchingButton) stopFetchingButton.style.display = 'none';
        if(fetchDashboardButton) { fetchDashboardButton.textContent = "Panel Gönderilerini Çekmeye Başla"; fetchDashboardButton.disabled = !selectedAppUsernameForModule;}

        if(step1Container && !fullReset && selectedAppUsernameForModule) step1Container.style.display = 'block';
        else if(step1Container) step1Container.style.display = 'none';

        potentialFollowTargets.clear(); selectedUsersToProcessFromStep2.clear();
        if(suggestedUsersList) suggestedUsersList.innerHTML = '<p class="text-slate-400 italic p-4 text-center">Bloglar Adım 2\'de burada listelenecek.</p>';
        if(selectedUserDetailsPanel) selectedUserDetailsPanel.style.display = 'none'; currentDetailedUser = null;
        if(step2ProgressBarElement) updateProgressBar(step2ProgressBarElement, 0, "0%");
        if (lastActiveFilterInput) lastActiveFilterInput.value = LAST_ACTIVE_SLIDER_VALUES.length - 1;
        updateLastActiveFilterDisplay();
        if(goToStep3Button) goToStep3Button.style.display = 'none';
        if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'none';
        if(step2Container) step2Container.style.display = 'none';

        if(likesPerUserSliderInput) likesPerUserSliderInput.value = 2; updateLikesPerUserDisplay();
        if(step3ProgressBarElement) updateProgressBar(step3ProgressBarElement, 0, "0%");
        if(followedCountSpan) followedCountSpan.textContent = '0';
        if(likedPostsCountStep3Span) likedPostsCountStep3Span.textContent = '0';
        if(step3Container) step3Container.style.display = 'none';

        if (findSuggestedUsersButton) findSuggestedUsersButton.disabled = true;
        if (followAndLikeButton) followAndLikeButton.disabled = true;
    }

    // --- Adım 1 Fonksiyonları ---
    async function fetchDashboardPostsForSelection() {
        if (isProcessingStep1) { logAction("Zaten bir gönderi çekme işlemi devam ediyor.", "warn"); return; }
        isProcessingStep1 = true;
        stopFetchingFlag = false;
        logAction("Adım 1: Panel gönderileri çekilmeye başlanıyor...", "info");
        if(fetchDashboardButton) {fetchDashboardButton.textContent = "Çekiliyor..."; fetchDashboardButton.disabled = true;}
        if(stopFetchingButton) stopFetchingButton.style.display = 'inline-block';
        if(selectAllStep1PostsButton && allFetchedDashboardPosts.size > 0) selectAllStep1PostsButton.style.display = 'inline-block'; else if(selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'none';
        updateStep2ButtonVisibility();
        
        if (allFetchedDashboardPosts.size === 0 && dashboardPostsContainer) {
             dashboardPostsContainer.innerHTML = '<p class="text-slate-400 italic text-center py-4">Gönderiler yükleniyor...</p>';
        }
        
        const postsPerBatch = 20;
        let batchesWithoutNewPosts = 0;

        while (!stopFetchingFlag) {
            logAction(`Panel gönderi grubu çekiliyor... (Since ID: ${lastFetchedSinceIdForDashboard || 'ilk istek'})`, "debug");
            try {
                const params = { limit: postsPerBatch, notes_info: true, reblog_info: true, npf: true };
                if (lastFetchedSinceIdForDashboard) params.since_id = lastFetchedSinceIdForDashboard;

                const data = await executeApiActionForModule('getDashboardPosts', params);

                if (data && data.posts && data.posts.length > 0) {
                    let newPostsAddedThisBatch = 0;
                    data.posts.reverse().forEach(post => { 
                        if (!allFetchedDashboardPosts.has(post.id_string)) {
                            allFetchedDashboardPosts.set(post.id_string, post);
                            renderSingleDashboardPost(post, true); 
                            newPostsAddedThisBatch++;
                        }
                    });
                    
                    if (newPostsAddedThisBatch > 0) {
                        if (fetchedPostCountSpan) fetchedPostCountSpan.textContent = `${allFetchedDashboardPosts.size} gönderi`;
                        // API'den gelen postlar en yeniden eskiye doğru ise, reverse() sonrası listenin son elemanı en yeni olur.
                        // Bu ID, bir sonraki since_id olmalı.
                        lastFetchedSinceIdForDashboard = data.posts[data.posts.length-1].id_string; 
                        batchesWithoutNewPosts = 0;
                        logAction(`${newPostsAddedThisBatch} yeni gönderi eklendi. Toplam: ${allFetchedDashboardPosts.size}. Son ID: ${lastFetchedSinceIdForDashboard}`, "info");
                    } else {
                        logAction("Bu sorguda yeni gönderi bulunamadı (muhtemelen hepsi daha önce çekilmiş).", "info");
                        batchesWithoutNewPosts++;
                    }

                    if (data.posts.length < postsPerBatch && !params.since_id) {
                         logAction("Panelin sonuna ulaşıldı (ilk istekte az gönderi).", "info");
                    }
                    if (batchesWithoutNewPosts >= 3 && newPostsAddedThisBatch === 0 && data.posts.length === 0) { // API 3 kez boş döndüyse
                        logAction("API bir süredir hiç gönderi döndürmüyor. Çekme durduruluyor.", "warn");
                        stopFetchingFlag = true; 
                    } else if (batchesWithoutNewPosts >= 5) { // Ya da 5 kez YENİ post gelmezse
                        logAction("Bir süredir YENİ gönderi gelmiyor, 10sn duraklatılıyor.", "warn");
                        await delay(10000); 
                        batchesWithoutNewPosts = 0; 
                    }
                } else { 
                    logAction("Bu sorguda gönderi bulunamadı veya API yanıtı boş.", "info");
                    batchesWithoutNewPosts++;
                    if (batchesWithoutNewPosts >= 3) { 
                        logAction("API bir süredir hiç gönderi döndürmüyor. Çekme durduruluyor.", "warn");
                        stopFetchingFlag = true;
                    }
                }
            } catch (error) {
                logAction(`Panel gönderileri çekilirken hata: ${error.message}`, "error");
                if (error.isUserError && error.type === "auth") { stopFetchingFlag = true; }
                break; 
            }
            if (!stopFetchingFlag) await delay(5000);
        }

        if (stopFetchingFlag) logAction("Gönderi çekme durduruldu.", "system");
        else logAction("Gönderi çekme döngüsü sonlandı.", "system_success");
        
        isProcessingStep1 = false;
        if(fetchDashboardButton) {fetchDashboardButton.textContent = "Panel Gönderilerini Çekmeye Başla"; fetchDashboardButton.disabled = false;}
        if(stopFetchingButton) stopFetchingButton.style.display = 'none';
        if (allFetchedDashboardPosts.size > 0) {
            if(selectAllStep1PostsButton) selectAllStep1PostsButton.style.display = 'inline-block';
            updateStep2ButtonVisibility(); 
        }
    }

    if(stopFetchingButton) {
        stopFetchingButton.addEventListener('click', () => {
            stopFetchingFlag = true;
            logAction("Gönderi çekme işlemi kullanıcı tarafından durduruluyor...", "warn");
        });
    }
    
    function renderSingleDashboardPost(post, prepend = false) {
        if (!dashboardPostsContainer) return;
        const placeholder = dashboardPostsContainer.querySelector('p.italic');
        if (placeholder) placeholder.remove();

        const entry = document.createElement('article');
        entry.className = 'dashboard-post-entry';
        entry.dataset.postId = post.id_string;

        let mainImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.blog_name || 'T')}&background=f8fafc&color=94a3b8&size=600&font-size=0.1&bold=true&format=svg&length=1`;
        let blogAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.blog_name || 'B')}&size=40&background=random&font-size=0.4&format=svg`;
        let postContentRenderedHtml = '<p class="text-gray-500 italic text-sm py-4">Bu gönderi için zengin içerik bulunamadı veya formatı anlaşılamadı.</p>';
        
        if(post.blog?.avatar?.length > 0){
            blogAvatarUrl = post.blog.avatar.find(a => a.width >= 64)?.url || post.blog.avatar[0].url || blogAvatarUrl;
        } else if (post.trail && post.trail.length > 0 && post.trail[0].blog) {
            const originalPosterBlog = post.trail[0].blog;
            if(originalPosterBlog.avatar && originalPosterBlog.avatar.length > 0){
                blogAvatarUrl = originalPosterBlog.avatar.find(a => a.width >= 64)?.url || originalPosterBlog.avatar[0].url || blogAvatarUrl;
            }
        }

        if (post.content && Array.isArray(post.content) && post.content.length > 0) {
            postContentRenderedHtml = '';
            let imageSetForMain = false;
            post.content.forEach(block => {
                switch (block.type) {
                    case 'text':
                        let textClass = "my-1.5";
                        if (block.subtype === 'heading1') textClass += ' text-xl font-bold my-2.5';
                        else if (block.subtype === 'heading2') textClass += ' text-lg font-semibold my-2';
                        else if (block.subtype === 'quote') textClass += ' text-lg italic border-l-4 pl-3 ml-1 my-2 border-slate-300 text-slate-600';
                        else textClass += ' text-base leading-relaxed';
                        
                        let textContent = block.text ? block.text.replace(/\n/g, "<br>") : '';
                        if(block.formatting && textContent){
                            let offset = 0;
                            try { 
                                block.formatting.forEach(fmt => {
                                    const start = fmt.start - offset;
                                    const end = fmt.end - offset;
                                    if (start < 0 || end > textContent.length || start > end) { return; }
                                    const originalText = textContent.substring(start, end);
                                    let formattedText = originalText;
                                    if(fmt.type === 'bold') formattedText = `<strong>${originalText}</strong>`;
                                    else if(fmt.type === 'italic') formattedText = `<em>${originalText}</em>`;
                                    else if(fmt.type === 'strikethrough') formattedText = `<del>${originalText}</del>`;
                                    else if(fmt.type === 'link' && fmt.url) formattedText = `<a href="${fmt.url}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">${originalText}</a>`;
                                    else if(fmt.type === 'mention' && fmt.blog?.url) formattedText = `<a href="${fmt.blog.url}" target="_blank" rel="noopener noreferrer" class="text-teal-600 font-medium hover:underline">${originalText}</a>`;
                                    
                                    textContent = textContent.substring(0, start) + formattedText + textContent.substring(end);
                                    offset += formattedText.length - originalText.length;
                                });
                            } catch (fmtError) { console.error("Formatting error:", fmtError, block.formatting); }
                        }
                        if(block.subtype === 'ordered-list-item' || block.subtype === 'unordered-list-item'){
                            postContentRenderedHtml += `<li class="${textClass} ml-5">${textContent}</li>`;
                        } else {
                            postContentRenderedHtml += `<p class="${textClass}">${textContent}</p>`;
                        }
                        break;
                    case 'image':
                        if (block.media && block.media.length > 0) {
                            const imageMedia = block.media.find(m => m.type && m.type.startsWith("image/")) || block.media[0];
                            if (imageMedia && imageMedia.url) {
                                const displayImage = imageMedia.url; 
                                if (!imageSetForMain) { mainImageUrl = displayImage; imageSetForMain = true; }
                                // İçeriğe de ekle (isteğe bağlı, ana görsel üstte)
                                // postContentRenderedHtml += `<img src="${displayImage}" alt="${block.alt_text || 'Gönderi görseli'}" class="my-2 rounded-md border block mx-auto max-w-md">`;
                            }
                        }
                        break;
                    case 'link':
                         if (block.url) {
                            postContentRenderedHtml += `<div class="my-2 p-3 border rounded bg-slate-50 hover:bg-slate-100 transition-colors"><a href="${block.url}" target="_blank" rel="noopener noreferrer" class="text-indigo-700 hover:underline font-semibold block">${block.title || block.display_url || block.url}</a>`;
                            if (block.description) postContentRenderedHtml += `<p class="text-sm text-slate-600 mt-1">${block.description}</p>`;
                            if(block.poster && block.poster.length > 0 && block.poster[0].url && !imageSetForMain) {
                                mainImageUrl = block.poster[0].url; imageSetForMain = true;
                            }
                            postContentRenderedHtml += `</div>`;
                         }
                         break;
                    case 'video':
                        const videoUrlToEmbed = block.embed_url || block.url || (block.media && block.media[0] ? block.media[0].url : null);
                        if(block.embed_html && block.embed_html.includes("<iframe")){ // embed_html varsa ve iframe içeriyorsa onu kullan
                             postContentRenderedHtml += `<div class="my-2 aspect-video">${block.embed_html}</div>`;
                        } else if(videoUrlToEmbed && block.can_embed_url){ // iframe için
                             postContentRenderedHtml += `<div class="my-2 aspect-video"><iframe src="${videoUrlToEmbed}" frameborder="0" allowfullscreen class="w-full h-full rounded-md"></iframe></div>`;
                        } else if(videoUrlToEmbed) {
                             postContentRenderedHtml += `<p class="my-2"><a href="${videoUrlToEmbed}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">[Video: ${block.provider || 'İzle'}]</a></p>`;
                        }
                        if(block.poster && block.poster.length > 0 && !imageSetForMain && block.poster[0].url){ mainImageUrl = block.poster[0].url; imageSetForMain = true;}
                        break;
                }
            });
        } else { // Eski Format Fallback
            if (post.type === 'photo' && post.photos && post.photos.length > 0) {
                mainImageUrl = post.photos[0].original_size?.url || post.photos[0].alt_sizes?.find(s => s.width >= 500)?.url || mainImageUrl;
                postContentRenderedHtml = post.caption ? post.caption.replace(/\n/g, "<br>") : '';
            } else if (post.type === 'text') {
                postContentRenderedHtml = post.body ? post.body.replace(/\n/g, "<br>") : '';
            } else if (post.type === 'quote') {
                postContentRenderedHtml = `<blockquote class="text-lg italic border-l-4 pl-3 ml-1 my-2 border-slate-400 text-slate-600">"${post.text}"</blockquote><cite class="text-sm block text-right">- ${post.source || ''}</cite>`;
            }
        }
        
        entry.innerHTML = `
            <div class="post-image-area" onclick="this.querySelector('img') ? window.open(this.querySelector('img').src, '_blank') : null">
                <img src="${mainImageUrl}" alt="Gönderi Ana Görseli" onerror="this.style.display='none'; this.parentElement.innerHTML='<p class=\\'text-slate-400 text-xs p-4 text-center\\'>Görsel yüklenemedi.</p>';">
            </div>
            <div class="post-details-area">
                <div class="post-blog-header">
                    <img src="${blogAvatarUrl}" alt="${post.blog_name} avatarı" class="post-blog-avatar">
                    <a href="${post.blog?.url || `https://${post.blog_name}.tumblr.com`}" target="_blank" rel="noopener noreferrer" class="post-blog-name hover:underline">${post.blog_name}</a>
                </div>
                <div class="post-content-render custom-scroll">
                    ${postContentRenderedHtml || '<p class="italic text-sm">İçerik yok.</p>'}
                </div>
            </div>
            <div class="post-selection-checkbox-area">
                 <input type="checkbox" id="select-post-${post.id_string}" class="form-checkbox h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 dashboard-post-select">
                 <label for="select-post-${post.id_string}" class="text-sm text-gray-700 ml-2">Bu gönderiyi bir sonraki adım için seç</label>
            </div>
            <div class="post-meta-footer">
                <div>
                    <span class="post-type-indicator">${post.type}</span>
                    <span class="ml-2">Not: ${post.note_count || 0}</span>
                </div>
                <a href="${post.post_url}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline text-xs">Gönderiye Git &rarr;</a>
            </div>
        `;
        const checkbox = entry.querySelector('.dashboard-post-select');
        checkbox.addEventListener('change', () => {
            const postFromMap = allFetchedDashboardPosts.get(entry.dataset.postId);
            if (!postFromMap) return;
            if (checkbox.checked) {
                entry.classList.add('selected');
                if (!selectedDashboardPostsData.some(p => p.id_string === postFromMap.id_string)) {
                    selectedDashboardPostsData.push(postFromMap);
                }
            } else {
                entry.classList.remove('selected');
                selectedDashboardPostsData = selectedDashboardPostsData.filter(p => p.id_string !== postFromMap.id_string);
            }
            updateStep2ButtonVisibility();
        });
        const clickableAreas = [entry.querySelector('.post-image-area'), entry.querySelector('.post-details-area')];
        clickableAreas.forEach(area => {
            if(area) {
                area.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'IMG' && e.target.type !== 'checkbox' && !e.target.closest('a') && !e.target.closest('label') && !e.target.closest('iframe')) {
                        if (checkbox) { checkbox.checked = !checkbox.checked; checkbox.dispatchEvent(new Event('change'));}
                    }
                });
            }
        });

        if (prepend && dashboardPostsContainer.firstChild) {
            dashboardPostsContainer.insertBefore(entry, dashboardPostsContainer.firstChild);
        } else {
            dashboardPostsContainer.appendChild(entry);
        }
    }
    
    function updateStep2ButtonVisibility() {
        if(!goToStep2Button) return;
        if (selectedDashboardPostsData.length > 0) {
            goToStep2Button.style.display = 'block';
            goToStep2Button.textContent = `Adım 2: ${selectedDashboardPostsData.length} Gönderiden Devam Et →`;
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
                const shouldBeChecked = allCurrentlySelected ? false : true;
                if (cb.checked !== shouldBeChecked) {
                    cb.checked = shouldBeChecked;
                    cb.dispatchEvent(new Event('change'));
                }
            });
        });
    }

    function updateLastActiveFilterDisplay() {
        if (!lastActiveFilterInput || !lastActiveFilterValueSpan) return;
        const selectedIndex = parseInt(lastActiveFilterInput.value);
        lastActiveFilterValueSpan.textContent = LAST_ACTIVE_SLIDER_VALUES[selectedIndex]?.label || "Limitsiz";
    }

    async function processSelectedPostsForNotes() {
        if (selectedDashboardPostsData.length === 0) { logAction("Adım 1'den işlenecek gönderi seçin.", "warn"); return;}
        if (isProcessingStep2) { logAction("Adım 2 işlemi zaten devam ediyor.", "warn"); return; }
        isProcessingStep2 = true;
        logAction(`Adım 2: ${selectedDashboardPostsData.length} gönderinin notları işleniyor...`, "info");

        if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = true;
        if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'none';
        if(goToStep3Button) goToStep3Button.style.display = 'none';
        if(step2ProgressBarElement) updateProgressBar(step2ProgressBarElement, 0, "0% (Notlar)");
        if(suggestedUsersList) suggestedUsersList.innerHTML = '<p class="text-slate-400 italic text-center py-4">Bloglar bulunuyor ve takip durumları kontrol ediliyor...</p>';
        potentialFollowTargets.clear(); selectedUsersToProcessFromStep2.clear();

        const selectedFilterIndex = parseInt(lastActiveFilterInput.value);
        const maxDaysOldFilter = LAST_ACTIVE_SLIDER_VALUES[selectedFilterIndex]?.value;
        logAction(`Aktiflik filtresi: ${LAST_ACTIVE_SLIDER_VALUES[selectedFilterIndex]?.label}`, "system");

        let processedPostCountForProgress = 0;
        const uniqueBlogNamesToQuery = new Set();

        for (const selectedPost of selectedDashboardPostsData) {
            if (stopFetchingFlag || isProcessingStep1) { logAction("Adım 1 aktifken Adım 2 başlatılamaz.", "warn"); isProcessingStep2 = false; if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = false; return; }
            try {
                logAction(`"${selectedPost.id_string}" için notlar çekiliyor...`, "debug");
                const notesData = await executeApiActionForModule('getPostNotes', {
                    blog_identifier: selectedPost.blog_name,
                    post_id: selectedPost.id_string,
                    mode: 'all',
                });
                if (notesData && notesData.notes && notesData.notes.length > 0) {
                     logAction(` -> "${selectedPost.id_string}" için ${notesData.notes.length} not bulundu.`, "debug");
                    notesData.notes.slice(0, 100).forEach(note => {
                        if (note.blog_name && note.blog_name.toLowerCase() !== selectedAppUsernameForModule.split('_')[0].toLowerCase()) {
                            uniqueBlogNamesToQuery.add(note.blog_name);
                        }
                    });
                } else {
                    logAction(` -> "${selectedPost.id_string}" için not bulunamadı.`, "debug");
                }
            } catch (error) { logAction(`"${selectedPost.id_string}" notları çekme hatası: ${error.message}`, "error"); }
            processedPostCountForProgress++;
            if(step2ProgressBarElement) updateProgressBar(step2ProgressBarElement, (processedPostCountForProgress / selectedDashboardPostsData.length) * 50, `${Math.round((processedPostCountForProgress / selectedDashboardPostsData.length) * 50)}% (Notlar)`);
            await delay(150);
        }
        
        logAction(`${uniqueBlogNamesToQuery.size} benzersiz blog bulundu, detayları ve takip durumları çekiliyor...`, "info");
        if (uniqueBlogNamesToQuery.size === 0) {
            logAction("İşlenecek benzersiz blog bulunamadı.", "warn");
            renderSuggestedUsers();
            isProcessingStep2 = false;
            if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = false;
            if(step2ProgressBarElement) updateProgressBar(step2ProgressBarElement, 100, "Tamamlandı");
            return;
        }

        let processedBlogCountForProgress = 0;
        const totalUniqueBlogs = uniqueBlogNamesToQuery.size;

        for (const blogName of uniqueBlogNamesToQuery) {
            if (stopFetchingFlag || isProcessingStep1) break; 
            try {
                logAction(`"${blogName}" için takip durumu ve blog bilgisi çekiliyor...`, "debug");
                const blogDataWithStatus = await executeApiActionForModule('getBlogFollowingStatus', { blog_identifier: blogName });

                if (blogDataWithStatus) {
                    const { name, updated, am_i_following_them, is_following_me } = blogDataWithStatus;
                    
                    if (maxDaysOldFilter > 0 && updated) {
                        const blogAgeDays = (Date.now() / 1000 - updated) / (60 * 60 * 24);
                        if (blogAgeDays > maxDaysOldFilter) {
                            logAction(` -> "${name}" aktiflik filtresine takıldı. Atlanıyor.`, "debug");
                            continue;
                        }
                    }
                    
                    let followStatusClass = ""; let isSelectable = true;
                    if (am_i_following_them && is_following_me) { followStatusClass = "mutual-follow"; isSelectable = false; }
                    else if (am_i_following_them) { followStatusClass = "following-them"; isSelectable = false; }
                    else if (is_following_me) { followStatusClass = "follows-me"; }

                    potentialFollowTargets.set(name, { ...blogDataWithStatus, followStatusClass, isSelectable });
                }
            } catch (error) { logAction(`"${blogName}" blog durumu çekme hatası: ${error.message}`, "error"); }
            
            processedBlogCountForProgress++;
            if(step2ProgressBarElement) updateProgressBar(step2ProgressBarElement, 50 + (processedBlogCountForProgress / totalUniqueBlogs) * 50, `${Math.round(50 + (processedBlogCountForProgress / totalUniqueBlogs) * 50)}% (Blog Info)`);
            await delay(250);
        }

        logAction(`Adım 2 tamamlandı. ${potentialFollowTargets.size} potansiyel blog işlendi.`, "system_success");
        renderSuggestedUsers();
        if (potentialFollowTargets.size > 0) {
            if(goToStep3Button) goToStep3Button.style.display = 'block';
            if(selectAllStep2UsersButton) selectAllStep2UsersButton.style.display = 'inline-block';
        }
        isProcessingStep2 = false;
        if(findSuggestedUsersButton) findSuggestedUsersButton.disabled = false;
    }

    function renderSuggestedUsers() {
        // ... (Bir önceki yanıttaki gibi eksiksiz) ...
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
            item.className = `suggested-user-item ${user.followStatusClass || ''} ${currentDetailedUser === user.name ? 'detailed-view' : ''}`;
            if (!user.isSelectable) item.classList.add('disabled-selection');
            item.dataset.blogName = user.name;

            item.innerHTML = `
                <input type="checkbox" class="form-checkbox h-5 w-5 text-indigo-600 rounded mr-4 user-select-checkbox self-center flex-shrink-0" 
                       data-blog-name="${user.name}" 
                       ${selectedUsersToProcessFromStep2.has(user.name) ? 'checked' : ''} 
                       ${!user.isSelectable ? 'disabled title="Bu blog için işlem önerilmiyor (örn: zaten takip ediliyor)"' : ''}>
                <img src="${user.avatar}" alt="${user.name} avatarı" class="user-avatar flex-shrink-0">
                <div class="ml-1 overflow-hidden flex-grow">
                    <p class="text-base font-semibold text-slate-800 truncate" title="${user.title}">${user.title}</p>
                    <p class="text-sm text-indigo-600 truncate hover:underline"><a href="${user.url}" target="_blank" rel="noopener noreferrer">${user.name}</a></p>
                    <p class="text-xs text-gray-500 mt-0.5">Son aktif: ${user.updated ? new Date(user.updated * 1000).toLocaleDateString() : 'Bilinmiyor'}</p>
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
                const shouldBeChecked = allCurrentlySelected ? false : true;
                if (cb.checked !== shouldBeChecked) {
                    cb.checked = shouldBeChecked;
                    cb.dispatchEvent(new Event('change'));
                }
            });
        });
    }

    function updateFollowAndLikeButtonState() {
         if (followAndLikeButton) {
            const usersToActOnCount = Array.from(selectedUsersToProcessFromStep2).filter(blogName => {
                const target = potentialFollowTargets.get(blogName);
                return target && target.isSelectable && !target.am_i_following_them;
            }).length;

            followAndLikeButton.disabled = usersToActOnCount === 0;
            followAndLikeButton.textContent = usersToActOnCount > 0 ?
                `${usersToActOnCount} Blogu Takip Et ve Beğen` :
                "Takip Edilecek Uygun Blog Seçin";
        }
    }

    function displaySelectedUserDetails(blogName) {
        const user = potentialFollowTargets.get(blogName);
        if (user && selectedUserAvatar && selectedUserName && selectedUserUrl && selectedUserLastActive && selectedUserPostCount && selectedUserDescription && selectedUserDetailsPanel) {
            selectedUserAvatar.src = user.avatar.includes('/avatar/') ? user.avatar.replace(/(\/)\d+(\.pn|\.jp|\.gi|\.we)?g$/, '$1256$2g') : user.avatar;
            selectedUserName.textContent = user.title;
            if(selectedUserUrl) { // Make sure element exists
                selectedUserUrl.href = user.url;
                selectedUserUrl.textContent = user.url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
            }
            selectedUserLastActive.textContent = user.updated ? new Date(user.updated * 1000).toLocaleString() : 'Bilinmiyor';
            selectedUserPostCount.textContent = user.posts?.toLocaleString() || '0';
            selectedUserDescription.innerHTML = user.description ? user.description.replace(/\n/g, '<br>') : '<p class="italic text-gray-500">Açıklama yok.</p>';
            selectedUserDetailsPanel.style.display = 'block';
        } else {
             if(selectedUserDetailsPanel) selectedUserDetailsPanel.style.display = 'none';
        }
    }

    function updateLikesPerUserDisplay() {
        if (likesPerUserSliderInput && likesPerUserValueSpan) {
            likesPerUserValueSpan.textContent = likesPerUserSliderInput.value;
        }
    }

    async function followAndLikeSelectedTargets() {
        const usersToActOn = Array.from(selectedUsersToProcessFromStep2).filter(blogName => {
            const target = potentialFollowTargets.get(blogName);
            return target && target.isSelectable && !target.am_i_following_them;
        });

        if (usersToActOn.length === 0) {logAction("Takip edilecek uygun blog seçilmedi veya hepsi zaten takip ediliyor.", "warn"); return;}
        if (isProcessingStep3) { logAction("Adım 3 işlemi zaten devam ediyor.", "warn"); return; }
        isProcessingStep3 = true;
        logAction(`Adım 3: ${usersToActOn.length} blog için takip/beğeni...`, "info");
        if(followAndLikeButton) followAndLikeButton.disabled = true;
        if(step3ProgressBarElement) updateProgressBar(step3ProgressBarElement, 0, "0%");

        let totalFollowed = 0, totalLikedPosts = 0, processedUserCountInStep3 = 0;
        const likesPerUserCount = parseInt(likesPerUserSliderInput.value);

        for (const blogNameToProcess of usersToActOn) {
            if (stopFetchingFlag || isProcessingStep1 || isProcessingStep2) break;
            const userBlog = potentialFollowTargets.get(blogNameToProcess);
            
            logAction(`"${blogNameToProcess}" takip ediliyor...`, "info");
            try {
                await executeApiActionForModule('followTumblrBlog', { blog_url: userBlog.url });
                totalFollowed++;
                logAction(`"${blogNameToProcess}" takip edildi.`, "success");
                if(followedCountSpan) followedCountSpan.textContent = totalFollowed;
                
                userBlog.am_i_following_them = true;
                if(userBlog.is_following_me) userBlog.followStatusClass = "mutual-follow";
                else userBlog.followStatusClass = "following-them";
                userBlog.isSelectable = false;
                
                if (likesPerUserCount > 0) {
                    logAction(`"${blogNameToProcess}" için ${likesPerUserCount} orijinal gönderi beğenilecek...`, "info");
                    let likedForThisUser = 0, offset = 0;
                    const postsToFetchPerBatch = Math.max(5, likesPerUserCount + 3); 

                    while (likedForThisUser < likesPerUserCount && offset < 100) {
                        if (stopFetchingFlag || isProcessingStep1 || isProcessingStep2) break;
                        try {
                            const data = await executeApiActionForModule('getBlogOriginalPosts', {
                                blog_identifier: blogNameToProcess, limit: postsToFetchPerBatch, offset: offset
                            }, false); 

                            if (data && data.posts && data.posts.length > 0) {
                                for (const post of data.posts) {
                                    if (likedForThisUser >= likesPerUserCount) break;
                                    if (post.blog_name === blogNameToProcess && post.id_string && post.reblog_key) {
                                        try {
                                            await executeApiActionForModule('likeTumblrPost', {
                                                post_id: post.id_string, reblog_key: post.reblog_key
                                            });
                                            likedForThisUser++; totalLikedPosts++;
                                            logAction(` -> "${post.id_string}" beğenildi.`, "success");
                                            if(likedPostsCountStep3Span) likedPostsCountStep3Span.textContent = totalLikedPosts;
                                        } catch (likeError) { logAction(` -> "${post.id_string}" beğenme hatası: ${likeError.message}`, "error");}
                                        await delay(250);
                                    }
                                }
                                if (data.posts.length < postsToFetchPerBatch) { break; }
                                offset += postsToFetchPerBatch;
                            } else { break; }
                        } catch (fetchErr) {
                            logAction(`"${blogNameToProcess}" orijinal gönderi çekme hatası: ${fetchErr.message}`, "error");
                            break;
                        }
                        await delay(200);
                    }
                }
            } catch (followError) {
                logAction(`"${blogNameToProcess}" takip hatası: ${followError.message}`, "error");
            }
            processedUserCountInStep3++;
            if(step3ProgressBarElement) updateProgressBar(step3ProgressBarElement, (processedUserCountInStep3 / usersToActOn.length) * 100, `${Math.round((processedUserCountInStep3 / usersToActOn.length) * 100)}%`);
            await delay(600);
        }
        logAction(`Adım 3 tamamlandı. ${totalFollowed} blog takip edildi, ${totalLikedPosts} gönderi beğenildi.`, "system_success");
        isProcessingStep3 = false;
        renderSuggestedUsers(); 
        updateFollowAndLikeButtonState();
    }
    
    // --- Buton Event Listener'ları ---
    if (fetchDashboardButton) fetchDashboardButton.addEventListener('click', fetchDashboardPostsForSelection);
    
    if (goToStep2Button) {
        goToStep2Button.addEventListener('click', () => {
            if(isProcessingStep1 && !stopFetchingFlag) { 
                logAction("Lütfen önce gönderi çekme işleminin bitmesini veya durdurulmasını bekleyin.", "warn"); 
                return; 
            }
            if(selectedDashboardPostsData.length === 0){
                logAction("Adım 2'ye devam etmek için lütfen en az bir gönderi seçin.", "warn");
                return;
            }
            if(step1Container) step1Container.style.display = 'none';
            if(step2Container) step2Container.style.display = 'block';
            if (findSuggestedUsersButton) findSuggestedUsersButton.disabled = false;
            logAction("Adım 2'ye geçildi.", "info");
        });
    }

    if (findSuggestedUsersButton) findSuggestedUsersButton.addEventListener('click', processSelectedPostsForNotes);
    
    if (goToStep3Button) {
        goToStep3Button.addEventListener('click', () => {
             if(isProcessingStep2) { 
                logAction("Lütfen önce blog bulma işleminin bitmesini bekleyin.", "warn"); 
                return; 
            }
            const usersToActOnCount = Array.from(selectedUsersToProcessFromStep2).filter(blogName => {
                const target = potentialFollowTargets.get(blogName);
                return target && target.isSelectable && !target.am_i_following_them;
            }).length;

            if (usersToActOnCount === 0 && selectedUsersToProcessFromStep2.size > 0) {
                logAction("Seçili bloglar arasında takip edilecek uygun blog bulunmuyor.", "warn");
            } else if (selectedUsersToProcessFromStep2.size === 0) {
                 logAction("Adım 3'e devam etmek için lütfen en az bir blog seçin.", "warn");
                return;
            }

            if(step2Container) step2Container.style.display = 'none';
            if(step3Container) step3Container.style.display = 'block';
            updateFollowAndLikeButtonState();
        });
    }
    if (followAndLikeButton) followAndLikeButton.addEventListener('click', followAndLikeSelectedTargets);

    // --- Slider Event Listener'ları ---
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
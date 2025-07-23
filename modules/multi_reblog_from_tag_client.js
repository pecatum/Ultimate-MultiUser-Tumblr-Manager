document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENT TANIMLAMALARI ---
    const step1Container = document.getElementById('step1Container');
    const step2Container = document.getElementById('step2Container');
    const goToStep2Button = document.getElementById('goToStep2Button');
    const selectionCountStep2 = document.getElementById('selectionCountStep2');

    const tagInputField = document.getElementById('tagInputField');
    const minNoteCountSelect = document.getElementById('minNoteCountSelect');
    const fetchPostsButton = document.getElementById('fetchPostsButton');
    const stopFetchPostsButton = document.getElementById('stopFetchPostsButton');
    const totalFetchedPostsCount = document.getElementById('totalFetchedPostsCount');
    const selectAllPostsButton = document.getElementById('selectAllPostsButton');
    const postsContainer = document.getElementById('postsContainer');
    
    const moduleUserSelectorContainer = document.getElementById('moduleUserSelectorContainer');
    const selectAllUsersButton = document.getElementById('selectAllUsersButton');
    const noUserSelectedWarning = document.getElementById('noUserSelectedWarning');
    const executeActionButton = document.getElementById('executeActionButton');
    const actionProgressBarContainer = document.getElementById('actionProgressBarContainer');
    const actionProgressBar = document.getElementById('actionProgressBar');
    const actionLogArea = document.getElementById('actionLogArea');
        
    const sendModeSelect = document.getElementById('sendModeSelect');
    const workerCountSlider = document.getElementById('workerCountSlider');
    const workerCountValue = document.getElementById('workerCountValue');
    const commonReblogCommentInput = document.getElementById('commonReblogComment');
    const commonReblogTagsInput = document.getElementById('commonReblogTags');
    
    // --- UYGULAMA DURUMU (STATE) ---
    let isScanning = false, isReblogging = false;
    let lastFetchedTimestamp = null;
    let allFetchedPosts = new Map();
    let selectedPostsForReblog = new Set();
    let allAvailableUsers = [];
    let selectedAppUsernames = new Set();
    let reblogDetailsCache = new Map();

    // --- YARDIMCI FONKSİYONLAR ---
    const logAction = (message, type = 'info') => {
        const time = new Date().toLocaleTimeString('tr-TR');
        const typeClasses = { info: 'text-gray-400', success: 'text-green-400', error: 'text-red-400', system: 'text-blue-400', warn: 'text-yellow-400' };
        actionLogArea.innerHTML += `<div><span class="mr-2">${time}</span><span class="${typeClasses[type] || 'text-gray-400'}">${message}</span></div>`;
        actionLogArea.scrollTop = actionLogArea.scrollHeight;
    };

    const makeApiCall = async (actionId, params, appUsername = null) => {
        const body = { actionId, params };
        if (appUsername) body.appUsername = appUsername;
        
        const response = await fetch('/api/execute-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.error || `Sunucu hatası: ${response.status}`);
            error.details = result.details;
            throw error;
        }
        return result.data;
    };

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    const updateProgressBar = (bar, percentage, text = '') => {
        const p = Math.min(100, Math.max(0, percentage));
        bar.style.width = `${p}%`;
        bar.textContent = text || `${Math.round(p)}%`;
    };

    // --- ADIM 1: GÖNDERİ ÇEKME VE LİSTELEME ---
    const startFetchingPosts = async () => {
        if (isScanning) return;
        const tag = tagInputField.value.trim();
        if (!tag) { alert("Lütfen bir etiket girin."); return; }

        isScanning = true;
        fetchPostsButton.hidden = true;
        stopFetchPostsButton.hidden = false;
        if (allFetchedPosts.size === 0) {
            postsContainer.innerHTML = '<p class="text-slate-400 italic p-4 text-center col-span-full">Gönderiler yükleniyor...</p>';
            lastFetchedTimestamp = null;
        }
        logAction(`'${tag}' etiketi için gönderi çekme başlatıldı...`, "system");

        while (isScanning) {
            try {
                const params = { tag, limit: 20, before: lastFetchedTimestamp };
                const posts = await makeApiCall('getTaggedPosts', params, null);

                if (!isScanning) break;

                if (posts && posts.length > 0) {
                    posts.forEach(post => {
                        if (post.id_string && !allFetchedPosts.has(post.id_string) && !post.reblogged_from_id) {
                            allFetchedPosts.set(post.id_string, post);
                        }
                    });
                    lastFetchedTimestamp = posts[posts.length - 1].timestamp;
                    totalFetchedPostsCount.textContent = `Toplam Çekilen: ${allFetchedPosts.size}`;
                    renderPosts();
                } else {
                    logAction("Etiketin sonuna ulaşıldı veya yeni gönderi yok.", "system");
                    stopFetchingPosts();
                    break;
                }
            } catch (error) {
                logAction(`Gönderi çekme hatası: ${error.message}`, "error");
                stopFetchingPosts();
                break;
            }
            await delay(1000);
        }
    };
    
    const stopFetchingPosts = () => {
        if(!isScanning) return;
        isScanning = false;
        fetchPostsButton.hidden = false;
        stopFetchPostsButton.hidden = true;
        logAction("Gönderi çekme durduruldu.", "warn");
    };

    const renderPosts = () => {
        const minNotes = parseInt(minNoteCountSelect.value, 10);
        const filteredPosts = Array.from(allFetchedPosts.values()).filter(post => (post.note_count || 0) >= minNotes);
        
        if (postsContainer.firstChild?.tagName === 'P') postsContainer.innerHTML = '';
        
        if (filteredPosts.length === 0 && allFetchedPosts.size > 0) {
            postsContainer.innerHTML = '<p class="text-slate-400 italic p-4 text-center col-span-full">Filtreye uygun gönderi bulunamadı.</p>';
        }

        filteredPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        // Sadece ekranda olmayan yeni postları ekle
        filteredPosts.forEach(post => {
            if (!document.querySelector(`.dashboard-post-item[data-post-id="${post.id_string}"]`)) {
                postsContainer.prepend(createPostElement(post));
            }
        });
        
        selectAllPostsButton.hidden = allFetchedPosts.size === 0;
    };

    const createPostElement = (post) => {
        const item = document.createElement('div');
        const postId = post.id_string || post.id.toString();
        item.className = 'dashboard-post-item';
        item.dataset.postId = postId;

        let imageUrl = null;
        if (post.photos && post.photos.length > 0) {
            const suitablePhoto = post.photos[0].alt_sizes.find(s => s.width >= 400) || post.photos[0].original_size;
            imageUrl = suitablePhoto ? suitablePhoto.url : null;
        } else if (post.type === 'photo' && post.image_permalink) {
            imageUrl = post.image_permalink;
        } else if (post.type === 'video' && post.thumbnail_url) {
            imageUrl = post.thumbnail_url;
        }

        const postSummaryHtml = post.summary || post.caption || (post.trail && post.trail[0] && post.trail[0].content_raw) || '<p class="italic">İçerik özeti yok.</p>';

        item.innerHTML = `
            <div class="post-checkbox-container"><input type="checkbox" class="form-checkbox h-5 w-5 dashboard-post-select" data-post-id="${postId}"></div>
            <div class="post-thumbnail-container">
                ${imageUrl ? `<img src="${imageUrl}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'post-thumbnail-placeholder\\'>${post.type}</div>';">` : `<div class="post-thumbnail-placeholder">${post.type}</div>`}
            </div>
            <div class="post-summary-text custom-scroll">${postSummaryHtml}</div>
            <div class="post-blog-info">
                <span><strong>${post.blog_name || 'Bilinmeyen'}</strong></span>
                <span>Not: <strong>${(post.note_count || 0).toLocaleString()}</strong></span>
                <a href="${post.post_url}" target="_blank" class="text-indigo-500 hover:underline">Gönderi</a>
            </div>
        `;

        const checkbox = item.querySelector('.dashboard-post-select');
        checkbox.addEventListener('change', () => handlePostSelection(postId, checkbox.checked, item));
        item.addEventListener('click', e => {
            if (e.target.type !== 'checkbox' && e.target.tagName !== 'A') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        return item;
    };

    const handlePostSelection = (postId, isChecked, itemElement) => {
        if (isChecked) {
            selectedPostsForReblog.add(postId);
            itemElement.classList.add('selected');
        } else {
            selectedPostsForReblog.delete(postId);
            itemElement.classList.remove('selected');
        }
        goToStep2Button.disabled = selectedPostsForReblog.size === 0;
        goToStep2Button.textContent = selectedPostsForReblog.size > 0 
            ? `Adım 2: ${selectedPostsForReblog.size} Gönderi İçin Ayar Yap →` 
            : 'Adım 2: Reblog Ayarları →';
    };

    // --- ADIM 2: REBLOG İŞLEMLERİ ---
    const setupStep2Panel = async () => {
        try {
            allAvailableUsers = await fetch('/api/users').then(res => res.json());
            moduleUserSelectorContainer.innerHTML = '';
            if (allAvailableUsers.length > 0) {
                selectAllUsersButton.hidden = false;
                allAvailableUsers.forEach(user => {
                    const label = document.createElement('label');
                    label.className = 'flex items-center space-x-2 p-1.5 border rounded-md hover:bg-slate-50 cursor-pointer text-sm';
                    label.innerHTML = `<input type="checkbox" value="${user.appUsername}" class="form-checkbox h-4 w-4 user-select-checkbox"><span>${user.tumblrBlogName || user.appUsername}</span>`;
                    label.querySelector('input').addEventListener('change', (e) => {
                        if (e.target.checked) selectedAppUsernames.add(user.appUsername);
                        else selectedAppUsernames.delete(user.appUsername);
                        noUserSelectedWarning.hidden = selectedAppUsernames.size > 0;
                    });
                    moduleUserSelectorContainer.appendChild(label);
                });
            } else {
                selectAllUsersButton.hidden = true;
            }
        } catch (error) { logAction(`Kullanıcılar çekilemedi: ${error.message}`, "error"); }
    };

    const handleExecuteReblog = async () => {
        if (selectedPostsForReblog.size === 0) { alert("Lütfen reblog yapılacak gönderileri seçin."); return; }
        if (selectedAppUsernames.size === 0) { noUserSelectedWarning.hidden = false; return; }
        if (isReblogging) return;

        isReblogging = true;
        executeActionButton.disabled = true;
        actionProgressBarContainer.hidden = false;
        updateProgressBar(actionProgressBar, 0, 'Başlatılıyor...');
        logAction("Reblog işlemi başlatılıyor...", "system");

        // Detayları çekerken kullanılacak yetkili kullanıcıyı seç (ilk seçilen kullanıcı)
        const authorizedUserForFetching = Array.from(selectedAppUsernames)[0];
        if (!authorizedUserForFetching) {
            logAction("Detayları çekmek için yetkili kullanıcı bulunamadı.", "error");
            finishReblogging();
            return;
        }
        logAction(`Gönderi detayları [${authorizedUserForFetching}] kullanıcısının yetkisiyle çekilecek.`, "info");

        const postsToProcess = Array.from(selectedPostsForReblog).map(id => allFetchedPosts.get(id)).filter(Boolean);
        
        // 1. Reblog detaylarını YENİ ve GÜVENİLİR metotla çek
        updateProgressBar(actionProgressBar, 5, 'Reblog detayları çekiliyor...');
        for (const post of postsToProcess) {
            if (!reblogDetailsCache.has(post.id_string)) {
                try {
                    // DEĞİŞİKLİK: Eski API eylemi yerine yenisini çağırıyoruz.
                    // Parametre olarak artık post_url değil, blog_identifier ve post_id gönderiyoruz.
                    // Ve bu işlemi bir kullanıcının yetkisiyle yapıyoruz.
                    const details = await makeApiCall(
                        'getSinglePostForReblogApi', 
                        { blog_identifier: post.blog_name, post_id: post.id_string },
                        authorizedUserForFetching
                    );
                    reblogDetailsCache.set(post.id_string, details);
                } catch (e) { 
                    logAction(`'${post.blog_name}/${post.id_string}' detayı alınamadı: ${e.message}`, "error"); 
                }
            }
        }
        
        // 2. Görevleri oluştur (Bu kısım aynı)
        const reblogTasks = [];
        selectedAppUsernames.forEach(username => {
            postsToProcess.forEach(post => {
                const details = reblogDetailsCache.get(post.id_string);
                if (details) reblogTasks.push({ type: 'reblog', username, post, details });
            });
        });

        if (reblogTasks.length === 0) { logAction("Reblog yapılacak geçerli görev bulunamadı.", "error"); finishReblogging(); return; }
        
        // 3. Görevleri işle (Bu kısım aynı)
        let completedTasks = 0;
        const totalTasks = reblogTasks.length;
        logAction(`${totalTasks} reblog görevi ${workerCountSlider.value} işçi ile başlatılıyor.`);

        const worker = async () => {
            while (reblogTasks.length > 0) {
                const task = reblogTasks.shift();
                if (!task) continue;
                try {
                    const { username, post, details } = task;
                    const commonComment = commonReblogCommentInput.value.trim();
                    const commonTags = commonReblogTagsInput.value.trim().split(',').map(t => t.trim()).filter(Boolean);
                    
                    const params = {
                        parent_tumblelog_uuid: details.parent_tumblelog_uuid,
                        parent_post_id: details.parent_post_id,
                        reblog_key: details.reblog_key,
                        tags_array: commonTags,
                        comment_npf: commonComment ? [{ type: 'text', text: commonComment }] : [],
                        state: sendModeSelect.value === 'instant' ? 'published' : 'queue'
                    };

                    await makeApiCall('reblogPostApi', params, username);
                    logAction(`[${username}] > ${post.blog_name} rebloglandı.`, "success");
                } catch(e) { 
                    logAction(`[${task?.username}] reblog hatası: ${e.message}`, "error"); 
                    if (e.message.includes('429')) {
                        logAction("API Limitine takılındı. 60sn bekleniyor...", "warn");
                        await delay(60000);
                        reblogTasks.unshift(task);
                    }
                } finally {
                    completedTasks++;
                    const progress = 10 + (completedTasks / totalTasks) * 80;
                    updateProgressBar(actionProgressBar, progress, `${completedTasks}/${totalTasks}`);
                    await delay(500);
                }
            }
        };

        const workerPromises = Array(parseInt(workerCountSlider.value, 10)).fill(null).map(worker);
        await Promise.all(workerPromises);

        // 4. Kuyrukları karıştır (Bu kısım aynı)
        logAction("Tüm blogların kuyrukları 6 kez karıştırılıyor...", "system");
        const shuffleUsers = Array.from(selectedAppUsernames);
        let shuffledCount = 0;
        for (const username of shuffleUsers) {
            for (let i = 0; i < 6; i++) {
                try {
                    await makeApiCall('shuffleUserQueue', {}, username);
                } catch(e) { logAction(`[${username}] kuyruk karıştırma hatası: ${e.message}`, "error"); }
                shuffledCount++;
                const progress = 90 + (shuffledCount / (shuffleUsers.length * 6)) * 10;
                updateProgressBar(actionProgressBar, progress, 'Kuyruklar karıştırılıyor...');
                await delay(300);
            }
            logAction(`[${username}] kuyruğu 6 kez karıştırıldı.`, "info");
        }
        
        finishReblogging(); // Bu fonksiyon zaten dosyanızda mevcut
    };

    const finishReblogging = () => {
        updateProgressBar(actionProgressBar, 100, 'Tamamlandı!');
        logAction("Tüm işlemler tamamlandı.", "system");
        isReblogging = false;
        executeActionButton.disabled = false;
        setTimeout(() => { 
            step2Container.hidden = true;
            step1Container.hidden = false;
            selectedPostsForReblog.clear();
            renderPosts();
            goToStep2Button.disabled = true;
            goToStep2Button.textContent = 'Adım 2: Reblog Ayarları →';
        }, 3000);
    };

    // --- OLAY DİNLEYİCİLERİ ---
    fetchPostsButton.addEventListener('click', startFetchingPosts);
    stopFetchPostsButton.addEventListener('click', stopFetchingPosts);
    minNoteCountSelect.addEventListener('change', renderPosts);
    
    selectAllPostsButton.addEventListener('click', () => {
        const checkboxes = postsContainer.querySelectorAll('.dashboard-post-select');
        const shouldSelectAll = Array.from(checkboxes).some(cb => !cb.checked);
        checkboxes.forEach(cb => {
            if (cb.checked !== shouldSelectAll) {
                cb.checked = shouldSelectAll;
                cb.dispatchEvent(new Event('change'));
            }
        });
    });

    selectAllUsersButton.addEventListener('click', () => {
        const checkboxes = moduleUserSelectorContainer.querySelectorAll('.user-select-checkbox');
        const shouldSelectAll = Array.from(checkboxes).some(cb => !cb.checked);
        checkboxes.forEach(cb => {
            if(cb.checked !== shouldSelectAll) {
                cb.checked = shouldSelectAll;
                cb.dispatchEvent(new Event('change'));
            }
        });
    });
    
    goToStep2Button.addEventListener('click', () => {
        if(selectedPostsForReblog.size > 0) {
            step1Container.hidden = true;
            step2Container.hidden = false;
            selectionCountStep2.textContent = selectedPostsForReblog.size;
        }
    });

    executeActionButton.addEventListener('click', handleExecuteReblog);
    workerCountSlider.addEventListener('input', e => workerCountValue.textContent = e.target.value);

    // --- BAŞLANGIÇ ---
    setupStep2Panel();
});
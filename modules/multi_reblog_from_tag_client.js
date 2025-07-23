// modules/multi_reblog_from_tag_client.js
document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENT TANIMLAMALARI ---
    const tagInputField = document.getElementById('tagInputField'),
        minNoteCountSelect = document.getElementById('minNoteCountSelect'),
        fetchPostsButton = document.getElementById('fetchPostsButton'),
        stopFetchPostsButton = document.getElementById('stopFetchPostsButton'),
        totalFetchedPostsCount = document.getElementById('totalFetchedPostsCount'),
        selectAllPostsButton = document.getElementById('selectAllPostsButton'),
        step1ProgressBar = document.getElementById('step1ProgressBar'),
        postsContainer = document.getElementById('postsContainer');

    const actionPanel = document.getElementById('actionPanel'),
        actionPanelSelectionCount = document.getElementById('actionPanelSelectionCount'),
        moduleUserSelectorContainer = document.getElementById('moduleUserSelectorContainer'),
        noUserSelectedWarning = document.getElementById('noUserSelectedWarning'),
        executeActionButton = document.getElementById('executeActionButton'),
        actionProgressBarContainer = document.getElementById('actionProgressBarContainer'),
        actionProgressBar = document.getElementById('actionProgressBar'),
        actionLogArea = document.getElementById('actionLogArea');
        
    const sendModeRadios = document.querySelectorAll('input[name="sendMode"]'),
        scheduleOptionsContainer = document.getElementById('scheduleOptionsContainer'),
        randomizeTimeSlider = document.getElementById('randomizeTimeSlider'),
        randomizeTimeValue = document.getElementById('randomizeTimeValue'),
        workerCountSlider = document.getElementById('workerCountSlider'),
        workerCountValue = document.getElementById('workerCountValue'),
        commonReblogCommentInput = document.getElementById('commonReblogComment'),
        commonReblogTagsInput = document.getElementById('commonReblogTags'),
        bulkScheduleDateTimeInput = document.getElementById('bulkScheduleDateTime'),
        bulkScheduleIntervalInput = document.getElementById('bulkScheduleInterval');
    
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
        const typeColors = { info: 'text-gray-400', success: 'text-green-400', error: 'text-red-400', system: 'text-blue-400' };
        actionLogArea.innerHTML += `<div><span class="mr-2">${time}</span><span class="${typeColors[type] || 'text-gray-400'}">${message}</span></div>`;
        actionLogArea.scrollTop = actionLogArea.scrollHeight;
    };

    const makeApiCall = async (actionId, params, appUsername = null) => {
        const body = { actionId, params };
        if (appUsername) body.appUsername = appUsername;
        
        const response = await fetch('/api/execute-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Sunucu hatası: ${response.status}`);
        return result.data;
    };

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    // --- TARAMA MANTIĞI (follow_suggester'dan uyarlandı) ---
    const startFetchingPosts = async () => {
        if (isScanning) return;
        const tag = tagInputField.value.trim();
        if (!tag) { alert("Lütfen bir etiket girin."); return; }

        isScanning = true;
        fetchPostsButton.hidden = true;
        stopFetchPostsButton.hidden = false;
        if (postsContainer.children.length === 0 || postsContainer.firstChild.tagName === 'P') {
            postsContainer.innerHTML = '<p class="text-slate-400 italic text-center py-4 w-full">Gönderiler yükleniyor...</p>';
        }
        updateProgressBar(step1ProgressBar, 0);

        while (isScanning) {
            try {
                const sortOrder = document.querySelector('input[name="sortOrder"]:checked').value;
                const params = { tag, limit: 20, before: lastFetchedTimestamp, sort: sortOrder };
                const posts = await makeApiCall('getTaggedPosts', params);

                if (!isScanning) break;

                if (posts && posts.length > 0) {
                    posts.forEach(post => {
                        if (post.id_string && !post.reblogged_from_id) {
                            allFetchedPosts.set(post.id_string, post);
                        }
                    });
                    lastFetchedTimestamp = posts[posts.length - 1].timestamp;
                    totalFetchedPostsCount.textContent = `Toplam Çekilen Gönderi: ${allFetchedPosts.size}`;
                    renderPosts();
                } else {
                    logAction("Etiketin sonuna ulaşıldı.", "system");
                    stopFetchingPosts();
                    break;
                }
            } catch (error) {
                logAction(`Gönderi çekme hatası: ${error.message}`, "error");
                stopFetchingPosts();
                break;
            }
            await delay(500);
        }
    };
    
    const stopFetchingPosts = () => {
        isScanning = false;
        fetchPostsButton.hidden = false;
        stopFetchPostsButton.hidden = true;
    };

    // --- ARAYÜZ GÜNCELLEME (follow_suggester'dan uyarlandı) ---
    const renderPosts = () => {
        const minNotes = parseInt(minNoteCountSelect.value, 10);
        const filteredPosts = Array.from(allFetchedPosts.values()).filter(post => (post.note_count || 0) >= minNotes);
        
        const previouslyCheckedPostIds = new Set(selectedPostsForReblog);
        postsContainer.innerHTML = '';
        
        if (filteredPosts.length === 0) {
            postsContainer.innerHTML = '<p class="text-slate-400 italic p-4 text-center w-full">Filtreye uygun gönderi bulunamadı.</p>';
            return;
        }

        filteredPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        filteredPosts.forEach(post => postsContainer.appendChild(createPostElement(post, previouslyCheckedPostIds)));
        
        if(filteredPosts.length > 0) selectAllPostsButton.hidden = false;
        updateActionPanelVisibility();
    };

    const extractImageUrlFromPost = (post) => {
        if (Array.isArray(post.content)) {
            const imageBlock = post.content.find(block => block.type === 'image');
            if (imageBlock?.media?.length > 0) {
                return (imageBlock.media.find(m => m.width >= 400) || imageBlock.media[0]).url;
            }
        }
        if (post.type === 'photo' && post.photos?.length > 0) {
            const photo = post.photos[0];
            return (photo.alt_sizes?.find(s => s.width >= 400) || photo.original_size)?.url;
        }
        if (post.type === 'video' && post.thumbnail_url) return post.thumbnail_url;
        return null;
    };
    
    const createPostElement = (post, checkedIds) => {
        const item = document.createElement('div');
        const postId = post.id_string || post.id.toString();
        item.className = 'dashboard-post-item';
        item.dataset.postId = postId;

        const imageUrl = extractImageUrlFromPost(post);
        const postSummaryHtml = post.summary || post.caption || post.body || '<p class="italic">İçerik özeti yok.</p>';

        item.innerHTML = `
            <div class="post-checkbox-container">
                <input type="checkbox" class="form-checkbox h-5 w-5 dashboard-post-select" data-post-id="${postId}" ${checkedIds.has(postId) ? 'checked' : ''}>
            </div>
            <div class="post-thumbnail-container">
                ${imageUrl ? `<img src="${imageUrl}" onerror="this.parentElement.innerHTML='<div class=\\'post-thumbnail-placeholder\\'>${post.type}</div>';">` : `<div class="post-thumbnail-placeholder">${post.type}</div>`}
            </div>
            <div class="post-summary-text custom-scroll">${postSummaryHtml}</div>
            <div class="post-blog-info">
                <span>Blog: <strong>${post.blog_name || 'Bilinmeyen'}</strong></span>
                <span>Not: <strong>${(post.note_count || 0).toLocaleString()}</strong></span>
                <span>Tür: <strong>${post.type}</strong></span>
            </div>
        `;

        const checkbox = item.querySelector('.dashboard-post-select');
        checkbox.addEventListener('change', () => handlePostSelection(postId, checkbox.checked, item));
        item.addEventListener('click', e => {
            if (e.target.type !== 'checkbox') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        if (checkedIds.has(postId)) item.classList.add('selected');
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
        updateActionPanelVisibility();
    };

    const updateActionPanelVisibility = () => {
        actionPanelSelectionCount.textContent = selectedPostsForReblog.size;
        if (selectedPostsForReblog.size > 0 && !isReblogging) {
            actionPanel.classList.remove('translate-y-full');
        } else {
            actionPanel.classList.add('translate-y-full');
        }
    };
    
    // --- REBLOG MANTIĞI (Korundu ve uyarlandı) ---
    const setupReblogPanel = async () => {
        try {
            allAvailableUsers = await fetch('/api/users').then(res => res.json());
            moduleUserSelectorContainer.innerHTML = '';
            allAvailableUsers.forEach(user => {
                const label = document.createElement('label');
                label.className = 'flex items-center space-x-2 p-1.5 border rounded-md hover:bg-slate-50 cursor-pointer text-sm';
                label.innerHTML = `<input type="checkbox" value="${user.appUsername}" class="form-checkbox h-4 w-4"><span>${user.tumblrBlogName || user.appUsername}</span>`;
                label.querySelector('input').addEventListener('change', (e) => {
                    if (e.target.checked) selectedAppUsernames.add(user.appUsername);
                    else selectedAppUsernames.delete(user.appUsername);
                    noUserSelectedWarning.hidden = selectedAppUsernames.size > 0;
                });
                moduleUserSelectorContainer.appendChild(label);
            });
        } catch (error) { logAction(`Kullanıcılar çekilemedi: ${error.message}`, "error"); }
    };

    const handleExecuteReblog = async () => {
        if (selectedPostsForReblog.size === 0 || selectedAppUsernames.size === 0 || isReblogging) return;

        isReblogging = true;
        executeActionButton.disabled = true;
        actionProgressBarContainer.hidden = false;
        actionProgressBar.style.width = '0%';
        logAction("Reblog işlemi başlatılıyor...", "system");
        
        const postsToProcess = Array.from(selectedPostsForReblog).map(id => allFetchedPosts.get(id)).filter(Boolean);
        
        logAction(`${postsToProcess.length} gönderi için reblog detayları çekiliyor...`, "system");
        let processedDetailsCount = 0;
        for(const post of postsToProcess) {
            if(!reblogDetailsCache.has(post.id_string)) {
                try {
                    const details = await makeApiCall('getPostDetailsForReblogApi', { post_url: post.post_url });
                    reblogDetailsCache.set(post.id_string, details);
                } catch(e) { logAction(`${post.blog_name}/${post.id_string} detayı alınamadı: ${e.message}`, "error"); }
            }
            processedDetailsCount++;
            actionProgressBar.style.width = `${(processedDetailsCount / postsToProcess.length) * 50}%`;
        }
         
        const tasks = [];
        selectedAppUsernames.forEach(username => {
            postsToProcess.forEach(post => {
                if(reblogDetailsCache.has(post.id_string)) {
                    tasks.push({ username, post, details: reblogDetailsCache.get(post.id_string) });
                }
            });
        });
        
        let rebloggedCount = 0;
        const totalReblogs = tasks.length;
        if (totalReblogs === 0) {
            logAction("Reblog yapılacak geçerli görev yok.", "error");
            finishReblogging(); return;
        }

        const worker = async () => {
            while (tasks.length > 0) {
                const task = tasks.shift();
                if (!task) continue;
                try {
                    const { username, post, details } = task;
                    const sendMode = document.querySelector('input[name="sendMode"]:checked')?.value || 'instant';
                    const commonComment = commonReblogCommentInput.value.trim();
                    const commonTags = commonReblogTagsInput.value.trim().split(',').map(t => t.trim()).filter(Boolean);
                    
                    const params = {
                        parent_tumblelog_uuid: details.parent_tumblelog_uuid,
                        parent_post_id: details.parent_post_id,
                        reblog_key: details.reblog_key,
                        tags_array: commonTags.length > 0 ? commonTags : details.original_tags,
                        comment_npf: commonComment ? [{ type: 'text', text: commonComment }] : [],
                        post_state: sendMode === 'instant' ? 'published' : 'queue'
                    };
                    
                    if (sendMode === 'schedule') {
                         if (bulkScheduleDateTimeInput.value) {
                            let baseTime = new Date(bulkScheduleDateTimeInput.value);
                            const interval = parseInt(bulkScheduleIntervalInput.value) || 0;
                            const randomization = parseInt(randomizeTimeSlider.value, 10);
                            const offset = (Math.random() * 2 - 1) * randomization;
                            // Not: Daha gelişmiş bireysel planlama için burası genişletilebilir.
                            baseTime.setMinutes(baseTime.getMinutes() + offset + (tasks.length * interval));
                            params.publish_on_iso = baseTime.toISOString();
                        }
                    }

                    await makeApiCall('reblogPostApi', params, username);
                    logAction(`[${username}] > ${post.blog_name} rebloglandı.`, "success");
                } catch(e) { logAction(`[${task?.username}] reblog hatası: ${e.message}`, "error"); } 
                finally {
                    rebloggedCount++;
                    actionProgressBar.style.width = `${50 + (rebloggedCount / totalReblogs) * 50}%`;
                }
            }
        };

        const workerCount = parseInt(workerCountSlider.value, 10);
        const workerPromises = Array(workerCount).fill(null).map(worker);
        await Promise.all(workerPromises);
        finishReblogging();
    };

    const finishReblogging = () => {
        logAction("Tüm reblog işlemleri tamamlandı.", "system");
        isReblogging = false;
        executeActionButton.disabled = false;
        setTimeout(() => { actionProgressBarContainer.hidden = true; }, 2000);
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

    executeActionButton.addEventListener('click', handleExecuteReblog);
    
    sendModeRadios.forEach(radio => radio.addEventListener('change', e => scheduleOptionsContainer.hidden = e.target.value !== 'schedule'));
    randomizeTimeSlider.addEventListener('input', e => randomizeTimeValue.textContent = e.target.value);
    workerCountSlider.addEventListener('input', e => workerCountValue.textContent = e.target.value);

    // --- Başlangıç ---
    setupReblogPanel();
});
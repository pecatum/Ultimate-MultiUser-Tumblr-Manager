document.addEventListener('DOMContentLoaded', () => {
    // --- GLOBAL DEĞİŞKENLER VE AYARLAR ---
    const MAX_WORKERS = 10;
    const LIMIT_EXCEEDED_PAUSE_MS = 40000; // 40 saniye
    const ACTION_DELAY_MIN_MS = 2000; // 2 saniye
    const ACTION_DELAY_MAX_MS = 6000; // 6 saniye

    // --- DOM ELEMENTLERİ ---
    const userCheckboxesContainer = document.getElementById('userCheckboxesContainer');
    const userSelectionHelper = document.getElementById('userSelectionHelper');
    // ... (diğer element seçimleri aynı)
    const targetPostUrlInput = document.getElementById('targetPostUrl');
    const targetBlogNameInput = document.getElementById('targetBlogName');
    const actionTypeSelect = document.getElementById('actionType');
    const randomizeScheduleCheckbox = document.getElementById('randomizeSchedule');
    const reblogOptionsDiv = document.getElementById('reblogOptions');
    const startButton = document.getElementById('startButton');
    const progressContainer = document.getElementById('progressContainer');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const logContainer = document.getElementById('logContainer');
    const logArea = document.getElementById('logArea');

    // --- YARDIMCI FONKSİYONLAR ---
    const log = (message, workerId = null) => {
        const time = new Date().toLocaleTimeString();
        const workerTag = workerId ? `<span class="text-yellow-400">[İşçi-${workerId}]</span>` : `<span class="text-blue-400">[Sistem]</span>`;
        logArea.innerHTML += `<div class="log-entry"><span class="text-gray-500">${time}</span> ${workerTag} ${message}</div>`;
        logArea.scrollTop = logArea.scrollHeight;
    };
    
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    const getRandomActionDelay = () => Math.random() * (ACTION_DELAY_MAX_MS - ACTION_DELAY_MIN_MS) + ACTION_DELAY_MIN_MS;

    async function executeApiAction(actionId, params, appUsername) {
        // ... (Bu fonksiyon aynı, değişiklik yok)
        const response = await fetch('/api/execute-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId, params, appUsername }) });
        const result = await response.json();
        if (!response.ok) throw result;
        return result.data;
    }

    const updateProgress = (completed, total) => {
        if (total === 0) return;
        const percentage = Math.round((completed / total) * 100);
        progressBar.style.width = `${percentage}%`;
        progressPercentage.textContent = `${percentage}%`;
        progressText.textContent = `İşlem Kuyruğu (${completed} / ${total})`;
    };
    
    const toggleInputs = (disabled) => {
        startButton.disabled = disabled;
        userSelectionHelper.disabled = disabled;
        userCheckboxesContainer.querySelectorAll('input').forEach(i => i.disabled = disabled);
        document.querySelectorAll('#sourceUrl, #sourceBlog, #targetPostUrl, #targetBlogName, #actionType, #randomizeSchedule').forEach(el => el.disabled = disabled);
    };

    // --- İŞÇİ (WORKER) MANTIĞI ---
    async function worker(id, jobQueue, onJobComplete) {
        log(`İşçi ${id} başlatıldı.`, id);
        while (jobQueue.length > 0) {
            const job = jobQueue.shift();
            if (!job) continue;

            try {
                log(`Görev alındı: ${job.type} -> Post ${job.postId} -> Hesap ${job.username.split('_')[0]}`, id);
                
                if (job.type === 'like') {
                    await executeApiAction('likeTumblrPost', { post_id: job.postId, reblog_key: job.reblogKey }, job.username);
                    log(`<span class="text-green-400">BAŞARILI:</span> Gönderi (${job.postId}) beğenildi.`, id);
                } 
                else if (job.type === 'reblog') {
                    const reblogParams = { parent_post_id: job.postId, reblog_key: job.reblogKey, parent_tumblelog_uuid: job.parentTumblelogUuid };
                    if (job.useRandomSchedule) {
                        const baseMinutes = 60;
                        const randomOffset = Math.floor(Math.random() * 60) - 30;
                        const scheduledDate = new Date();
                        scheduledDate.setMinutes(scheduledDate.getMinutes() + baseMinutes + randomOffset);
                        reblogParams.publish_on_iso = scheduledDate.toISOString();
                        log(`Reblog zamanlandı: ${scheduledDate.toLocaleTimeString()}`, id);
                    }
                    await executeApiAction('reblogPostApi', reblogParams, job.username);
                    log(`<span class="text-green-400">BAŞARILI:</span> Gönderi (${job.postId}) ${job.useRandomSchedule ? 'zamanlandı' : 'yeniden bloglandı'}.`, id);
                }
                // DÜZELTME: İstenen 2-6 saniyelik rastgele bekleme eklendi.
                await delay(getRandomActionDelay());
            } catch (e) {
                // DÜZELTME: Limit aşıldı hatası kontrolü ve yeniden deneme mantığı
                const isLimitError = (e.statusCode === 429) || (e.message && e.message.toLowerCase().includes('limit'));
                if (isLimitError) {
                    log(`<span class="text-orange-400">UYARI:</span> Limit hatası alındı. ${LIMIT_EXCEEDED_PAUSE_MS / 1000} saniye bekleniyor ve görev yeniden denenecek.`, id);
                    jobQueue.unshift(job); // Görevi kuyruğun başına geri koy
                    await delay(LIMIT_EXCEEDED_PAUSE_MS);
                } else {
                    log(`<span class="text-red-400">HATA:</span> ${job.type} işlemi sırasında: ${e.error || e.message}`, id);
                }
            } finally {
                onJobComplete();
            }
        }
        log(`Tüm görevler bitti, işçi ${id} durduruluyor.`, id);
    }

    // --- ANA KONTROL FONKSİYONLARI ---
    async function initializePage() {
        try {
            const users = await (await fetch('/api/users')).json();
            userCheckboxesContainer.innerHTML = '';
            if (users && users.length > 0) {
                users.forEach(user => {
                    const div = document.createElement('div');
                    div.className = 'flex items-center justify-between space-x-2 p-1.5 rounded hover:bg-slate-50';
                    div.innerHTML = `
                        <label class="flex items-center space-x-2 cursor-pointer flex-grow">
                            <input type="checkbox" data-type="select" value="${user.appUsername}" class="form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300">
                            <span class="text-sm text-slate-700 truncate">${user.tumblrBlogName || user.appUsername.split('_')[0]}</span>
                        </label>
                        <input type="checkbox" data-type="pin" title="Bu hesabı sabitle" class="pin-checkbox flex-shrink-0">
                    `;
                    userCheckboxesContainer.appendChild(div);
                });
            } else { userCheckboxesContainer.innerHTML = '<p class="text-slate-500 italic col-span-full">Kayıtlı kullanıcı bulunamadı.</p>'; }
        } catch (e) { userCheckboxesContainer.innerHTML = '<p class="text-red-500 italic col-span-full">Kullanıcılar yüklenemedi.</p>'; }
    }
    
    // DÜZELTME: Gelişmiş kullanıcı seçimi fonksiyonu
    userSelectionHelper.addEventListener('change', (e) => {
        const command = e.target.value;
        if (command === 'none') return;
        
        const allCheckboxes = Array.from(userCheckboxesContainer.querySelectorAll('div'));
        const nonPinnedCheckboxes = allCheckboxes.filter(div => !div.querySelector('input[data-type="pin"]').checked);
        
        const selectionCheckboxes = nonPinnedCheckboxes.map(div => div.querySelector('input[data-type="select"]'));

        switch(command) {
            case 'all':
                selectionCheckboxes.forEach(cb => cb.checked = true);
                break;
            case 'clear':
                selectionCheckboxes.forEach(cb => cb.checked = false);
                break;
            default: // Rastgele seçim
                const count = parseInt(command.split('-')[1], 10);
                selectionCheckboxes.forEach(cb => cb.checked = false); // Önce temizle
                // Fisher-Yates shuffle
                for (let i = selectionCheckboxes.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [selectionCheckboxes[i], selectionCheckboxes[j]] = [selectionCheckboxes[j], selectionCheckboxes[i]];
                }
                selectionCheckboxes.slice(0, count).forEach(cb => cb.checked = true);
                break;
        }
        e.target.value = 'none'; // Helper'ı sıfırla
    });

    actionTypeSelect.addEventListener('change', () => {
        const selectedAction = actionTypeSelect.value;
        reblogOptionsDiv.style.display = (selectedAction === 'reblog' || selectedAction === 'both') ? 'block' : 'none';
    });

    startButton.addEventListener('click', async () => {
        // ... (Bu fonksiyonun geri kalanı bir önceki cevapla aynı, tüm düzeltmeleri zaten içeriyor)
        logArea.innerHTML = '';
        logContainer.style.display = 'block';
        progressContainer.style.display = 'block';
        updateProgress(0, 0);
        toggleInputs(true);
        log('İşlem başlatılıyor, girdiler doğrulanıyor...');

        const jobQueue = [];
        try {
            const selectedUsers = Array.from(userCheckboxesContainer.querySelectorAll('input[data-type="select"]:checked')).map(cb => cb.value);
            if (selectedUsers.length === 0) throw new Error("En az bir işlem yapacak hesap seçmelisiniz.");

            const postSource = document.querySelector('input[name="postSource"]:checked').value;
            const actionType = actionTypeSelect.value;
            const useRandomSchedule = randomizeScheduleCheckbox.checked && (actionType === 'reblog' || actionType === 'both');

            let targetPosts = [];
            if (postSource === 'url') {
                const url = targetPostUrlInput.value.trim();
                if (!url) throw new Error("Lütfen bir gönderi URL'si girin.");
                log(`URL'den gönderi detayları alınıyor...`);
                const postDetails = await executeApiAction('getPostDetailsForReblogApi', { post_url: url }, null);
                if (!postDetails || !postDetails.parent_post_id) { throw new Error("URL'den geçerli gönderi detayı alınamadı."); }
                targetPosts.push(postDetails);
            } else {
                const blogName = targetBlogNameInput.value.trim();
                if (!blogName) throw new Error("Lütfen bir blog adı girin.");
                log(`${blogName} blogunun son gönderileri çekiliyor...`);
                const postData = await executeApiAction('fetchBlogPostsForLiking', { blog_identifier: blogName, limit: 20 }, selectedUsers[0]);
                targetPosts = postData.posts || [];
            }
            if (targetPosts.length === 0) throw new Error("İşlem yapılacak gönderi bulunamadı.");
            log(`${targetPosts.length} hedef gönderi bulundu.`);

            for (const username of selectedUsers) {
                for (const post of targetPosts) {
                    const jobBase = {
                        username,
                        postId: post.parent_post_id || post.id_string || post.id,
                        reblogKey: post.reblog_key,
                        parentTumblelogUuid: post.parent_tumblelog_uuid || post.blog?.uuid
                    };
                    if (!jobBase.parentTumblelogUuid && (actionType === 'reblog' || actionType === 'both')) {
                       log(`<span class="text-orange-400">UYARI:</span> Post ${jobBase.postId} için reblog UUID bulunamadı, reblog işlemi atlanabilir.`);
                    }

                    if (actionType === 'like' || actionType === 'both') jobQueue.push({ ...jobBase, type: 'like' });
                    if (actionType === 'reblog' || actionType === 'both') jobQueue.push({ ...jobBase, type: 'reblog', useRandomSchedule });
                }
            }
            if (jobQueue.length === 0) throw new Error("İşlem kuyruğuna eklenecek görev bulunamadı.");
            log(`Toplam ${jobQueue.length} görev oluşturuldu ve kuyruğa eklendi.`);
            
            const totalJobs = jobQueue.length;
            let completedJobs = 0;
            updateProgress(completedJobs, totalJobs);

            const onJobComplete = () => { completedJobs++; updateProgress(completedJobs, totalJobs); };
            const workerPromises = [];
            for (let i = 1; i <= MAX_WORKERS; i++) {
                workerPromises.push(worker(i, jobQueue, onJobComplete));
            }
            await Promise.all(workerPromises);
            log('TÜM İŞLEMLER TAMAMLANDI!');

        } catch (error) {
            log(`<span class="text-red-400">KRİTİK HATA:</span> ${error.message || JSON.stringify(error)}`);
        } finally {
            toggleInputs(false);
        }
    });

    // --- SAYFAYI BAŞLAT ---
    initializePage();
});
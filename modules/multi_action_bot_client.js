document.addEventListener('DOMContentLoaded', () => {
    // --- GLOBAL DEĞİŞKENLER VE AYARLAR ---
    const LIMIT_EXCEEDED_PAUSE_MS = 40000; // 40 saniye
    let isRunning = false; // İşlemin çalışıp çalışmadığını tutan global bayrak
    let activeWorkers = []; // Aktif çalışan promise'leri tutan dizi

    // --- DOM ELEMENTLERİ ---
    const userCheckboxesContainer = document.getElementById('userCheckboxesContainer');
    const userSelectionHelper = document.getElementById('userSelectionHelper');
    const targetPostUrlInput = document.getElementById('targetPostUrl');
    const targetBlogNameInput = document.getElementById('targetBlogName');
    const actionTypeSelect = document.getElementById('actionType');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const progressContainer = document.getElementById('progressContainer');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const logContainer = document.getElementById('logContainer');
    const logArea = document.getElementById('logArea');
    const reblogOptionsDiv = document.getElementById('reblogOptions');
    // Yeni Slider'lar
    const minDelaySlider = document.getElementById('minDelaySlider');
    const minDelayValue = document.getElementById('minDelayValue');
    const scheduleRandomizeSlider = document.getElementById('scheduleRandomizeSlider');
    const scheduleRandomizeValue = document.getElementById('scheduleRandomizeValue');

    // --- YARDIMCI FONKSİYONLAR ---
    const log = (message, workerId = null) => {
        const time = new Date().toLocaleTimeString();
        const workerTag = workerId ? `<span class="text-yellow-400">[${workerId.split('_')[0]}]</span>` : `<span class="text-blue-400">[Sistem]</span>`;
        logArea.innerHTML += `<div class="log-entry"><span class="text-gray-500">${time}</span> ${workerTag} ${message}</div>`;
        logArea.scrollTop = logArea.scrollHeight;
    };
    
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function executeApiAction(actionId, params, appUsername) {
        const response = await fetch('/api/execute-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId, params, appUsername }) });
        const result = await response.json();
        if (!response.ok) throw result;
        return result.data;
    }

    let totalJobCount = 0;
    let completedJobCount = 0;
    const updateProgress = () => {
        if (totalJobCount === 0) return;
        completedJobCount++;
        const percentage = Math.round((completedJobCount / totalJobCount) * 100);
        progressBar.style.width = `${percentage}%`;
        progressPercentage.textContent = `${percentage}%`;
        progressText.textContent = `Genel İlerleme (${completedJobCount} / ${totalJobCount})`;
    };

    const resetProgress = (total) => {
        totalJobCount = total;
        completedJobCount = 0;
        const percentage = 0;
        progressBar.style.width = `${percentage}%`;
        progressPercentage.textContent = `${percentage}%`;
        progressText.textContent = `Genel İlerleme (0 / ${totalJobCount})`;
    };
    
    const toggleInputs = (disabled) => {
        startButton.disabled = disabled;
        stopButton.disabled = !disabled;
        // Diğer tüm inputları devre dışı bırak/etkinleştir
        document.querySelectorAll('input, select').forEach(el => {
            if (el.id !== 'startButton' && el.id !== 'stopButton') {
                el.disabled = disabled;
            }
        });
    };
    
    // --- HESAP İŞÇİSİ (ACCOUNT WORKER) MANTIĞI ---
    // Her bir seçili hesap için bu fonksiyondan bir tane çalıştırılır.
    async function accountWorker(username, posts, settings) {
        log(`Hesap işçisi başlatıldı.`, username);

        // Her işçi kendi gönderi listesini karıştırır.
        const shuffledPosts = [...posts].sort(() => Math.random() - 0.5);

        for (const post of shuffledPosts) {
            if (!isRunning) {
                log(`Durdurma sinyali alındı. İşçi durduruluyor.`, username);
                return;
            }
            
            const jobBase = {
                username,
                postId: post.parent_post_id || post.id_string || post.id,
                reblogKey: post.reblog_key,
                parentTumblelogUuid: post.parent_tumblelog_uuid || post.blog?.uuid
            };
            
            let actionSuccessful = false;
            while (!actionSuccessful) {
                if (!isRunning) break;
                try {
                    log(`Görev alındı: Post ${jobBase.postId}`, username);
                    // LIKE İŞLEMİ
                    if (settings.actionType === 'like' || settings.actionType === 'both') {
                        await executeApiAction('likeTumblrPost', { post_id: jobBase.postId, reblog_key: jobBase.reblogKey }, username);
                        log(`<span class="text-green-400">BAŞARILI:</span> Gönderi (${jobBase.postId}) beğenildi.`, username);
                        updateProgress();
                    }
                    
                    // REBLOG İŞLEMİ
                    if (settings.actionType === 'reblog' || settings.actionType === 'both') {
                         if (!jobBase.parentTumblelogUuid) {
                           log(`<span class="text-orange-400">UYARI:</span> Post ${jobBase.postId} için reblog UUID bulunamadı, reblog atlanıyor.`, username);
                           updateProgress(); // Atlanan işi de tamamlanmış say
                        } else {
                            const reblogParams = { parent_post_id: jobBase.postId, reblog_key: jobBase.reblogKey, parent_tumblelog_uuid: jobBase.parentTumblelogUuid };
                            if (settings.scheduleRandomizeHours > 0) {
                                const randomOffsetMs = (Math.random() - 0.5) * 2 * settings.scheduleRandomizeHours * 60 * 60 * 1000;
                                const scheduledDate = new Date(Date.now() + randomOffsetMs);
                                reblogParams.publish_on_iso = scheduledDate.toISOString();
                                log(`Reblog zamanlandı: ${scheduledDate.toLocaleString()}`, username);
                            }
                            await executeApiAction('reblogPostApi', reblogParams, username);
                            log(`<span class="text-green-400">BAŞARILI:</span> Gönderi (${jobBase.postId}) ${settings.scheduleRandomizeHours > 0 ? 'zamanlandı' : 'yeniden bloglandı'}.`, username);
                            updateProgress();
                        }
                    }
                    
                    actionSuccessful = true; // Hata yoksa döngüden çık

                } catch (e) {
                    const isLimitError = (e.statusCode === 429) || (e.message && e.message.toLowerCase().includes('limit'));
                    if (isLimitError) {
                        log(`<span class="text-orange-400">UYARI:</span> Limit hatası. Bu hesap için ${LIMIT_EXCEEDED_PAUSE_MS / 1000} saniye bekleniyor ve görev yeniden denenecek.`, username);
                        await delay(LIMIT_EXCEEDED_PAUSE_MS);
                        // actionSuccessful false kalır ve döngü tekrar eder.
                    } else {
                        log(`<span class="text-red-400">HATA:</span> ${e.error || e.message}. Bu gönderi atlanıyor.`, username);
                        // Bilinmeyen hatalarda bir sonraki posta geçmek için görevi tamamlanmış say
                        if (settings.actionType === 'both') { updateProgress(); updateProgress(); }
                        else { updateProgress(); }
                        actionSuccessful = true; // Döngüyü kır ve sonraki posta geç.
                    }
                }
            }
             // Bir sonraki posta geçmeden önce minimum bekleme süresi kadar bekle
            if (shuffledPosts.indexOf(post) < shuffledPosts.length - 1) {
                 await delay(settings.minDelaySeconds * 1000);
            }
        }
        log(`Tüm görevler bitti, işçi durduruluyor.`, username);
    }
    
    // --- ANA KONTROL FONKSİYONLARI ---
    
    // Sayfa Yüklenince Kullanıcıları Çek
    async function initializePage() {
        try {
            const users = await (await fetch('/api/users')).json();
            userCheckboxesContainer.innerHTML = '';
            if (users && users.length > 0) {
                users.forEach(user => {
                    const div = document.createElement('div');
                    div.className = 'flex items-center justify-between space-x-2 p-1.5 rounded hover:bg-slate-200';
                    div.innerHTML = `
                        <label class="flex items-center space-x-2 cursor-pointer flex-grow">
                            <input type="checkbox" data-type="select" value="${user.appUsername}" class="form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300">
                            <span class="text-sm text-slate-700 truncate">${user.tumblrBlogName || user.appUsername.split('_')[0]}</span>
                        </label>
                        <input type="checkbox" data-type="pin" title="Bu hesabı sabitle" class="pin-checkbox">
                    `;
                    userCheckboxesContainer.appendChild(div);
                });
            } else { userCheckboxesContainer.innerHTML = '<p class="text-slate-500 italic col-span-full">Kayıtlı kullanıcı bulunamadı.</p>'; }
        } catch (e) { userCheckboxesContainer.innerHTML = '<p class="text-red-500 italic col-span-full">Kullanıcılar yüklenemedi.</p>'; }
    }

    // Arayüz Event Listeners
    const setupEventListeners = () => {
        minDelaySlider.addEventListener('input', (e) => minDelayValue.textContent = `${e.target.value} saniye`);
        scheduleRandomizeSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (val === 0) {
                scheduleRandomizeValue.textContent = 'Anında';
            } else {
                scheduleRandomizeValue.textContent = `+/- ${val} saat`;
            }
        });

        actionTypeSelect.addEventListener('change', () => {
            const isReblog = actionTypeSelect.value === 'reblog' || actionTypeSelect.value === 'both';
            reblogOptionsDiv.style.display = isReblog ? 'block' : 'none';
        });
        
        userSelectionHelper.addEventListener('change', (e) => {
            const command = e.target.value;
            if (command === 'none') return;
            const allCheckboxes = Array.from(userCheckboxesContainer.querySelectorAll('div'));
            const nonPinnedDivs = allCheckboxes.filter(div => !div.querySelector('input[data-type="pin"]').checked);
            const selectionCheckboxes = nonPinnedDivs.map(div => div.querySelector('input[data-type="select"]'));
            
            switch(command) {
                case 'all': selectionCheckboxes.forEach(cb => cb.checked = true); break;
                case 'clear': selectionCheckboxes.forEach(cb => cb.checked = false); break;
                default:
                    const count = parseInt(command.split('-')[1], 10);
                    selectionCheckboxes.forEach(cb => cb.checked = false);
                    for (let i = selectionCheckboxes.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [selectionCheckboxes[i], selectionCheckboxes[j]] = [selectionCheckboxes[j], selectionCheckboxes[i]];
                    }
                    selectionCheckboxes.slice(0, count).forEach(cb => cb.checked = true);
                    break;
            }
            e.target.value = 'none';
        });

        startButton.addEventListener('click', startProcess);
        stopButton.addEventListener('click', stopProcess);
    };
    
    // BAŞLATMA FONKSİYONU
    async function startProcess() {
        isRunning = true;
        activeWorkers = [];
        logArea.innerHTML = '';
        logContainer.style.display = 'block';
        progressContainer.style.display = 'block';
        toggleInputs(true);
        log('İşlem başlatılıyor, girdiler doğrulanıyor...');

        try {
            const selectedUsers = Array.from(userCheckboxesContainer.querySelectorAll('input[data-type="select"]:checked')).map(cb => cb.value);
            if (selectedUsers.length === 0) throw new Error("En az bir hesap seçmelisiniz.");

            const actionType = actionTypeSelect.value;
            const settings = {
                actionType: actionType,
                minDelaySeconds: parseInt(minDelaySlider.value, 10),
                scheduleRandomizeHours: (actionType === 'reblog' || actionType === 'both') ? parseInt(scheduleRandomizeSlider.value, 10) : 0,
            };

            // Hedef gönderileri tek seferde çek
            const postSource = document.querySelector('input[name="postSource"]:checked').value;
            let targetPosts = [];
            if (postSource === 'url') {
                const url = targetPostUrlInput.value.trim();
                if (!url) throw new Error("Lütfen bir gönderi URL'si girin.");
                log(`URL'den gönderi detayı alınıyor...`);
                // Yeni handler'a uygun API çağrısı
                const postDetails = await executeApiAction('getPostDetailsForReblogApi', { post_url: url }, null);
                if (!postDetails || !postDetails.parent_post_id) throw new Error("URL'den geçerli gönderi detayı alınamadı. Handler'ın doğru çalıştığından emin olun.");
                targetPosts.push(postDetails);
            } else {
                const blogName = targetBlogNameInput.value.trim();
                if (!blogName) throw new Error("Lütfen bir blog adı girin.");
                log(`${blogName} blogunun son gönderileri çekiliyor...`);
                // Blog gönderilerini çekmek için yetkili bir kullanıcı gerekir, ilkini kullanıyoruz.
                const postData = await executeApiAction('fetchBlogPostsForLiking', { blog_identifier: blogName, limit: 20 }, selectedUsers[0]);
                targetPosts = postData.posts || [];
            }
            if (targetPosts.length === 0) throw new Error("İşlem yapılacak gönderi bulunamadı.");
            log(`${targetPosts.length} hedef gönderi bulundu.`);
            
            // Toplam iş sayısını hesapla ve progress bar'ı sıfırla
            const actionsPerPost = (actionType === 'both') ? 2 : 1;
            resetProgress(selectedUsers.length * targetPosts.length * actionsPerPost);
            
            log(`${selectedUsers.length} hesap için paralel işlem başlatılıyor...`);

            // Her seçili kullanıcı için bir 'accountWorker' başlat
            for (const username of selectedUsers) {
                const workerPromise = accountWorker(username, targetPosts, settings);
                activeWorkers.push(workerPromise);
            }
            
            // Tüm işçilerin bitmesini bekle
            await Promise.all(activeWorkers);
            
            if(isRunning) { // Eğer kullanıcı "durdur" demediyse başarı mesajı göster
               log('TÜM İŞLEMLER TAMAMLANDI!');
            }

        } catch (error) {
            log(`<span class="text-red-400">KRİTİK HATA:</span> ${error.message || JSON.stringify(error)}`);
        } finally {
            isRunning = false;
            toggleInputs(false);
        }
    }
    
    // DURDURMA FONKSİYONU
    function stopProcess() {
        if (!isRunning) return;
        isRunning = false; // Global bayrağı indir
        stopButton.disabled = true; // Spam'lenmesini önle
        log('<span class="text-red-500">DURDURULUYOR...</span> Aktif işçilerin mevcut görevlerini bitirip durması bekleniyor.');
        // Not: Çalışan worker'lar döngülerinin başında 'isRunning' bayrağını kontrol ederek kendiliğinden duracaklar.
        // 'finally' bloğu arayüzü temizleyecek.
    }


    // --- SAYFAYI BAŞLAT ---
    initializePage();
    setupEventListeners();
});
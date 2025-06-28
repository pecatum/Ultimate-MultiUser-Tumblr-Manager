// modules/auto_liker_client.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('[AutoLiker] DOM Yüklendi.');

    // --- Element Tanımlamaları ---
    const moduleUserSelector = document.getElementById('moduleUserSelector');
    const noUserSelectedWarning = document.getElementById('noUserSelectedWarning');
    
    const delayInput = document.getElementById('delayBetweenLikes');
    const maxTotalLikesInput = document.getElementById('maxTotalLikes');
    const dashboardPostCountInput = document.getElementById('dashboardPostCount');
    const rebloggersToProcessInput = document.getElementById('rebloggersToProcess');
    const originalPostsToLikeInput = document.getElementById('originalPostsToLikePerReblogger');
    const maxLikesFromOneRebloggerInput = document.getElementById('maxLikesFromOneReblogger');
    const reblogMaxAgeDaysInput = document.getElementById('reblogMaxAgeDays');

    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');

    const progressBar = document.getElementById('progressBar');
    const currentLikesCountSpan = document.getElementById('currentLikesCount');
    const maxLikesTargetSpan = document.getElementById('maxLikesTarget');
    const logArea = document.getElementById('logArea');

    const lastLikedPostArea = document.getElementById('lastLikedPostArea');
    const lastLikedPostImage = document.getElementById('lastLikedPostImage');
    const lastLikedPostBlog = document.getElementById('lastLikedPostBlog');
    const lastLikedPostSummary = document.getElementById('lastLikedPostSummary');
    const lastLikedPostLink = document.getElementById('lastLikedPostLink');

    // --- Durum Değişkenleri ---
    let selectedAppUsernameForLiker = null;
    let isRunning = false;
    let totalLikesMade = 0;
    let currentMaxLikesGoal = 1000;
    let likedPostsFromRebloggers = {}; // { 'rebloggerName': count }
    let processedDashboardPosts = new Set(); // Tekrar tekrar aynı dashboard postlarını işlememek için

    // --- Yardımcı Fonksiyonlar ---
    function logMessage(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('tr-TR');
        const logEntry = document.createElement('div');
        const typeClass = type === 'error' ? 'text-red-400' : (type === 'success' ? 'text-green-400' : (type === 'warn' ? 'text-yellow-400' : 'text-sky-400'));
        logEntry.innerHTML = `[${timestamp}] <span class="${typeClass} font-semibold">${type.toUpperCase()}</span>: ${message}`;
        logArea.appendChild(logEntry);
        logArea.scrollTop = logArea.scrollHeight; 
        console.log(`[AutoLiker Log] ${type.toUpperCase()}: ${message}`);
    }

    function updateProgressBar() {
        const percentage = Math.min(100, (totalLikesMade / currentMaxLikesGoal) * 100);
        progressBar.style.width = `${percentage}%`;
        progressBar.textContent = `${Math.floor(percentage)}%`;
        currentLikesCountSpan.textContent = totalLikesMade;
    }

    function delay(ms) {
        logMessage(`Bekleniyor: ${ms / 1000} saniye...`, 'system');
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function fetchAndPopulateUsers() {
        logMessage("Kayıtlı kullanıcılar çekiliyor...", "system");
        startButton.disabled = true; 
        try {
            const response = await fetch('/api/users');
            if (!response.ok) throw new Error(`Kullanıcılar çekilemedi: ${response.status}`);
            const users = await response.json();
            moduleUserSelector.innerHTML = '<option value="">Lütfen bir kullanıcı seçin...</option>';
            if (users && users.length > 0) {
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.appUsername;
                    option.textContent = user.tumblrBlogName || user.appUsername;
                    moduleUserSelector.appendChild(option);
                });
                logMessage(`${users.length} kayıtlı kullanıcı bulundu.`, "system");
                noUserSelectedWarning.style.display = 'none';
            } else {
                logMessage("Hiç kayıtlı kullanıcı bulunamadı.", "warn");
                noUserSelectedWarning.textContent = "İşlem yapacak kayıtlı kullanıcı bulunamadı. Lütfen ana sayfadan hesap ekleyin.";
                noUserSelectedWarning.style.display = 'block';
            }
        } catch (error) {
            logMessage(`Kullanıcı listesi çekilirken hata: ${error.message}`, "error");
            noUserSelectedWarning.textContent = "Kullanıcı listesi yüklenemedi.";
            noUserSelectedWarning.style.display = 'block';
        }
    }

    if (moduleUserSelector) {
        moduleUserSelector.addEventListener('change', function() {
            selectedAppUsernameForLiker = this.value;
            if (selectedAppUsernameForLiker) {
                logMessage(`Kullanıcı seçildi: ${selectedAppUsernameForLiker}`, "info");
                noUserSelectedWarning.style.display = 'none';
                startButton.disabled = false;
            } else {
                logMessage("Kullanıcı seçimi kaldırıldı.", "warn");
                noUserSelectedWarning.style.display = 'block';
                startButton.disabled = true;
            }
        });
    }

    async function executeApiAction(actionId, params = {}) {
        // Bu fonksiyonun modules.xml'den gelen action config'e ihtiyacı var authenticationType için.
        // Şimdilik, userToken gerektirenleri manuel olarak kontrol edelim.
        const userTokenActions = ['getDashboardPosts', 'getPostNotes', 'likeTumblrPost'];
        if (userTokenActions.includes(actionId) && !selectedAppUsernameForLiker) {
            const errorMsg = `API eylemi (${actionId}) için kullanıcı seçilmemiş.`;
            logMessage(errorMsg, "error");
            noUserSelectedWarning.style.display = 'block';
            throw new Error(errorMsg);
        }
        const requestBody = {
            actionId: actionId, params: params,
            appUsername: userTokenActions.includes(actionId) ? selectedAppUsernameForLiker : undefined
        };
        logMessage(`Sunucuya API eylemi: ${actionId}, Param: ${JSON.stringify(params)}, Kullanıcı: ${requestBody.appUsername || 'API_KEY'}`, 'api_call');
        const response = await fetch('/api/execute-action', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const resultText = await response.text();
        let result;
        try { result = JSON.parse(resultText); } catch (e) {
            logMessage(`API yanıtı JSON parse edilemedi: ${resultText}`, "error_api");
            throw new Error(`API yanıtı parse edilemedi (Durum: ${response.status}). Yanıt: ${resultText}`);
        }
        if (!response.ok || result.error) {
            const errMsg = result.error || result.message || `HTTP ${response.status}`;
            logMessage(`API eylem hatası (${actionId}): ${errMsg}`, "error_api");
            if (result.details) logMessage(`Detay: ${JSON.stringify(result.details)}`, "error_api");
            throw new Error(errMsg);
        }
        logMessage(`API eylemi başarılı (${actionId}). Dönen veri (ilk 200 karakter): ${JSON.stringify(result.data).substring(0,200)}...`, "success_api");
        return result.data;
    }

    function displayLastLikedPost(post, blogName) {
        if (!post) { lastLikedPostArea.style.display = 'none'; return; }
        lastLikedPostImage.src = 'https://placehold.co/100x100/e0e0e0/909090?text=G%C3%B6rsel';
        if (post.type === 'photo' && post.photos && post.photos.length > 0) {
            lastLikedPostImage.src = post.photos[0].alt_sizes?.find(s => s.width <= 100)?.url || post.photos[0].original_size?.url || lastLikedPostImage.src;
        } else if (post.type === 'video' && post.thumbnail_url) {
            lastLikedPostImage.src = post.thumbnail_url;
        }
        lastLikedPostBlog.textContent = `Blog: ${post.blog_name || blogName || 'Bilinmiyor'}`;
        lastLikedPostSummary.textContent = post.summary || post.caption || (post.body ? post.body.substring(0, 100) + '...' : 'İçerik özeti yok.');
        lastLikedPostLink.href = post.post_url || '#';
        lastLikedPostArea.style.display = 'block';
    }

    async function likeAndLog(postToLike, sourceBlogName) {
        if (!isRunning || totalLikesMade >= currentMaxLikesGoal) return false;
        if (!postToLike.id_string || !postToLike.reblog_key) {
            logMessage(`Gönderi ID ${postToLike.id_string || 'Bilinmeyen ID'} (Blog: ${postToLike.blog_name || sourceBlogName}) için reblog_key veya id eksik, beğenilemiyor.`, "warn");
            return false;
        }
        logMessage(`Gönderi ID ${postToLike.id_string} (Blog: ${postToLike.blog_name || sourceBlogName}) beğeniliyor...`);
        try {
            await executeApiAction('likeTumblrPost', { post_id: postToLike.id_string, reblog_key: postToLike.reblog_key });
            totalLikesMade++;
            updateProgressBar();
            logMessage(`BEĞENİLDİ: ${postToLike.blog_name || sourceBlogName} - Post ID ${postToLike.id_string}. Toplam: ${totalLikesMade}`, "success");
            displayLastLikedPost(postToLike, sourceBlogName);
            return true;
        } catch (likeError) {
            logMessage(`Gönderi ID ${postToLike.id_string} beğenilirken hata: ${likeError.message}`, "error");
            if (likeError.message && (likeError.message.includes("zaten beğenilmiş") || likeError.message.includes("already liked"))) {
                displayLastLikedPost(postToLike, sourceBlogName);
            }
            return false;
        }
    }

    async function processReblogger(rebloggerName, dashboardPostTimestamp, settings) {
        if (!isRunning || totalLikesMade >= settings.maxTotalLikes) return;
        logMessage(`Reblog yapan "${rebloggerName}" işleniyor...`, "info");

        if (settings.reblogMaxAgeDays > 0 && dashboardPostTimestamp) { // dashboardPostTimestamp reblog'un yapıldığı ana gönderinin tarihi
            const mainPostAgeInSeconds = Math.floor(Date.now() / 1000) - dashboardPostTimestamp;
            const mainPostAgeInDays = mainPostAgeInSeconds / (60 * 60 * 24);
            if (mainPostAgeInDays > settings.reblogMaxAgeDays) {
                logMessage(`Ana gönderi (${dashboardPostTimestamp}) çok eski (${Math.floor(mainPostAgeInDays)} gün), "${rebloggerName}" tarafından yapılan reblog atlanıyor.`, "info");
                return;
            }
        }

        let likesForThisReblogger = likedPostsFromRebloggers[rebloggerName] || 0;
        if (likesForThisReblogger >= settings.maxLikesFromOneReblogger) {
            logMessage(`"${rebloggerName}" için maksimum beğeni limitine (${settings.maxLikesFromOneReblogger}) ulaşıldı, atlanıyor.`, "info");
            return;
        }

        let originalPostsLikedCount = 0;
        let currentOffset = 0;
        const postsToFetchPerCall = 20; 
        let fetchedTotalForReblogger = 0;
        const maxFetchesForReblogger = 10; // Bir reblog yapan için en fazla 10 * 20 = 200 gönderi tara
        let fetchAttempts = 0;

        while (isRunning && totalLikesMade < settings.maxTotalLikes && originalPostsLikedCount < settings.originalPostsToLikePerReblogger && likesForThisReblogger < settings.maxLikesFromOneReblogger && fetchAttempts < maxFetchesForReblogger) {
            logMessage(`"${rebloggerName}" blogundan orijinal gönderiler çekiliyor (offset: ${currentOffset}, deneme: ${fetchAttempts + 1})...`, "info");
            try {
                const blogPostsData = await executeApiAction('getBlogOriginalPosts', {
                    blog_identifier: rebloggerName,
                    limit: postsToFetchPerCall,
                    offset: currentOffset
                });
                fetchAttempts++;

                if (!blogPostsData || !blogPostsData.posts || blogPostsData.posts.length === 0) {
                    logMessage(`"${rebloggerName}" blogunda (offset ${currentOffset}) daha fazla orijinal gönderi bulunamadı.`, "info");
                    break; 
                }

                for (const blogPost of blogPostsData.posts) {
                    if (!isRunning || totalLikesMade >= settings.maxTotalLikes || originalPostsLikedCount >= settings.originalPostsToLikePerReblogger || likesForThisReblogger >= settings.maxLikesFromOneReblogger) break;
                    
                    // getBlogOriginalPosts handler'ı zaten orijinal olanları filtreliyor.
                    // Ekstra kontrol: post.blog_name === rebloggerName
                    if (blogPost.blog_name && blogPost.blog_name.toLowerCase() !== rebloggerName.toLowerCase()) {
                        logMessage(`Atlanıyor: Gönderi (${blogPost.id_string}) yazarı "${blogPost.blog_name}", beklenen "${rebloggerName}" değil. Bu bir reblog olabilir.`, "debug");
                        continue;
                    }

                    const liked = await likeAndLog(blogPost, rebloggerName);
                    if (liked) {
                        originalPostsLikedCount++;
                        likesForThisReblogger++;
                        likedPostsFromRebloggers[rebloggerName] = (likedPostsFromRebloggers[rebloggerName] || 0) + 1;
                        await delay(settings.delayMs);
                    }
                }
                currentOffset += postsToFetchPerCall;
            } catch (error) {
                logMessage(`"${rebloggerName}" blogundan gönderi çekilirken hata: ${error.message}`, "error");
                break; 
            }
        }
        logMessage(`"${rebloggerName}" işlemi tamamlandı. Bu blogdan beğenilen orijinal gönderi: ${originalPostsLikedCount}`, "info");
    }

    async function startLikingProcess() {
        if (isRunning) { logMessage("İşlem zaten çalışıyor.", "warn"); return; }
        if (!selectedAppUsernameForLiker) {
            logMessage("Lütfen önce işlem yapılacak bir kullanıcı seçin!", "error");
            noUserSelectedWarning.style.display = 'block'; moduleUserSelector.focus(); return;
        }
        isRunning = true; startButton.disabled = true; stopButton.style.display = 'block'; moduleUserSelector.disabled = true;
        logArea.innerHTML = ''; 
        logMessage(`Otomatik beğeni işlemi "${selectedAppUsernameForLiker}" kullanıcısı için başlatılıyor...`);

        totalLikesMade = 0;
        likedPostsFromRebloggers = {};
        processedDashboardPosts.clear(); 
        const settings = {
            delayMs: parseInt(delayInput.value, 10) || 2000,
            maxTotalLikes: parseInt(maxTotalLikesInput.value, 10) || 1000,
            dashboardPostCount: parseInt(dashboardPostCountInput.value, 10) || 20,
            rebloggersToProcess: parseInt(rebloggersToProcessInput.value, 10) || 3,
            originalPostsToLikePerReblogger: parseInt(originalPostsToLikeInput.value, 10) || 2,
            maxLikesFromOneReblogger: parseInt(maxLikesFromOneRebloggerInput.value, 10) || 5,
            reblogMaxAgeDays: parseInt(reblogMaxAgeDaysInput.value, 10) || 0,
        };
        currentMaxLikesGoal = settings.maxTotalLikes;
        maxLikesTargetSpan.textContent = currentMaxLikesGoal;
        updateProgressBar();
        logMessage(`Ayarlar: ${JSON.stringify(settings)}`, "system");

        let sinceIdForDashboard = null;

        while (isRunning && totalLikesMade < settings.maxTotalLikes) {
            try {
                logMessage(`Paneldeki son ${settings.dashboardPostCount} gönderi "${selectedAppUsernameForLiker}" için çekiliyor (since_id: ${sinceIdForDashboard || 'yok'})...`, "info");
                const dashboardParams = { limit: settings.dashboardPostCount, notes_info: true, reblog_info: true }; // notes_info ve reblog_info ekledik
                if (sinceIdForDashboard) dashboardParams.since_id = sinceIdForDashboard;
                
                const dashboardPostsData = await executeApiAction('getDashboardPosts', dashboardParams);
                
                if (!dashboardPostsData || !dashboardPostsData.posts || dashboardPostsData.posts.length === 0) {
                    logMessage("Panelde (yeni) gönderi bulunamadı. İşlem tamamlandı veya bir süre sonra tekrar denenecek.", "warn");
                    // Eğer sinceId kullanılıyorsa ve sonuç yoksa, başa dönmek mantıklı olabilir.
                    // Ya da işlemi sonlandırabiliriz. Şimdilik sonlandıralım.
                    if (sinceIdForDashboard) {
                        logMessage("Panelin sonuna ulaşıldı.", "info");
                        break; // While döngüsünü kır
                    }
                    await delay(settings.delayMs * 10); // Yeni gönderi yoksa uzun bekle
                    continue; // Döngünün başına dön
                }
                const dashboardPosts = dashboardPostsData.posts;
                logMessage(`${dashboardPosts.length} panel gönderisi bulundu.`);
                
                let newPostsFoundInLoop = 0;
                for (const dashPost of dashboardPosts) {
                    if (!isRunning || totalLikesMade >= settings.maxTotalLikes) break;
                    
                    if (processedDashboardPosts.has(dashPost.id_string)) {
                        logMessage(`Panel gönderisi ID ${dashPost.id_string} daha önce işlendi, atlanıyor.`, "debug");
                        continue;
                    }
                    processedDashboardPosts.add(dashPost.id_string);
                    newPostsFoundInLoop++;

                    logMessage(`Panel gönderisi işleniyor: ID ${dashPost.id_string} (Blog: ${dashPost.blog_name}, Not Sayısı: ${dashPost.note_count})`, "debug");

                    const likedDashPost = await likeAndLog(dashPost, dashPost.blog_name);
                    if (likedDashPost) await delay(settings.delayMs);
                    if (!isRunning || totalLikesMade >= settings.maxTotalLikes) break;

                    if (dashPost.note_count > 0 && settings.rebloggersToProcess > 0) {
                        logMessage(`Gönderi ID ${dashPost.id_string} için reblog yapanlar çekiliyor...`, "info");
                        try {
                            const notesData = await executeApiAction('getPostNotes', { 
                                blog_identifier: dashPost.blog_name, 
                                post_id: dashPost.id_string,
                                mode: 'reblogs'
                            });

                            if (notesData && notesData.notes && notesData.notes.length > 0) {
                                const rebloggers = notesData.notes.filter(note => note.type === 'reblog' && note.blog_name && note.blog_name.toLowerCase() !== selectedAppUsernameForLiker.split('_')[0].toLowerCase());
                                logMessage(`${rebloggers.length} farklı reblog yapan bulundu. İlk ${settings.rebloggersToProcess} tanesi işlenecek.`);
                                
                                let rebloggersProcessedCount = 0;
                                for (const rebloggerNote of rebloggers) {
                                    if (!isRunning || totalLikesMade >= settings.maxTotalLikes || rebloggersProcessedCount >= settings.rebloggersToProcess) break;
                                    await processReblogger(rebloggerNote.blog_name, dashPost.timestamp, settings); // dashPost.timestamp'i gönder
                                    rebloggersProcessedCount++;
                                }
                            } else {
                                logMessage(`Gönderi ID ${dashPost.id_string} için reblog yapan bulunamadı.`, "info");
                            }
                        } catch (notesError) {
                            logMessage(`Gönderi ID ${dashPost.id_string} için notlar çekilirken hata: ${notesError.message}`, "error");
                        }
                    }
                     if (!isRunning || totalLikesMade >= settings.maxTotalLikes) break;
                } 

                if (dashboardPosts.length > 0) {
                    sinceIdForDashboard = dashboardPosts[dashboardPosts.length - 1].id_string;
                }
                if (newPostsFoundInLoop === 0 && sinceIdForDashboard) {
                    logMessage("Panelde yeni gönderi bulunamadı (since_id ile), başa dönülüyor.", "info");
                    sinceIdForDashboard = null; // Başa dönmek için
                    await delay(settings.delayMs * 5);
                } else if (isRunning && totalLikesMade < settings.maxTotalLikes) {
                    logMessage("Mevcut panel gönderi grubu işlendi. Bir sonraki grup için bekleniyor...", "info");
                    await delay(settings.delayMs * 2); 
                }

            } catch (error) {
                logMessage(`Ana işlem döngüsünde hata: ${error.message}`, "error");
                console.error("[AutoLiker] Ana işlem döngüsü hatası:", error);
                if (isRunning) { 
                    logMessage("Hata nedeniyle bir süre bekleniyor...", "warn");
                    await delay(settings.delayMs * 10);
                }
            }
        } 

        isRunning = false;
        startButton.disabled = false;
        stopButton.style.display = 'none';
        moduleUserSelector.disabled = false;
        logMessage("Otomatik beğeni işlemi tamamlandı veya durduruldu.", "system_success");
        if (totalLikesMade >= settings.maxTotalLikes) {
            logMessage(`Maksimum beğeni limitine ulaşıldı: ${settings.maxTotalLikes}`, "success");
        }
    }

    function stopLikingProcess() {
        if (isRunning) {
            isRunning = false; 
            logMessage("Durdurma isteği alındı... Mevcut işlemler tamamlanınca duracak.", "warn");
        }
    }

    startButton.addEventListener('click', startLikingProcess);
    stopButton.addEventListener('click', stopLikingProcess);
    maxTotalLikesInput.addEventListener('input', () => {
        currentMaxLikesGoal = parseInt(maxTotalLikesInput.value, 10) || 1000;
        maxLikesTargetSpan.textContent = currentMaxLikesGoal;
        updateProgressBar();
    });
    currentMaxLikesGoal = parseInt(maxTotalLikesInput.value, 10) || 1000;
    maxLikesTargetSpan.textContent = currentMaxLikesGoal;
    updateProgressBar();
    startButton.disabled = true; 

    fetchAndPopulateUsers(); 
    logMessage("Modül kullanıma hazır. Lütfen işlem yapılacak kullanıcıyı yukarıdan seçin.", "system");
});

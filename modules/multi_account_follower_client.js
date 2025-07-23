// modules/multi_account_follower_client.js
// NİHAİ SÜRÜM v6: Hedef Odaklı, Tamamen Rastgele Hesap Atamalı Mantık.

document.addEventListener('DOMContentLoaded', () => {
    // --- Element Tanımlamaları ve Durum Değişkenleri (Değişiklik Yok) ---
    const multiUserSelectorContainer = document.getElementById('multiUserSelectorContainer');
    const userLimitsContainer = document.getElementById('userLimitsContainer');
    const postUrlInput = document.getElementById('postUrlInput');
    const actionLogArea = document.getElementById('actionLogArea');
    const startProcessButton = document.getElementById('startProcessButton');
    const stopProcessButton = document.getElementById('stopProcessButton');
    const progressLabel = document.getElementById('progressLabel');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    let selectedAccounts = new Set();
    let accountStates = new Map();
    let isProcessing = false;
    
    // --- Sabitler ---
    const LIKES_PER_BLOG = 4;
    const LAST_ACTIVE_DAYS = 1;
    const FIND_FILTER_WORKERS = 10;
    const ACTION_WORKERS = 6;
    const FOLLOWS_PER_TARGET = 5; // İSTEK: Her hedefin kaç kez takip edileceği

    // --- Temel Fonksiyonlar (Değişiklik Yok) ---
    function logAction(message, type = 'info') {if (!actionLogArea) return; const now = new Date(); const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`; const logEntry = document.createElement('div'); logEntry.innerHTML = `<span style="color: #6b7280;">[${timeString}]</span> <span style="color: ${getLogColor(type)}; font-weight:500; text-transform:uppercase;">[${type}]</span> ${message}`; actionLogArea.appendChild(logEntry); actionLogArea.scrollTop = actionLogArea.scrollHeight;}
    function getLogColor(type) { switch (type.toLowerCase()) { case 'debug': return '#818cf8'; case 'info': return '#60a5fa'; case 'success': return '#34d399'; case 'system_success': return '#2dd4bf'; case 'warn': return '#facc15'; case 'error': return '#f87171'; default: return '#9ca3af'; } }
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function parseTumblrUrl(url) { try { const urlObj = new URL(url); const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0); let blogIdentifier, postId; if (urlObj.hostname.endsWith('.tumblr.com') && urlObj.hostname.split('.').length > 2 && urlObj.hostname.split('.')[0] !== 'www') { blogIdentifier = urlObj.hostname.split('.')[0]; if (pathParts.length >= 2 && pathParts[0] === 'post') { postId = pathParts[1]; } else if (pathParts.length >= 1 && /^\d+$/.test(pathParts[0])) { postId = pathParts[0]; } else if (pathParts.length >= 1) { for (let i = pathParts.length - 1; i >= 0; i--) { if (/^\d+$/.test(pathParts[i])) { postId = pathParts[i]; break; } } } } else if (urlObj.hostname === 'www.tumblr.com') { if (pathParts.length >= 2) { blogIdentifier = pathParts[0]; if (pathParts[1] === 'post' && pathParts.length >= 3) { postId = pathParts[2]; } else { postId = pathParts[1]; } } } if (blogIdentifier && postId) { const numericPostIdMatch = postId.match(/^\d+/); if (numericPostIdMatch) { return { blogIdentifier, postId: numericPostIdMatch[0] }; } } } catch (e) {} return null; }
    async function executeApiAction(actionId, params = {}, appUsername = null, needsAuth = true) { const requestBody = { actionId, params }; if (needsAuth) { if (!appUsername) throw new Error(`${actionId} için kullanıcı adı gerekli`); requestBody.appUsername = appUsername; } const response = await fetch('/api/execute-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }); const responseText = await response.text(); if (!responseText) throw new Error(`Sunucudan boş yanıt (${response.status})`); const result = JSON.parse(responseText); if (!response.ok || result.error) { throw new Error(result.error || result.message || `${actionId} hatası (${response.status})`); } return result.data; }
    async function fetchAndPopulateUsers() { try { const response = await fetch('/api/users'); if (!response.ok) throw new Error(`Sunucu yanıtı: ${response.status}`); const users = await response.json(); multiUserSelectorContainer.innerHTML = ''; if (users && users.length > 0) { users.forEach(user => { const div = document.createElement('div'); div.className = 'flex items-center'; const checkboxId = `user-checkbox-${user.appUsername}`; div.innerHTML = `<input id="${checkboxId}" type="checkbox" value="${user.appUsername}" class="h-4 w-4 text-indigo-600 rounded"><label for="${checkboxId}" class="ml-2">${user.tumblrBlogName || user.appUsername}</label>`; multiUserSelectorContainer.appendChild(div); div.querySelector('input').addEventListener('change', (e) => handleUserSelection(e.target.value, e.target.checked)); }); } else { multiUserSelectorContainer.innerHTML = '<p>Kayıtlı hesap bulunamadı.</p>'; } } catch (error) { logAction(`Kullanıcı listesi çekilemedi: ${error.message}`, "error"); } }
    async function handleUserSelection(appUsername, isSelected) { if (isSelected) { selectedAccounts.add(appUsername); logAction(`${appUsername} seçildi.`, 'info'); try { const limits = await executeApiAction('getUserLimits', {}, appUsername, true); const state = { limits, element: createLimitCard(appUsername, limits) }; accountStates.set(appUsername, state); userLimitsContainer.appendChild(state.element); } catch (error) { logAction(`${appUsername} limit çekme hatası: ${error.message}`, 'error'); } } else { selectedAccounts.delete(appUsername); if (accountStates.has(appUsername)) { accountStates.get(appUsername).element.remove(); accountStates.delete(appUsername); } logAction(`${appUsername} seçimden çıkarıldı.`, 'info'); } }
    function createLimitCard(appUsername, limits) { const card = document.createElement('div'); card.className = 'user-limit-card'; const followLimit = limits?.follows?.limit || 200; const followRemaining = limits?.follows?.remaining ?? '?'; const followUsed = followRemaining === '?' ? '?' : followLimit - followRemaining; const likeLimit = limits?.likes?.limit || 1000; const likeRemaining = limits?.likes?.remaining ?? '?'; const likeUsed = likeRemaining === '?' ? '?' : likeLimit - likeRemaining; card.innerHTML = `<h4 class="font-bold text-sm text-indigo-700">${appUsername.split('_')[0]}</h4><div class="text-xs mt-2 space-y-1"><p>Takip: ${followUsed}/${followLimit} (${followRemaining} kaldı)</p><p>Beğeni: ${likeUsed}/${likeLimit} (${likeRemaining} kaldı)</p></div>`; return card; }
    function updateLimitCard(appUsername) { const state = accountStates.get(appUsername); if (state) state.element.innerHTML = createLimitCard(appUsername, state.limits).innerHTML; }
    
    // --- Kontrol Butonları ve Ana Akış ---
    function updateProgress(label, current, total) { progressLabel.textContent = label; progressText.textContent = `${current} / ${total}`; progressBar.style.width = total > 0 ? `${(current / total) * 100}%` : '0%';}
    startProcessButton.addEventListener('click', () => { if (isProcessing) return; if (selectedAccounts.size === 0) { logAction("Lütfen en az bir hesap seçin!", "warn"); return; } const urlsText = postUrlInput.value.trim(); if (!urlsText) { logAction("Lütfen en az bir gönderi URL'si girin!", "warn"); return; } isProcessing = true; startProcessButton.disabled = true; stopProcessButton.disabled = false; postUrlInput.disabled = true; multiUserSelectorContainer.querySelectorAll('input').forEach(i => i.disabled = true); runFullAutoProcess(urlsText.split(/[\n\s,]+/).map(url => url.trim()).filter(url => url)); });
    stopProcessButton.addEventListener('click', () => { if (!isProcessing) return; isProcessing = false; logAction("İşlem durduruluyor...", "warn"); stopProcessButton.disabled = true; });
    function resetUIState() { isProcessing = false; startProcessButton.disabled = false; stopProcessButton.disabled = true; postUrlInput.disabled = false; multiUserSelectorContainer.querySelectorAll('input').forEach(i => i.disabled = false); updateProgress('Beklemede', 0, 0); }
    
    async function runFullAutoProcess(urls) {
        logAction(`OTOMATİK İŞLEM BAŞLATILDI. ${urls.length} URL ile çalışılacak.`, 'system_success');
        const validTargets = await findAndFilterTargets(urls);
        if (!isProcessing || validTargets === null) { logAction("İşlem durduruldu veya kritik hata oluştu.", 'warn'); resetUIState(); return; }
        logAction(`BULMA VE FİLTRELEME TAMAMLANDI: Toplam ${validTargets.length} geçerli hedef bulundu.`, 'system_success');
        if (validTargets.length === 0) { logAction("İşlem yapılacak uygun hedef bulunamadı.", "warn"); resetUIState(); return; }
        await executeFollowAndLikeActions(validTargets);
        if(isProcessing) logAction("TÜM İŞLEMLER TAMAMLANDI.", "system_success");
        resetUIState();
    }
    
    async function findAndFilterTargets(urls) {
        logAction(`AŞAMA 1: Not Çekme ve Filtreleme Başladı (${FIND_FILTER_WORKERS} işçi).`, 'info');
        let processedUrlCount = 0;
        const validTargets = new Map(); // Duplike kontrolü ve URL saklama için Map kullan
        const processedBlogs = new Set();
        const urlQueue = [...urls];
        const oneDayAgo = (Date.now() / 1000) - (LAST_ACTIVE_DAYS * 24 * 60 * 60);

        if (selectedAccounts.size === 0) { logAction("Filtreleme için yetkili hesap seçilmemiş!", "error"); return null; }
        const authAccountForFiltering = Array.from(selectedAccounts)[0];

        const worker = async (workerId) => {
            while (isProcessing && urlQueue.length > 0) {
                const url = urlQueue.shift(); if (!url) continue;
                const parsedData = parseTumblrUrl(url);
                if (parsedData) {
                    try {
                        const notesData = await executeApiAction('fetchNotesFromPostUrl', { blog_identifier: parsedData.blogIdentifier, post_id: parsedData.postId, mode: 'all' }, null, false);
                        if (notesData?.notes) {
                            for (const note of notesData.notes) {
                                const blogName = note.blog_name;
                                if (!blogName || processedBlogs.has(blogName)) continue;
                                processedBlogs.add(blogName);
                                try {
                                    const [avatarResponse, blogStatusData] = await Promise.all([
                                        fetch(`https://api.tumblr.com/v2/blog/${blogName}/avatar/64`),
                                        executeApiAction('getBlogFollowingStatus', { blog_identifier: blogName }, authAccountForFiltering, true)
                                    ]);
                                    const hasDefaultAvatar = avatarResponse.url.includes("assets.tumblr.com/images/default_avatar/");
                                    const isActive = blogStatusData?.updated > oneDayAgo;
                                    if (isActive && !hasDefaultAvatar) {
                                        logAction(`FİLTRE OK: "${blogName}" geçerli hedef.`, 'success');
                                        validTargets.set(blogStatusData.name, { name: blogStatusData.name, url: blogStatusData.url });
                                    }
                                } catch (filterError) { /* Hata loglandı */ }
                            }
                        }
                    } catch (error) { /* Hata loglandı */ }
                }
                processedUrlCount++;
                updateProgress('URL\'ler taranıp hedefler filtreleniyor...', processedUrlCount, urls.length);
                await delay(200);
            }
        };
        try { await Promise.all(Array(FIND_FILTER_WORKERS).fill(0).map((_, i) => worker(i + 1))); } 
        catch (e) { logAction(`Hedef bulma aşamasında kritik hata: ${e.message}`, 'error'); return null; }
        return Array.from(validTargets.values());
    }
    
    // --- YENİLENMİŞ EYLEM FONKSİYONU ---
    
    function getRandomEligibleAccount() {
        const eligible = Array.from(selectedAccounts).filter(acc => accountStates.get(acc)?.limits?.follows?.remaining > 0);
        return eligible.length > 0 ? eligible[Math.floor(Math.random() * eligible.length)] : null;
    }

    async function executeFollowAndLikeActions(targets) {
        logAction(`AŞAMA 2: Takip/Beğeni Başladı. ${targets.length} hedef, hedef başına ${FOLLOWS_PER_TARGET} takip denemesiyle işlenecek.`, 'info');
        
        // İSTEK: Her hedefin kaç kez takip edildiğini saymak için yeni kuyruk yapısı
        let targetQueue = targets.map(t => ({ target: t, followedCount: 0 }));
        
        let totalFollowsAttempted = 0;
        const maxTotalFollows = targets.length * FOLLOWS_PER_TARGET;
        updateProgress('Takip/Beğeni yapılıyor...', 0, maxTotalFollows);

        const actionWorker = async (workerId) => {
            while (isProcessing && targetQueue.length > 0) {
                const item = targetQueue.shift(); 
                if (!item) continue;
                
                // İSTEK: Her seferinde tamamen rastgele bir hesap seç
                const actingAccount = getRandomEligibleAccount();
                if (!actingAccount) {
                    logAction("Uygun hesap kalmadı, hedef kuyruğa geri konuluyor.", 'warn');
                    targetQueue.push(item); // İşlenemeyen hedefi kuyruğa geri ekle
                    await delay(30000); // 30 saniye sonra tekrar dene
                    continue;
                }
                logAction(`[İşçi ${workerId}] "${item.target.name}" için "${actingAccount}" atandı. (Deneme ${item.followedCount + 1}/${FOLLOWS_PER_TARGET})`, 'info');
                
                try {
                    const status = await executeApiAction('getBlogFollowingStatus', { blog_identifier: item.target.name }, actingAccount, true);
                    if (status.is_following_me || status.am_i_following_them) {
                        logAction(`"${item.target.name}" -> "${actingAccount}" tarafından zaten takip ediliyor/ediyor. Bu deneme sayılmıyor.`, 'info');
                        // Bu durumda takip denemesi yapılmadığı için hedefi tekrar kuyruğa ekle, sayacı artırma
                        targetQueue.push(item);
                    } else {
                        await executeApiAction('followTumblrBlog', { blog_url: item.target.url }, actingAccount, true);
                        logAction(`"${item.target.name}" -> "${actingAccount}" tarafından takip edildi!`, 'success');
                        
                        item.followedCount++; // Başarılı takip sayacını artır
                        totalFollowsAttempted++;
                        updateProgress('Takip/Beğeni yapılıyor...', totalFollowsAttempted, maxTotalFollows);

                        const state = accountStates.get(actingAccount);
                        if (state.limits.follows) state.limits.follows.remaining--;
                        updateLimitCard(actingAccount);

                        // İSTEK: Takip sonrası 4 beğeni
                        await likePosts(actingAccount, item.target.name, LIKES_PER_BLOG);

                        // İSTEK: Hedef 5 takibe ulaşmadıysa, tekrar işlenmek üzere kuyruğa ekle
                        if (item.followedCount < FOLLOWS_PER_TARGET) {
                            logAction(`"${item.target.name}" hedefine ${FOLLOWS_PER_TARGET - item.followedCount} takip daha yapılacak. Kuyruğa ekleniyor.`, 'debug');
                            targetQueue.push(item);
                        } else {
                            logAction(`"${item.target.name}" hedefi ${FOLLOWS_PER_TARGET} takibe ulaştı. İşlemi tamamlandı.`, 'system_success');
                        }
                    }
                } catch (error) {
                    logAction(`"${item.target.name}" işlenirken "${actingAccount}" ile hata: ${error.message}`, 'error');
                    if (error.message.includes("limit")) {
                        accountStates.get(actingAccount).limits.follows.remaining = 0;
                        updateLimitCard(actingAccount);
                    }
                }
                await delay(1500 + Math.random() * 1000);
            }
        };
        await Promise.all(Array(ACTION_WORKERS).fill(0).map((_, i) => actionWorker(i + 1)));
    }
    
    async function likePosts(appUsername, blogName, count) {
        try {
            const postData = await executeApiAction('getBlogOriginalPosts', { blog_identifier: blogName, limit: count * 2 }, null, false);
            if (!postData?.posts) return;
            const originalPosts = postData.posts.filter(p => !p.reblogged_from_id && p.id_string && p.reblog_key).slice(0, count);
            for (const post of originalPosts) {
                if (!isProcessing) break;
                try {
                    await executeApiAction('likeTumblrPost', { post_id: post.id_string, reblog_key: post.reblog_key }, appUsername, true);
                    logAction(`"${blogName}" -> bir gönderi beğenildi.`, 'success');
                    const state = accountStates.get(appUsername);
                    if(state.limits.likes) state.limits.likes.remaining--; updateLimitCard(appUsername);
                    await delay(500);
                } catch (likeError) { if (likeError.message.includes("429")) { break; } }
            }
        } catch (error) { logAction(`"${blogName}" gönderi çekme hatası: ${error.message}`, 'error'); }
    }

    // --- Başlangıç ---
    fetchAndPopulateUsers();
    logAction("Tam Otomatik modül yüklendi. Lütfen hesapları ve URL'leri seçip işlemi başlatın.", "system_success");
});
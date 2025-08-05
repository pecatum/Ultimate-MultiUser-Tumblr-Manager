// --- GLOBAL DEĞİŞKENLER ---
let allUsers = [];
let selectedUsers = [];
let askRefreshInterval = 120;
let notifyRefreshInterval = 300;
let askTimer, notifyTimer;
let blogInfoCache = {};
let postInfoCache = {}; // Gönderi bilgileri için cache
let hideCardTimer;
let hidePostCardTimer; // Gönderi kartı için zamanlayıcı
// AI modalı için global değişkenler
let currentAiContext = {
    textarea: null,
    question: null,
    button: null
};

// --- DOM ELEMENTLERİ ---
const accountsList = document.getElementById('accountsList');
const selectAllCheckbox = document.getElementById('selectAllAccounts');
const submissionsFeed = document.getElementById('submissions-feed');
const notificationsFeed = document.getElementById('notifications-feed');
const askCountdownEl = document.getElementById('askCountdown');
const notifyCountdownEl = document.getElementById('notifyCountdown');
const blogHoverCard = document.getElementById('blog-hover-card');
const postHoverCard = document.getElementById('post-hover-card'); // Yeni gönderi kartı elementi
// AI Modal Elementleri
const aiModal = document.getElementById('ai-customization-modal');
const aiSlidersContainer = document.getElementById('ai-sliders-container');
const aiModalCancelBtn = document.getElementById('ai-modal-cancel');
const aiModalGenerateBtn = document.getElementById('ai-modal-generate');

// --- API ÇAĞRI FONKSİYONLARI ---
async function apiCall(actionId, params = {}, appUsername = null) {
    try {
        const response = await fetch('/api/execute-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actionId, params, appUsername })
        });
        const result = await response.json();
        if (!response.ok) {
            throw result;
        }
        return result;
    } catch (error) {
        console.error(`API Çağrısı Hatası (${actionId})`, {
            params: params,
            appUsername: appUsername,
            errorDetails: error
        });
        return Promise.reject(error);
    }
}

// --- VERİ ÇEKME MANTIĞI ---
async function fetchAllData() {
    if (selectedUsers.length === 0) {
        submissionsFeed.innerHTML = '<p class="text-gray-500 italic p-4">Verileri görmek için bir hesap seçin.</p>';
        notificationsFeed.innerHTML = '<p class="text-gray-500 italic p-4">Verileri görmek için bir hesap seçin.</p>';
        return;
    }
    submissionsFeed.innerHTML = '<div class="loader mx-auto mt-10"></div>';
    notificationsFeed.innerHTML = '<div class="loader mx-auto mt-10"></div>';

    const submissionPromises = selectedUsers.map(user => apiCall('getBlogSubmissions', {}, user.appUsername).catch(() => null));
    const notificationPromises = selectedUsers.map(user => apiCall('getBlogNotifications', {}, user.appUsername).catch(() => null));

    const submissionResults = await Promise.all(submissionPromises);
    const notificationResults = await Promise.all(notificationPromises);

    const allSubmissions = submissionResults
        .filter(r => r && r.data)
        .flatMap((result, index) => {
            const user = selectedUsers[index];
            return result.data.map(s => ({ 
                ...s, 
                appUsername: user.appUsername,
                parent_tumblelog_uuid: user.blog.uuid
            }));
        });

    const allNotifications = notificationResults
        .filter(r => r && r.data && r.data.notifications)
        .flatMap((result, index) => {
            const appUsername = selectedUsers[index].appUsername;
            return result.data.notifications.map(n => ({ ...n, appUsername }));
        });

    allSubmissions.sort((a, b) => b.timestamp - a.timestamp);
    allNotifications.sort((a, b) => b.timestamp - a.timestamp);

    renderSubmissions(allSubmissions);
    renderNotifications(allNotifications);
}

// --- RENDER FONKSİYONLARI ---
function renderAccountsList() {
    accountsList.innerHTML = '';
    allUsers.forEach(user => {
        const template = document.getElementById('account-checkbox-template');
        const clone = template.content.cloneNode(true);
        const checkbox = clone.querySelector('.account-checkbox');
        const label = clone.querySelector('label');
        const img = clone.querySelector('img');

        checkbox.value = user.appUsername;
        checkbox.id = `user-${user.appUsername}`;
        label.htmlFor = `user-${user.appUsername}`;
        label.textContent = user.blog.title || user.blog.name;
        img.src = user.blog.avatar?.[0]?.url || 'https://placehold.co/64x64/e2e8f0/cbd5e0?text=?';

        accountsList.appendChild(clone);
    });

    document.querySelectorAll('.account-checkbox').forEach(cb => {
        cb.addEventListener('change', handleAccountSelection);
    });
}

async function renderSubmissions(submissions) {
    submissionsFeed.innerHTML = '';
    if (submissions.length === 0) {
        submissionsFeed.innerHTML = '<p class="text-gray-500 italic p-4">Yanıtlanacak soru bulunmuyor.</p>';
        return;
    }

    for (const sub of submissions) {
        const template = document.getElementById('submission-item-template');
        const clone = template.content.cloneNode(true);
        const targetUser = allUsers.find(u => u.appUsername === sub.appUsername);

        if (!targetUser) continue;

        clone.querySelector('.target-avatar').src = targetUser.blog.avatar?.[0]?.url || '';
        clone.querySelector('.target-name').textContent = targetUser.blog.title || targetUser.blog.name;

        const askerNameEl = clone.querySelector('.asker-name');
        const askerAvatarEl = clone.querySelector('.asker-avatar');
        
        const askerName = sub.asking_name || 'Anonymous';
        const questionHtml = sub.question || sub.summary || "";
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = questionHtml;
        const questionTextForAI = tempDiv.textContent || tempDiv.innerText || "";

        if (askerName && askerName.toLowerCase() !== 'anonymous') {
            askerNameEl.textContent = askerName;
            const askerAvatarUrl = sub.asking_avatar?.[3]?.url;
            askerAvatarEl.src = askerAvatarUrl || 'https://placehold.co/64x64/e2e8f0/cbd5e0?text=?';
            askerNameEl.dataset.blogInfoHover = askerName;
        } else {
            askerNameEl.textContent = 'Anonim';
            askerAvatarEl.style.display = 'none';
        }

        clone.querySelector('.question-text').innerHTML = questionHtml;

        const answerSection = clone.querySelector('.answer-section');
        const answerTextarea = answerSection.querySelector('textarea');
        
        answerSection.querySelectorAll('.answer-btn').forEach(btn => btn.addEventListener('click', (e) => {
            const answerText = answerTextarea.value;
            const state = e.target.dataset.state;
            if (answerText) {
                handleAnswerSubmit(sub.id_string, sub.reblog_key, answerText, state, sub.appUsername, askerName, questionTextForAI, sub.parent_tumblelog_uuid);
                e.target.closest('.feed-item').classList.add('opacity-50', 'pointer-events-none');
            } else {
                alert('Lütfen bir cevap yazın.');
            }
        }));

        answerSection.querySelector('.openai-btn').addEventListener('click', (e) => {
            currentAiContext.textarea = answerTextarea;
            currentAiContext.question = questionTextForAI;
            currentAiContext.button = e.target;
            openAiModal();
        });

        submissionsFeed.appendChild(clone);
    }

    document.querySelectorAll('[data-blog-info-hover]').forEach(el => {
        el.addEventListener('mouseover', (e) => showBlogInfoCard(e, el.dataset.blogInfoHover));
        el.addEventListener('mouseout', hideBlogInfoCard);
    });
}

function renderNotifications(notifications) {
    notificationsFeed.innerHTML = '';
    if (notifications.length === 0) {
        notificationsFeed.innerHTML = '<p class="text-gray-500 italic p-4">Yeni bildirim bulunmuyor.</p>';
        return;
    }
    
    notifications.forEach(note => {
        const template = document.getElementById('notification-item-template');
        const clone = template.content.cloneNode(true);
        const notificationItem = clone.querySelector('.feed-item');
        const iconEl = clone.querySelector('.notification-icon');
        const textEl = clone.querySelector('.notification-text');
        const targetUser = allUsers.find(u => u.appUsername === note.appUsername);
        
        if(!targetUser) return;
        
        const fromBlogName = note.from_tumblelog_name || 'Biri';
        let icon = '🔔', text = `<b>${fromBlogName}</b> bir işlem yaptı.`;
        
        // Kullanıcı adlarını tıklanabilir link yap ve hover özelliği ekle
        const userLink = `<a href="https://${fromBlogName}.tumblr.com" target="_blank" class="font-bold hover:underline" data-blog-info-hover="${fromBlogName}">${fromBlogName}</a>`;

        switch(note.type) {
            case 'like': 
                icon = '❤️'; 
                text = `${userLink} gönderinizi beğendi.`; 
                break;
            case 'reblog_with_content':
            case 'reblog_naked': 
                icon = '🔁'; 
                text = `${userLink} gönderinizi yeniden blogladı.`; 
                break;
            case 'follow': 
                icon = '➕'; 
                text = `${userLink} sizi takip etmeye başladı.`; 
                break;
            case 'reply': 
                icon = '💬'; 
                text = `${userLink} gönderinize yanıt verdi: "${note.reply_text}"`; 
                break;
            case 'ask': 
                icon = '❓'; 
                text = `<b>${fromBlogName}</b> bir soru sordu.`; 
                break;
        }
        
        // Tıklayınca gönderiye gitmesi için tüm kartı bir link yap
        if (note.target_post_url) {
            const linkWrapper = document.createElement('a');
            linkWrapper.href = note.target_post_url;
            linkWrapper.target = '_blank';
            linkWrapper.rel = 'noopener noreferrer';
            // Orijinal öğeyi kopyalayıp linkin içine taşı
            const originalItemClone = notificationItem.cloneNode(true);
            linkWrapper.appendChild(originalItemClone);
            // Klonlanmış öğeyi ana klonun içindeki orijinalle değiştir
            clone.replaceChild(linkWrapper, notificationItem);
        }
        
        iconEl.innerHTML = icon;
        textEl.innerHTML = text;
        clone.querySelector('.notification-time').textContent = new Date(note.timestamp * 1000).toLocaleString('tr-TR');
        clone.querySelector('.blog-name').textContent = targetUser.blog.title;
        
        notificationsFeed.appendChild(clone);

        // Event listener'ları klonlama işleminden sonra ekle
        const finalItemInFeed = notificationsFeed.lastElementChild;
        // Hover olayını linkin içindeki dive (veya linkin kendisine) ata
        const hoverableItem = finalItemInFeed.tagName === 'A' ? finalItemInFeed : finalItemInFeed.querySelector('.feed-item');

        // Gönderi ile ilgiliyse hover event'i ekle
        if (note.post_id && targetUser.blog.name) {
             hoverableItem.addEventListener('mouseover', (e) => {
                showPostInfoCard(e, note.post_id, targetUser.blog.name);
             });
             hoverableItem.addEventListener('mouseout', hidePostInfoCard);
        }
    });

    // Kullanıcı hover kartı event listener'larını yeniden ata
    document.querySelectorAll('[data-blog-info-hover]').forEach(el => {
        el.addEventListener('mouseover', (e) => showBlogInfoCard(e, el.dataset.blogInfoHover));
        el.addEventListener('mouseout', hideBlogInfoCard);
    });
}


// --- EVENT HANDLERS & YARDIMCI FONKSİYONLAR ---
function handleAccountSelection() {
    selectedUsers = Array.from(document.querySelectorAll('.account-checkbox:checked'))
        .map(cb => allUsers.find(u => u.appUsername === cb.value));
        
    selectAllCheckbox.checked = selectedUsers.length === allUsers.length && allUsers.length > 0;
    
    fetchAllData();
    resetTimers();
}

async function handleAnswerSubmit(postId, reblogKey, answerText, state, appUsername, askerName, questionText, parentTumblelogUuid) {
    console.log(`Cevap gönderiliyor: PostID=${postId}, ReblogKey=${reblogKey}, BlogUUID=${parentTumblelogUuid}`);
    try {
        const result = await apiCall('answerAsk', {
            post_id: postId,
            reblog_key: reblogKey,
            answer_text: answerText,
            state: state,
            asker_name: askerName,
            question_text: questionText,
            parent_tumblelog_uuid: parentTumblelogUuid
        }, appUsername);

        if (result?.data?.success) {
            console.log("Cevap başarıyla gönderildi.");
        }
    } catch (error) {
        // Hata apiCall içinde loglandı.
    }
}

// --- AI MODAL FONKSİYONLARI ---
function createSliders() {
    aiSlidersContainer.innerHTML = '';
    const sliderData = [
        { id: 'length', label: 'Uzunluk', minLabel: 'Kısa', maxLabel: 'Uzun' },
        { id: 'mood', label: 'Mod', minLabel: 'Kızgın', maxLabel: 'Mutlu' },
        { id: 'tone', label: 'Ton', minLabel: 'Negatif', maxLabel: 'Pozitif' },
        { id: 'complexity', label: 'Karmaşıklık', minLabel: 'Basit', maxLabel: 'Akademik' }
    ];

    const template = document.getElementById('ai-slider-template');
    sliderData.forEach(data => {
        const clone = template.content.cloneNode(true);
        const label = clone.querySelector('label');
        const valueSpan = clone.querySelector('span');
        const slider = clone.querySelector('.ai-slider');
        const minLabel = clone.querySelector('.slider-label-min');
        const maxLabel = clone.querySelector('.slider-label-max');

        label.textContent = data.label;
        valueSpan.textContent = slider.value;
        slider.dataset.id = data.id;
        minLabel.textContent = data.minLabel;
        maxLabel.textContent = data.maxLabel;

        slider.addEventListener('input', () => { valueSpan.textContent = slider.value; });
        aiSlidersContainer.appendChild(clone);
    });
}

function openAiModal() {
    if (!aiModal) return;
    createSliders();
    aiModal.classList.remove('hidden');
}

function closeAiModal() {
    if (!aiModal) return;
    aiModal.classList.add('hidden');
    currentAiContext = { textarea: null, question: null, button: null };
}

async function handleAiGenerate() {
    const btn = aiModalGenerateBtn;
    const btnText = document.getElementById('ai-generate-btn-text');
    const loader = document.getElementById('ai-generate-loader');
    btn.disabled = true;
    btnText.textContent = 'Üretiliyor...';
    loader.classList.remove('hidden');
    
    const originalBtn = currentAiContext.button;
    if(originalBtn) originalBtn.disabled = true;

    try {
        const language = document.querySelector('input[name="language"]:checked').value;
        const sliders = aiSlidersContainer.querySelectorAll('.ai-slider');
        const settings = {
            question_text: currentAiContext.question,
            language: language
        };
        sliders.forEach(slider => { settings[slider.dataset.id] = slider.value; });

        const result = await apiCall('generateAskAnswerOpenAi', settings);
        
        if (result?.data?.answer && currentAiContext.textarea) {
            currentAiContext.textarea.value = result.data.answer;
        }
    } catch (error) {
        console.error("AI answer generation failed:", error);
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Cevap Üret';
        loader.classList.add('hidden');
        if(originalBtn) originalBtn.disabled = false;
        closeAiModal();
    }
}

// --- BLOG HOVER KARTI FONKSİYONLARI ---
async function getBlogInfoForHover(blogIdentifier) {
    if (!blogIdentifier || blogIdentifier.toLowerCase() === 'anonymous') return null;
    if (blogInfoCache[blogIdentifier]) return blogInfoCache[blogIdentifier];
    
    try {
        const result = await apiCall('fetchExternalBlogInfoApi', { blog_identifier: blogIdentifier });
        if (result?.data?.info?.blog) {
            const info = {
                name: result.data.info.blog.name,
                title: result.data.info.blog.title,
                avatar: result.data.info.blog.avatar?.[0]?.url,
                header: result.data.info.blog.theme?.header_image,
                posts: result.data.posts?.slice(0, 3) || []
            };
            blogInfoCache[blogIdentifier] = info;
            return info;
        }
    } catch (error) { return null; }
    return null;
}

function showBlogInfoCard(event, blogIdentifier) {
    if (!blogIdentifier || blogIdentifier.toLowerCase() === 'anonymous') return;
    
    clearTimeout(hideCardTimer);
    blogHoverCard.style.left = `${event.pageX + 15}px`;
    blogHoverCard.style.top = `${event.pageY + 15}px`;
    blogHoverCard.style.display = 'block';
    blogHoverCard.innerHTML = '<div class="loader mx-auto my-10"></div>';

    getBlogInfoForHover(blogIdentifier).then(info => {
        if(!info || !info.name) {
            blogHoverCard.innerHTML = '<p class="p-4 text-center">Blog bilgisi alınamadı.</p>';
            return;
        }
        const template = document.getElementById('blog-hover-card-template');
        const clone = template.content.cloneNode(true);
        
        clone.querySelector('.blog-card-header').style.backgroundImage = `url(${info.header})`;
        clone.querySelector('.blog-card-avatar').src = info.avatar;
        clone.querySelector('.blog-name').textContent = info.name;
        clone.querySelector('.blog-title').textContent = info.title;
        
        const postsContainer = clone.querySelector('.blog-card-posts');
        info.posts.forEach(post => {
            if (post.type === 'photo' && post.photos?.[0]?.original_size?.url) {
                const img = document.createElement('img');
                img.src = post.photos[0].original_size.url;
                postsContainer.appendChild(img);
            }
        });

        blogHoverCard.innerHTML = '';
        blogHoverCard.appendChild(clone);
    });
    
    blogHoverCard.addEventListener('mouseover', () => clearTimeout(hideCardTimer));
    blogHoverCard.addEventListener('mouseout', hideBlogInfoCard);
}

function hideBlogInfoCard() {
    hideCardTimer = setTimeout(() => {
        blogHoverCard.style.display = 'none';
    }, 300);
}

// --- YENİ: GÖNDERİ HOVER KARTI FONKSİYONLARI ---
async function getPostInfoForHover(postId, blogIdentifier) {
    const cacheKey = `${blogIdentifier}-${postId}`;
    if (postInfoCache[cacheKey]) {
        return postInfoCache[cacheKey];
    }
    try {
        // `fetchPostsForBlog` backend'de oluşturulmuş bir actionId olmalı.
        // Bu action, postHandler.js içindeki fetchPostsForBlog'u kullanır.
        const result = await apiCall('fetchPostsForBlog', {
            blog_identifier: blogIdentifier,
            id: postId, // Tek bir gönderi getirmek için API'ye id parametresi gönderiyoruz.
            notes_info: true
        });

        // API genellikle bir dizi döndürür, tek bir gönderi istesek bile.
        if (result?.data?.posts?.length > 0) {
            const post = result.data.posts[0];
            postInfoCache[cacheKey] = post;
            return post;
        }
        return null;
    } catch (error) {
        console.error(`Post info fetch failed for ${cacheKey}:`, error);
        return null;
    }
}

function showPostInfoCard(event, postId, blogIdentifier) {
    if (!postId || !blogIdentifier) return;
    
    clearTimeout(hidePostCardTimer);
    // Kartın bildirim kartının solunda çıkması için pozisyonu ayarla
    postHoverCard.style.left = `${event.currentTarget.getBoundingClientRect().left - 400}px`;
    postHoverCard.style.top = `${event.currentTarget.getBoundingClientRect().top}px`;
    postHoverCard.style.display = 'block';
    postHoverCard.innerHTML = '<div class="loader mx-auto my-10"></div>';

    getPostInfoForHover(postId, blogIdentifier).then(post => {
        if (!post) {
            postHoverCard.innerHTML = '<p class="p-4 text-center">Gönderi bilgisi alınamadı.</p>';
            return;
        }

        const template = document.getElementById('post-hover-card-template');
        const clone = template.content.cloneNode(true);
        
        // Gönderiyi yapan blogun bilgilerini doldur
        clone.querySelector('.author-avatar').src = post.blog.avatar[0]?.url || 'https://placehold.co/64x64/e2e8f0/cbd5e0?text=?';
        clone.querySelector('.author-name').textContent = post.blog.name;
        clone.querySelector('.notes-count').textContent = post.note_count || 0;

        // Gönderi içeriğini işle
        const contentPreview = clone.querySelector('.post-content-preview');
        contentPreview.innerHTML = ''; // Temizle

        if (post.type === 'photo' && post.photos?.[0]?.original_size?.url) {
            const img = document.createElement('img');
            img.src = post.photos[0].original_size.url;
            img.className = 'w-full h-auto rounded';
            contentPreview.appendChild(img);
        } else if (post.summary) {
            contentPreview.textContent = post.summary;
        } else if (post.trail?.length > 0 && post.trail[0].content_raw) {
            contentPreview.textContent = post.trail[0].content_raw;
        } else {
             contentPreview.textContent = 'İçerik önizlemesi mevcut değil.';
        }

        postHoverCard.innerHTML = '';
        postHoverCard.appendChild(clone);
    });
    
    postHoverCard.addEventListener('mouseover', () => clearTimeout(hidePostCardTimer));
    postHoverCard.addEventListener('mouseout', hidePostInfoCard);
}

function hidePostInfoCard() {
    hidePostCardTimer = setTimeout(() => {
        postHoverCard.style.display = 'none';
    }, 300);
}


// --- ZAMANLAYICILAR ---
function startTimers() {
    if (askTimer) clearInterval(askTimer);
    if (notifyTimer) clearInterval(notifyTimer);

    let askTime = askRefreshInterval;
    askCountdownEl.textContent = askTime;
    askTimer = setInterval(() => {
        askTime--;
        askCountdownEl.textContent = askTime;
        if (askTime <= 0) {
            askTime = askRefreshInterval;
            if (selectedUsers.length > 0) fetchAllData();
        }
    }, 1000);

    let notifyTime = notifyRefreshInterval;
    notifyCountdownEl.textContent = notifyTime;
    notifyTimer = setInterval(() => {
        notifyTime--;
        notifyCountdownEl.textContent = notifyTime;
        if (notifyTime <= 0) {
            notifyTime = notifyRefreshInterval;
            if (selectedUsers.length > 0) fetchAllData();
        }
    }, 1000);
}

function resetTimers() {
    startTimers();
}

// --- İLK YÜKLEME ---
document.addEventListener('DOMContentLoaded', async () => {
    accountsList.innerHTML = '<li><div class="flex items-center p-2"><div class="loader"></div><span class="text-xs text-gray-500 ml-2">Hesaplar yükleniyor...</span></div></li>';
    try {
        const initialUsersResponse = await fetch('/api/users');
        if (!initialUsersResponse.ok) throw new Error('Kullanıcı listesi sunucudan alınamadı.');
        const initialUsers = await initialUsersResponse.json();

        if (!initialUsers || initialUsers.length === 0) {
            accountsList.innerHTML = '<li><span class="text-xs text-gray-500 p-2">Kayıtlı hesap bulunamadı.</span></li>';
            return;
        }

        const userPromises = initialUsers.map(user =>
            apiCall('getUserDataForDashboard', {}, user.appUsername)
                .then(result => ({ ...result.data, appUsername: user.appUsername }))
                .catch(err => {
                    console.warn(`Kullanıcı verisi alınamadı (token geçersiz olabilir): ${user.appUsername}`);
                    return null;
                })
        );
        
        const resolvedUsers = await Promise.all(userPromises);
        
        allUsers = resolvedUsers.filter(user => user !== null);

        if (allUsers.length === 0) {
            selectAllCheckbox.parentElement.style.display = 'none';
            accountsList.innerHTML = '<li><span class="text-xs text-red-500 p-2">Hiçbir hesap yüklenemedi. Lütfen hesaplarınıza yeniden giriş yapın.</span></li>';
        } else {
            renderAccountsList();
            selectAllCheckbox.parentElement.style.display = 'flex';
        }
        
        startTimers();

        selectAllCheckbox.addEventListener('change', () => {
            document.querySelectorAll('.account-checkbox').forEach(cb => {
                cb.checked = selectAllCheckbox.checked;
            });
            handleAccountSelection();
        });

        if (aiModal) {
            aiModalCancelBtn.addEventListener('click', closeAiModal);
            aiModalGenerateBtn.addEventListener('click', handleAiGenerate);
            aiModal.addEventListener('click', (e) => {
                if (e.target === aiModal) {
                    closeAiModal();
                }
            });
        }
    } catch (error) {
        console.error("Panel yüklenirken kritik hata:", error);
        accountsList.innerHTML = `<li><span class="text-xs text-red-500 p-2">Hesaplar yüklenemedi: ${error.message}</span></li>`;
    }
});
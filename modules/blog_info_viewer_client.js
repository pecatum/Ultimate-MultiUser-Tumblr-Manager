// modules/blog_info_viewer_client.js

document.addEventListener('DOMContentLoaded', () => {
    console.log('[BlogViewer] DOM полностью загружен и обработан.');

    const blogIdentifierInput = document.getElementById('blogIdentifierInput');
    const getBlogInfoButton = document.getElementById('getBlogInfoButton');

    const blogInfoLoading = document.getElementById('blogInfoLoading');
    const blogInfoError = document.getElementById('blogInfoError');
    const blogInfoErrorText = document.getElementById('blogInfoErrorText');
    const blogDetailsContainer = document.getElementById('blogDetailsContainer');

    // Blog Detayları Elementleri
    const blogHeaderImage = document.getElementById('blogHeaderImage');
    const blogAvatar = document.getElementById('blogAvatar');
    const blogTitle = document.getElementById('blogTitle');
    const blogName = document.getElementById('blogName');
    const blogUuid = document.getElementById('blogUuid');
    const blogDescription = document.getElementById('blogDescription');
    const blogPostsCount = document.getElementById('blogPostsCount');
    const blogLikesCount = document.getElementById('blogLikesCount');
    const blogLastUpdated = document.getElementById('blogLastUpdated');
    const blogIsNsfw = document.getElementById('blogIsNsfw');
    const blogAsk = document.getElementById('blogAsk');
    const askDetails = document.getElementById('askDetails');
    const blogAskAnon = document.getElementById('blogAskAnon');
    const blogAskPageTitle = document.getElementById('blogAskPageTitle');
    const blogAsksAllowMedia = document.getElementById('blogAsksAllowMedia');
    const blogShareLikes = document.getElementById('blogShareLikes');
    const visitBlogLink = document.getElementById('visitBlogLink');
    
    // Tema Bilgileri Elementleri
    const themeAvatarShape = document.getElementById('themeAvatarShape');
    const themeBgColor = document.getElementById('themeBgColor');
    const themeBgColorSwatch = document.getElementById('themeBgColorSwatch');
    const themeBodyFont = document.getElementById('themeBodyFont');
    const themeTitleFont = document.getElementById('themeTitleFont');
    const themeLinkColor = document.getElementById('themeLinkColor');
    const themeLinkColorSwatch = document.getElementById('themeLinkColorSwatch');
    const themeHeaderStretch = document.getElementById('themeHeaderStretch');

    // Gönderi Sayısı Başlığı
    const displayedPostCount = document.getElementById('displayedPostCount');
    const totalPostCountHeader = document.getElementById('totalPostCountHeader');

    const blogPostsContainer = document.getElementById('blogPostsContainer');
    const noPostsMessage = document.getElementById('noPostsMessage');

    const imageModal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalCloseButton = document.getElementById('modalCloseButton');

    function showLoading(message = "Blog bilgileri yükleniyor...") { /* ... önceki gibi ... */ }
    function hideLoading() { /* ... önceki gibi ... */ }
    function showError(message) { /* ... önceki gibi ... */ }
    function hideError() { /* ... önceki gibi ... */ }
    function openImageModal(src) { /* ... önceki gibi ... */ }

    if (blogHeaderImage) blogHeaderImage.addEventListener('click', () => openImageModal(blogHeaderImage.src));
    if (blogAvatar) blogAvatar.addEventListener('click', () => openImageModal(blogAvatar.src));
    if (modalCloseButton) modalCloseButton.addEventListener('click', () => imageModal.style.display = 'none');
    if (imageModal) imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.style.display = 'none'; });

    async function fetchAndDisplayBlogInfo() {
        // ... (fetchAndDisplayBlogInfo fonksiyonunun başı önceki gibi) ...
        const identifier = blogIdentifierInput.value.trim();
        console.log(`[BlogViewer] fetchAndDisplayBlogInfo çağrıldı. Tanımlayıcı: "${identifier}"`);

        if (!identifier) {
            showError("Lütfen bir blog adı veya URL girin.");
            console.warn("[BlogViewer] Tanımlayıcı boş, işlem iptal edildi.");
            return;
        }

        showLoading(`"${identifier}" için bilgiler getiriliyor...`);
        hideError();

        try {
            const apiUrl = `/api/get-external-blog-info?blog_identifier=${encodeURIComponent(identifier)}`;
            console.log(`[BlogViewer] API isteği gönderiliyor: ${apiUrl}`);
            
            const response = await fetch(apiUrl);
            console.log(`[BlogViewer] API yanıtı alındı. Durum: ${response.status}`, response);

            const responseText = await response.text(); 
            console.log("[BlogViewer] Ham API yanıt metni:", responseText);

            if (!response.ok) {
                let errorDetails = responseText;
                try { const errorJson = JSON.parse(responseText); errorDetails = errorJson.error || errorJson.message || responseText; } catch (e) {}
                console.error(`[BlogViewer] API Hata Yanıtı (Durum ${response.status}):`, errorDetails);
                throw new Error(errorDetails || `Blog bilgileri alınamadı. Sunucu hatası: ${response.status}`);
            }
            
            if (!responseText) { throw new Error("API'den boş yanıt alındı."); }
            const data = JSON.parse(responseText);
            console.log("[BlogViewer] Parse edilmiş API verisi:", data);

            if (data.error) { throw new Error(data.error + (data.details ? ` (Detay: ${data.details})` : '')); }
            if (!data.info || !data.info.blog) { throw new Error("Alınan blog verisi geçersiz veya eksik. 'info.blog' alanı bulunamadı.");}

            displayBlogDetails(data.info, data.posts);
            blogDetailsContainer.style.display = 'grid';
            console.log("[BlogViewer] Blog detayları başarıyla gösterildi.");

        } catch (error) {
            console.error("[BlogViewer] fetchAndDisplayBlogInfo içinde genel hata:", error);
            showError(error.message || "Blog bilgileri alınırken beklenmedik bir hata oluştu. Lütfen konsolu kontrol edin.");
        } finally {
            hideLoading();
        }
    }

    function displayBlogDetails(info, posts) {
        console.log("[BlogViewer] displayBlogDetails çağrıldı. Info:", info, "Posts:", posts);
        const blog = info.blog;

        // Genel Blog Bilgileri
        blogHeaderImage.src = blog.theme?.header_image_focused || blog.theme?.header_image || 'https://placehold.co/600x200/e2e8f0/cbd5e0?text=Header+Yok';
        const avatarObj = blog.avatar?.find(a => a.width === 128) || blog.avatar?.[0];
        blogAvatar.src = avatarObj?.url || 'https://placehold.co/100x100/e2e8f0/cbd5e0?text=Avatar+Yok';
        if (blog.theme?.avatar_shape === 'circle') {
            blogAvatar.classList.add('rounded-full');
            blogAvatar.classList.remove('rounded-md'); // Eğer varsa
        } else {
            blogAvatar.classList.add('rounded-md'); // Veya varsayılan şekli
            blogAvatar.classList.remove('rounded-full');
        }
        blogTitle.textContent = blog.title || 'Başlık Yok';
        blogName.textContent = blog.name || 'Blog Adı Yok';
        blogUuid.textContent = `UUID: ${blog.uuid || '-'}`;
        blogDescription.innerHTML = blog.description ? blog.description.replace(/\r\n/g, '<br>') : '<p class="text-slate-500 italic">Açıklama bulunmuyor.</p>';
        
        blogPostsCount.textContent = blog.posts?.toLocaleString() || '0';
        blogLikesCount.textContent = blog.share_likes && typeof blog.likes === 'number' ? blog.likes.toLocaleString() : (blog.share_likes ? 'Veri Yok' : 'Paylaşılmıyor');
        blogLastUpdated.textContent = blog.updated ? new Date(blog.updated * 1000).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }) : '-';
        blogIsNsfw.textContent = blog.is_nsfw ? 'Evet' : 'Hayır';
        blogAsk.textContent = blog.ask ? 'Evet' : 'Hayır';

        if (blog.ask) {
            askDetails.style.display = 'block';
            blogAskAnon.textContent = blog.ask_anon ? 'Evet' : 'Hayır';
            blogAskPageTitle.textContent = blog.ask_page_title || '-';
            blogAsksAllowMedia.textContent = blog.asks_allow_media ? 'Evet' : 'Hayır';
        } else {
            askDetails.style.display = 'none';
        }
        blogShareLikes.textContent = blog.share_likes ? 'Evet' : 'Hayır';
        visitBlogLink.href = blog.url || '#';

        // Tema Bilgileri
        if (blog.theme) {
            themeAvatarShape.textContent = blog.theme.avatar_shape || '-';
            themeBgColor.childNodes[0].nodeValue = blog.theme.background_color || '- '; // Metin düğümünü güncelle
            themeBgColorSwatch.style.backgroundColor = blog.theme.background_color || 'transparent';
            themeBodyFont.textContent = blog.theme.body_font || '-';
            themeTitleFont.textContent = `${blog.theme.title_font || ''} (${blog.theme.title_font_weight || 'normal'})`.trim();
            themeLinkColor.childNodes[0].nodeValue = blog.theme.link_color || '- ';
            themeLinkColorSwatch.style.backgroundColor = blog.theme.link_color || 'transparent';
            themeHeaderStretch.textContent = blog.theme.header_stretch ? 'Evet' : 'Hayır';
        }
        console.log("[BlogViewer] Blog genel ve tema bilgileri ayarlandı.");

        // Gönderiler
        totalPostCountHeader.textContent = blog.posts?.toLocaleString() || '0';
        blogPostsContainer.innerHTML = ''; 
        if (posts && posts.length > 0) {
            displayedPostCount.textContent = posts.length;
            console.log(`[BlogViewer] ${posts.length} gönderi gösterilecek.`);
            noPostsMessage.style.display = 'none';
            posts.forEach((post, index) => {
                console.log(`[BlogViewer] Gönderi #${index + 1} işleniyor:`, post);
                const postElement = createPostElement(post, blog.name);
                blogPostsContainer.appendChild(postElement);
            });
        } else {
            displayedPostCount.textContent = '0';
            console.log("[BlogViewer] Gösterilecek gönderi bulunamadı.");
            noPostsMessage.style.display = 'block';
        }
    }

    function createPostElement(post, blogNameForUrl) {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg shadow-md post-card';
        let contentHtml = '';
        let reblogInfoHtml = '';

        // Reblog bilgilerini işle
        if (post.trail && post.trail.length > 0) {
            // En üstteki (ilk) trail item genellikle orijinal posttur (is_root_item: true)
            // Veya sondan bir önceki reblogged_from olabilir.
            // Şimdilik en basitinden reblogged_from bilgilerini kullanalım.
            if (post.reblogged_from_name && post.reblogged_from_url) {
                reblogInfoHtml += `<div class="text-xs text-slate-500 mb-2">
                    <span class="font-semibold">${post.blog_name}</span> reblogged from 
                    <a href="${post.reblogged_from_url}" target="_blank" class="text-indigo-500 hover:underline">${post.reblogged_from_name}</a>
                    ${post.reblog?.comment ? `<div class="mt-1 p-2 bg-slate-50 rounded prose-custom prose-custom-xs max-w-none">${post.reblog.comment}</div>` : ''}
                </div>`;
            }
        }
        contentHtml += reblogInfoHtml;


        if (post.type === 'photo' && post.photos && post.photos.length > 0) {
            if (post.photos.length > 1) { // Photoset
                contentHtml += `<div class="photoset-grid grid-cols-${Math.min(post.photos.length, 3)}">`; // Basit grid
                post.photos.forEach(p => {
                    const displayUrl = p.alt_sizes?.find(s => s.width <= 400)?.url || p.original_size?.url || p.alt_sizes?.[0]?.url;
                    if (displayUrl) {
                        contentHtml += `<img src="${displayUrl}" alt="${p.caption || 'Photoset Image'}" class="w-full photoset-image clickable-image" data-original-src="${p.original_size?.url}">`;
                    }
                });
                contentHtml += `</div>`;
                 if (post.caption) contentHtml += `<div class="mt-2 text-sm text-slate-700 prose-custom prose-custom-sm max-w-none">${post.caption}</div>`;
            } else { // Tek fotoğraf
                const photo = post.photos[0];
                const displayUrl = photo.alt_sizes?.find(s => s.width <= 640)?.url || photo.original_size?.url || photo.alt_sizes?.[0]?.url;
                if (displayUrl) {
                    contentHtml += `<img src="${displayUrl}" alt="${post.summary || post.caption || 'Gönderi Resmi'}" class="w-full rounded-md mb-2 post-image clickable-image" data-original-src="${photo.original_size?.url}">`;
                }
                if (post.caption) contentHtml += `<div class="text-sm text-slate-700 prose-custom prose-custom-sm max-w-none">${post.caption}</div>`;
            }
        } else if (post.type === 'video' && post.player && post.player.length > 0) {
            const suitablePlayer = post.player.find(p => p.width <= 540 && p.embed_code) || post.player.find(p => p.embed_code);
            if (suitablePlayer) {
                contentHtml += `<div class="mb-2 video-embed-container">${suitablePlayer.embed_code.replace(/width="\d+"/g, 'width="100%"').replace(/height="\d+"/g, 'height="auto"')}</div>`;
            } else {
                contentHtml += `<p class="text-sm text-slate-500 italic">Video oynatıcı bulunamadı.</p>`;
            }
            if (post.caption) contentHtml += `<div class="text-sm text-slate-700 prose-custom prose-custom-sm max-w-none">${post.caption}</div>`;
        } else if (post.type === 'text') {
            if (post.title) contentHtml += `<h3 class="text-lg font-semibold text-slate-800 mb-1">${post.title}</h3>`;
            contentHtml += `<div class="text-sm text-slate-700 prose-custom prose-custom-sm max-w-none">${post.body || post.summary || ''}</div>`;
        } else if (post.type === 'link' && post.url) {
            contentHtml += `<a href="${post.url}" target="_blank" class="text-indigo-600 hover:underline font-semibold text-lg">${post.title || post.url}</a>`;
            if (post.description) contentHtml += `<div class="text-sm text-slate-600 mt-1 prose-custom prose-custom-sm max-w-none">${post.description}</div>`;
            if (post.excerpt) contentHtml += `<p class="text-xs text-slate-500 mt-1 italic">Alıntı: ${post.excerpt}</p>`;
            if (post.photos && post.photos.length > 0) { // Link gönderilerindeki thumbnail
                const photo = post.photos[0];
                const displayUrl = photo.alt_sizes?.find(s => s.width <= 250)?.url || photo.original_size?.url;
                if (displayUrl) {
                     contentHtml += `<img src="${displayUrl}" alt="Link Thumbnail" class="w-full max-w-xs rounded-md my-2 post-image">`;
                }
            }
        } else if (post.type === 'quote') {
            contentHtml += `<blockquote class="border-l-4 border-slate-400 pl-4 italic text-slate-700 my-2 text-lg">
                                <p>"${post.text || ''}"</p>
                            </blockquote>`;
            if (post.source) contentHtml += `<footer class="text-sm text-slate-500 prose-custom prose-custom-sm max-w-none">${post.source}</footer>`;
        } else if (post.type === 'chat' && post.dialogue && post.dialogue.length > 0) {
            if (post.title) contentHtml += `<h3 class="text-md font-semibold text-slate-800 mb-1">${post.title}</h3>`;
            contentHtml += `<ul class="space-y-1 text-sm list-none p-0">`;
            post.dialogue.forEach(line => {
                contentHtml += `<li class="flex"><strong class="mr-2 text-slate-600">${line.label || line.name}:</strong> <span class="text-slate-800">${line.phrase}</span></li>`;
            });
            contentHtml += `</ul>`;
        } else if (post.type === 'audio' && post.player) {
             contentHtml += `<div class="my-2">${post.player}</div>`; // Embed kodu
             if(post.track_name) contentHtml += `<p class="text-sm font-medium text-slate-700">${post.track_name}</p>`;
             if(post.artist) contentHtml += `<p class="text-xs text-slate-500">${post.artist}</p>`;
             if(post.album_art) contentHtml += `<img src="${post.album_art}" alt="Albüm Kapağı" class="w-24 h-24 rounded mt-2">`;
             if(post.caption) contentHtml += `<div class="text-sm text-slate-700 prose-custom prose-custom-sm max-w-none mt-1">${post.caption}</div>`;
        } else {
             contentHtml += `<p class="text-sm text-slate-500 italic">Bu gönderi tipi (${post.type}) için özel gösterim ayarlanmadı. Özet: ${post.summary || 'Yok'}</p>`;
        }

        const postDate = post.timestamp ? new Date(post.timestamp * 1000).toLocaleDateString('tr-TR', {day:'2-digit', month:'2-digit', year:'numeric'}) : 'Bilinmiyor';
        const postUrl = post.post_url || `https://${blogNameForUrl}.tumblr.com/post/${post.id_string || post.id}`;
        
        card.innerHTML = `
            ${contentHtml || '<p class="text-sm text-slate-500 italic">İçerik bulunamadı.</p>'}
            <div class="mt-3 pt-3 border-t border-slate-200">
                <div class="flex justify-between items-center text-xs text-slate-500">
                    <span>${post.type ? post.type.charAt(0).toUpperCase() + post.type.slice(1) : 'Bilinmeyen'} - ${postDate}</span>
                    <span title="Not Sayısı">Not: ${post.note_count?.toLocaleString() || '0'}</span>
                    <a href="${postUrl}" target="_blank" class="text-indigo-600 hover:text-indigo-800 font-medium">Gönderiye Git &rarr;</a>
                </div>
                ${post.tags && post.tags.length > 0 ? `<div class="mt-2 flex flex-wrap gap-1">${post.tags.map(tag => `<span class="tag">#${tag}</span>`).join('')}</div>` : ''}
                ${post.short_url ? `<div class="mt-1 text-xs text-slate-400">Kısa URL: <a href="${post.short_url}" target="_blank" class="hover:underline">${post.short_url}</a></div>` : ''}
            </div>
        `;
        
        card.querySelectorAll('.clickable-image').forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation(); 
                openImageModal(img.dataset.originalSrc || img.src);
            });
        });
        return card;
    }

    if (getBlogInfoButton) getBlogInfoButton.addEventListener('click', fetchAndDisplayBlogInfo);
    if (blogIdentifierInput) blogIdentifierInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); fetchAndDisplayBlogInfo(); } });
    console.log("[BlogViewer] Event listener'lar ayarlandı.");
});

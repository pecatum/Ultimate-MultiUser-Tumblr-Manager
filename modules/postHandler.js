// modules/postHandler.js
const { makeTumblrApiRequest, getTumblrAppConfig } = require('./serverUtils');

// fetchPostNotes: Hem accessToken (userToken) hem de apiKey ile çalışabilir.
// Eğer accessToken ile çalışıyorsa appUsername gerekir.
async function fetchPostNotes(params, accessToken, appUsername) { // appUsername eklendi
    const { blog_identifier, post_id, mode = 'reblogs' } = params;
    const logPrefix = `[PostHandler-${appUsername || 'APIKey'}]`; // Log için appUsername veya APIKey
    console.log(`${logPrefix} fetchPostNotes called. Blog: ${blog_identifier}, PostID: ${post_id}, Mode: ${mode}, Token (first 5):`, accessToken ? accessToken.substring(0,5) + '...' : 'NONE (API Key expected)');

    if (!blog_identifier || !post_id) {
        console.error(`${logPrefix} blog_identifier and post_id are required for fetchPostNotes.`);
        throw { statusCode: 400, message: "Notları çekmek için blog tanımlayıcısı ve gönderi ID'si gereklidir." };
    }
    
    let useApiKey = !accessToken;
    let apiKeyToUse = null;

    if (useApiKey) {
        try {
            const config = await getTumblrAppConfig();
            apiKeyToUse = config.oauthConsumerKey;
            if (!apiKeyToUse) throw new Error("API Key not found in config for notes.");
        } catch (configError) {
            console.error(`${logPrefix} Error getting API Key for notes:`, configError);
            throw { statusCode: 500, message: "Notları çekerken sunucu yapılandırma hatası."};
        }
    } else if (!appUsername) { // AccessToken var ama appUsername yoksa (bu durum olmamalı ama güvenlik için)
        console.error(`${logPrefix} AccessToken provided but appUsername is missing for token refresh capability.`);
        // Token yenileme çalışmayacağı için hata verebiliriz veya appUsername olmadan devam edebiliriz.
        // Şimdilik devam edelim, serverUtils zaten appUsername yoksa yenileme yapmaz.
    }

    const apiPath = `/blog/${blog_identifier}/notes?id=${post_id}&mode=${mode}`;
    console.log(`${logPrefix} Requesting post notes from Tumblr. Path: ${apiPath}. Using API Key: ${useApiKey}`);
    try {
        // Eğer accessToken kullanılıyorsa appUsername'i ilet
        const notesData = await makeTumblrApiRequest('GET', apiPath, accessToken, null, useApiKey, apiKeyToUse, useApiKey ? null : appUsername);
        console.log(`${logPrefix} Post notes received for ${post_id}. Notes count: ${notesData.notes ? notesData.notes.length : 'N/A'}`);
        if (!notesData || !notesData.notes) {
            console.warn(`${logPrefix} No notes found for post ${post_id} or response malformed:`, notesData);
            return { notes: [], total_notes: 0 };
        }
        return notesData;
    } catch (error) {
        console.error(`${logPrefix} Error fetching post notes for ${post_id}:`, error);
        throw error; // Hata objesi zaten serverUtils'den needsReAuth içerebilir
    }
}

async function fetchBlogOriginalPosts(params) { // Bu fonksiyon API Key ile çalışır, appUsername gerekmez
    const { blog_identifier, limit = 10, offset = 0 } = params;
    const logPrefix = `[PostHandler-APIKey]`;
    console.log(`${logPrefix} fetchBlogOriginalPosts called. Blog: ${blog_identifier}, Limit: ${limit}, Offset: ${offset}`);

    if (!blog_identifier) {
        console.error(`${logPrefix} blog_identifier is required for fetchBlogOriginalPosts.`);
        throw { statusCode: 400, message: "Blog gönderilerini çekmek için blog tanımlayıcısı gereklidir." };
    }

    let config, apiKey;
    try {
        config = await getTumblrAppConfig();
        apiKey = config.oauthConsumerKey;
        if (!apiKey) throw new Error("API Key not found in config for blog posts.");
    } catch (configError) {
        console.error(`${logPrefix} Error getting API Key for blog posts:`, configError);
        throw { statusCode: 500, message: "Blog gönderilerini çekerken sunucu yapılandırma hatası."};
    }

    let cleanIdentifier = blog_identifier;
    // ... (URL temizleme mantığı aynı kalacak)
    try {
        if (blog_identifier.includes('.') && (blog_identifier.startsWith('http') || blog_identifier.includes('tumblr.com'))) {
            const url = new URL(blog_identifier.startsWith('http') ? blog_identifier : `https://${blog_identifier}`);
            const hostnameParts = url.hostname.split('.');
            if (hostnameParts.length > 1 && hostnameParts[hostnameParts.length-2] === 'tumblr' && hostnameParts[hostnameParts.length-1] === 'com') {
                cleanIdentifier = hostnameParts[0];
            } else { 
                cleanIdentifier = url.hostname;
            }
        } else if (blog_identifier.includes('/')) {
             const pathParts = blog_identifier.split('/');
             const blogNameFromPath = pathParts.pop() || pathParts.pop();
             if (blogNameFromPath) cleanIdentifier = blogNameFromPath;
        }
    } catch (e) { console.warn(`${logPrefix} Could not parse '${blog_identifier}' as URL for original posts, using as is.`); }
    
    console.log(`${logPrefix} Cleaned identifier for original posts: ${cleanIdentifier}`);

    const apiPath = `/blog/${cleanIdentifier}/posts?limit=${limit}&offset=${offset}&reblog_info=true&notes_info=false`;
    console.log(`${logPrefix} Requesting blog posts from Tumblr for original check. Path: ${apiPath}`);
    try {
        const blogPostsData = await makeTumblrApiRequest('GET', apiPath, null, null, true, apiKey, null); // API Key ile çağrı
        console.log(`${logPrefix} Received ${blogPostsData.posts ? blogPostsData.posts.length : 0} posts for ${cleanIdentifier} before filtering.`);

        if (blogPostsData && blogPostsData.posts) {
            const originalPosts = blogPostsData.posts.filter(post => !post.reblogged_from_id && !post.reblogged_root_id);
            console.log(`${logPrefix} Filtered to ${originalPosts.length} original posts for ${cleanIdentifier}.`);
            return { ...blogPostsData, posts: originalPosts, blog: blogPostsData.blog }; 
        } else {
            console.warn(`${logPrefix} No posts found for ${cleanIdentifier} or response malformed:`, blogPostsData);
            return { posts: [], blog: blogPostsData ? blogPostsData.blog : null, total_posts: 0 };
        }
    } catch (error) {
        console.error(`${logPrefix} Error fetching blog posts for ${cleanIdentifier}:`, error);
        throw error;
    }
}

async function fetchPostsForBlog(params, accessToken, appUsername) { // appUsername eklendi
    const { 
        blog_identifier, 
        limit = 20, 
        offset = 0, 
        npf = true,
        notes_info = false, 
        reblog_info = true,
        type = null,
        before = null,
        after = null
    } = params;
    const logPrefix = `[PostHandler-${appUsername}]`;

    if (!blog_identifier) {
        throw { statusCode: 400, message: "Blog kimliği ('blog_identifier') gereklidir." };
    }
    if (!accessToken) {
        throw { statusCode: 401, message: "Bu işlem için erişim token'ı gereklidir.", needsReAuth: true };
    }

    const apiPath = `/blog/${blog_identifier}/posts${type ? '/' + type : ''}`;
    
    const queryParams = { limit, offset, npf, notes_info, reblog_info };
    if (before) queryParams.before = before;
    if (after) queryParams.after = after;
    
    try {
        console.log(`${logPrefix} Blog için gönderiler çekiliyor: ${blog_identifier}, Parametreler: ${JSON.stringify(queryParams)}. Token (ilk 5): ${accessToken.substring(0,5)}...`);
        // makeTumblrApiRequest'e appUsername parametresini ekle
        const response = await makeTumblrApiRequest('GET', apiPath, accessToken, queryParams, false, null, appUsername);
        
        if (response && Array.isArray(response.posts)) {
            console.log(`${logPrefix} ${blog_identifier} için ${response.posts.length} gönderi başarıyla çekildi. Toplam mevcut: ${response.total_posts || 'Bilinmiyor'}`);
            return response; 
        } else {
            console.warn(`${logPrefix} ${blog_identifier} için gönderi bulunamadı veya beklenmedik yanıt yapısı:`, response);
            return { blog: response ? response.blog : null, posts: [], total_posts: 0 };
        }
    } catch (error) {
        console.error(`${logPrefix} ${blog_identifier} için gönderi çekme hatası:`, error);
        throw error; // Hata objesi zaten serverUtils'den needsReAuth içerebilir
    }
}

module.exports = {
    fetchPostNotes,
    fetchBlogOriginalPosts,
    fetchPostsForBlog
};
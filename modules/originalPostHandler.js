// modules/originalPostHandler.js
const { makeTumblrApiRequest, getTumblrAppConfig } = require('./serverUtils.js');

/**
 * Belirtilen bir blogun BÜTÜN orijinal gönderilerini (reblog olmayan) çeker.
 * Bu fonksiyon, aynı anda en fazla 5 API isteği çalıştıran bir görev havuzu kullanarak,
 * bir blogdaki tüm gönderileri verimli bir şekilde toplar.
 *
 * @param {object} params - API eyleminden gelen parametreler.
 * @param {string} params.blog_identifier - Hedef blogun adı (örn: "staff").
 * @param {string} [params.tag] - Gönderileri etikete göre filtrelemek için (opsiyonel).
 * @param {string} [params.type] - Gönderi tipine göre filtrelemek için (photo, text, vb. - opsiyonel).
 * @returns {Promise<object>} - Blog detaylarını ve BÜTÜN filtrelenmiş orijinal gönderi listesini içeren bir nesne.
 */
async function fetchBlogOriginalPosts(params) {
    console.log(`[originalPostHandler] Fetching ALL original posts for blog: ${params.blog_identifier} with controlled concurrency.`);

    const config = await getTumblrAppConfig();
    const apiKey = config.oauthConsumerKey;
    if (!apiKey) {
        throw { statusCode: 500, message: "Tumblr API Key (oauthConsumerKey) config.xml dosyasında bulunamadı." };
    }

    // --- Adım 1: Toplam gönderi sayısını ve blog bilgisini al ---
    let totalPosts = 0;
    let blogInfo = null;
    try {
        const initialResponse = await makeTumblrApiRequest('GET', `/blog/${params.blog_identifier}/posts`, null, { limit: 1 }, true, apiKey);
        if (!initialResponse || typeof initialResponse.total_posts === 'undefined') {
            throw { statusCode: 404, message: "Blog bulunamadı veya gönderi bilgisi alınamadı." };
        }
        totalPosts = initialResponse.total_posts;
        blogInfo = initialResponse.blog;
        console.log(`[originalPostHandler] Blog '${params.blog_identifier}' has ${totalPosts} posts. Starting fetch process...`);
    } catch (error) {
        console.error(`[originalPostHandler] Error during initial API call for blog: ${params.blog_identifier}:`, error);
        throw error;
    }

    if (totalPosts === 0) {
        return { blog: blogInfo, posts: [], total_posts_on_blog: 0, fetched_original_posts_count: 0 };
    }

    // --- Adım 2: Paralel görev havuzunu kur ve çalıştır ---
    const allFetchedPosts = [];
    const concurrencyLimit = 5; // Aynı anda çalışacak maksimum istek sayısı
    const limitPerRequest = 20; // Her API isteğinde çekilecek gönderi sayısı
    const requestOffsets = [];

    // Yapılacak tüm isteklerin offset'lerini bir diziye doldur.
    for (let i = 0; i < totalPosts; i += limitPerRequest) {
        requestOffsets.push(i);
    }
    
    let activeRequests = 0;
    let requestIndex = 0;
    const promises = [];

    const worker = async () => {
        while(requestIndex < requestOffsets.length) {
            const currentIndex = requestIndex++;
            const offset = requestOffsets[currentIndex];

            const apiParams = {
                limit: limitPerRequest,
                offset: offset,
                notes_info: true,
                reblog_info: true
            };
            if (params.type && params.type !== 'all') apiParams.type = params.type;
            if (params.tag) apiParams.tag = params.tag;
            
            try {
                // console.log(`[Worker] Starting request for offset ${offset}`);
                const response = await makeTumblrApiRequest('GET', `/blog/${params.blog_identifier}/posts`, null, apiParams, true, apiKey);
                if (response && response.posts) {
                    allFetchedPosts.push(...response.posts);
                }
            } catch (err) {
                // Bir istek hata verse bile diğerlerini engelleme, sadece konsola yazdır.
                console.error(`[Worker] Error fetching offset ${offset} for blog ${params.blog_identifier}:`, err.message);
            }
        }
    };
    
    console.log(`[originalPostHandler] Starting ${concurrencyLimit} parallel workers for ${requestOffsets.length} total requests.`);
    // Belirtilen sayıda (5) worker'ı başlat
    for (let i = 0; i < concurrencyLimit; i++) {
        promises.push(worker());
    }

    // Tüm worker'ların işlerini bitirmesini bekle
    await Promise.all(promises);
    console.log(`[originalPostHandler] All workers finished. Total posts fetched: ${allFetchedPosts.length}.`);

    // --- Adım 3: Sonuçları filtrele ve formatla ---
    const originalPosts = allFetchedPosts.filter(post => post && !post.reblogged_from_id && !post.reblogged_from_name);
    console.log(`[originalPostHandler] Found ${originalPosts.length} original posts.`);

    const formattedPosts = originalPosts.map(post => {
        let imageUrl = null;
        if (post.type === 'photo' && post.photos && post.photos.length > 0) {
            imageUrl = post.photos[0].alt_sizes.find(s => s.width <= 400)?.url || post.photos[0].original_size.url;
        } else if (post.type === 'video' && post.thumbnail_url) {
            imageUrl = post.thumbnail_url;
        }
        return {
            id: post.id_string, type: post.type, tumblrLink: post.post_url, date: post.date,
            notes: post.note_count, tags: post.tags, title: post.title || post.summary || (post.type === 'quote' ? post.text : null),
            imageUrl: imageUrl
        };
    });

    return {
        blog: blogInfo,
        posts: formattedPosts,
        total_posts_on_blog: totalPosts,
        fetched_original_posts_count: formattedPosts.length
    };
}

module.exports = {
    fetchBlogOriginalPosts
};

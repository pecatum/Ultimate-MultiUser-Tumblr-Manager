// modules/blogInfoHandler.js
// Bu dosya, herhangi bir blogun bilgilerini API anahtarı ile çekmek için kullanılır.
// userInfoHandler.js'den farklıdır, o giriş yapmış kullanıcıların token'ları ile çalışır.

const { getTumblrAppConfig, makeTumblrApiRequest } = require('./serverUtils'); // serverUtils.js ile aynı klasörde

async function getExternalBlogData(params) { // İstemciden gelen params objesini alır
    const blogIdentifier = params.blog_identifier; // modules.xml'deki param name ile eşleşmeli

    if (!blogIdentifier) {
        console.error("getExternalBlogData: blog_identifier parameter is missing.");
        throw new Error("Blog tanımlayıcısı (blog_identifier) gereklidir.");
    }

    let cleanIdentifier = blogIdentifier;
    try {
        // Basit URL temizleme (daha önce olduğu gibi)
        if (blogIdentifier.includes('.') && (blogIdentifier.startsWith('http') || blogIdentifier.includes('tumblr.com'))) {
            const url = new URL(blogIdentifier.startsWith('http') ? blogIdentifier : `https://${blogIdentifier}`);
            const hostnameParts = url.hostname.split('.');
            if (hostnameParts.length > 1 && hostnameParts[hostnameParts.length-2] === 'tumblr' && hostnameParts[hostnameParts.length-1] === 'com') {
                cleanIdentifier = hostnameParts[0];
            } else { 
                cleanIdentifier = url.hostname;
            }
        } else if (blogIdentifier.includes('/')) {
             const pathParts = blogIdentifier.split('/');
             const blogNameFromPath = pathParts.pop() || pathParts.pop();
             if (blogNameFromPath) cleanIdentifier = blogNameFromPath;
        }
    } catch (e) {
        console.warn(`getExternalBlogData: Could not parse '${blogIdentifier}' as URL, using as is. Error: ${e.message}`);
    }
    
    console.log(`getExternalBlogData: Fetching data for clean blog identifier: ${cleanIdentifier}`);

    const config = await getTumblrAppConfig();
    const apiKey = config.oauthConsumerKey; 

    if (!apiKey) {
        console.error("getExternalBlogData: Tumblr API Consumer Key not found in config.");
        throw new Error("Tumblr API Consumer Key bulunamadı. config.xml dosyasını kontrol edin.");
    }

    // API Key ile çağrı yaparken accessToken null, isApiKeyCall true ve apiKey gönderilir.
    // makeTumblrApiRequest path'e api_key'i kendisi ekleyecek.
    const infoPath = `/blog/${cleanIdentifier}/info`; // api_key'i makeTumblrApiRequest ekleyecek
    let blogInfo;
    try {
        blogInfo = await makeTumblrApiRequest('GET', infoPath, null, null, true, apiKey);
    } catch (infoError) {
        console.error(`getExternalBlogData: Error fetching blog info for ${cleanIdentifier}:`, infoError);
        throw new Error(`Blog bilgileri alınamadı (${cleanIdentifier}): ${infoError.message || 'API hatası'}`);
    }

    const postsPath = `/blog/${cleanIdentifier}/posts`; // api_key'i makeTumblrApiRequest ekleyecek
    let blogPosts = [];
    try {
        // reblog_info ve notes_info gibi ek parametreleri de path'e ekleyebiliriz.
        // Şimdilik sadece limit ekleyelim.
        const postsApiPath = `${postsPath}?limit=10&reblog_info=true`;
        const postsData = await makeTumblrApiRequest('GET', postsApiPath, null, null, true, apiKey);
        blogPosts = postsData.posts || [];
    } catch (postsError) {
        console.warn(`getExternalBlogData: Could not fetch posts for ${cleanIdentifier}. Error: ${postsError.message || 'API hatası'}`);
    }

    return {
        info: blogInfo, // Bu zaten .response objesini içermeli (makeTumblrApiRequest'e göre)
        posts: blogPosts
    };
}

module.exports = {
    getExternalBlogData // Bu fonksiyonu dışa aktar
};

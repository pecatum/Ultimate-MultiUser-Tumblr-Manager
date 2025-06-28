// modules/followHandler.js
const { makeTumblrApiRequest } = require('./serverUtils'); // serverUtils.js ile aynı klasörde olmalı

async function followBlog(params, accessToken) {
    const logPrefix = `[FollowHandler]`;
    console.log(`${logPrefix} followBlog called. Params:`, params, 'Token (first 5):', accessToken ? accessToken.substring(0,5) + '...' : 'NONE');
    if (!accessToken) {
        const errorMsg = `${logPrefix} Access token is required to follow a blog.`;
        console.error(errorMsg);
        throw { statusCode: 401, message: "Blog takip etmek için kullanıcı token'ı gereklidir." };
    }
    const { blog_url } = params; 
    if (!blog_url || typeof blog_url !== 'string' || blog_url.trim() === '') {
        const errorMsg = `${logPrefix} blog_url parameter is required and must be a non-empty string.`;
        console.error(errorMsg, "Received params:", params);
        throw { statusCode: 400, message: "Takip edilecek blogun URL'si gereklidir." };
    }

    const apiPath = `/user/follow`;
    const postData = {
        url: blog_url 
    };
    
    console.log(`${logPrefix} Attempting to follow blog. Path: ${apiPath}, Data:`, JSON.stringify(postData));
    try {
        const result = await makeTumblrApiRequest('POST', apiPath, accessToken, postData);
        console.log(`${logPrefix} Follow request processed for ${blog_url}. Tumblr API Result:`, JSON.stringify(result, null, 2));
        
        if (result && result.blog && result.blog.name) {
             console.log(`${logPrefix} Blog ${result.blog.name} successfully followed.`);
             return { success: true, message: `Blog "${result.blog.name}" başarıyla takip edildi.`, followed_blog: result.blog };
        } else if (result !== undefined) { 
            console.warn(`${logPrefix} Follow request for ${blog_url} did not return expected blog object, but no error thrown. Assuming success. Response:`, result);
            return { success: true, message: `Blog "${blog_url}" için takip isteği gönderildi (yanıt detayı eksik olabilir).`, apiResponse: result };
        } else { 
             console.warn(`${logPrefix} Follow request for ${blog_url} returned undefined/null result, assuming success if no error was thrown.`);
            return { success: true, message: `Blog "${blog_url}" için takip isteği gönderildi (API yanıtı boş olabilir).`, apiResponse: result };
        }
    } catch (error) {
        console.error(`${logPrefix} Error following blog ${blog_url}:`, JSON.stringify(error, null, 2));
        const statusCode = error.statusCode || 500;
        let userFriendlyMessage = `Blog "${blog_url}" takip edilemedi (durum ${statusCode}).`;
        if (error.details && error.details.errors && error.details.errors.length > 0) {
            userFriendlyMessage += ` Detay: ${error.details.errors[0].title || error.details.errors[0].detail || error.details.errors[0].code}`;
        } else if (error.details && typeof error.details === 'string') {
             userFriendlyMessage += ` Detay: ${error.details}`;
        } else if (error.message) {
            userFriendlyMessage += ` Detay: ${error.message}`;
        }
        throw { statusCode: statusCode, success: false, message: userFriendlyMessage, details: error.details };
    }
}

module.exports = {
    followBlog
};

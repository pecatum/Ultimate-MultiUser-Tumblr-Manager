// modules/dashboardHandler.js
const { makeTumblrApiRequest } = require('./serverUtils');

async function fetchDashboardPosts(params, accessToken) {
    const logPrefix = `[DashboardHandler]`;
    console.log(`${logPrefix} fetchDashboardPosts called. Params:`, params, 'Token (first 5):', accessToken ? accessToken.substring(0,5) + '...' : 'NONE');
    if (!accessToken) {
        const errorMsg = `${logPrefix} Access token is required to fetch dashboard posts.`;
        console.error(errorMsg);
        throw { statusCode: 401, message: "Panel gönderilerini çekmek için kullanıcı token'ı gereklidir." };
    }

    const limit = params.limit || 20;
    const since_id = params.since_id || undefined;
    // notes_info ve reblog_info'nun boolean olduğundan emin olalım.
    const notes_info = params.notes_info === true || params.notes_info === 'true' || true; 
    const reblog_info = params.reblog_info === true || params.reblog_info === 'true' || true;

    let apiPath = `/user/dashboard?limit=${limit}&notes_info=${notes_info}&reblog_info=${reblog_info}`;
    if (since_id) {
        apiPath += `&since_id=${since_id}`;
    }
    
    console.log(`${logPrefix} Requesting dashboard from Tumblr. Path: ${apiPath}`);
    try {
        const dashboardData = await makeTumblrApiRequest('GET', apiPath, accessToken);
        console.log(`${logPrefix} Dashboard data received. Number of posts: ${dashboardData && dashboardData.posts ? dashboardData.posts.length : 'N/A'}.`);
        // console.log(`${logPrefix} Full dashboard response:`, JSON.stringify(dashboardData, null, 2)); // Çok uzun olabilir, dikkatli kullanın
        if (!dashboardData || !dashboardData.posts) {
            console.warn(`${logPrefix} No posts found in dashboard response or response is malformed:`, dashboardData);
            return { posts: [] }; 
        }
        return dashboardData; 
    } catch (error) {
        console.error(`${logPrefix} Error fetching dashboard posts:`, JSON.stringify(error, null, 2));
        throw { statusCode: error.statusCode || 500, message: "Panel gönderileri çekilemedi.", details: error.details || error.message };
    }
}

module.exports = {
    fetchDashboardPosts
};

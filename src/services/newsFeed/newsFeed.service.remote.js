import { httpService } from '../http.service'

export const newsFeedService = {
    getArticles,
}

async function getArticles() {
    const res = await httpService.get('news-feed')
    return Array.isArray(res?.articles) ? res.articles : []
}

import sys
import json
import time
import os
import random
from datetime import datetime
from dotenv import load_dotenv
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# 한글 출력 인코딩 설정
sys.stdout.reconfigure(encoding='utf-8')

# .env 로드
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, '..', '.env')
load_dotenv(dotenv_path=env_path)

def parse_cookies(cookie_string):
    """쿠키 문자열 파싱 -> Playwright 쿠키 객체 리스트"""
    cookies = []
    if not cookie_string:
        return cookies
    for item in cookie_string.split(';'):
        if '=' in item:
            try:
                name, value = item.strip().split('=', 1)
                cookies.append({
                    'name': name, 
                    'value': value, 
                    'domain': '.x.com', 
                    'path': '/'
                })
            except ValueError:
                continue
    return cookies

def search_twitter_playwright(query, max_results=70):
    try:
        cookie_string = os.environ.get('TWITTER_COOKIES', '')
        if not cookie_string:
            print(json.dumps({"error": "TWITTER_COOKIES environment variable not found"}))
            return

        cookies = parse_cookies(cookie_string)
        
        with sync_playwright() as p:
            # 브라우저 실행
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-setuid-sandbox"
                ]
            )
            
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800}
            )
            context.add_cookies(cookies)
            
            page = context.new_page()
            
            # 검색 페이지 이동
            search_url = f"https://x.com/search?q={query}&src=typed_query&f=live"
            
            try:
                page.goto(search_url, timeout=60000, wait_until="domcontentloaded")
            except Exception as e:
                print(json.dumps({"error": "Page load timeout", "details": str(e)}))
                browser.close()
                return

            try:
                page.wait_for_selector('article[data-testid="tweet"]', timeout=20000)
            except:
                print(json.dumps([]))
                browser.close()
                return

            # 스크롤링 및 데이터 수집
            unique_tweets = {}
            scroll_attempts = 0
            # 100개를 채우기 위해 스크롤 횟수를 넉넉하게 설정 (한 번에 10~15개 로딩됨)
            max_scrolls = 20 
            
            # 목표 개수를 채우거나 최대 스크롤 횟수에 도달할 때까지 반복
            while len(unique_tweets) < int(max_results) and scroll_attempts < max_scrolls:
                content = page.content()
                soup = BeautifulSoup(content, 'html.parser')
                
                articles = soup.find_all('article', {'data-testid': 'tweet'})
                
                for article in articles:
                    try:
                        text_div = article.find('div', {'data-testid': 'tweetText'})
                        text = text_div.get_text(separator="\n") if text_div else ""
                        
                        # 해시태그 추출
                        tags = []
                        if text_div:
                            hashtag_elements = text_div.find_all('a', href=True)
                            for tag in hashtag_elements:
                                if '/hashtag/' in tag['href']:
                                    tags.append(tag.get_text())
                        
                        user_div = article.find('div', {'data-testid': 'User-Name'})
                        if user_div:
                            user_text = user_div.get_text(separator="|").split('|')
                            name = user_text[0] if len(user_text) > 0 else "Unknown"
                            handle = next((s for s in user_text if s.startswith('@')), "unknown")
                        else:
                            name = "Unknown"
                            handle = "unknown"
                            
                        img_tag = article.find('div', {'data-testid': 'Tweet-User-Avatar'}).find('img')
                        profile_image_url = img_tag['src'] if img_tag else ""
                        
                        time_tag = article.find('time')
                        created_at = time_tag['datetime'] if time_tag else datetime.now().isoformat()
                        
                        links = article.find_all('a')
                        tweet_url = ""
                        tweet_id = str(random.randint(100000, 999999))
                        
                        for link in links:
                            href = link.get('href', '')
                            if '/status/' in href and handle.replace('@', '') in href:
                                tweet_url = f"https://x.com{href}"
                                tweet_id = href.split('/')[-1]
                                break
                        
                        metrics = {
                            'likes': 0,
                            'retweets': 0, 
                            'replies': 0,
                            'quotes': 0,
                            'views': 0
                        }
                        
                        # 파싱한 트윗이 아직 없으면 추가
                        if tweet_id not in unique_tweets:
                            unique_tweets[tweet_id] = {
                                'id': tweet_id,
                                'text': text,
                                'created_at': created_at,
                                'author': {
                                    'name': name,
                                    'screen_name': handle,
                                    'profile_image_url': profile_image_url
                                },
                                'metrics': metrics,
                                'url': tweet_url
                            }
                            
                    except Exception as e:
                        continue

                # 목표 개수 도달 시 중단
                if len(unique_tweets) >= int(max_results):
                    break

                # 스크롤 다운 (조금 더 많이 내리도록 수정)
                page.evaluate("window.scrollBy(0, 3000)")
                time.sleep(2.5) # 로딩 시간 확보
                scroll_attempts += 1
                
            browser.close()
            
            # 정확히 요청한 개수만큼 자름
            results = list(unique_tweets.values())[:int(max_results)]
            print(json.dumps(results, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": "Playwright Script Error", "details": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python twitter_search.py <query> [max_results]"}))
    else:
        query = sys.argv[1]
        max_res = sys.argv[2] if len(sys.argv) > 2 else 70 # 기본값을 70으로 변경
        search_twitter_playwright(query, max_res)

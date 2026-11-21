import asyncio, time, subprocess, json
from playwright.async_api import async_playwright
B="http://127.0.0.1:8787"; EMAIL=f"p{int(time.time())}@example.com"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox","--no-proxy-server"])
        for w,h,tag in [(390,780,"a"),(320,568,"s")]:
            cx = await b.new_context(viewport={"width":w,"height":h}, device_scale_factor=2, is_mobile=True, has_touch=True)
            pg = await cx.new_page(); errs=[]
            pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(B); await pg.wait_for_selector("#authForm", state="visible")
            if tag=="a":
                await pg.fill("#aName","Pat"); await pg.fill("#aEmail",EMAIL); await pg.fill("#aPass","longenough12"); await pg.fill("#aBirth","1985-06-10"); await pg.click("#authGo")
            else:
                await pg.click("#authSwap"); await pg.fill("#aEmail",EMAIL); await pg.fill("#aPass","longenough12"); await pg.click("#authGo")
            await pg.wait_for_selector(".tile"); await pg.wait_for_timeout(500)
            over = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            small = await pg.evaluate("[...document.querySelectorAll('#app button, #app a')].filter(e=>e.offsetParent && (e.getBoundingClientRect().height<40)).map(e=>e.className+':'+Math.round(e.getBoundingClientRect().height))")
            print(tag, "h-overflow", over, "small targets", small, "unlock card:", await pg.locator(".unlock").count())
            await pg.screenshot(path=f"/tmp/m_{tag}1.png")
            if tag=="a":
                await pg.click(".idea >> nth=0"); await pg.wait_for_selector("#pwGo"); print("pay href:", (await pg.get_attribute("#pwGo","href"))[:70]); await pg.screenshot(path="/tmp/m_a2.png")
                uid = json.loads(subprocess.run(["npx","wrangler","d1","execute","cardblueprint-daily","--local","--json","--command",f"SELECT id FROM users WHERE email='{EMAIL}'"],capture_output=True,text=True).stdout)[0]["results"][0]["id"]
                await pg.goto(B+"/?paid=1"); await pg.wait_for_selector(".tile"); await pg.wait_for_timeout(300); print("notice:", await pg.inner_text("#notice"))
                print(subprocess.run(["node","test/stripe-event.mjs","checkout.session.completed",uid],capture_output=True,text=True).stdout.strip())
                await pg.wait_for_timeout(3000); print("unlock card after pay:", await pg.locator(".unlock").count(), "url:", pg.url)
                await pg.click(".idea >> nth=0"); await pg.wait_for_selector(".bot .bubble:not(:has(.thinking))"); await pg.wait_for_timeout(300); print("answer:", (await pg.locator(".bot .bubble").last.inner_text())[:60])
                await pg.click("#accountBtn"); await pg.wait_for_timeout(200); print("acct:", await pg.inner_text("#acSub"), "|", await pg.locator("#acBill a").count()); await pg.screenshot(path="/tmp/m_a3.png")
            print("errors", errs); await cx.close()
        await b.close()
asyncio.run(main())

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";
import { prisma } from "@/lib/prisma";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { query, maxResults = 10 } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    const scriptPath = path.join(process.cwd(), "scripts", "twitter_search.py");
    
    console.log("Executing Python script at:", scriptPath);

    const pythonProcess = spawn("python", [scriptPath, query, maxResults.toString()], {
      env: {
        ...process.env,
        TWITTER_COOKIES: process.env.TWITTER_COOKIES || "",
      }
    });

    let dataString = "";
    let errorString = "";

    const tweets = await new Promise<any[]>((resolve, reject) => {
      pythonProcess.stdout.on("data", (data) => {
        dataString += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        errorString += data.toString();
      });

      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error output:", errorString);
          reject(new Error(`Python script exited with code ${code}: ${errorString}`));
          return;
        }

        if (!dataString.trim()) {
            console.error("Python script returned empty output");
            resolve([]); // 빈 결과 반환
            return;
        }

        try {
          const results = JSON.parse(dataString);
          if (results.error) {
             console.error("Python logic error:", results.error);
             reject(new Error(results.error));
             return;
          }
          resolve(results);
        } catch (e) {
          console.error("JSON parse error:", e);
          reject(new Error("Failed to parse script output"));
        }
      });
    });

    // DB에 저장 (Upsert)
    const savedTweets = [];
    for (const tweet of tweets) {
        try {
            const saved = await prisma.tweet.upsert({
                where: { tweetId: tweet.id },
                update: {
                    // 이미 존재하면 업데이트할 필드들 (필요 시)
                    metrics: tweet.metrics,
                },
                create: {
                    tweetId: tweet.id,
                    searchQuery: query,
                    content: tweet.text,
                    username: tweet.author.name,
                    screenName: tweet.author.screen_name,
                    profileImageUrl: tweet.author.profile_image_url,
                    postedAt: new Date(tweet.created_at),
                    url: tweet.url,
                    tags: tweet.tags || [],
                    metrics: tweet.metrics,
                }
            });
            savedTweets.push(saved);
        } catch (dbError) {
            console.error("Failed to save tweet:", tweet.id, dbError);
        }
    }

    return NextResponse.json({ 
        tweets: tweets,
        savedCount: savedTweets.length 
    }, { headers: { "Access-Control-Allow-Origin": "*" } });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

import { NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file")

    console.log(file)

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: "Say OpenAI connection successful"
        }
      ]
    })

    return NextResponse.json({
      result: completion.choices[0].message.content
    })
  } catch (error) {
    console.error(error)

    return NextResponse.json({
      error: "Something went wrong"
    })
  }
}
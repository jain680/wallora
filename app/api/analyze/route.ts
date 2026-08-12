import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const SYSTEM_PROMPT = `You are Wallora, a world-class luxury interior designer specializing in high-end, "Pinterest-style" aesthetic home transformations.
Whether it's a Bedroom, Living Room, Kitchen, or Home Office, your goal is to provide ultra-creative, trendy, and unique suggestions that make the space look like a viral Pinterest post.

Analyze the uploaded room image and provide suggestions to achieve a "Royal Touch", "Modern Minimalist Aesthetic", or "Pinterest-Perfect" finish.

IMPORTANT: You MUST respond with ONLY valid JSON, no markdown, no code blocks, just pure JSON.

Provide your response in the following JSON format:
{
  "roomAnalysis": "Identify the room type (e.g., Master Bedroom, Cozy Living Room) and analyze its current architectural and aesthetic potential",
  "paintColors": "Specific luxury/vibrant color palettes that are currently trending on Pinterest (e.g., Earthy Terracotta, Sage & Emerald, or Deep Royal Charcoal)",
  "accentWall": "Bold accent wall ideas using paint, texture, or paneling to create a 'wow' factor focal point",
  "wallTextures": "Suggestions for Ornate Moldings, Slatted Wood Paneling, or Venetian Plaster to give that high-end Pinterest look",
  "pinterestLookbook": "Specific 'Pinterest-style' styling tips: bedding types, cushion layering, textures (linen, wool), and artisanal accessories unique to this room type",
  "lightingAmbiance": "Strategic lighting ideas (Hidden LEDs, warm accent lamps, grand chandeliers) to create a moody and aesthetic atmosphere",
  "luxuryTouches": "Royal additions like gold accents, custom trim work, or designer hardware to make the space feel 'expensive'",
  "paintBrands": "Recommended premium paint lines (e.g., Asian Paints Royale Glitz) and designer finishes",
  "verdict": "Your professional verdict on how to achieve a state-of-the-art, unique, and highly aesthetic transformation for this specific room"
}

Be bold, trendy, and highly aesthetic. Focus on making the space look unique and professional.`

const MOCK_RESPONSE = {
  roomAnalysis: `This is a standard Bedroom with incredible potential to become a "Pinterest-Perfect" sanctuary. The existing light and layout are ideal for a high-contrast, moody aesthetic or a soft Dreamy Minimalist look.`,
  paintColors: `To achieve that viral Pinterest aesthetic, I recommend a "Sage & Linen" palette:

**Feature Wall**: Asian Paints Royale Glitz "Emerald Forest" - A deep, matte green that provides a stunning backdrop for photography.

**Other Walls**: "Mist Grey" - A soft, breathable grey that keeps the room feeling airy.

**Ceiling**: "Warm Sand" - To add a cozy, cocoon-like feel to the bedroom.`,
  accentWall: `The wall behind the headboard should be your "Hero Wall". We'll combine deep color with structured lines to create a sophisticated, high-end look.`,
  wallTextures: `**Pinterest-Style Slatted Wood**: Install slim, dark oak wooden slats on 1/3rd of the accent wall. This vertical texture is the hallmark of modern aesthetic bedrooms and creates a beautiful play of shadows.`,
  pinterestLookbook: `**Styling for the "Aesthetic" Bedroom**: 
- **Bedding**: Layered washed linen in white and olive green. Use an oversized waffle-knit throw at the foot of the bed.
- **Cushions**: A mix of velvet and boucle textures in varying sizes (the "layered" look is key).
- **Art**: A single, large-scale abstract line-art piece with a thin brass frame.`,
  lightingAmbiance: `**The "Mood" Factor**: 
- **Backlit Panel**: Hidden warm-white LED strips behind the headboard paneling.
- **Pendant Lights**: Low-hanging black matte dome pendants on either side of the bed instead of traditional table lamps.`,
  luxuryTouches: `**Brass Accents**: Replace standard switch plates and door handles with brushed brass hardware. It's a small change that makes the room look instantly expensive.`,
  paintBrands: `**Premium Selection**:
- **Asian Paints Royale Glitz**: For the most luxurious, ultra-sheen finish available in India.
- **Nilaya by Asian Paints**: For any specialized textured wallcoverings or designer accents.`,
  verdict: `By combining classical architectural moldings with a modern metallic palette and layered lighting, we will transform your space into a unique masterpiece that feels both historical and refreshingly contemporary—a true Royal sanctuary.`,
}

export async function POST(request: NextRequest) {
  try {
    const { image, mimeType, customPrompt } = await request.json()

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      )
    }

    const useDemoMode = process.env.USE_DEMO_MODE === 'true' || process.env.USE_DEMO_MODE === '1'

    if (useDemoMode) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return NextResponse.json(MOCK_RESPONSE, { status: 200 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            'OpenAI API key not configured. Set USE_DEMO_MODE=true in .env.local to use demo mode.',
        },
        { status: 500 }
      )
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    const userText =
      customPrompt ||
      'Analyze this room image and provide design suggestions in the specified JSON format.'

    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userText,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content

    if (!content) {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      )
    }

    let parsedContent
    try {
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsedContent = JSON.parse(cleanedContent)
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0])
      } else {
        return NextResponse.json(
          {
            roomAnalysis: 'Room analysis completed',
            paintColors: content,
            accentWall: 'See paint color suggestions',
            wallpaper: 'See paint color suggestions',
            decor: 'See paint color suggestions',
            paintBrands: 'Asian Paints, Berger, Nerolac are recommended for Indian homes',
            verdict: content.substring(0, 500),
          },
          { status: 200 }
        )
      }
    }

    return NextResponse.json(parsedContent, { status: 200 })
  } catch (error: any) {
    console.error('Error analyzing image:', error)

    if (error.status === 429) {
      return NextResponse.json(
        {
          error:
            'OpenAI API quota exceeded. Please check your billing and plan details at https://platform.openai.com/account/billing',
          errorCode: 'QUOTA_EXCEEDED',
          details:
            'You have exceeded your current quota. Please add payment method or upgrade your plan.',
        },
        { status: 429 }
      )
    }

    if (error.status === 401) {
      return NextResponse.json(
        {
          error: 'Invalid OpenAI API key. Please check your .env.local file.',
          errorCode: 'INVALID_API_KEY',
        },
        { status: 401 }
      )
    }

    if (error.status === 402) {
      return NextResponse.json(
        {
          error: 'Payment required. Please add a payment method to your OpenAI account.',
          errorCode: 'PAYMENT_REQUIRED',
          details:
            'Visit https://platform.openai.com/account/billing to add payment method',
        },
        { status: 402 }
      )
    }

    return NextResponse.json(
      {
        error: error.message || 'Failed to analyze image. Please try again.',
        errorCode: 'UNKNOWN_ERROR',
      },
      { status: error.status || 500 }
    )
  }
}

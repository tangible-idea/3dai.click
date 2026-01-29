import { NextResponse } from 'next/server';

export const maxDuration = 60; // Set max duration to 60 seconds for long generations

export async function POST(req: Request) {
  try {
    const { image, style } = await req.json();

    if (!image) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.POE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'POE_API_KEY is not configured' },
        { status: 500 }
      );
    }

    let stylePrompt = '';
    switch (style) {
      case 'cartoon':
        stylePrompt = 'Style: Cartoon/Mascot Line Art. Create a clean, thick outline frame representation of the image subjects.';
        break;
      case 'lowpoly':
        stylePrompt = 'Style: Low Poly/Triangulated. Create a mesh network of triangles representing the image forms.';
        break;
      case 'stainedglass':
        stylePrompt = 'Style: Stained Glass/Voronoi. Create a cell-like voronoi pattern frame structure.';
        break;
      default:
        stylePrompt = 'Style: Net-like frame structure.';
    }

    const systemPrompt = `You are a specialized SVG generator.
Your task is to convert the input image into a specific SVG "frame" or "net" structure.
The output MUST be raw SVG code only. No markdown, no explanations.
The SVG should look like a physical cutout or frame that can be 3D printed.
All paths must be closed loops if possible to allow for extrusion.
Use black strokes and no fill (or white fill) for the preview, but ensure the geometry is clean.
${stylePrompt}
Return ONLY the <svg>...</svg> code.`;

    // Construct the payload for Poe API (OpenAI compatible format)
    // Assuming gpt-5.2 supports vision input via standard user content array
    const payload = {
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Generate the SVG frame for this image."
            },
            {
              type: "image_url",
              image_url: {
                url: image // Expecting data:image/jpeg;base64,...
              }
            }
          ]
        }
      ]
    };

    const response = await fetch("https://api.poe.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Poe API Error:", errorText);
      return NextResponse.json(
        { error: `API Error: ${response.status} ${response.statusText}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Extract SVG content from the response
    let content = data.choices[0]?.message?.content || "";
    
    // Clean up if the model wrapped it in markdown code blocks
    content = content.replace(/```svg/g, '').replace(/```/g, '').trim();
    
    // Find the SVG tag
    const svgStart = content.indexOf('<svg');
    const svgEnd = content.indexOf('</svg>') + 6;
    
    if (svgStart !== -1 && svgEnd !== -1) {
      content = content.substring(svgStart, svgEnd);
    }

    return NextResponse.json({ svg: content });

  } catch (error) {
    console.error("Server Error:", error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

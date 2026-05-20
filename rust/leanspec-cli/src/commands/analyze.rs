app.post("/api/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No PDF uploaded",
      });
    }

    const pdfData = await pdfParse(req.file.buffer);

    const extractedText = pdfData.text.slice(0, 8000);

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",

      messages: [
        {
          role: "system",
          content: "You are a senior game QA analyst.",
        },
        {
          role: "user",
          content: `
Analyze this Game Design Document.

Return:
- gameplay risks
- technical risks
- missing systems
- balancing concerns
- multiplayer concerns
- deployment readiness

GDD:
${extractedText}
          `,
        },
      ],
    });

    res.json({
      success: true,
      summary: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "AI analysis failed",
    });
  }
});
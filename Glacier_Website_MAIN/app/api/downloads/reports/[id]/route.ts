import { type NextRequest, NextResponse } from "next/server"

// Sample PDF content (in a real app, this would come from a file system or database)
const generateSamplePDF = (reportId: string) => {
  // This is a minimal PDF structure - in a real app, you'd use a proper PDF library
  const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Sample Report ${reportId}) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
300
%%EOF`

  return new Uint8Array(Buffer.from(pdfContent))
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const reportId = params.id

    // Generate sample PDF content
    const pdfBuffer = generateSamplePDF(reportId)

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${reportId}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error("Error generating PDF:", error)
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 })
  }
}

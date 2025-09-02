import { NextRequest, NextResponse } from 'next/server';

const MET_OFFICE_API_KEY = process.env.MET_OFFICE_API_KEY;

export async function GET(request: NextRequest) {
  try {
    if (!MET_OFFICE_API_KEY) {
      return NextResponse.json({ error: 'MET_OFFICE_API_KEY not configured' }, { status: 500 });
    }

    console.log('API Key length:', MET_OFFICE_API_KEY.length);
    console.log('API Key starts with:', MET_OFFICE_API_KEY.substring(0, 20));
    
    // Leamington Spa coordinates
    const latitude = 52.2928;
    const longitude = -1.5317;

    // Try different authentication methods
    const testMethods = [
      {
        name: 'apikey header',
        headers: {
          'accept': 'application/json',
          'apikey': MET_OFFICE_API_KEY
        } as Record<string, string>
      },
      {
        name: 'Authorization Bearer',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${MET_OFFICE_API_KEY}`
        } as Record<string, string>
      },
      {
        name: 'x-api-key header',
        headers: {
          'accept': 'application/json',
          'x-api-key': MET_OFFICE_API_KEY
        } as Record<string, string>
      }
    ];

    const results = [];
    
    for (const method of testMethods) {
      try {
        const response = await fetch(
          `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/daily?latitude=${latitude}&longitude=${longitude}&includeLocationName=true`,
          { headers: method.headers }
        );
        
        const responseText = await response.text();
        
        results.push({
          method: method.name,
          status: response.status,
          statusText: response.statusText,
          responsePreview: responseText.substring(0, 200)
        });
      } catch (error) {
        results.push({
          method: method.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      apiKeyConfigured: true,
      apiKeyLength: MET_OFFICE_API_KEY.length,
      results
    });

  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Debug failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}